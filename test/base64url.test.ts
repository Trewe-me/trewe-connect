import { describe, expect, it } from 'vitest';
import {
	decodeBytes,
	decodeText,
	encodeBytes,
	encodeText,
} from '../src/base64url';

describe( 'base64url', () => {
	it( 'encodes without padding or + and /', () => {
		expect( encodeBytes( new Uint8Array( [ 251, 255, 191 ] ) ) ).toBe(
			'-_-_'
		);
		expect( encodeText( 'a' ) ).toBe( 'YQ' );
	} );

	it( 'round-trips text of every padding length', () => {
		for ( const text of [ '', 'a', 'ab', 'abc', 'abcd', 'Ünïcödé' ] ) {
			expect( decodeText( encodeText( text ) ) ).toBe( text );
		}
	} );

	it( 'refuses anything that is not base64url', () => {
		expect( decodeBytes( 'a+b/' ) ).toBeNull();
		expect( decodeBytes( 'abc=' ) ).toBeNull();
		expect( decodeBytes( 'a' ) ).toBeNull();
		expect( decodeText( '%%' ) ).toBeNull();
	} );
} );
