import { describe, expect, it } from 'vitest';
import { addParams, parseReturnUrl } from '../src/return-url';
import { RETURN } from './helpers';

describe( 'parseReturnUrl', () => {
	it( 'accepts a store wp-admin URL, subdirectory and multisite included', () => {
		for ( const ok of [
			RETURN,
			'https://shop.example.com/store/wp-admin/admin.php',
			'https://example.com/site2/wp-admin/admin.php?page=x&y=1',
			'http://localhost:8030/wp-admin/admin.php?page=trewe-ai-storefront',
			'http://127.0.0.1/wp-admin/admin.php',
		] ) {
			expect( parseReturnUrl( ok )?.href ).toBe( new URL( ok ).href );
		}
	} );

	it( 'refuses everything else', () => {
		for ( const bad of [
			null,
			'',
			'not a url',
			'http://saltwarp.shop/wp-admin/admin.php',
			'https://saltwarp.shop/wp-admin/options.php',
			'https://saltwarp.shop/wp-admin/admin.php/extra',
			'https://saltwarp.shop/wp-login.php',
			'https://user:pass@saltwarp.shop/wp-admin/admin.php',
			'https://saltwarp.shop/wp-admin/admin.php#reach',
			'javascript:alert(1)//wp-admin/admin.php',
			'ftp://saltwarp.shop/wp-admin/admin.php',
			`https://saltwarp.shop/wp-admin/admin.php?x=${ 'a'.repeat( 2048 ) }`,
		] ) {
			expect( parseReturnUrl( bad ) ).toBeNull();
		}
	} );

	it( 'reports the host the browser will really visit', () => {
		// A backslash is a path separator for https, so this is evil.example.
		const url = parseReturnUrl(
			'https://evil.example\\@saltwarp.shop/wp-admin/admin.php'
		);
		expect( url === null || url.host === 'evil.example' ).toBe( true );
	} );
} );

describe( 'addParams', () => {
	it( 'adds parameters, keeping the ones already there', () => {
		const href = addParams( new URL( RETURN ), {
			trewe_google_code: '4/0A&b=c',
			trewe_google_state: 's',
		} );
		const url = new URL( href );
		expect( url.searchParams.get( 'page' ) ).toBe( 'trewe-ai-storefront' );
		expect( url.searchParams.get( 'trewe_google_code' ) ).toBe( '4/0A&b=c' );
		expect( url.searchParams.get( 'trewe_google_state' ) ).toBe( 's' );
	} );
} );
