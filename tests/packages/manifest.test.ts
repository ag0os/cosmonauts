/**
 * Tests for lib/packages/manifest.ts
 * Covers loadManifest() and validateManifest()
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadManifest, validateManifest } from "../../lib/packages/manifest.ts";

// ============================================================================
// Helpers
// ============================================================================

async function createTestDir(): Promise<string> {
	return await mkdtemp(join(tmpdir(), "cosmo-packages-test-"));
}

async function cleanupTestDir(dir: string): Promise<void> {
	try {
		await rm(dir, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors
	}
}

async function writeManifest(dir: string, content: unknown): Promise<void> {
	await writeFile(
		join(dir, "cosmonauts.json"),
		JSON.stringify(content),
		"utf-8",
	);
}

function expectManifestError(
	result: ReturnType<typeof validateManifest>,
	field: string,
	reason: string,
): void {
	expect(result.valid).toBe(false);
	if (!result.valid) {
		expect(result.errors).toContainEqual({ field, reason });
	}
}

// ============================================================================
// loadManifest
// ============================================================================

describe("loadManifest", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTestDir();
	});

	afterEach(async () => {
		await cleanupTestDir(testDir);
	});

	test("reads and parses cosmonauts.json from a directory", async () => {
		const data = {
			name: "my-pkg",
			version: "1.0.0",
			description: "A package",
			domains: [],
		};
		await writeManifest(testDir, data);

		const result = await loadManifest(testDir);

		expect(result).toEqual(data);
	});

	test("throws when cosmonauts.json does not exist", async () => {
		await expect(loadManifest(testDir)).rejects.toThrow();
	});

	test("throws when file contains invalid JSON", async () => {
		await writeFile(join(testDir, "cosmonauts.json"), "not json", "utf-8");

		await expect(loadManifest(testDir)).rejects.toThrow();
	});

	test("returns raw parsed value without validation", async () => {
		await writeManifest(testDir, { arbitrary: true, fields: 42 });

		const result = await loadManifest(testDir);

		expect(result).toEqual({ arbitrary: true, fields: 42 });
	});
});

// ============================================================================
// validateManifest — valid input
// ============================================================================

describe("validateManifest — valid manifests", () => {
	test("returns valid result for a complete manifest", () => {
		const raw = {
			name: "my-package",
			version: "1.0.0",
			description: "A test package",
			domains: [{ name: "coding", path: "domains/coding" }],
		};

		const result = validateManifest(raw);

		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.manifest.name).toBe("my-package");
			expect(result.manifest.version).toBe("1.0.0");
			expect(result.manifest.description).toBe("A test package");
			expect(result.manifest.domains).toHaveLength(1);
		}
	});

	test("accepts scoped package name (@org/name)", () => {
		const raw = {
			name: "@myorg/my-package",
			version: "2.3.1",
			description: "A scoped package",
			domains: [{ name: "devops", path: "domains/devops" }],
		};

		const result = validateManifest(raw);

		expect(result.valid).toBe(true);
	});

	test("accepts multiple domains", () => {
		const raw = {
			name: "multi-domain",
			version: "0.1.0",
			description: "Package with multiple domains",
			domains: [
				{ name: "coding", path: "domains/coding" },
				{ name: "devops", path: "domains/devops" },
			],
		};

		const result = validateManifest(raw);

		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.manifest.domains).toHaveLength(2);
		}
	});
});

// ============================================================================
// validateManifest — missing required fields
// ============================================================================

describe("validateManifest — missing required fields", () => {
	const requiredMissingFieldErrors = [
		{ field: "name", reason: "missing" },
		{ field: "version", reason: "missing" },
		{ field: "description", reason: "missing" },
		{ field: "domains", reason: "missing" },
	];

	test.each([
		[
			"name",
			{
				version: "1.0.0",
				description: "A package",
				domains: [{ name: "x", path: "x" }],
			},
		],
		[
			"version",
			{
				name: "my-pkg",
				description: "A package",
				domains: [{ name: "x", path: "x" }],
			},
		],
		[
			"description",
			{
				name: "my-pkg",
				version: "1.0.0",
				domains: [{ name: "x", path: "x" }],
			},
		],
	])("returns error for missing %s", (field, raw) => {
		expectManifestError(validateManifest(raw), field, "missing");
	});

	test("returns error for missing domains", () => {
		const raw = { name: "my-pkg", version: "1.0.0", description: "A package" };

		expectManifestError(validateManifest(raw), "domains", "missing");
	});

	test("collects all missing field errors at once", () => {
		const result = validateManifest({});

		expect(result.valid).toBe(false);
		if (!result.valid) {
			const fields = result.errors.map((e) => e.field);
			expect(fields).toContain("name");
			expect(fields).toContain("version");
			expect(fields).toContain("description");
			expect(fields).toContain("domains");
		}
	});

	test("returns errors for non-object input", () => {
		const result = validateManifest("not an object");

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors.length).toBeGreaterThan(0);
		}
	});

	test.each([
		["null", null],
		["array", []],
		["string", "not an object"],
		["number", 42],
	])("returns exactly the required missing field errors for %s input", (_label, raw) => {
		const result = validateManifest(raw);

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors).toEqual(requiredMissingFieldErrors);
		}
	});
});

// ============================================================================
// validateManifest — invalid name format
// ============================================================================

describe("validateManifest — invalid name format", () => {
	function makeRaw(name: unknown): unknown {
		return {
			name,
			version: "1.0.0",
			description: "A package",
			domains: [{ name: "x", path: "x" }],
		};
	}

	test.each([
		["uppercase letters", "MyPackage"],
		["name starting with hyphen", "-my-pkg"],
		["name with spaces", "my package"],
		["non-string name", 42],
	])("rejects %s", (_label, name) => {
		expectManifestError(
			validateManifest(makeRaw(name)),
			"name",
			"invalid-format",
		);
	});

	test("accepts name with underscores and hyphens", () => {
		const result = validateManifest(makeRaw("my_package-v2"));

		expect(result.valid).toBe(true);
	});
});

// ============================================================================
// validateManifest — empty domains array
// ============================================================================

describe("validateManifest — empty domains array", () => {
	test("returns empty error for empty domains array", () => {
		const raw = {
			name: "my-pkg",
			version: "1.0.0",
			description: "A package",
			domains: [],
		};

		expectManifestError(validateManifest(raw), "domains", "empty");
	});

	test("returns invalid-entry error for non-array domains", () => {
		const raw = {
			name: "my-pkg",
			version: "1.0.0",
			description: "A package",
			domains: "coding",
		};

		expectManifestError(validateManifest(raw), "domains", "invalid-entry");
	});

	test("returns invalid-entry error for domains with missing path", () => {
		const raw = {
			name: "my-pkg",
			version: "1.0.0",
			description: "A package",
			domains: [{ name: "coding" }], // missing path
		};

		expectManifestError(validateManifest(raw), "domains", "invalid-entry");
	});
});
