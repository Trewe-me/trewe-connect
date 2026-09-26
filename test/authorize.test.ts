import { describe, expect, it } from 'vitest';
import { handleAuthorize } from '../src/authorize';
import { readTicket } from '../src/ticket';
import { CHALLENGE, ENV, NOW_MS, RETURN, STATE, deps } from './helpers';

function authorizeUrl( params: Record< string, string > ): URL {
	const url = new URL( 'https://connect.trewe.me/google/authorize' );
	for ( const [ k, v ] of Object.entries( params ) ) {
		url.searchParams.set( k, v );
	}
	return url;
}

const GOOD = { return: RETURN, state: STATE, code_challenge: CHALLENGE };

function hrefs( html: string ): string[] {
	return [ ...html.matchAll( /href="([^"]+)"/g ) ].map( ( m ) =>
		m[ 1 ].replace( /&amp;/g, '&' )
	);
}

describe( 'GET /google/authorize', () => {
	it( 'shows the store host and a Google link carrying a signed ticket', async () => {
		const res = await handleAuthorize( authorizeUrl( GOOD ), ENV, deps() );
		expect( res.status ).toBe( 200 );
		const html = await res.text();
		expect( html ).toContain( '<span class="host">saltwarp.shop</span>' );

		const google = new URL(
			hrefs( html ).find( ( h ) => h.startsWith( 'https://accounts.google.com/' ) ) as string
		);
		expect( google.origin + google.pathname ).toBe(
			'https://accounts.google.com/o/oauth2/v2/auth'
		);
		expect( Object.fromEntries( google.searchParams ) ).toMatchObject( {
			client_id: ENV.GOOGLE_CLIENT_ID,
			redirect_uri: ENV.REDIRECT_URI,
			response_type: 'code',
			scope: 'openid email https://www.googleapis.com/auth/webmasters.readonly',
			access_type: 'offline',
			prompt: 'consent',
			include_granted_scopes: 'true',
			code_challenge: CHALLENGE,
			code_challenge_method: 'S256',
			// Google echoes the nonce in the ID token; /google/token checks it.
			nonce: CHALLENGE,
		} );

		const ticket = await readTicket(
			google.searchParams.get( 'state' ) as string,
			ENV.TICKET_KEY
		);
		expect( ticket ).toEqual( {
			r: RETURN,
			s: STATE,
			c: CHALLENGE,
			e: NOW_MS / 1000 + 600,
		} );
	} );

	it( 'sends Cancel back to the store as a refusal, with its state', async () => {
		const html = await ( await handleAuthorize( authorizeUrl( GOOD ), ENV, deps() ) ).text();
		const cancel = new URL(
			hrefs( html ).find( ( h ) => h.startsWith( 'https://saltwarp.shop/' ) ) as string
		);
		expect( cancel.searchParams.get( 'page' ) ).toBe( 'trewe-ai-storefront' );
		expect( cancel.searchParams.get( 'trewe_google_error' ) ).toBe( 'access_denied' );
		expect( cancel.searchParams.get( 'trewe_google_state' ) ).toBe( STATE );
	} );

	it( 'shows the host the browser will really visit', async () => {
		const url = authorizeUrl( {
			...GOOD,
			return: 'https://evil.example\\@saltwarp.shop/wp-admin/admin.php',
		} );
		const res = await handleAuthorize( url, ENV, deps() );
		expect( res.status ).toBe( 200 );
		const html = await res.text();
		expect( html ).toContain( '<span class="host">evil.example</span>' );
		const cancel = hrefs( html ).find( ( h ) => ! h.startsWith( 'https://accounts.google.com/' ) && h.includes( 'trewe_google_error' ) ) as string;
		expect( new URL( cancel ).host ).toBe( 'evil.example' );
	} );

	it( 'refuses a bad return URL, state or challenge with a 400 page', async () => {
		for ( const bad of [
			{ ...GOOD, return: 'https://saltwarp.shop/wp-login.php' },
			{ ...GOOD, state: 'short' },
			{ ...GOOD, state: 'has spaces in it, sixteen+' },
			{ ...GOOD, code_challenge: 'too-short' },
			{ return: RETURN, state: STATE },
		] ) {
			const res = await handleAuthorize( authorizeUrl( bad ), ENV, deps() );
			expect( res.status ).toBe( 400 );
			const html = await res.text();
			expect( html ).toContain( 'This connect link isn’t valid' );
			expect( html ).not.toContain( 'accounts.google.com' );
		}
	} );
} );
