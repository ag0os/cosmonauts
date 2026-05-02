/**
 * Tests for lib/packages/scanner.ts
 * Covers scanDomainSources() with all source combinations.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import { scanDomainSources } from "../../lib/packages/scanner.ts";
import type { InstalledPackage } from "../../lib/packages/types.ts";

// ============================================================================
// Mock store
// ============================================================================

vi.mock("../../lib/packages/store.ts", () => ({
	listInstalledPackages: vi.fn(),
}));

import { listInstalledPackages } from "../../lib/packages/store.ts";

const mockListInstalledPackages = vi.mocked(listInstalledPackages);

// ============================================================================
// Mock node:fs/promises and node:os
// ============================================================================

vi.mock("node:fs/promises", () => ({
	stat: vi.fn(),
}));

vi.mock("node:os", () => ({
	homedir: vi.fn(() => "/home/user"),
}));

import { stat } from "node:fs/promises";

const mockStat = vi.mocked(stat);

// By default stat rejects (directories do not exist)
function statRejects(): void {
	mockStat.mockRejectedValue(
		Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
	);
}

function statExistsFor(...existingPaths: string[]): void {
	mockStat.mockImplementation(async (p) => {
		if (existingPaths.includes(p as string)) {
			return {
				isDirectory: () => true,
			} as Awaited<ReturnType<typeof stat>>;
		}
		throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
	});
}

function statAsFileFor(...filePaths: string[]): void {
	mockStat.mockImplementation(async (p) => {
		if (filePaths.includes(p as string)) {
			return {
				isDirectory: () => false,
			} as Awaited<ReturnType<typeof stat>>;
		}
		throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
	});
}

// ============================================================================
// Helpers
// ============================================================================

function makePackage(
	name: string,
	installPath: string,
	scope: "user" | "project",
	domainCount = 1,
): InstalledPackage {
	return {
		manifest: {
			name,
			version: "1.0.0",
			description: `Package ${name}`,
			domains: Array.from({ length: domainCount }, (_, i) => ({
				name: `domain-${i}`,
				path: `domain-${i}`,
			})),
		},
		installPath,
		scope,
		installedAt: new Date(),
	};
}

const BUILTIN_DIR = "/framework/domains";
const PROJECT_ROOT = "/project";

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
	mockListInstalledPackages.mockReset();
	mockStat.mockReset();
	statRejects(); // default: no directory-based tiers present
});

// ============================================================================
// No packages installed
// ============================================================================

describe("no packages installed", () => {
	test("returns only the built-in source when no packages are installed", async () => {
		mockListInstalledPackages.mockResolvedValue([]);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources).toHaveLength(1);
		expect(sources[0]).toEqual({
			domainsDir: BUILTIN_DIR,
			origin: "builtin",
			precedence: 0,
		});
	});
});

// ============================================================================
// Global-only packages
// ============================================================================

describe("global packages only", () => {
	test("returns built-in + global sources in precedence order", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "user") {
				return [makePackage("global-pkg", "/global/store/global-pkg", "user")];
			}
			return [];
		});

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources).toHaveLength(2);
		expect(sources[0]).toMatchObject({ origin: "builtin", precedence: 0 });
		expect(sources[1]).toMatchObject({
			domainsDir: "/global/store/global-pkg",
			origin: "global:global-pkg",
			precedence: 1,
		});
	});

	test("includes multiple global packages", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "user") {
				return [
					makePackage("pkg-a", "/global/store/pkg-a", "user"),
					makePackage("pkg-b", "/global/store/pkg-b", "user"),
				];
			}
			return [];
		});

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources).toHaveLength(3);
		expect(sources.map((s) => s.origin)).toEqual([
			"builtin",
			"global:pkg-a",
			"global:pkg-b",
		]);
		expect(sources.every((s) => s.precedence <= 1)).toBe(true);
	});
});

// ============================================================================
// Local-only packages
// ============================================================================

describe("local packages only", () => {
	test("returns built-in + local sources in precedence order", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "project") {
				return [
					makePackage(
						"local-pkg",
						"/project/.cosmonauts/packages/local-pkg",
						"project",
					),
				];
			}
			return [];
		});

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources).toHaveLength(2);
		expect(sources[0]).toMatchObject({ origin: "builtin", precedence: 0 });
		expect(sources[1]).toMatchObject({
			domainsDir: "/project/.cosmonauts/packages/local-pkg",
			origin: "local:local-pkg",
			precedence: 2,
		});
	});
});

// ============================================================================
// Both scopes
// ============================================================================

describe("global and local packages", () => {
	test("returns all sources ordered: built-in → global → local", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "user") {
				return [makePackage("global-pkg", "/global/store/global-pkg", "user")];
			}
			return [
				makePackage(
					"local-pkg",
					"/project/.cosmonauts/packages/local-pkg",
					"project",
				),
			];
		});

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources).toHaveLength(3);
		expect(sources[0]).toMatchObject({ origin: "builtin", precedence: 0 });
		expect(sources[1]).toMatchObject({
			origin: "global:global-pkg",
			precedence: 1,
		});
		expect(sources[2]).toMatchObject({
			origin: "local:local-pkg",
			precedence: 2,
		});
	});

	test("precedence values are strictly ordered", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "user") {
				return [makePackage("g", "/g/pkg", "user")];
			}
			return [makePackage("l", "/l/pkg", "project")];
		});

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		const precedences = sources.map((s) => s.precedence);
		expect(precedences).toEqual([0, 1, 2]);
	});
});

// ============================================================================
// Plugin dirs
// ============================================================================

describe("plugin dirs", () => {
	test("omitting pluginDirs returns only built-in + store sources", async () => {
		mockListInstalledPackages.mockResolvedValue([]);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources).toHaveLength(1);
		expect(sources.every((s) => s.precedence < 3)).toBe(true);
	});

	test("plugin dirs appear last with precedence 3", async () => {
		mockListInstalledPackages.mockResolvedValue([]);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
			pluginDirs: ["/plugin/a", "/plugin/b"],
		});

		expect(sources).toHaveLength(3);
		expect(sources[1]).toMatchObject({
			domainsDir: "/plugin/a",
			origin: "/plugin/a",
			precedence: 3,
		});
		expect(sources[2]).toMatchObject({
			domainsDir: "/plugin/b",
			origin: "/plugin/b",
			precedence: 3,
		});
	});

	test("full ordering: built-in → global → local → plugin", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "user") {
				return [makePackage("g", "/g/pkg", "user")];
			}
			return [makePackage("l", "/l/pkg", "project")];
		});

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
			pluginDirs: ["/plugin/dev"],
		});

		expect(sources).toHaveLength(4);
		expect(sources.map((s) => s.precedence)).toEqual([0, 1, 2, 3]);
		expect(sources.map((s) => s.origin)).toEqual([
			"builtin",
			"global:g",
			"local:l",
			"/plugin/dev",
		]);
	});
});

// ============================================================================
// Packages with no declared domains (skipped)
// ============================================================================

describe("packages with no declared domains are skipped", () => {
	test("global package with no domains is excluded from sources", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "user") {
				return [makePackage("no-domains-pkg", "/g/pkg", "user", 0)];
			}
			return [];
		});

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		// Only built-in; the package with 0 domains is skipped
		expect(sources).toHaveLength(1);
		expect(sources[0]?.origin).toBe("builtin");
	});

	test("local package with no domains is excluded", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "project") {
				return [makePackage("empty", "/l/pkg", "project", 0)];
			}
			return [];
		});

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources).toHaveLength(1);
	});

	test("packages with domains are included while empty ones are skipped", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "user") {
				return [
					makePackage("has-domains", "/g/has", "user", 2),
					makePackage("no-domains", "/g/none", "user", 0),
				];
			}
			return [];
		});

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources).toHaveLength(2); // builtin + has-domains
		expect(sources[1]?.origin).toBe("global:has-domains");
	});
});

// ============================================================================
// Bundled dirs
// ============================================================================

describe("bundled dirs", () => {
	test("bundled dirs appear between built-in (0) and global (1) at precedence 0.5", async () => {
		mockListInstalledPackages.mockResolvedValue([]);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
			bundledDirs: ["/bundled/coding"],
		});

		expect(sources).toHaveLength(2);
		expect(sources[0]).toMatchObject({ origin: "builtin", precedence: 0 });
		expect(sources[1]).toMatchObject({
			domainsDir: "/bundled/coding",
			origin: "bundled:coding",
			precedence: 0.5,
		});
	});

	test("full ordering: built-in → bundled → global → local → plugin", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "user") {
				return [makePackage("g", "/g/pkg", "user")];
			}
			return [makePackage("l", "/l/pkg", "project")];
		});

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
			bundledDirs: ["/bundled/coding"],
			pluginDirs: ["/plugin/dev"],
		});

		expect(sources).toHaveLength(5);
		expect(sources.map((s) => s.origin)).toEqual([
			"builtin",
			"bundled:coding",
			"global:g",
			"local:l",
			"/plugin/dev",
		]);
		expect(sources.map((s) => s.precedence)).toEqual([0, 0.5, 1, 2, 3]);
	});

	test("multiple bundled dirs all get precedence 0.5", async () => {
		mockListInstalledPackages.mockResolvedValue([]);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
			bundledDirs: ["/bundled/coding", "/bundled/extra"],
		});

		expect(sources).toHaveLength(3);
		expect(sources[1]).toMatchObject({
			origin: "bundled:coding",
			precedence: 0.5,
		});
		expect(sources[2]).toMatchObject({
			origin: "bundled:extra",
			precedence: 0.5,
		});
	});

	test("omitting bundledDirs does not add any bundled sources", async () => {
		mockListInstalledPackages.mockResolvedValue([]);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources.every((s) => s.precedence !== 0.5)).toBe(true);
	});
});

// ============================================================================
// User-domains tier (1.5)
// ============================================================================

const USER_DOMAINS_DIR = "/home/user/.cosmonauts/domains";
const PROJECT_DOMAINS_DIR = `${PROJECT_ROOT}/.cosmonauts/domains`;

describe("user-domains tier (1.5)", () => {
	test("when ~/.cosmonauts/domains/ exists, appears at precedence 1.5 with origin 'user-domains'", async () => {
		mockListInstalledPackages.mockResolvedValue([]);
		statExistsFor(USER_DOMAINS_DIR);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources).toHaveLength(2);
		expect(sources[1]).toMatchObject({
			domainsDir: USER_DOMAINS_DIR,
			origin: "user-domains",
			precedence: 1.5,
		});
	});

	test("when ~/.cosmonauts/domains/ does not exist, no user-domains source is added", async () => {
		mockListInstalledPackages.mockResolvedValue([]);
		// statRejects() already set in beforeEach

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources).toHaveLength(1);
		expect(sources.every((s) => s.origin !== "user-domains")).toBe(true);
	});

	test("when ~/.cosmonauts/domains/ exists as a file, user-domains source is not added", async () => {
		mockListInstalledPackages.mockResolvedValue([]);
		statAsFileFor(USER_DOMAINS_DIR);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources.every((s) => s.origin !== "user-domains")).toBe(true);
	});

	test("user-domains (1.5) appears after global-packages (1)", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "user") return [makePackage("g", "/g/pkg", "user")];
			return [];
		});
		statExistsFor(USER_DOMAINS_DIR);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		const globalIdx = sources.findIndex((s) => s.origin === "global:g");
		const userIdx = sources.findIndex((s) => s.origin === "user-domains");
		expect(globalIdx).toBeLessThan(userIdx);
		expect(sources[userIdx]?.precedence).toBe(1.5);
	});

	test("user-domains (1.5) is lower precedence than local-packages (2)", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "project") return [makePackage("l", "/l/pkg", "project")];
			return [];
		});
		statExistsFor(USER_DOMAINS_DIR);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		const userIdx = sources.findIndex((s) => s.origin === "user-domains");
		const localIdx = sources.findIndex((s) => s.origin === "local:l");
		expect(userIdx).toBeLessThan(localIdx);
		expect(sources[userIdx]?.precedence).toBeLessThan(
			sources[localIdx]?.precedence ?? 0,
		);
	});
});

// ============================================================================
// Project-domains tier (2.5)
// ============================================================================

describe("project-domains tier (2.5)", () => {
	test("when .cosmonauts/domains/ exists, appears at precedence 2.5 with origin 'project-domains'", async () => {
		mockListInstalledPackages.mockResolvedValue([]);
		statExistsFor(PROJECT_DOMAINS_DIR);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources).toHaveLength(2);
		expect(sources[1]).toMatchObject({
			domainsDir: PROJECT_DOMAINS_DIR,
			origin: "project-domains",
			precedence: 2.5,
		});
	});

	test("when .cosmonauts/domains/ does not exist, no project-domains source is added", async () => {
		mockListInstalledPackages.mockResolvedValue([]);
		// statRejects() already set in beforeEach

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources).toHaveLength(1);
		expect(sources.every((s) => s.origin !== "project-domains")).toBe(true);
	});

	test("when .cosmonauts/domains/ exists as a file, project-domains source is not added", async () => {
		mockListInstalledPackages.mockResolvedValue([]);
		statAsFileFor(PROJECT_DOMAINS_DIR);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources.every((s) => s.origin !== "project-domains")).toBe(true);
	});

	test("project-domains (2.5) appears after local-packages (2)", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "project") return [makePackage("l", "/l/pkg", "project")];
			return [];
		});
		statExistsFor(PROJECT_DOMAINS_DIR);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		const localIdx = sources.findIndex((s) => s.origin === "local:l");
		const projIdx = sources.findIndex((s) => s.origin === "project-domains");
		expect(localIdx).toBeLessThan(projIdx);
		expect(sources[projIdx]?.precedence).toBe(2.5);
	});
});

// ============================================================================
// Full 7-tier ordering
// ============================================================================

describe("full 7-tier ordering", () => {
	test("builtin → bundled → global-packages → user-domains → local-packages → project-domains → plugin", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "user") return [makePackage("g", "/g/pkg", "user")];
			return [makePackage("l", "/l/pkg", "project")];
		});
		statExistsFor(USER_DOMAINS_DIR, PROJECT_DOMAINS_DIR);

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
			bundledDirs: ["/bundled/coding"],
			pluginDirs: ["/plugin/dev"],
		});

		expect(sources).toHaveLength(7);
		expect(sources.map((s) => s.origin)).toEqual([
			"builtin",
			"bundled:coding",
			"global:g",
			"user-domains",
			"local:l",
			"project-domains",
			"/plugin/dev",
		]);
		expect(sources.map((s) => s.precedence)).toEqual([
			0, 0.5, 1, 1.5, 2, 2.5, 3,
		]);
	});

	test("when neither directory-based tier exists, output matches pre-change behavior", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "user") return [makePackage("g", "/g/pkg", "user")];
			return [makePackage("l", "/l/pkg", "project")];
		});
		// statRejects() already set in beforeEach — both dirs missing

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
			bundledDirs: ["/bundled/coding"],
			pluginDirs: ["/plugin/dev"],
		});

		expect(sources).toHaveLength(5);
		expect(sources.map((s) => s.origin)).toEqual([
			"builtin",
			"bundled:coding",
			"global:g",
			"local:l",
			"/plugin/dev",
		]);
		expect(sources.map((s) => s.precedence)).toEqual([0, 0.5, 1, 2, 3]);
	});
});

// ============================================================================
// DomainSource shape
// ============================================================================

describe("DomainSource fields", () => {
	test("each source has domainsDir, origin, and precedence", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "user") {
				return [makePackage("@org/pkg", "/g/pkg", "user")];
			}
			return [];
		});

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
			pluginDirs: ["/plugin"],
		});

		for (const source of sources) {
			expect(typeof source.domainsDir).toBe("string");
			expect(typeof source.origin).toBe("string");
			expect(typeof source.precedence).toBe("number");
		}
	});

	test("scoped package names are included in origin label", async () => {
		mockListInstalledPackages.mockImplementation(async (scope) => {
			if (scope === "user") {
				return [makePackage("@org/my-pkg", "/g/pkg", "user")];
			}
			return [];
		});

		const sources = await scanDomainSources({
			builtinDomainsDir: BUILTIN_DIR,
			projectRoot: PROJECT_ROOT,
		});

		expect(sources[1]?.origin).toBe("global:@org/my-pkg");
	});
});
