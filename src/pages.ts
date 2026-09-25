/**
 * The relay's only HTML: the confirm page before Google, and error pages.
 * No scripts, no external resources, no cookies.
 */

export const PAGE_HEADERS: Record< string, string > = {
	'Content-Type': 'text/html; charset=utf-8',
	'Content-Security-Policy':
		"default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; form-action 'none'; base-uri 'none'",
	'Cache-Control': 'no-store',
	'Referrer-Policy': 'no-referrer',
	'X-Content-Type-Options': 'nosniff',
};

export const SOURCE_URL = 'https://github.com/Trewe-me/trewe-connect';
export const PRIVACY_URL = 'https://trewe.me/privacy';

export const COPY = {
	invalidTitle: 'This connect link isn’t valid',
	expiredTitle: 'This link has expired',
	startAgain: 'Go back to your store’s wp-admin and click Connect again.',
};

const ENTITIES: Record< string, string > = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};

function escapeHtml( text: string ): string {
	return text.replace( /[&<>"']/g, ( c ) => ENTITIES[ c ] );
}

function layout( title: string, body: string ): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${ escapeHtml( title ) }</title>
<style>
body { margin: 0; background: #f6f7f9; color: #1b1f29; font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 460px; margin: 48px auto; padding: 28px; background: #fff; border: 1px solid #dfe3ea; border-radius: 10px; display: flex; flex-direction: column; gap: 14px; }
.brand { font-size: 13px; font-weight: 600; color: #0F348A; }
h1 { margin: 0; font-size: 21px; line-height: 1.3; overflow-wrap: anywhere; }
p { margin: 0; color: #3d4350; }
.host { font-family: ui-monospace, Menlo, Consolas, monospace; background: #eef1f6; padding: 1px 6px; border-radius: 4px; color: #1b1f29; overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
.button { display: inline-block; padding: 9px 16px; border-radius: 6px; border: 1px solid #0F348A; font-weight: 600; text-decoration: none; background: #0F348A; color: #fff; }
.button.ghost { background: #fff; color: #0F348A; }
.button:focus-visible { outline: 2px solid #0F348A; outline-offset: 2px; }
footer { margin-top: 8px; padding-top: 12px; border-top: 1px solid #eceff4; font-size: 12.5px; color: #5d6472; }
footer a { color: #0F348A; }
@media (max-width: 500px) { main { margin: 16px; } }
</style>
</head>
<body>
<main>
<div class="brand">AI Storefront by Trewe</div>
${ body }
<footer>connect.trewe.me passes sign-in tokens between your store and Google, and stores nothing. <a href="${ SOURCE_URL }">Source code</a> · <a href="${ PRIVACY_URL }">Privacy</a></footer>
</main>
</body>
</html>`;
}

export function confirmPage(
	host: string,
	continueUrl: string,
	cancelUrl: string
): string {
	return layout(
		'Connect to Google Search Console',
		`<h1>Connect <span class="host">${ escapeHtml( host ) }</span> to Google Search Console?</h1>
<p>AI Storefront will read this store’s Search Console data: clicks, searches and pages. It can’t change anything in Search Console.</p>
<p>Next, Google asks you to choose an account and allow access.</p>
<div class="actions"><a class="button" href="${ escapeHtml( continueUrl ) }">Continue to Google</a><a class="button ghost" href="${ escapeHtml( cancelUrl ) }">Cancel</a></div>`
	);
}

export function errorPage( title: string, message: string ): string {
	return layout(
		title,
		`<h1>${ escapeHtml( title ) }</h1>
<p>${ escapeHtml( message ) }</p>`
	);
}

export function htmlResponse( html: string, status = 200 ): Response {
	return new Response( html, { status, headers: PAGE_HEADERS } );
}
