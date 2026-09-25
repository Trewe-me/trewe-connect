import { describe, expect, it } from 'vitest';
import { handleCallback } from '../src/callback';
import { signTicket } from '../src/ticket';
import { CHALLENGE, ENV, NOW_MS, RETURN, STATE, deps } from './helpers';

async function ticket( overrides: Partial< { r: string; e: number } > = {} ) {
	return signTicket(
		{ r: RETURN, s: STATE, c: CHALLENGE, e: NOW_MS / 1000 + 600, ...overrides },
		ENV.TICKET_KEY
	);
}

function callbackUrl( params: Record< string, string > ): URL {
	const url = new URL( 'https://connect.trewe.me/google/callback' );
	for ( const [ k, v ] of Object.entries( params ) ) {
		url.searchParams.set( k, v );
	}
	return url;
}

describe( 'GET /google/callback', () => {
	it( 'sends the code, state and ticket back to the store', async () => {
		const t = await ticket();
		const res = await handleCallback(
			callbackUrl( { code: '4/0Ab-code', state: t } ),
			ENV,
			deps()
		);
		expect( res.status ).toBe( 302 );
		expect( res.headers.get( 'Cache-Control' ) ).toBe( 'no-store' );
		expect( res.headers.get( 'Referrer-Policy' ) ).toBe( 'no-referrer' );
		const to = new URL( res.headers.get( 'Location' ) as string );
		expect( to.origin + to.pathname ).toBe( 'https://saltwarp.shop/wp-admin/admin.php' );
		expect( Object.fromEntries( to.searchParams ) ).toEqual( {
			page: 'trewe-ai-storefront',
			trewe_google_code: '4/0Ab-code',
			trewe_google_state: STATE,
			trewe_google_ticket: t,
		} );
	} );

	it( 'passes a refusal back without a code or ticket', async () => {
		const res = await handleCallback(
			callbackUrl( { error: 'access_denied', state: await ticket() } ),
			ENV,
			deps()
		);
		const to = new URL( res.headers.get( 'Location' ) as string );
		expect( to.searchParams.get( 'trewe_google_error' ) ).toBe( 'access_denied' );
		expect( to.searchParams.get( 'trewe_google_state' ) ).toBe( STATE );
		expect( to.searchParams.has( 'trewe_google_code' ) ).toBe( false );
		expect( to.searchParams.has( 'trewe_google_ticket' ) ).toBe( false );
	} );

	it( 'replaces an error value that is not a plain OAuth code', async () => {
		const res = await handleCallback(
			callbackUrl( { error: '<script>x</script>', state: await ticket() } ),
			ENV,
			deps()
		);
		const to = new URL( res.headers.get( 'Location' ) as string );
		expect( to.searchParams.get( 'trewe_google_error' ) ).toBe( 'access_denied' );
	} );

	it( 'shows the expired page for an old, forged or missing ticket', async () => {
		const old = await ticket( { e: NOW_MS / 1000 - 1 } );
		const forged = await signTicket(
			{ r: RETURN, s: STATE, c: CHALLENGE, e: NOW_MS / 1000 + 600 },
			'someone else'
		);
		for ( const state of [ old, forged, '' ] ) {
			const res = await handleCallback(
				callbackUrl( { code: 'c', state } ),
				ENV,
				deps()
			);
			expect( res.status ).toBe( 400 );
			expect( res.headers.get( 'Location' ) ).toBeNull();
			expect( await res.text() ).toContain( 'This link has expired' );
		}
	} );

	it( 'refuses a signed return URL that breaks the rules', async () => {
		const res = await handleCallback(
			callbackUrl( {
				code: 'c',
				state: await ticket( { r: 'https://evil.example/somewhere' } ),
			} ),
			ENV,
			deps()
		);
		expect( res.status ).toBe( 400 );
		expect( res.headers.get( 'Location' ) ).toBeNull();
	} );
} );
