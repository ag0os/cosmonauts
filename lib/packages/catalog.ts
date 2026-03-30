/**
 * Bundled domain catalog — static registry of officially bundled domains.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * An entry in the bundled domain catalog.
 */
export interface CatalogEntry {
	/** Short name used to reference the domain (e.g., "coding") */
	name: string;
	/** Human-readable description of the domain */
	description: string;
	/** Source path relative to the framework root */
	source: string;
}

// ============================================================================
// Catalog
// ============================================================================

const BUNDLED_CATALOG: readonly CatalogEntry[] = [
	{
		name: "coding",
		description:
			"Full-featured coding domain with agents, tools, and skills for software development",
		source: "./domains/coding",
	},
	{
		name: "coding-minimal",
		description:
			"Minimal coding domain with essential agents only, for lightweight setups",
		source: "./domains/coding-minimal",
	},
] as const;

// ============================================================================
// Functions
// ============================================================================

/**
 * Returns the static catalog of officially bundled domains.
 */
export function getBundledCatalog(): readonly CatalogEntry[] {
	return BUNDLED_CATALOG;
}

/**
 * Looks up a catalog entry by short name.
 * Returns undefined if not found.
 */
export function resolveCatalogEntry(name: string): CatalogEntry | undefined {
	return BUNDLED_CATALOG.find((entry) => entry.name === name);
}
