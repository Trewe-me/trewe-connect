import { describe, expect, it } from 'vitest';
import worker, { handle } from '../src/index';
import type { Env, RateLimiter } from '../src/types';
import { CHALLENGE, ENV, RETURN, STATE, deps } from './helpers';

const AUTHORIZE = `https://connect.trewe.me/google/authorize?${ new URLSearchParams( {
	return: RETURN,
	state: STATE,
	code_challenge: CHALLENGE,
} ) }`;

function limiter( success: boolean, keys: string[] = [] ): RateLimiter {
	return {
		limit: async ( { key } ) => {
			keys.push( key );
			return { success };
		},
	};
}

describe( 'handle', () => {
	it( 'routes the three endpoints', async () => {
		expect( ( await handle( new Request( AUTHORIZE ), ENV, deps() ) ).status ).toBe( 200 );
		expect(
			( await handle( new Request( 'https://connect.trewe.me/google/callback' ), ENV, deps() ) ).status
		).toBe( 400 );
		expect(
			( await handle( new Request( 'https://connect.trewe.me/google/token', { method: 'POST', body: '{}' } ), ENV, deps() ) ).status
		).toBe( 400 );
	} );

	it( 'answers 404 elsewhere, 405 for the wrong method, and names itself at /', async () => {
		expect( ( await handle( new Request( 'https://connect.trewe.me/authorize' ), ENV, deps() ) ).status ).toBe( 404 );
		expect( ( await handle( new Request( AUTHORIZE, { method: 'POST' } ), ENV, deps() ) ).status ).toBe( 405 );
		const root = await handle( new Request( 'https://connect.trewe.me/' ), ENV, deps() );
		expect( await root.text() ).toContain( 'https://github.com/Trewe-me/trewe-connect' );
	} );

	it( 'rate-limits authorize and token per IP and path', async () => {
		const keys: string[] = [];
		const env: Env = { ...ENV, RATE_LIMITER: limiter( false, keys ) };
		const req = new Request( AUTHORIZE, { headers: { 'CF-Connecting-IP': '203.0.113.9' } } );
		const res = await handle( req, env, deps() );
		expect( res.status ).toBe( 429 );
		expect( res.headers.get( 'Retry-After' ) ).toBe( '60' );
		expect( keys ).toEqual( [ '203.0.113.9:/google/authorize' ] );
	} );

	it( 'does not rate-limit the callback, and works with no limiter at all', async () => {
		const keys: string[] = [];
		const env: Env = { ...ENV, RATE_LIMITER: limiter( false, keys ) };
		await handle( new Request( 'https://connect.trewe.me/google/callback' ), env, deps() );
		expect( keys ).toEqual( [] );
		expect( ( await handle( new Request( AUTHORIZE ), ENV, deps() ) ).status ).toBe( 200 );
	} );

	it( 'answers the token endpoint with JSON when rate-limited', async () => {
		const env: Env = { ...ENV, RATE_LIMITER: limiter( false ) };
		const res = await handle(
			new Request( 'https://connect.trewe.me/google/token', { method: 'POST', body: '{}' } ),
			env,
			deps()
		);
		expect( res.status ).toBe( 429 );
		expect( await res.json() ).toEqual( { error: 'rate_limited' } );
	} );

	// Review finding: an empty client ID showed a normal confirm page that
	// led to Google's error; a missing secret sent "undefined" to Google.
	it( 'answers 503 when a variable or secret is missing', async () => {
		for ( const missing of [ 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TICKET_KEY', 'REDIRECT_URI' ] as const ) {
			const env = { ...ENV, [ missing ]: '' } as Env;
			const page = await handle( new Request( AUTHORIZE ), env, deps() );
			expect( page.status ).toBe( 503 );
			expect( await page.text() ).not.toContain( 'accounts.google.com' );
			const token = await handle(
				new Request( 'https://connect.trewe.me/google/token', { method: 'POST', body: '{}' } ),
				env,
				deps()
			);
			expect( token.status ).toBe( 503 );
			expect( await token.json() ).toEqual( { error: 'not_configured' } );
		}
		expect( ( await handle( new Request( 'https://connect.trewe.me/' ), { ...ENV, TICKET_KEY: '' }, deps() ) ).status ).toBe( 200 );
	} );

	it( 'answers 500 without details when something throws', async () => {
		const throwing = { ...deps(), now: () => { throw new Error( 'secret detail' ); } };
		const res = await handle( new Request( AUTHORIZE ), ENV, throwing );
		expect( res.status ).toBe( 500 );
		expect( await res.text() ).not.toContain( 'secret detail' );
	} );

	it( 'exports a Worker fetch handler', () => {
		expect( typeof worker.fetch ).toBe( 'function' );
	} );
} );
