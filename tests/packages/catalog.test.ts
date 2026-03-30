/**
 * Tests for lib/packages/catalog.ts
 * Covers getBundledCatalog() and resolveCatalogEntry()
 */

import { describe, expect, test } from "vitest";
import {
	getBundledCatalog,
	resolveCatalogEntry,
} from "../../lib/packages/catalog.ts";

describe("getBundledCatalog", () => {
	test("returns an array", () => {
		const catalog = getBundledCatalog();
		expect(Array.isArray(catalog)).toBe(true);
	});

	test("contains the 'coding' entry", () => {
		const catalog = getBundledCatalog();
		const names = catalog.map((e) => e.name);
		expect(names).toContain("coding");
	});

	test("contains the 'coding-minimal' entry", () => {
		const catalog = getBundledCatalog();
		const names = catalog.map((e) => e.name);
		expect(names).toContain("coding-minimal");
	});

	test("every entry has name, description, and source fields", () => {
		for (const entry of getBundledCatalog()) {
			expect(typeof entry.name).toBe("string");
			expect(entry.name.length).toBeGreaterThan(0);
			expect(typeof entry.description).toBe("string");
			expect(entry.description.length).toBeGreaterThan(0);
			expect(typeof entry.source).toBe("string");
			expect(entry.source.length).toBeGreaterThan(0);
		}
	});

	test("source paths are relative to framework root (start with './')", () => {
		for (const entry of getBundledCatalog()) {
			expect(entry.source).toMatch(/^\.\//);
		}
	});
});

describe("resolveCatalogEntry", () => {
	test("returns the correct entry for 'coding'", () => {
		const entry = resolveCatalogEntry("coding");
		expect(entry).toBeDefined();
		expect(entry?.name).toBe("coding");
		expect(entry?.source).toBe("./bundled/coding");
	});

	test("returns the correct entry for 'coding-minimal'", () => {
		const entry = resolveCatalogEntry("coding-minimal");
		expect(entry).toBeDefined();
		expect(entry?.name).toBe("coding-minimal");
		expect(entry?.source).toBe("./bundled/coding-minimal");
	});

	test("returns undefined for an unknown name", () => {
		const entry = resolveCatalogEntry("unknown-name");
		expect(entry).toBeUndefined();
	});

	test("returns undefined for empty string", () => {
		const entry = resolveCatalogEntry("");
		expect(entry).toBeUndefined();
	});
});
