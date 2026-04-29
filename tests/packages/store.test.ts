/**
 * Tests for lib/packages/store.ts
 * Covers resolveStorePath, listInstalledPackages, and packageExists
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	listInstalledPackages,
	packageExists,
	resolveStorePath,
} from "../../lib/packages/store.ts";
import type { InstalledPackage } from "../../lib/packages/types.ts";

// ============================================================================
// Helpers
// ============================================================================

async function cleanupTestDir(dir: string): Promise<void> {
	try {
		await rm(dir, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors
	}
}

const VALID_MANIFEST = {
	name: "my-pkg",
	version: "1.0.0",
	description: "A test package",
	domains: [{ name: "coding", path: "domains/coding" }],
};

let testDir: string;
let storeRoot: string;

beforeEach(async () => {
	testDir = await mkdtemp(join(tmpdir(), "cosmo-store-test-"));
	storeRoot = join(testDir, ".cosmonauts/packages");
});

afterEach(async () => {
	await cleanupTestDir(testDir);
});

/**
 * Creates a package directory with a cosmonauts.json inside the store root.
 */
async function writePackage(
	storeRoot: string,
	name: string,
	manifest: unknown = VALID_MANIFEST,
): Promise<string> {
	const pkgDir = join(storeRoot, name);
	await mkdir(pkgDir, { recursive: true });
	await writeFile(
		join(pkgDir, "cosmonauts.json"),
		JSON.stringify(manifest),
		"utf-8",
	);
	return pkgDir;
}

function expectSingleInstalledPackage(
	result: readonly InstalledPackage[],
	name: string,
): void {
	expect(result).toHaveLength(1);
	expect(result[0]?.manifest.name).toBe(name);
}

async function listSinglePackage(): Promise<InstalledPackage | undefined> {
	await writePackage(storeRoot, "my-pkg");

	const result = await listInstalledPackages("project", testDir);
	return result.find((p) => p.manifest.name === "my-pkg");
}

// ============================================================================
// resolveStorePath
// ============================================================================

describe("resolveStorePath", () => {
	test("returns ~/.cosmonauts/packages/<name> for global (user) scope", () => {
		const result = resolveStorePath("my-pkg", "user");
		expect(result).toBe(join(homedir(), ".cosmonauts/packages/my-pkg"));
	});

	test("returns <projectRoot>/.cosmonauts/packages/<name> for local (project) scope", () => {
		const projectRoot = "/home/user/myproject";
		const result = resolveStorePath("my-pkg", "project", projectRoot);
		expect(result).toBe(join(projectRoot, ".cosmonauts/packages/my-pkg"));
	});

	test("includes scoped package names in path", () => {
		const result = resolveStorePath("@org/my-pkg", "user");
		expect(result).toBe(join(homedir(), ".cosmonauts/packages/@org/my-pkg"));
	});

	test("throws when project scope is used without projectRoot", () => {
		expect(() => resolveStorePath("my-pkg", "project")).toThrow();
	});
});

// ============================================================================
// listInstalledPackages — user (global) scope
// ============================================================================

describe("listInstalledPackages — user scope", () => {
	test("global scope returns an array (smoke — real store may not exist)", async () => {
		const result = await listInstalledPackages("user");
		expect(Array.isArray(result)).toBe(true);
	});
});

// ============================================================================
// listInstalledPackages — project (local) scope
// ============================================================================

