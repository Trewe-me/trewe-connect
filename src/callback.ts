/**
 * GET /google/callback?code&state (or error&state): Google's redirect.
 * `state` is the relay's ticket, and the relay redirects only to a return
 * URL it signed. That limits, but doesn't remove, redirect abuse: anyone
 * can get a ticket for any https address ending in /wp-admin/admin.php,
 * valid for 10 minutes. The confirm page before Google is what stops a
 * crafted connect; see README.md.
 */
import { COPY, errorPage, htmlResponse } from './pages';
import { addParams, parseReturnUrl } from './return-url';
import { readTicket } from './ticket';
import type { Deps, Env } from './types';

const OAUTH_ERROR = /^[a-z_]{1,64}$/;

export async function handleCallback(
	url: URL,
	env: Env,
	deps: Deps
): Promise< Response > {
	const ticket = url.searchParams.get( 'state' ) ?? '';
	const payload = await readTicket( ticket, env.TICKET_KEY );
	const expired = ! payload || payload.e < Math.floor( deps.now() / 1000 );
	const ret = payload ? parseReturnUrl( payload.r ) : null;
	if ( expired || ! ret || ! payload ) {
		return htmlResponse( errorPage( COPY.expiredTitle, COPY.startAgain ), 400 );
	}

	const code = url.searchParams.get( 'code' );
	let params: Record< string, string >;
	if ( code ) {
		params = {
			trewe_google_code: code,
			trewe_google_state: payload.s,
			trewe_google_ticket: ticket,
		};
	} else {
		const error = url.searchParams.get( 'error' ) ?? '';
		params = {
			trewe_google_error: OAUTH_ERROR.test( error ) ? error : 'access_denied',
			trewe_google_state: payload.s,
		};
	}

	return new Response( null, {
		status: 302,
		headers: {
			Location: addParams( ret, params ),
			'Cache-Control': 'no-store',
			'Referrer-Policy': 'no-referrer',
		},
	} );
}
