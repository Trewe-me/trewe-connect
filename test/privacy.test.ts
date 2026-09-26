import { describe, expect, it } from 'vitest';

// The relay promises it logs nothing (README, "What it receives, keeps and
// logs"). Google's one-time code is in /google/callback's URL, and new
// Workers log every request URL unless observability is off, so these
// guards keep that promise from being broken by a later edit.

const SOURCES = import.meta.glob< string >( '../src/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true,
} );

const CONFIG = import.meta.glob< string >( '../wrangler.toml', {
	query: '?raw',
	import: 'default',
	eager: true,
} )[ '../wrangler.toml' ];

/** The body of a TOML table, up to the next table header. */
function table( toml: string, name: string ): string {
	const start = toml.indexOf( `[${ name }]` );
	if ( start === -1 ) {
		return '';
	}
	const rest = toml.slice( start + name.length + 2 );
	const next = rest.search( /^\[/m );
	return next === -1 ? rest : rest.slice( 0, next );
}

describe( 'logging stays off', () => {
	it( 'finds the source files', () => {
		expect( Object.keys( SOURCES ).length ).toBeGreaterThan( 5 );
	} );

	it( 'has no console calls in src/', () => {
		for ( const [ file, source ] of Object.entries( SOURCES ) ) {
			expect( source, file ).not.toMatch( /\bconsole\s*\.\s*\w+/ );
		}
	} );

	it( 'keeps Workers observability off in wrangler.toml', () => {
		expect( table( CONFIG, 'observability' ) ).toMatch( /^\s*enabled\s*=\s*false\s*$/m );
	} );

	it( 'serves only the custom domain', () => {
		expect( CONFIG ).toMatch( /^workers_dev\s*=\s*false\s*$/m );
		expect( CONFIG ).toMatch( /^preview_urls\s*=\s*false\s*$/m );
	} );
} );
