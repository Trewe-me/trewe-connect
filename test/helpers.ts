import type { Deps, Env } from '../src/types';

export const ENV: Env = {
	GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
	GOOGLE_CLIENT_SECRET: 'client-secret',
	TICKET_KEY: 'test-ticket-key',
	REDIRECT_URI: 'https://connect.trewe.me/google/callback',
};

export const NOW_MS = 1_790_000_000_000;

export const RETURN =
	'https://saltwarp.shop/wp-admin/admin.php?page=trewe-ai-storefront';

export const STATE = 'abcdefghijklmnopqrstuvwxyz012345';

// RFC 7636, appendix B: a verifier and its S256 challenge.
export const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
export const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

export function deps( fetchImpl?: Deps[ 'fetch' ], nowMs = NOW_MS ): Deps {
	return {
		fetch:
			fetchImpl ??
			( async () => {
				throw new Error( 'unexpected fetch' );
			} ),
		now: () => nowMs,
	};
}
