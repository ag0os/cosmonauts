/** Current CLI consumer's bundled content catalog. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type CatalogEntry,
	resolveCatalogSource as resolveSource,
	getBundledCatalog as suppliedCatalog,
} from "../lib/packages/catalog.ts";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const CATALOG: readonly CatalogEntry[] = [
	{
		name: "coding",
		description:
			"Full-featured coding domain with agents, tools, and skills for software development",
		source: "./bundled/coding",
	},
];
export function getBundledCatalog(): readonly CatalogEntry[] {
	return suppliedCatalog(CATALOG);
}
export function resolveCatalogSource(source: string): string {
	return resolveSource(source, ROOT);
}
