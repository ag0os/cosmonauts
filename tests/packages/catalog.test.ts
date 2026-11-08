/**
 * Tests for the current CLI consumer catalog
 * Covers getBundledCatalog() and resolveCatalogEntry()
 */

import { describe, expect, test } from "vitest";
import { getBundledCatalog } from "../../cli/package-catalog.ts";
import { resolveCatalogEntry as lookupEntry } from "../../lib/packages/catalog.ts";

const resolveCatalogEntry = (name: string) =>
	lookupEntry(name, getBundledCatalog());

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

	test("coding-minimal retired from bundled catalog", () => {
		const catalog = getBundledCatalog();
		const names = catalog.map((e) => e.name);
		expect(names).not.toContain("coding-minimal");
		expect(resolveCatalogEntry("coding-minimal")).toBeUndefined();
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

	test("returns undefined for an unknown name", () => {
		const entry = resolveCatalogEntry("unknown-name");
		expect(entry).toBeUndefined();
	});

	test("returns undefined for empty string", () => {
		const entry = resolveCatalogEntry("");
		expect(entry).toBeUndefined();
	});
});

test("the library has no implicit content catalog or framework source root", async () => {
	const { getBundledCatalog, resolveCatalogEntry, resolveCatalogSource } =
		await import("../../lib/packages/catalog.ts");
	expect(getBundledCatalog()).toEqual([]);
	expect(resolveCatalogEntry("coding")).toBeUndefined();
	const catalog = [
		{ name: "studio", description: "Consumer", source: "./provided" },
	];
	expect(getBundledCatalog(catalog)).toBe(catalog);
	expect(resolveCatalogEntry("studio", catalog)).toBe(catalog[0]);
	expect(() => resolveCatalogSource("./provided")).toThrow(
		"explicit consumer root",
	);
	expect(resolveCatalogSource("./provided", "/consumer")).toBe(
		"/consumer/provided",
	);
	expect(resolveCatalogSource("/absolute/source")).toBe("/absolute/source");
});
