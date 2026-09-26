// Vite's import.meta.glob, typed only as far as the privacy test uses it,
// so the project doesn't need Vite's or Node's global types.
interface ImportMeta {
	glob< T >(
		pattern: string,
		options: { query: string; import: string; eager: true }
	): Record< string, T >;
}
