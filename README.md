# connect.trewe.me

connect.trewe.me is the sign-in relay for AI Storefront, a WooCommerce plugin by Trewe. It lets a store connect Google Search Console with one click. It holds Trewe's Google OAuth client secret, which can't live in a public plugin, and swaps a one-time code or a refresh token for an access token. It has no database and never sees Search Console data: the store calls Google directly.

## What it receives, keeps and logs

| Endpoint | Receives | Keeps | Logs |
|---|---|---|---|
| `/google/authorize` | The store's wp-admin address, a one-time state, a PKCE challenge | Nothing | Nothing |
| `/google/callback` | Google's one-time code and the relay's own ticket | Nothing | Nothing |
| `/google/token` | The code with the verifier and ticket, or a refresh token | Nothing | Nothing |

Logging is off in `wrangler.toml` (`[observability] enabled = false`) and the code prints nothing. Cloudflare's request counts remain.

## Endpoints

### `GET /google/authorize`

Query: `return`, `state`, `code_challenge`.

- `return` must be an `https` URL (or `http` when the host is `localhost` or `127.0.0.1`) with no username, password or fragment, whose path ends in `/wp-admin/admin.php`, at most 2048 characters. Its query string may hold anything.
- `state` is 16 to 128 characters of `[A-Za-z0-9_-]`. `code_challenge` is 43 characters of base64url.
- Anything else gets a 400 page.

The relay signs a ticket (base64url of `{ "r": return, "s": state, "c": code_challenge, "e": now + 600 }`, a dot, and base64url of its HMAC-SHA256 under `TICKET_KEY`) and answers with a page that has no scripts: "Connect **example.com** to Google Search Console?", with **Continue to Google** and **Cancel**. The page shows the host the browser will really go to, so a link crafted to connect someone's Search Console to a stranger's site is visible before anything happens.

- **Continue** goes to `https://accounts.google.com/o/oauth2/v2/auth` with `client_id`, `redirect_uri`, `response_type=code`, `scope=openid email https://www.googleapis.com/auth/webmasters.readonly`, `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`, `state=<ticket>`, `code_challenge`, `code_challenge_method=S256` and `nonce` (the same value as `code_challenge`).
- **Cancel** goes to `return` with `trewe_google_error=access_denied` and `trewe_google_state` added.

### `GET /google/callback`

Query from Google: `code` and `state`, or `error` and `state`. `state` is the ticket.

- A ticket with a bad signature, or past its expiry, gets a 400 page: "This link has expired". The relay never redirects to an address it didn't sign. That limits redirect abuse without removing it: anyone can get a ticket for any https address ending in `/wp-admin/admin.php`, good for 10 minutes. The confirm page, which names the host, is what stops a crafted connect.
- `trewe_google_` parameters already in the return URL are dropped, so the store reads only the relay's own.
- Otherwise it redirects (302) to the ticket's `return` with `trewe_google_code`, `trewe_google_state` and `trewe_google_ticket` added, or `trewe_google_error` and `trewe_google_state`. An `error` that isn't a plain OAuth error code becomes `access_denied`.

### `POST /google/token`

Called by the store's server, with a JSON body:

- `{ "grant": "code", "code": "...", "code_verifier": "...", "ticket": "..." }`
- `{ "grant": "refresh", "refresh_token": "..." }`

For a code grant the relay checks two things, so a code copied from a store's access log can't be exchanged, whether or not Google checks PKCE too:

1. Before calling Google: the ticket's signature, and that `base64url(SHA-256(code_verifier))` equals the ticket's challenge. If either fails, the answer is a 400 and Google is never called.
2. After: that the ID token's `nonce` equals the ticket's challenge, which proves the code came from this ticket's flow. A code paired with a ticket and verifier someone minted for themselves fails here, and the answer is a 400 with no tokens. The tokens aren't revoked, because revoking one token of a grant can revoke the account owner's other tokens.

The relay adds `client_id`, `client_secret` and (code grant only) `redirect_uri`, posts to `https://oauth2.googleapis.com/token`, and answers with only these fields:

