/**
 * Bundled domain catalog — static registry of officially bundled domains.
 */

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
		source: "./bundled/coding",
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

/**
 * Resolve a framework-relative catalog source path to an absolute path.
 * e.g. "./bundled/coding" → "/usr/local/lib/cosmonauts/bundled/coding"
 */
export function resolveCatalogSource(catalogSource: string): string {
	const frameworkRoot = resolve(
		fileURLToPath(import.meta.url),
		"..",
		"..",
		"..",
	);
	return join(frameworkRoot, catalogSource);
}
