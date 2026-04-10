/**
 * Tests for lib/packages/eject.ts
 */

import {
	mkdir,
	mkdtemp,
	readFile,
	readlink,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ejectDomain } from "../../lib/packages/eject.ts";
import { listInstalledPackages } from "../../lib/packages/store.ts";

// ============================================================================
// Helpers
// ============================================================================

interface PkgFixtureOptions {
	name: string;
	domainName?: string;
	domainPath?: string;
	extraFiles?: Record<string, string>;
}

/**
 * Create a minimal package with a domain directory and cosmonauts.json.
 * Returns the package root directory.
 */
async function createPkgFixture(
	storeDir: string,
	opts: PkgFixtureOptions,
): Promise<string> {
	const {
		name,
		domainName = "coding",
		domainPath = `domains/${domainName}`,
		extraFiles = {},
	} = opts;

	const pkgDir = join(storeDir, name);
	const domainDir = join(pkgDir, domainPath);
	await mkdir(domainDir, { recursive: true });

	// domain.ts sentinel file
	await writeFile(
		join(domainDir, "domain.ts"),
		'export const id = "coding";\n',
		"utf-8",
	);

	// Write any extra files
	for (const [rel, content] of Object.entries(extraFiles)) {
		const fullPath = join(domainDir, rel);
		await mkdir(join(fullPath, ".."), { recursive: true });
		await writeFile(fullPath, content, "utf-8");
	}

	await writeFile(
		join(pkgDir, "cosmonauts.json"),
		JSON.stringify({
			name,
			version: "1.0.0",
			description: `Package ${name}`,
			domains: [{ name: domainName, path: domainPath }],
		}),
		"utf-8",
	);

	return pkgDir;
}

// ============================================================================
// Setup
// ============================================================================

let tmpRoot: string;
let projectRoot: string;
let localStore: string;
let globalStore: string;
let originalHome: string | undefined;

beforeEach(async () => {
	tmpRoot = await mkdtemp(join(tmpdir(), "cosmo-eject-test-"));
	projectRoot = join(tmpRoot, "project");
	localStore = join(projectRoot, ".cosmonauts", "packages");
	// Use an isolated home-like dir so tests don't touch the real global store
	globalStore = join(tmpRoot, "global", ".cosmonauts", "packages");
	originalHome = process.env.HOME;
	process.env.HOME = join(tmpRoot, "global");
	await mkdir(projectRoot, { recursive: true });
	await mkdir(globalStore, { recursive: true });
});

afterEach(async () => {
	process.env.HOME = originalHome;
	try {
		await rm(tmpRoot, { recursive: true, force: true });
	} catch {
		// ignore
	}
});

// ============================================================================
// AC #1 — basic copy with domain.ts present
// ============================================================================

describe("ejectDomain — basic copy", () => {
	test("copies domain directory to .cosmonauts/domains/<domainId>/ and domain.ts is present", async () => {
		await createPkgFixture(localStore, { name: "my-pkg" });

		const result = await ejectDomain({ domainId: "coding", projectRoot });

		const expectedTarget = join(
			projectRoot,
			".cosmonauts",
			"domains",
			"coding",
		);
		expect(result.ejectedTo).toBe(expectedTarget);

		const s = await stat(expectedTarget);
		expect(s.isDirectory()).toBe(true);

		const domainTs = await stat(join(expectedTarget, "domain.ts"));
		expect(domainTs.isFile()).toBe(true);
	});

	test("result includes correct source package metadata", async () => {
		await createPkgFixture(localStore, { name: "my-pkg" });

		const result = await ejectDomain({ domainId: "coding", projectRoot });

		expect(result.sourcePackage).toBe("my-pkg");
		expect(result.sourceScope).toBe("project");
		expect(result.sourcePath).toBe(
			join(localStore, "my-pkg", "domains", "coding"),
		);
	});
});

// ============================================================================
// Source scope metadata
// ============================================================================

describe("ejectDomain — source scope metadata", () => {
	test("reports user scope when domain comes from global store", async () => {
		await createPkgFixture(globalStore, { name: "global-pkg" });

		const result = await ejectDomain({ domainId: "coding", projectRoot });

		expect(result.sourcePackage).toBe("global-pkg");
		expect(result.sourceScope).toBe("user");
		expect(result.sourcePath).toContain(globalStore);
	});
});

// ============================================================================
// AC #2 — local package wins over global
// ============================================================================

