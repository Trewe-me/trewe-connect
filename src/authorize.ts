/**
 * GET /google/authorize?return&state&code_challenge: check the request,
 * sign a ticket, and show the merchant which store they're connecting
 * before sending them to Google.
 */
import { COPY, confirmPage, errorPage, htmlResponse } from './pages';
import { addParams, parseReturnUrl } from './return-url';
import { TICKET_LIFETIME_SECONDS, signTicket } from './ticket';
import type { Deps, Env } from './types';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const SCOPES =
	'openid email https://www.googleapis.com/auth/webmasters.readonly';

const STATE = /^[A-Za-z0-9_-]{16,128}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export async function handleAuthorize(
	url: URL,
	env: Env,
	deps: Deps
): Promise< Response > {
	const ret = parseReturnUrl( url.searchParams.get( 'return' ) );
	const state = url.searchParams.get( 'state' ) ?? '';
	const challenge = url.searchParams.get( 'code_challenge' ) ?? '';
	if ( ! ret || ! STATE.test( state ) || ! CHALLENGE.test( challenge ) ) {
		return htmlResponse( errorPage( COPY.invalidTitle, COPY.startAgain ), 400 );
	}

	const ticket = await signTicket(
		{
			r: ret.href,
			s: state,
			c: challenge,
			e: Math.floor( deps.now() / 1000 ) + TICKET_LIFETIME_SECONDS,
		},
		env.TICKET_KEY
	);

	const google = new URL( GOOGLE_AUTH_URL );
	google.search = new URLSearchParams( {
		client_id: env.GOOGLE_CLIENT_ID,
		redirect_uri: env.REDIRECT_URI,
		response_type: 'code',
		scope: SCOPES,
		access_type: 'offline',
		prompt: 'consent',
		include_granted_scopes: 'true',
		state: ticket,
		code_challenge: challenge,
		code_challenge_method: 'S256',
	} ).toString();

	const cancel = addParams( ret, {
		trewe_google_error: 'access_denied',
		trewe_google_state: state,
	} );

	return htmlResponse( confirmPage( ret.host, google.href, cancel ) );
}
