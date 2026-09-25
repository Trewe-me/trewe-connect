import { describe, expect, it } from 'vitest';
import { encodeText } from '../src/base64url';
import { handleToken } from '../src/token';
import { signTicket } from '../src/ticket';
import type { Deps } from '../src/types';
import { CHALLENGE, ENV, NOW_MS, RETURN, STATE, VERIFIER, deps } from './helpers';

type Call = { url: string; body: URLSearchParams };

function google( status: number, body: unknown, calls: Call[] = [] ): Deps[ 'fetch' ] {
	return async ( url, init ) => {
		calls.push( { url, body: new URLSearchParams( String( init.body ) ) } );
		return new Response(
			typeof body === 'string' ? body : JSON.stringify( body ),
			{ status, headers: { 'Content-Type': 'application/json' } }
		);
	};
}

function post( body: unknown ): Request {
	return new Request( 'https://connect.trewe.me/google/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify( body ),
	} );
}

const ticket = () =>
	signTicket(
		{ r: RETURN, s: STATE, c: CHALLENGE, e: NOW_MS / 1000 + 600 },
		ENV.TICKET_KEY
	);

const idToken = ( claims: object ) =>
	`${ encodeText( '{"alg":"RS256"}' ) }.${ encodeText( JSON.stringify( claims ) ) }.sig`;

const TOKENS = {
	access_token: 'ya29.access',
	expires_in: 3599,
	scope: 'openid https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/userinfo.email',
	token_type: 'Bearer',
	refresh_token: '1//refresh',
	id_token: idToken( { email: 'maya@example.com', sub: '1' } ),
};

describe( 'POST /google/token, code grant', () => {
	it( 'adds the secret, checks PKCE, and returns only the allowed fields', async () => {
		const calls: Call[] = [];
		const res = await handleToken(
			post( { grant: 'code', code: '4/0Ab', code_verifier: VERIFIER, ticket: await ticket() } ),
			ENV,
			deps( google( 200, TOKENS, calls ) )
		);
		expect( res.status ).toBe( 200 );
		expect( res.headers.get( 'Cache-Control' ) ).toBe( 'no-store' );
		expect( await res.json() ).toEqual( {
			access_token: 'ya29.access',
			expires_in: 3599,
			scope: TOKENS.scope,
			refresh_token: '1//refresh',
			email: 'maya@example.com',
		} );
		expect( calls ).toHaveLength( 1 );
		expect( calls[ 0 ].url ).toBe( 'https://oauth2.googleapis.com/token' );
		expect( Object.fromEntries( calls[ 0 ].body ) ).toEqual( {
			client_id: ENV.GOOGLE_CLIENT_ID,
			client_secret: ENV.GOOGLE_CLIENT_SECRET,
			grant_type: 'authorization_code',
			code: '4/0Ab',
			code_verifier: VERIFIER,
			redirect_uri: ENV.REDIRECT_URI,
		} );
	} );

	it( 'refuses a verifier that does not match the ticket, without calling Google', async () => {
		const calls: Call[] = [];
		const res = await handleToken(
			post( {
				grant: 'code',
				code: '4/0Ab',
				code_verifier: 'x'.repeat( 43 ),
				ticket: await ticket(),
			} ),
			ENV,
			deps( google( 200, TOKENS, calls ) )
		);
		expect( res.status ).toBe( 400 );
		expect( await res.json() ).toEqual( { error: 'invalid_request' } );
		expect( calls ).toHaveLength( 0 );
	} );

	it( 'refuses a missing or forged ticket', async () => {
		const forged = await signTicket(
			{ r: RETURN, s: STATE, c: CHALLENGE, e: NOW_MS / 1000 + 600 },
			'someone else'
		);
		for ( const t of [ undefined, '', forged ] ) {
			const res = await handleToken(
				post( { grant: 'code', code: 'c', code_verifier: VERIFIER, ticket: t } ),
				ENV,
				deps( google( 200, TOKENS ) )
			);
			expect( res.status ).toBe( 400 );
		}
	} );
} );

describe( 'POST /google/token, refresh grant', () => {
	it( 'refreshes and never returns a refresh token or email', async () => {
		const calls: Call[] = [];
		const res = await handleToken(
			post( { grant: 'refresh', refresh_token: '1//refresh' } ),
			ENV,
			deps( google( 200, TOKENS, calls ) )
		);
		expect( await res.json() ).toEqual( {
			access_token: 'ya29.access',
			expires_in: 3599,
			scope: TOKENS.scope,
		} );
		expect( Object.fromEntries( calls[ 0 ].body ) ).toEqual( {
			client_id: ENV.GOOGLE_CLIENT_ID,
			client_secret: ENV.GOOGLE_CLIENT_SECRET,
			grant_type: 'refresh_token',
			refresh_token: '1//refresh',
		} );
	} );

	it( "passes Google's error code through, nothing else", async () => {
		const res = await handleToken(
			post( { grant: 'refresh', refresh_token: '1//dead' } ),
			ENV,
			deps( google( 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } ) )
		);
		expect( res.status ).toBe( 400 );
		expect( await res.json() ).toEqual( { error: 'invalid_grant' } );
	} );
} );

describe( 'POST /google/token, failures', () => {
	it( 'answers 502 upstream for a Google 5xx, non-JSON, or a network error', async () => {
		const throwing: Deps[ 'fetch' ] = async () => {
			throw new Error( 'down' );
		};
		for ( const fetchImpl of [
			google( 503, { error: 'backend_error' } ),
			google( 200, '<html>oops</html>' ),
			google( 200, { token_type: 'Bearer' } ),
			throwing,
		] ) {
			const res = await handleToken(
				post( { grant: 'refresh', refresh_token: 'r' } ),
				ENV,
				deps( fetchImpl )
			);
			expect( res.status ).toBe( 502 );
			expect( await res.json() ).toEqual( { error: 'upstream' } );
		}
	} );

	it( 'refuses bodies of the wrong shape and other methods', async () => {
		for ( const body of [
			'not json',
			[],
			{},
			{ grant: 'password' },
			{ grant: 'refresh' },
			{ grant: 'refresh', refresh_token: 'r'.repeat( 2049 ) },
			{ grant: 'code', code: 'c', code_verifier: 'short', ticket: 't' },
		] ) {
			const res = await handleToken( post( body ), ENV, deps() );
			expect( res.status ).toBe( 400 );
			expect( await res.json() ).toEqual( { error: 'invalid_request' } );
		}
		const get = await handleToken(
			new Request( 'https://connect.trewe.me/google/token' ),
			ENV,
			deps()
		);
		expect( get.status ).toBe( 405 );
	} );
} );