describe("ejectDomain — local takes precedence over global", () => {
	test("uses local package when same domain exists in both scopes", async () => {
		await createPkgFixture(localStore, { name: "local-pkg" });
		const result = await ejectDomain({ domainId: "coding", projectRoot });
		expect(result.sourcePackage).toBe("local-pkg");
		expect(result.sourcePath).toContain(localStore);
	});
});

// ============================================================================
// AC #2b — within same scope, effective runtime winner is selected
// ============================================================================

describe("ejectDomain — same-scope conflicts", () => {
	test("selects the same local package that wins by source order", async () => {
		await createPkgFixture(localStore, {
			name: "alpha",
			extraFiles: { "marker.ts": "export const marker = 'alpha';\n" },
		});
		await createPkgFixture(localStore, {
			name: "beta",
			extraFiles: { "marker.ts": "export const marker = 'beta';\n" },
		});

		const localPackages = await listInstalledPackages("project", projectRoot);
		const localMatches = localPackages.filter((pkg) =>
			pkg.manifest.domains.some((domain) => domain.name === "coding"),
		);
		const expectedWinner = localMatches.at(-1);
		expect(expectedWinner).toBeDefined();

		const result = await ejectDomain({ domainId: "coding", projectRoot });
		expect(result.sourcePackage).toBe(expectedWinner?.manifest.name);

		const marker = await readFile(
			join(projectRoot, ".cosmonauts", "domains", "coding", "marker.ts"),
			"utf-8",
		);
		expect(marker).toContain(expectedWinner?.manifest.name ?? "");
	});
});

// ============================================================================
// AC #3 — domain not found
// ============================================================================

describe("ejectDomain — domain not found", () => {
	test("throws descriptive error when domain ID not in any package", async () => {
		// No packages installed at all
		await expect(
			ejectDomain({ domainId: "devops", projectRoot }),
		).rejects.toThrow(/Domain "devops" not found in any installed package/);

		await expect(
			ejectDomain({ domainId: "devops", projectRoot }),
		).rejects.toThrow(/cosmonauts install devops/);
	});

	test("throws when packages exist but none provides the requested domain", async () => {
		await createPkgFixture(localStore, {
			name: "my-pkg",
			domainName: "coding",
		});

		await expect(
			ejectDomain({ domainId: "devops", projectRoot }),
		).rejects.toThrow(/Domain "devops" not found/);
	});
});

// ============================================================================
// AC #4 — target exists: error without force, rm+copy with force
// ============================================================================

describe("ejectDomain — target already exists", () => {
	test("throws when target exists and force is not set", async () => {
		await createPkgFixture(localStore, { name: "my-pkg" });

		// First eject
		await ejectDomain({ domainId: "coding", projectRoot });

		// Second eject without force
		await expect(
			ejectDomain({ domainId: "coding", projectRoot }),
		).rejects.toThrow(/already ejected/);
	});

	test("overwrites when force is true — stale files are removed", async () => {
		await createPkgFixture(localStore, { name: "my-pkg" });

		// First eject
		await ejectDomain({ domainId: "coding", projectRoot });

		// Add a stale file to the ejected directory
		const ejectedDir = join(projectRoot, ".cosmonauts", "domains", "coding");
		await writeFile(join(ejectedDir, "stale.ts"), "// stale", "utf-8");

		// Re-eject with force
		await ejectDomain({ domainId: "coding", projectRoot, force: true });

		// Stale file must be gone
		await expect(stat(join(ejectedDir, "stale.ts"))).rejects.toThrow();
		// domain.ts should still be there
		await stat(join(ejectedDir, "domain.ts"));
	});
});

// ============================================================================
// AC #5 — import rewriting
// ============================================================================

