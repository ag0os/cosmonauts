/**
 * Tests for lib/packages/installer.ts
 * Covers installPackage() and uninstallPackage()
 */

import { execSync } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readFile,
	readlink,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	installPackage,
	uninstallPackage,
} from "../../lib/packages/installer.ts";

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
		const { dir: dirA } = await createPackageFixture(
			tmpRoot,
			"pkg-a",
			"coding",
		);
		const { dir: dirB } = await createPackageFixture(
			tmpRoot,
			"pkg-b",
			"coding",
		);

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

// ============================================================================
// Install metadata (.cosmonauts-meta.json)
// ============================================================================

async function readMeta(installDir: string): Promise<Record<string, unknown>> {
	const raw = await readFile(
		join(installDir, ".cosmonauts-meta.json"),
		"utf-8",
	);
	return JSON.parse(raw) as Record<string, unknown>;
}

function isIso8601(value: unknown): boolean {
	if (typeof value !== "string") return false;
	const date = new Date(value);
	return !Number.isNaN(date.getTime()) && value === date.toISOString();
}

describe("install metadata — local copy", () => {
	test("writes .cosmonauts-meta.json with source=local and originalPath", async () => {
		const { dir } = await createPackageFixture(tmpRoot, "my-pkg");

		const result = await installPackage({
			source: dir,
			scope: "project",
			projectRoot,
		});

		const meta = await readMeta(result.installedTo);
		expect(meta.source).toBe("local");
		expect(meta.originalPath).toBe(resolve(dir));
	});

	test("installedAt is a valid ISO 8601 timestamp", async () => {
		const { dir } = await createPackageFixture(tmpRoot, "my-pkg");

		const result = await installPackage({
			source: dir,
			scope: "project",
			projectRoot,
		});

		const meta = await readMeta(result.installedTo);
		expect(isIso8601(meta.installedAt)).toBe(true);
	});
});

describe("install metadata — catalog", () => {
	test("writes .cosmonauts-meta.json with source=catalog and catalogName", async () => {
		const { dir } = await createPackageFixture(tmpRoot, "my-pkg");

		const result = await installPackage({
			source: dir,
			scope: "project",
			projectRoot,
			catalogName: "coding",
		});

		const meta = await readMeta(result.installedTo);
		expect(meta.source).toBe("catalog");
		expect(meta.catalogName).toBe("coding");
	});

	test("installedAt is a valid ISO 8601 timestamp", async () => {
		const { dir } = await createPackageFixture(tmpRoot, "my-pkg");

		const result = await installPackage({
			source: dir,
			scope: "project",
			projectRoot,
			catalogName: "coding",
		});

		const meta = await readMeta(result.installedTo);
		expect(isIso8601(meta.installedAt)).toBe(true);
	});
});

describe("install metadata — symlink", () => {
	test("writes .cosmonauts-meta.json with source=link and targetPath", async () => {
		const { dir } = await createPackageFixture(tmpRoot, "my-pkg");

		const result = await installPackage({
			source: dir,
			scope: "project",
			projectRoot,
			link: true,
		});

		const meta = await readMeta(result.installedTo);
		expect(meta.source).toBe("link");
		expect(meta.targetPath).toBe(resolve(dir));
	});

	test("installedAt is a valid ISO 8601 timestamp", async () => {
		const { dir } = await createPackageFixture(tmpRoot, "my-pkg");

		const result = await installPackage({
			source: dir,
			scope: "project",
			projectRoot,
			link: true,
		});

		const meta = await readMeta(result.installedTo);
		expect(isIso8601(meta.installedAt)).toBe(true);
	});
});

describe("install metadata — git", () => {
	/**
	 * Creates a minimal local git repo containing a valid package, so we can
	 * clone it via file:// without network access.
	 */
	async function createGitRepoFixture(
		root: string,
		name: string,
	): Promise<string> {
		const repoDir = join(root, `${name}-repo`);
		const domainDir = join(repoDir, "domains", "coding");
		await mkdir(domainDir, { recursive: true });
		// Git does not track empty directories; add a placeholder
		await writeFile(join(domainDir, ".gitkeep"), "", "utf-8");
		await writeFile(
			join(repoDir, "cosmonauts.json"),
			JSON.stringify({
				name,
				version: "1.0.0",
				description: `Package ${name}`,
				domains: [{ name: "coding", path: "domains/coding" }],
			}),
			"utf-8",
		);
		execSync("git init -b main", { cwd: repoDir, stdio: "pipe" });
		execSync("git config user.email test@example.com", {
			cwd: repoDir,
			stdio: "pipe",
		});
		execSync("git config user.name Test", { cwd: repoDir, stdio: "pipe" });
		execSync("git add .", { cwd: repoDir, stdio: "pipe" });
		execSync("git commit -m init", { cwd: repoDir, stdio: "pipe" });
		return repoDir;
	}

	test("writes .cosmonauts-meta.json with source=git, url, and branch", async () => {
		const repoDir = await createGitRepoFixture(tmpRoot, "git-pkg");
		const fileUrl = `file://${repoDir}`;

		const result = await installPackage({
			source: fileUrl,
			scope: "project",
			projectRoot,
			branch: "main",
		});

		const meta = await readMeta(result.installedTo);
		expect(meta.source).toBe("git");
		expect(meta.url).toBe(fileUrl);
		expect(meta.branch).toBe("main");
	});

	test("branch is null when not specified", async () => {
		const repoDir = await createGitRepoFixture(tmpRoot, "git-pkg-nobranch");
		const fileUrl = `file://${repoDir}`;

		const result = await installPackage({
			source: fileUrl,
			scope: "project",
			projectRoot,
		});

		const meta = await readMeta(result.installedTo);
		expect(meta.source).toBe("git");
		expect(meta.branch).toBeNull();
	});

	test("installedAt is a valid ISO 8601 timestamp", async () => {
		const repoDir = await createGitRepoFixture(tmpRoot, "git-pkg-ts");
		const fileUrl = `file://${repoDir}`;

		const result = await installPackage({
			source: fileUrl,
			scope: "project",
			projectRoot,
		});

		const meta = await readMeta(result.installedTo);
		expect(isIso8601(meta.installedAt)).toBe(true);
	});
});
