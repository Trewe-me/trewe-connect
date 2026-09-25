/**
 * Cloudflare's Workers rate limiting binding. Optional: when it's absent
 * (not on the plan, or `wrangler dev` without it) nothing is limited.
 */
export interface RateLimiter {
	limit( options: { key: string } ): Promise< { success: boolean } >;
}

/** Worker variables and secrets. */
export interface Env {
	/** Google OAuth client ID. A plain variable: it isn't secret. */
	GOOGLE_CLIENT_ID: string;
	/** Google OAuth client secret. A Worker secret. */
	GOOGLE_CLIENT_SECRET: string;
	/** HMAC key for tickets. A Worker secret, 32 random bytes. */
	TICKET_KEY: string;
	/** The callback URL registered on the OAuth client. */
	REDIRECT_URI: string;
	RATE_LIMITER?: RateLimiter;
}

/** What the handlers take from the outside world, so tests can fake it. */
export interface Deps {
	fetch: ( url: string, init: RequestInit ) => Promise< Response >;
	/** Current time in milliseconds. */
	now: () => number;
}