describe("ejectDomain — import rewriting", () => {
	test("rewrites relative ../../lib/ imports in domain.ts", async () => {
		await createPkgFixture(localStore, {
			name: "my-pkg",
			extraFiles: {
				"domain.ts": 'import { foo } from "../../lib/something.ts";\n',
			},
		});

		await ejectDomain({ domainId: "coding", projectRoot });

		const content = await readFile(
			join(projectRoot, ".cosmonauts", "domains", "coding", "domain.ts"),
			"utf-8",
		);
		expect(content).toContain('from "cosmonauts/lib/something.ts"');
		expect(content).not.toContain("../../lib/");
	});

	test("rewrites single-quoted relative lib imports", async () => {
		await createPkgFixture(localStore, {
			name: "my-pkg",
			extraFiles: {
				"agents/single-quote.ts":
					"import { bar } from '../../../lib/core.ts';\n",
			},
		});

		await ejectDomain({ domainId: "coding", projectRoot });

		const content = await readFile(
			join(
				projectRoot,
				".cosmonauts",
				"domains",
				"coding",
				"agents",
				"single-quote.ts",
			),
			"utf-8",
		);
		expect(content).toContain("from 'cosmonauts/lib/core.ts'");
		expect(content).not.toContain("../../../lib/");
	});

	test("rewrites imports in nested agents/ files", async () => {
		await createPkgFixture(localStore, {
			name: "my-pkg",
			extraFiles: {
				"agents/worker.ts": 'import { bar } from "../../../lib/core.ts";\n',
			},
		});

		await ejectDomain({ domainId: "coding", projectRoot });

		const content = await readFile(
			join(
				projectRoot,
				".cosmonauts",
				"domains",
				"coding",
				"agents",
				"worker.ts",
			),
			"utf-8",
		);
		expect(content).toContain('from "cosmonauts/lib/core.ts"');
		expect(content).not.toContain("../../../lib/");
	});

	test("rewrites imports in workflows.ts", async () => {
		await createPkgFixture(localStore, {
			name: "my-pkg",
			extraFiles: {
				"workflows.ts":
					'import { step } from "../../../../lib/workflows.ts";\n',
			},
		});

		await ejectDomain({ domainId: "coding", projectRoot });

		const content = await readFile(
			join(projectRoot, ".cosmonauts", "domains", "coding", "workflows.ts"),
			"utf-8",
		);
		expect(content).toContain('from "cosmonauts/lib/workflows.ts"');
	});

	test("does not modify files that have no matching imports", async () => {
		const originalContent = 'export const id = "coding";\n';
		await createPkgFixture(localStore, {
			name: "my-pkg",
			extraFiles: { "domain.ts": originalContent },
		});

		await ejectDomain({ domainId: "coding", projectRoot });

		const content = await readFile(
			join(projectRoot, ".cosmonauts", "domains", "coding", "domain.ts"),
			"utf-8",
		);
		expect(content).toBe(originalContent);
	});
});

// ============================================================================
// AC #6 — link-installed package (symlink) produces real copy
// ============================================================================

describe("ejectDomain — link-installed package", () => {
	test("produces a real copy even when source package is a symlink", async () => {
		// Create a real package elsewhere
		const realPkgDir = join(tmpRoot, "real-pkg");
		const domainDir = join(realPkgDir, "domains", "coding");
		await mkdir(domainDir, { recursive: true });
		await writeFile(
			join(domainDir, "domain.ts"),
			'export const id = "coding";\n',
			"utf-8",
		);
		await writeFile(
			join(realPkgDir, "cosmonauts.json"),
			JSON.stringify({
				name: "link-pkg",
				version: "1.0.0",
				description: "Link pkg",
				domains: [{ name: "coding", path: "domains/coding" }],
			}),
			"utf-8",
		);

		// Install as a symlink in the local store
		await mkdir(localStore, { recursive: true });
		const linkPath = join(localStore, "link-pkg");
		await symlink(realPkgDir, linkPath);

		await ejectDomain({ domainId: "coding", projectRoot });

		const ejectedDir = join(projectRoot, ".cosmonauts", "domains", "coding");

		// Must be a real directory, not a symlink
		const s = await stat(ejectedDir); // stat follows symlinks
		expect(s.isDirectory()).toBe(true);

		// readlink should throw because the ejected path is not a symlink
		await expect(readlink(ejectedDir)).rejects.toThrow();
	});
});

// ============================================================================
// AC #7 (implicit) — domain.name ≠ last segment of domain.path
// ============================================================================

describe("ejectDomain — domain.name differs from domain.path last segment", () => {
	test("target directory uses domain.name (the ID), not the last path segment", async () => {
		// domain.name = "coding", domain.path = "domains/coding-v2"
		await createPkgFixture(localStore, {
			name: "my-pkg",
			domainName: "coding",
			domainPath: "domains/coding-v2",
		});

		const result = await ejectDomain({ domainId: "coding", projectRoot });

		// Target must be named by domain.name ("coding"), not "coding-v2"
		const expectedTarget = join(
			projectRoot,
			".cosmonauts",
			"domains",
			"coding",
		);
		expect(result.ejectedTo).toBe(expectedTarget);

		const s = await stat(expectedTarget);
		expect(s.isDirectory()).toBe(true);
	});
});
