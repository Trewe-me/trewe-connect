/**
 * POST /google/token: swap a code (with PKCE) or a refresh token for an
 * access token. The relay adds the client secret and passes back only
 * the fields the store needs.
 */
import { decodeText } from './base64url';
import { challengeFor, readTicket } from './ticket';
import type { Deps, Env } from './types';

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const OAUTH_ERROR = /^[a-z_]{1,64}$/;
const MAX_TOKEN = 2048;
const MAX_BODY = 16 * 1024;

type TokenRequest =
	| { grant: 'code'; code: string; code_verifier: string; ticket: string }
	| { grant: 'refresh'; refresh_token: string };

const isText = ( value: unknown, max = MAX_TOKEN ): value is string =>
	typeof value === 'string' && value.length > 0 && value.length <= max;

function parseBody( data: unknown ): TokenRequest | null {
	if ( typeof data !== 'object' || data === null || Array.isArray( data ) ) {
		return null;
	}
	const o = data as Record< string, unknown >;
	if (
		o.grant === 'code' &&
		isText( o.code ) &&
		typeof o.code_verifier === 'string' &&
		VERIFIER.test( o.code_verifier ) &&
		isText( o.ticket, 4096 )
	) {
		return {
			grant: 'code',
			code: o.code,
			code_verifier: o.code_verifier,
			ticket: o.ticket,
		};
	}
	if ( o.grant === 'refresh' && isText( o.refresh_token ) ) {
		return { grant: 'refresh', refresh_token: o.refresh_token };
	}
	return null;
}

function json( body: object, status = 200 ): Response {
	return new Response( JSON.stringify( body ), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store',
		},
	} );
}

const invalid = () => json( { error: 'invalid_request' }, 400 );
const upstream = () => json( { error: 'upstream' }, 502 );

/**
 * The claims of an ID token received straight from Google's token
 * endpoint over HTTPS, which needs no signature check (Google's OpenID
 * Connect docs). Only the email is passed on, never the token.
 */
export function idTokenClaims( idToken: unknown ): Record< string, unknown > | null {
	if ( typeof idToken !== 'string' ) {
		return null;
	}
	const text = decodeText( idToken.split( '.' )[ 1 ] ?? '' );
	if ( ! text ) {
		return null;
	}
	try {
		const claims: unknown = JSON.parse( text );
		return typeof claims === 'object' && claims !== null && ! Array.isArray( claims )
			? ( claims as Record< string, unknown > )
			: null;
	} catch {
		return null;
	}
}

export async function handleToken(
	request: Request,
	env: Env,
	deps: Deps
): Promise< Response > {
	if ( request.method !== 'POST' ) {
		return json( { error: 'invalid_request' }, 405 );
	}
	// A real request is a few hundred bytes. Refusing big bodies keeps one
	// request from spending the Worker's CPU budget on parsing.
	if ( Number( request.headers.get( 'Content-Length' ) ?? 0 ) > MAX_BODY ) {
		return invalid();
	}
	let data: unknown;
	try {
		const raw = await request.text();
		if ( raw.length > MAX_BODY ) {
			return invalid();
		}
		data = JSON.parse( raw );
	} catch {
		return invalid();
	}
	const req = parseBody( data );
	if ( ! req ) {
		return invalid();
	}

	let ticketChallenge = '';
	const form = new URLSearchParams( {
		client_id: env.GOOGLE_CLIENT_ID,
		client_secret: env.GOOGLE_CLIENT_SECRET,
	} );
	if ( req.grant === 'code' ) {
		// The relay's own PKCE check, whether or not Google checks too.
		const ticket = await readTicket( req.ticket, env.TICKET_KEY );
		if ( ! ticket || ticket.c !== ( await challengeFor( req.code_verifier ) ) ) {
			return invalid();
		}
		ticketChallenge = ticket.c;
		form.set( 'grant_type', 'authorization_code' );
		form.set( 'code', req.code );
		form.set( 'code_verifier', req.code_verifier );
		form.set( 'redirect_uri', env.REDIRECT_URI );
	} else {
		form.set( 'grant_type', 'refresh_token' );
		form.set( 'refresh_token', req.refresh_token );
	}

	let res: Response;
	let body: Record< string, unknown >;
	try {
		res = await deps.fetch( GOOGLE_TOKEN_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: form.toString(),
		} );
		body = ( await res.json() ) as Record< string, unknown >;
	} catch {
		return upstream();
	}
	if ( typeof body !== 'object' || body === null ) {
		return upstream();
	}

	if ( ! res.ok ) {
		const code = body.error;
		return res.status < 500 && typeof code === 'string' && OAUTH_ERROR.test( code )
			? json( { error: code }, 400 )
			: upstream();
	}
	if ( typeof body.access_token !== 'string' ) {
		return upstream();
	}

	const out: Record< string, unknown > = {
		access_token: body.access_token,
		expires_in: typeof body.expires_in === 'number' ? body.expires_in : 3600,
		scope: typeof body.scope === 'string' ? body.scope : '',
	};
	if ( req.grant === 'code' ) {
		// The ticket's challenge was the authorize request's nonce, and
		// Google echoes it in the ID token. A code from any other flow
		// (copied from a store's log, paired with a ticket and verifier
		// someone minted) doesn't match: send back no tokens. They aren't
		// revoked, because revoking one token of a grant can revoke the
		// grant's other tokens, which would disconnect the account's owner.
		const claims = idTokenClaims( body.id_token );
		if ( ! claims || claims.nonce !== ticketChallenge ) {
			return invalid();
		}
		if ( typeof body.refresh_token === 'string' ) {
			out.refresh_token = body.refresh_token;
		}
		if ( typeof claims.email === 'string' ) {
			out.email = claims.email;
		}
	}
	return json( out );
}
