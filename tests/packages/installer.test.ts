/**
 * Tests for lib/packages/installer.ts
 * Covers installPackage() and uninstallPackage()
 */

import { mkdir, mkdtemp, readlink, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { installPackage, uninstallPackage } from "../../lib/packages/installer.ts";

// ============================================================================
// Helpers
// ============================================================================

async function cleanup(dir: string): Promise<void> {
	try {
		await rm(dir, { recursive: true, force: true });
	} catch {
		// ignore
	}
}

interface PackageFixture {
	dir: string;
	domainDir: string;
}

/**
 * Create a minimal valid package directory with cosmonauts.json and
 * the declared domain subdirectory.
 */
async function createPackageFixture(
	root: string,
	name: string,
	domainName = "coding",
): Promise<PackageFixture> {
	const dir = join(root, name);
	const domainDir = join(dir, "domains", domainName);
	await mkdir(domainDir, { recursive: true });
	await writeFile(
		join(dir, "cosmonauts.json"),
		JSON.stringify({
			name,
			version: "1.0.0",
			description: `Package ${name}`,
			domains: [{ name: domainName, path: `domains/${domainName}` }],
		}),
		"utf-8",
	);
	return { dir, domainDir };
}

// ============================================================================
// Setup
// ============================================================================

let tmpRoot: string;
let projectRoot: string;

beforeEach(async () => {
	tmpRoot = await mkdtemp(join(tmpdir(), "cosmo-installer-test-"));
	projectRoot = join(tmpRoot, "project");
	await mkdir(projectRoot, { recursive: true });
});

afterEach(async () => {
	await cleanup(tmpRoot);
});

// ============================================================================
// installPackage — local copy (default)
// ============================================================================

describe("installPackage — local copy", () => {
	test("copies package directory into the store", async () => {
		const { dir } = await createPackageFixture(tmpRoot, "my-pkg");

		const result = await installPackage({
			source: dir,
			scope: "project",
			projectRoot,
		});

		const storePath = join(projectRoot, ".cosmonauts/packages/my-pkg");
		const s = await stat(storePath);
		expect(s.isDirectory()).toBe(true);
		expect(result.installedTo).toBe(storePath);
	});

	test("InstallResult includes manifest", async () => {
		const { dir } = await createPackageFixture(tmpRoot, "my-pkg");

		const result = await installPackage({
			source: dir,
			scope: "project",
			projectRoot,
		});

		expect(result.manifest.name).toBe("my-pkg");
		expect(result.manifest.version).toBe("1.0.0");
	});

	test("InstallResult includes installedTo path", async () => {
		const { dir } = await createPackageFixture(tmpRoot, "my-pkg");

		const result = await installPackage({
			source: dir,
			scope: "project",
			projectRoot,
		});

		expect(result.installedTo).toBe(
			join(projectRoot, ".cosmonauts/packages/my-pkg"),
		);
	});

	test("InstallResult includes domainMergeResults (empty when no conflicts)", async () => {
		const { dir } = await createPackageFixture(tmpRoot, "my-pkg");

		const result = await installPackage({
			source: dir,
			scope: "project",
			projectRoot,
		});

		expect(result.domainMergeResults).toEqual([]);
	});

	test("domainMergeResults reports conflict when another installed package provides the same domain", async () => {
		const { dir: dirA } = await createPackageFixture(tmpRoot, "pkg-a", "coding");
		const { dir: dirB } = await createPackageFixture(tmpRoot, "pkg-b", "coding");

		// Install first package
		await installPackage({ source: dirA, scope: "project", projectRoot });

		// Install second package that declares the same domain
		const result = await installPackage({
			source: dirB,
			scope: "project",
			projectRoot,
		});

		expect(result.domainMergeResults).toHaveLength(1);
		expect(result.domainMergeResults[0]).toEqual({
			domainId: "coding",
			existingPackage: "pkg-a",
		});
	});
});

// ============================================================================
// installPackage — symlink
// ============================================================================

describe("installPackage — symlink", () => {
	test("creates a symlink when link: true", async () => {
		const { dir } = await createPackageFixture(tmpRoot, "my-pkg");

		await installPackage({
			source: dir,
			scope: "project",
			projectRoot,
			link: true,
		});

		const storePath = join(projectRoot, ".cosmonauts/packages/my-pkg");
		const target = await readlink(storePath);
		expect(target).toBe(dir);
	});

	test("symlink result has correct installedTo path", async () => {
		const { dir } = await createPackageFixture(tmpRoot, "my-pkg");

		const result = await installPackage({
			source: dir,
			scope: "project",
			projectRoot,
			link: true,
		});

		expect(result.installedTo).toBe(
			join(projectRoot, ".cosmonauts/packages/my-pkg"),
		);
	});
});

// ============================================================================
// installPackage — invalid source
// ============================================================================

describe("installPackage — invalid source", () => {
	test("throws when cosmonauts.json is missing", async () => {
		const emptyDir = join(tmpRoot, "empty-pkg");
		await mkdir(emptyDir, { recursive: true });

		await expect(
			installPackage({ source: emptyDir, scope: "project", projectRoot }),
		).rejects.toThrow(/cosmonauts\.json/);
	});

	test("throws when a declared domain directory is absent", async () => {
		const pkgDir = join(tmpRoot, "bad-pkg");
		await mkdir(pkgDir, { recursive: true });
		// Manifest declares domains/coding but directory is not created
		await writeFile(
			join(pkgDir, "cosmonauts.json"),
			JSON.stringify({
				name: "bad-pkg",
				version: "1.0.0",
				description: "Bad",
				domains: [{ name: "coding", path: "domains/coding" }],
			}),
			"utf-8",
		);

		await expect(
			installPackage({ source: pkgDir, scope: "project", projectRoot }),
		).rejects.toThrow(/domains\/coding/);
	});

	test("throws with clear message when manifest is structurally invalid", async () => {
		const pkgDir = join(tmpRoot, "invalid-pkg");
		await mkdir(pkgDir, { recursive: true });
		await writeFile(
			join(pkgDir, "cosmonauts.json"),
			JSON.stringify({ name: "invalid-pkg" }), // missing required fields
			"utf-8",
		);

		await expect(
			installPackage({ source: pkgDir, scope: "project", projectRoot }),
		).rejects.toThrow(/Invalid cosmonauts\.json/);
	});
});

// ============================================================================
// uninstallPackage
// ============================================================================

describe("uninstallPackage", () => {
	test("removes the package directory and returns true", async () => {
		const { dir } = await createPackageFixture(tmpRoot, "my-pkg");
		await installPackage({ source: dir, scope: "project", projectRoot });

		const removed = await uninstallPackage("my-pkg", "project", projectRoot);

		expect(removed).toBe(true);
		const storePath = join(projectRoot, ".cosmonauts/packages/my-pkg");
		await expect(stat(storePath)).rejects.toThrow();
	});

	test("returns false when package does not exist", async () => {
		const removed = await uninstallPackage(
			"nonexistent-pkg",
			"project",
			projectRoot,
		);

		expect(removed).toBe(false);
	});
});
