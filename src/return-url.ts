/**
 * Where the relay may send a browser back to: a store's wp-admin.
 */

const LOCAL_HOSTS = new Set( [ 'localhost', '127.0.0.1' ] );

/**
 * The parsed return URL, or null when it breaks a rule. Callers show and
 * use the parsed URL's host, never the raw string, so what the merchant
 * reads is where the browser goes.
 */
export function parseReturnUrl( raw: string | null ): URL | null {
	if ( ! raw || raw.length > 2048 ) {
		return null;
	}
	let url: URL;
	try {
		url = new URL( raw );
	} catch {
		return null;
	}
	const secure =
		url.protocol === 'https:' ||
		( url.protocol === 'http:' && LOCAL_HOSTS.has( url.hostname ) );
	if ( ! secure || url.username || url.password || raw.includes( '#' ) ) {
		return null;
	}
	if ( ! url.pathname.endsWith( '/wp-admin/admin.php' ) ) {
		return null;
	}
	return url;
}

/** A copy of `url` with `params` set on its query string. */
export function addParams( url: URL, params: Record< string, string > ): string {
	const copy = new URL( url.href );
	for ( const [ name, value ] of Object.entries( params ) ) {
		copy.searchParams.set( name, value );
	}
	return copy.href;
}