describe("listInstalledPackages — project scope", () => {
	test("returns empty array when store directory does not exist", async () => {
		const result = await listInstalledPackages("project", testDir);
		expect(result).toEqual([]);
	});

	test("returns empty array for empty store directory", async () => {
		await mkdir(storeRoot, { recursive: true });

		const result = await listInstalledPackages("project", testDir);
		expect(result).toEqual([]);
	});

	test("returns InstalledPackage for each valid package", async () => {
		await writePackage(storeRoot, "pkg-a");
		await writePackage(storeRoot, "pkg-b", {
			...VALID_MANIFEST,
			name: "pkg-b",
			description: "Package B",
		});

		const result = await listInstalledPackages("project", testDir);

		expect(result).toHaveLength(2);
		const names = result.map((p) => p.manifest.name).sort();
		expect(names).toEqual(["my-pkg", "pkg-b"]);
	});

	test("each InstalledPackage has correct installPath", async () => {
		const pkg = await listSinglePackage();

		expect(pkg?.installPath).toBe(join(storeRoot, "my-pkg"));
	});

	test("each InstalledPackage has correct scope", async () => {
		const pkg = await listSinglePackage();

		expect(pkg?.scope).toBe("project");
	});

	test("each InstalledPackage has an installedAt Date", async () => {
		const pkg = await listSinglePackage();

		expect(pkg?.installedAt).toBeInstanceOf(Date);
	});

	test("skips entries with missing cosmonauts.json", async () => {
		await writePackage(storeRoot, "valid-pkg");
		// Directory with no manifest
		await mkdir(join(storeRoot, "no-manifest"), { recursive: true });

		const result = await listInstalledPackages("project", testDir);

		expectSingleInstalledPackage(result, "my-pkg");
	});

	test("skips entries with corrupt (invalid JSON) manifest", async () => {
		await writePackage(storeRoot, "valid-pkg");
		const corruptDir = join(storeRoot, "corrupt-pkg");
		await mkdir(corruptDir, { recursive: true });
		await writeFile(
			join(corruptDir, "cosmonauts.json"),
			"not valid json",
			"utf-8",
		);

		const result = await listInstalledPackages("project", testDir);

		expect(result).toHaveLength(1);
	});

	test("skips entries with structurally invalid manifest", async () => {
		await writePackage(storeRoot, "valid-pkg");
		const invalidDir = join(storeRoot, "invalid-pkg");
		await mkdir(invalidDir, { recursive: true });
		await writeFile(
			join(invalidDir, "cosmonauts.json"),
			JSON.stringify({ name: "invalid-pkg" }), // missing required fields
			"utf-8",
		);

		const result = await listInstalledPackages("project", testDir);

		expect(result).toHaveLength(1);
	});

	test("skips non-directory entries in store root", async () => {
		await mkdir(storeRoot, { recursive: true });
		await writeFile(join(storeRoot, "somefile.txt"), "data", "utf-8");
		await writePackage(storeRoot, "valid-pkg");

		const result = await listInstalledPackages("project", testDir);

		expect(result).toHaveLength(1);
	});

	test("discovers valid scoped packages", async () => {
		await writePackage(storeRoot, "@org/pkg", {
			...VALID_MANIFEST,
			name: "@org/pkg",
		});

		const result = await listInstalledPackages("project", testDir);

		expectSingleInstalledPackage(result, "@org/pkg");
		expect(result[0]?.installPath).toBe(join(storeRoot, "@org/pkg"));
	});

	test("skips invalid scoped child manifests", async () => {
		await writePackage(storeRoot, "@org/valid", {
			...VALID_MANIFEST,
			name: "@org/valid",
		});
		await writePackage(storeRoot, "@org/invalid", { name: "@org/invalid" });

		const result = await listInstalledPackages("project", testDir);

		expectSingleInstalledPackage(result, "@org/valid");
	});

	test("skips scoped children whose stat fails", async () => {
		const scopeDir = join(storeRoot, "@org");
		await mkdir(scopeDir, { recursive: true });
		await symlink(join(testDir, "missing-target"), join(scopeDir, "missing"));
		await writePackage(storeRoot, "@org/valid", {
			...VALID_MANIFEST,
			name: "@org/valid",
		});

		const result = await listInstalledPackages("project", testDir);

		expectSingleInstalledPackage(result, "@org/valid");
	});
});

// ============================================================================
// packageExists
// ============================================================================

describe("packageExists", () => {
	test("returns true when package directory with valid manifest exists", async () => {
		await writePackage(storeRoot, "my-pkg");

		const result = await packageExists("my-pkg", "project", testDir);

		expect(result).toBe(true);
	});

	test("returns false when store directory does not exist", async () => {
		const result = await packageExists("my-pkg", "project", testDir);

		expect(result).toBe(false);
	});

	test("returns false when package directory does not exist", async () => {
		await mkdir(storeRoot, { recursive: true });

		const result = await packageExists("my-pkg", "project", testDir);

		expect(result).toBe(false);
	});

	test("returns false when cosmonauts.json is missing", async () => {
		await mkdir(join(storeRoot, "my-pkg"), { recursive: true });

		const result = await packageExists("my-pkg", "project", testDir);

		expect(result).toBe(false);
	});

	test("returns false when manifest has invalid JSON", async () => {
		const pkgDir = join(storeRoot, "my-pkg");
		await mkdir(pkgDir, { recursive: true });
		await writeFile(join(pkgDir, "cosmonauts.json"), "not json", "utf-8");

		const result = await packageExists("my-pkg", "project", testDir);

		expect(result).toBe(false);
	});

	test("returns false when manifest fails validation", async () => {
		const pkgDir = join(storeRoot, "my-pkg");
		await mkdir(pkgDir, { recursive: true });
		await writeFile(
			join(pkgDir, "cosmonauts.json"),
			JSON.stringify({ name: "my-pkg" }), // missing required fields
			"utf-8",
		);

		const result = await packageExists("my-pkg", "project", testDir);

		expect(result).toBe(false);
	});

	test("returns false for nonexistent package in global scope (smoke)", async () => {
		const result = await packageExists("nonexistent-pkg-xyz", "user");
		expect(result).toBe(false);
	});
});