| Field | Code grant | Refresh grant |
|---|---|---|
| `access_token`, `expires_in`, `scope` | yes | yes |
| `refresh_token` | yes | no |
| `email` (from the ID token's claims) | yes | no |

Errors:

- 400 `{ "error": "<Google's error code>" }` when Google refuses, for example `invalid_grant`.
- 400 `{ "error": "invalid_request" }` for a body of the wrong shape, a failed ticket check, or an ID token whose `nonce` doesn't match.
- 502 `{ "error": "upstream" }` when Google is unreachable, answers 5xx, or answers something that isn't a token.
- 400 `{ "error": "invalid_request" }` for a body over 16 KB.
- 429 `{ "error": "rate_limited" }` over 30 requests a minute from one IP.
- 503 `{ "error": "not_configured" }` when a variable or secret is missing.
- 405 for any method but `POST`.

No response or error contains a token, a code or the secret.

### Everything else

`GET /` is a one-line page linking here. Other paths are a 404. `/google/authorize` and `/google/token` are rate-limited per IP to 30 requests a minute. While a variable or secret is missing, every `/google/` path answers 503. An unexpected error answers 500 with no details.

## Develop

```sh
npm install
npm test              # includes the logging-stays-off guards
npm run typecheck
npm run check:config  # validates wrangler.toml without deploying
```

CI runs the same three as separate checks (`test`, `typecheck`, `config`) on GitHub's standard runners, which are free for public repositories.

To run it locally, `cp .dev.vars.example .dev.vars`, fill in the Google client ID and secret and a `TICKET_KEY` from `openssl rand -base64 32`, then `npm run dev`. The relay listens on `http://localhost:8787`, and `http://localhost:8787/google/callback` must be a redirect URI on the OAuth client.

A dev store points AI Storefront at it with a mu-plugin:

```php
<?php
// Local only. Browser goes to localhost; PHP in Docker reaches the host.
add_filter( 'trewe_ai_storefront_google_relay_url', fn( $url, $context ) => 'server' === $context ? 'http://host.docker.internal:8787' : 'http://localhost:8787', 10, 2 );
add_filter( 'trewe_ai_storefront_google_connect_enabled', '__return_true' );
```

## Deploy

Needs runbook steps 1 to 5: trewe.me Active on Cloudflare, and the OAuth client's ID and secret.

1. `npx wrangler login`, then `npx wrangler whoami` to confirm the account.
2. Set `GOOGLE_CLIENT_ID` in `wrangler.toml` and merge that through a pull request (`main` is protected).
3. From `main`: `npm run check:config`, then `npm run deploy`. The output lists the custom domain `connect.trewe.me`, whose DNS record and certificate the deploy creates. Until step 4 every `/google/` path answers 503 "not set up yet", which is harmless.
4. Add the secrets. Each takes effect at once, with no redeploy:

   ```sh
   npx wrangler secret put GOOGLE_CLIENT_SECRET          # paste it at the prompt, never in a file or commit
   openssl rand -base64 32 | npx wrangler secret put TICKET_KEY   # nobody needs to see this one
   ```

5. Check it:
   - `curl -s https://connect.trewe.me/` prints the one line naming the relay.
   - `curl -s -X POST https://connect.trewe.me/google/token -d '{}'` prints `{"error":"invalid_request"}`; `not_configured` means a secret or the client ID is missing.
   - This link shows the confirm page naming saltwarp.shop, and Continue opens Google's consent screen for AI Storefront (after an unverified-app warning while the app is in Testing):

   ```
   https://connect.trewe.me/google/authorize?return=https%3A%2F%2Fsaltwarp.shop%2Fwp-admin%2Fadmin.php&state=abcdefghijklmnopqrstuvwxyz012345&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
   ```

If the deploy rejects the `[[ratelimits]]` block on the free plan, delete it and add a WAF rate-limiting rule instead (Security › WAF › Rate limiting rules): URI path `/google/token`, 30 requests per 1 minute per IP, action Block.

Rotating `TICKET_KEY` only breaks connects started in the last 10 minutes. Rotating the client secret: add a second secret in Google Cloud Console, `wrangler secret put GOOGLE_CLIENT_SECRET` with it, then delete the old one in Google.

## Setup runbook

In this order. Piero does these. Steps 1 to 6 are needed before the relay can be deployed and tested; steps 8 and 9 only before Google's review.

1. **Cloudflare DNS.** Create an account with two-factor sign-in. Add trewe.me on the Free plan. Check the records Cloudflare imports against GoDaddy's DNS page: keep the website's records as DNS only (the site is on GoDaddy's site builder, `76.223.105.230` and `13.248.243.5` with `www` a CNAME to trewe.me, and behind Cloudflare's proxy it fails: first no certificate, then error 522), keep existing TXT records, and delete any `connect` record, since the deploy creates it. At GoDaddy, confirm DNSSEC is off, then switch to Cloudflare's two nameservers; GoDaddy stays the registrar. Wait for the zone to show Active. Leave Bot Fight Mode off: it can challenge the store servers that call `/google/token`, and the Free plan can't exempt them. AI crawler settings don't reach a DNS-only website.
2. **Email Routing** for `support@trewe.me` and `admin@trewe.me`, forwarding to Piero's inbox. Step 3 sends mail to `admin@trewe.me`, so this comes first.
3. **Cloud Identity Free** for trewe.me: verify the domain with a TXT record in Cloudflare, create `admin@trewe.me` with two-factor sign-in, and sign in to Google Cloud Console as that user so the organization exists. Confirm it under IAM & Admin → Manage resources before step 4; a project made earlier lands outside the organization.
4. **Google Cloud project "AI Storefront"** in the organization; no billing account is needed. Turn on the Google Search Console API. In Google Auth Platform:
   - **Branding:** app name "AI Storefront"; user support email `admin@trewe.me` (the list offers only the signed-in account and Google Groups it manages, so `support@trewe.me` needs a group in admin.google.com first); homepage `https://trewe.me`; privacy policy `https://trewe.me/privacy`; authorized domain `trewe.me`; developer contact `admin@trewe.me`.
   - **Audience:** External, Testing, with Piero's Google account as a test user.
   - **Data access:** `openid`, `…/auth/userinfo.email`, `…/auth/webmasters.readonly`.
5. **OAuth client**, type Web application, with redirect URIs `https://connect.trewe.me/google/callback` and `http://localhost:8787/google/callback`. Save the client secret in a password manager when it's shown: Google shows it once. The client ID isn't secret; it goes in `wrangler.toml`.
6. **Deploy** as in [Deploy](#deploy).
7. **A Google-verified test property,** for example saltwarp.shop, verified through #262's Webmaster tools card. The dev store points at it with a local mu-plugin setting `trewe_ai_storefront_google_site_url` and `trewe_ai_storefront_google_connect_enabled`.
8. **Before review: verify trewe.me in Search Console** as `admin@trewe.me` (a Domain property, with a TXT record in Cloudflare). Google's review checks the authorized domain's ownership.
9. **Before review: trewe.me pages.** A homepage that says what AI Storefront is, and a privacy policy that covers the Google data and includes Google's Limited Use statement: "AI Storefront's use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements."
10. **Review.** Once #206 connects end to end, submit for verification with the written justification and a demo video of the flow.

While the app is in Testing, a test store's approval lasts 7 days, so the test store shows `needs_reconnect` weekly. That also exercises the Reconnect path.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
