/**
 * base64url (RFC 4648, section 5) without padding, for tickets, PKCE
 * challenges and JWT segments.
 */

export function encodeBytes( bytes: Uint8Array ): string {
	let binary = '';
	for ( const byte of bytes ) {
		binary += String.fromCharCode( byte );
	}
	return btoa( binary )
		.replace( /\+/g, '-' )
		.replace( /\//g, '_' )
		.replace( /=+$/, '' );
}

export function decodeBytes( text: string ): Uint8Array< ArrayBuffer > | null {
	if ( ! /^[A-Za-z0-9_-]*$/.test( text ) ) {
		return null;
	}
	// Length mod 4 of 0, 2 or 3 is valid; 1 gets "===", which atob refuses.
	const padded =
		text.replace( /-/g, '+' ).replace( /_/g, '/' ) +
		'==='.slice( ( text.length + 3 ) % 4 );
	try {
		return Uint8Array.from( atob( padded ), ( c ) => c.charCodeAt( 0 ) );
	} catch {
		return null;
	}
}

export function encodeText( text: string ): string {
	return encodeBytes( new TextEncoder().encode( text ) );
}

export function decodeText( text: string ): string | null {
	const bytes = decodeBytes( text );
	if ( ! bytes ) {
		return null;
	}
	try {
		return new TextDecoder( 'utf-8', { fatal: true } ).decode( bytes );
	} catch {
		return null;
	}
}
