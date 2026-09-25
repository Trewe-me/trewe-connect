import { describe, expect, it } from 'vitest';
import { PAGE_HEADERS, confirmPage, errorPage, htmlResponse } from '../src/pages';

describe( 'confirmPage', () => {
	const html = confirmPage(
		'saltwarp.shop',
		'https://accounts.google.com/o/oauth2/v2/auth?a=1&b=2',
		'https://saltwarp.shop/wp-admin/admin.php?x=1&y=2'
	);

	it( 'names the store and links both ways out', () => {
		expect( html ).toContain( 'Connect <span class="host">saltwarp.shop</span> to Google Search Console?' );
		expect( html ).toContain( 'href="https://accounts.google.com/o/oauth2/v2/auth?a=1&amp;b=2"' );
		expect( html ).toContain( 'href="https://saltwarp.shop/wp-admin/admin.php?x=1&amp;y=2"' );
		expect( html ).toContain( 'Continue to Google' );
		expect( html ).toContain( 'Cancel' );
	} );

	it( 'has no scripts and no em-dashes', () => {
		expect( html ).not.toMatch( /<script/i );
		expect( html ).not.toContain( '—' );
	} );

	it( 'escapes the host', () => {
		expect( confirmPage( '<b>x</b>', 'https://a/', 'https://b/' ) ).toContain(
			'&lt;b&gt;x&lt;/b&gt;'
		);
	} );
} );

describe( 'errorPage and htmlResponse', () => {
	it( 'escapes its text and sends the security headers', async () => {
		const res = htmlResponse( errorPage( 'A & B', '<i>' ), 400 );
		expect( res.status ).toBe( 400 );
		for ( const [ name, value ] of Object.entries( PAGE_HEADERS ) ) {
			expect( res.headers.get( name ) ).toBe( value );
		}
		const body = await res.text();
		expect( body ).toContain( 'A &amp; B' );
		expect( body ).toContain( '&lt;i&gt;' );
	} );
} );
