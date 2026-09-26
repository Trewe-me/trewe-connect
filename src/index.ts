/**
 * connect.trewe.me: the sign-in relay that connects AI Storefront stores
 * to Google Search Console. Stateless; see README.md.
 */
import { handleAuthorize } from './authorize';
import { handleCallback } from './callback';
import { SOURCE_URL } from './pages';
import { handleToken } from './token';
import type { Deps, Env } from './types';

const LIMITED = new Set( [ '/google/authorize', '/google/token' ] );

const text = ( body: string, status: number, headers: Record< string, string > = {} ) =>
	new Response( body, {
		status,
		headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
	} );

const json = ( body: object, status: number, headers: Record< string, string > = {} ) =>
	new Response( JSON.stringify( body ), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
	} );

/** Every variable and secret the /google/ endpoints need is set. */
function configured( env: Env ): boolean {
	return [ env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.TICKET_KEY, env.REDIRECT_URI ].every(
		( value ) => typeof value === 'string' && value !== ''
	);
}

export async function handle(
	request: Request,
	env: Env,
	deps: Deps
): Promise< Response > {
	try {
		return await route( request, env, deps );
	} catch {
		// Nothing about the failure goes back: it could name a secret.
		return text( 'Something went wrong. Try again in a few minutes.', 500 );
	}
}

async function route( request: Request, env: Env, deps: Deps ): Promise< Response > {
	const url = new URL( request.url );
	const isToken = url.pathname === '/google/token';

	// A deploy missing a variable or secret fails plainly instead of
	// sending merchants to Google's error page or Google a blank secret.
	if ( url.pathname.startsWith( '/google/' ) && ! configured( env ) ) {
		return isToken
			? json( { error: 'not_configured' }, 503 )
			: text( 'The sign-in relay is not set up yet. Try again later.', 503 );
	}

	if ( LIMITED.has( url.pathname ) && env.RATE_LIMITER ) {
		const ip = request.headers.get( 'CF-Connecting-IP' ) ?? 'unknown';
		const { success } = await env.RATE_LIMITER.limit( {
			key: `${ ip }:${ url.pathname }`,
		} );
		if ( ! success ) {
			return isToken
				? json( { error: 'rate_limited' }, 429, { 'Retry-After': '60' } )
				: text( 'Too many requests. Try again in a minute.', 429, { 'Retry-After': '60' } );
		}
	}

	switch ( url.pathname ) {
		case '/google/authorize':
			return request.method === 'GET'
				? handleAuthorize( url, env, deps )
				: text( 'Method not allowed', 405 );
		case '/google/callback':
			return request.method === 'GET'
				? handleCallback( url, env, deps )
				: text( 'Method not allowed', 405 );
		case '/google/token':
			return handleToken( request, env, deps );
		case '/':
			return text( `connect.trewe.me: sign-in relay for AI Storefront. Source: ${ SOURCE_URL }\n`, 200 );
		default:
			return text( 'Not found', 404 );
	}
}

export default {
	fetch( request: Request, env: Env ): Promise< Response > {
		return handle( request, env, {
			fetch: ( input, init ) => fetch( input, init ),
			now: () => Date.now(),
		} );
	},
};
