/** Catalog lookup over explicitly supplied consumer entries. */
import { isAbsolute, resolve } from "node:path";

export interface CatalogEntry {
	name: string;
	description: string;
	/** Absolute source or a path resolved against an explicit consumer root. */
	source: string;
}

export function getBundledCatalog(
	catalog: readonly CatalogEntry[] = [],
): readonly CatalogEntry[] {
	return catalog;
}
export function resolveCatalogEntry(
	name: string,
	catalog: readonly CatalogEntry[] = [],
): CatalogEntry | undefined {
	return catalog.find((entry) => entry.name === name);
}
export function resolveCatalogSource(source: string, root?: string): string {
	if (isAbsolute(source)) return source;
	if (!root)
		throw new Error(
			"Relative catalog sources require an explicit consumer root",
		);
	return resolve(root, source);
}
