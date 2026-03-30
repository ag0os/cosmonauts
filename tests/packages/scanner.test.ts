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
		expect(sources[0]!.origin).toBe("builtin");
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
		expect(sources[1]!.origin).toBe("global:has-domains");
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

		expect(sources[1]!.origin).toBe("global:@org/my-pkg");
	});
});
