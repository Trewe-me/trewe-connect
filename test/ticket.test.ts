import { describe, expect, it } from 'vitest';
import { challengeFor, readTicket, signTicket } from '../src/ticket';
import { CHALLENGE, RETURN, STATE, VERIFIER } from './helpers';

const PAYLOAD = { r: RETURN, s: STATE, c: CHALLENGE, e: 1_790_000_600 };

describe( 'tickets', () => {
	it( 'reads back what it signed', async () => {
		const ticket = await signTicket( PAYLOAD, 'key' );
		expect( ticket ).toMatch( /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/ );
		expect( await readTicket( ticket, 'key' ) ).toEqual( PAYLOAD );
	} );

	it( 'refuses a ticket signed with another key', async () => {
		const ticket = await signTicket( PAYLOAD, 'other key' );
		expect( await readTicket( ticket, 'key' ) ).toBeNull();
	} );

	it( 'refuses a changed payload', async () => {
		const ticket = await signTicket( PAYLOAD, 'key' );
		const [ , sig ] = ticket.split( '.' );
		const forged = await signTicket(
			{ ...PAYLOAD, r: 'https://evil.example/wp-admin/admin.php' },
			'other key'
		);
		const [ forgedBody ] = forged.split( '.' );
		expect( await readTicket( `${ forgedBody }.${ sig }`, 'key' ) ).toBeNull();
	} );

	it( 'refuses malformed tickets', async () => {
		for ( const bad of [ '', 'abc', 'a.b.c', '.', 'abc.', '!!.??' ] ) {
			expect( await readTicket( bad, 'key' ) ).toBeNull();
		}
	} );

	it( 'refuses a signed payload of the wrong shape', async () => {
		const ticket = await signTicket(
			{ ...PAYLOAD, e: 'soon' } as unknown as typeof PAYLOAD,
			'key'
		);
		expect( await readTicket( ticket, 'key' ) ).toBeNull();
	} );
} );

describe( 'challengeFor', () => {
	it( 'matches RFC 7636 appendix B', async () => {
		expect( await challengeFor( VERIFIER ) ).toBe( CHALLENGE );
	} );
} );
