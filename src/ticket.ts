/**
 * The signed ticket that carries a connect flow through Google and back,
 * so the relay stores nothing: the store's return URL (`r`), its state
 * (`s`), its PKCE challenge (`c`) and an expiry (`e`, Unix seconds).
 */
import { decodeBytes, decodeText, encodeBytes, encodeText } from './base64url';

export interface TicketPayload {
	r: string;
	s: string;
	c: string;
	e: number;
}

export const TICKET_LIFETIME_SECONDS = 600;

const encoder = new TextEncoder();

function hmacKey( secret: string ): Promise< CryptoKey > {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode( secret ),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		[ 'sign', 'verify' ]
	);
}

export async function signTicket(
	payload: TicketPayload,
	secret: string
): Promise< string > {
	const body = encodeText( JSON.stringify( payload ) );
	const signature = await crypto.subtle.sign(
		'HMAC',
		await hmacKey( secret ),
		encoder.encode( body )
	);
	return `${ body }.${ encodeBytes( new Uint8Array( signature ) ) }`;
}

function isPayload( value: unknown ): value is TicketPayload {
	if ( typeof value !== 'object' || value === null ) {
		return false;
	}
	const o = value as Record< string, unknown >;
	return (
		typeof o.r === 'string' &&
		typeof o.s === 'string' &&
		typeof o.c === 'string' &&
		typeof o.e === 'number'
	);
}

/**
 * The payload of a ticket this relay signed, or null. Checks the
 * signature (crypto.subtle.verify compares in constant time) and the
 * shape. Callers that care about expiry check `e` themselves.
 */
export async function readTicket(
	ticket: string,
	secret: string
): Promise< TicketPayload | null > {
	if ( ticket.length > 4096 ) {
		return null;
	}
	const parts = ticket.split( '.' );
	if ( parts.length !== 2 || ! parts[ 0 ] || ! parts[ 1 ] ) {
		return null;
	}
	const [ body, signatureText ] = parts;
	const signature = decodeBytes( signatureText );
	if ( ! signature ) {
		return null;
	}
	const valid = await crypto.subtle.verify(
		'HMAC',
		await hmacKey( secret ),
		signature,
		encoder.encode( body )
	);
	if ( ! valid ) {
		return null;
	}
	const json = decodeText( body );
	if ( json === null ) {
		return null;
	}
	try {
		const data: unknown = JSON.parse( json );
		return isPayload( data ) ? data : null;
	} catch {
		return null;
	}
}

/** The S256 PKCE challenge for a verifier (RFC 7636, section 4.2). */
export async function challengeFor( verifier: string ): Promise< string > {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		encoder.encode( verifier )
	);
	return encodeBytes( new Uint8Array( digest ) );
}
