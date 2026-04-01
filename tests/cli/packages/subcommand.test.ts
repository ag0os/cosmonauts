/**
 * Tests for cli/packages/subcommand.ts
 * Covers install, uninstall, and packages list actions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("../../../lib/packages/installer.ts", () => ({
	installPackage: vi.fn(),
	uninstallPackage: vi.fn(),
}));

vi.mock("../../../lib/packages/store.ts", () => ({
	listInstalledPackages: vi.fn(),
}));

vi.mock("../../../lib/packages/catalog.ts", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../../lib/packages/catalog.ts")>();
	return {
		...actual,
		resolveCatalogEntry: vi.fn(),
	};
});

import {
	createInstallProgram,
	createPackagesProgram,
	createUninstallProgram,
	installAction,
	packagesListAction,
	resolveSource,
	uninstallAction,
} from "../../../cli/packages/subcommand.ts";
import { resolveCatalogEntry } from "../../../lib/packages/catalog.ts";
import {
	installPackage,
	uninstallPackage,
} from "../../../lib/packages/installer.ts";
import { listInstalledPackages } from "../../../lib/packages/store.ts";
import type { InstalledPackage } from "../../../lib/packages/types.ts";

const mockInstallPackage = vi.mocked(installPackage);
const mockUninstallPackage = vi.mocked(uninstallPackage);
const mockListInstalledPackages = vi.mocked(listInstalledPackages);
const mockResolveCatalogEntry = vi.mocked(resolveCatalogEntry);

// ============================================================================
// Helpers
// ============================================================================

function makeInstalledPackage(
	name: string,
	scope: "user" | "project" = "user",
): InstalledPackage {
	return {
		manifest: {
			name,
			version: "1.0.0",
			description: `Package ${name}`,
			domains: [{ name: "coding", path: "domains/coding" }],
		},
		installPath: `/store/${name}`,
		scope,
		installedAt: new Date(),
	};
}

// ============================================================================
// Setup
// ============================================================================

let stdoutOutput: string;
let stderrOutput: string;
let originalExitCode: number | undefined;

beforeEach(() => {
	stdoutOutput = "";
	stderrOutput = "";
	originalExitCode = process.exitCode as number | undefined;

	vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
		stdoutOutput += String(chunk);
		return true;
	});
	vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
		stderrOutput += String(chunk);
		return true;
	});
	vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
		stdoutOutput += `${String(msg)}\n`;
	});

	process.exitCode = undefined;
	mockResolveCatalogEntry.mockReturnValue(undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
	process.exitCode = originalExitCode;
});

// ============================================================================
// resolveSource
// ============================================================================

describe("resolveSource", () => {
	it("passes through git URLs unchanged", () => {
		mockResolveCatalogEntry.mockReturnValue(undefined);
		expect(resolveSource("https://github.com/owner/repo")).toBe(
			"https://github.com/owner/repo",
		);
	});

	it("passes through local paths unchanged", () => {
		mockResolveCatalogEntry.mockReturnValue(undefined);
		expect(resolveSource("./my-pkg")).toBe("./my-pkg");
	});

	it("resolves catalog short names to an absolute path", () => {
		mockResolveCatalogEntry.mockReturnValue({
			name: "coding",
			description: "Coding domain",
			source: "./bundled/coding",
		});
		const result = resolveSource("coding");
		// Should be an absolute path containing "bundled/coding"
		expect(result).toMatch(/bundled[\\/]coding$/);
	});

	it("calls resolveCatalogEntry with the provided argument", () => {
		mockResolveCatalogEntry.mockReturnValue(undefined);
		resolveSource("some-name");
		expect(mockResolveCatalogEntry).toHaveBeenCalledWith("some-name");
	});
});

// ============================================================================
// installAction — success
// ============================================================================

describe("installAction — success", () => {
	it("installs a package and prints confirmation", async () => {
		mockInstallPackage.mockResolvedValue({
			manifest: {
				name: "my-pkg",
				version: "1.2.3",
				description: "Test",
				domains: [{ name: "coding", path: "domains/coding" }],
			},
			installedTo: "/home/user/.cosmonauts/packages/my-pkg",
			domainMergeResults: [],
		});

		await installAction("./my-pkg", {
			projectRoot: "/project",
		});

		expect(stdoutOutput).toContain('"my-pkg"');
		expect(stdoutOutput).toContain("1.2.3");
		expect(stdoutOutput).toContain("global"); // default scope
		expect(process.exitCode).toBeUndefined();
	});

	it("installs to project-local scope with --local", async () => {
		mockInstallPackage.mockResolvedValue({
			manifest: {
				name: "my-pkg",
				version: "1.0.0",
				description: "Test",
				domains: [{ name: "coding", path: "domains/coding" }],
			},
			installedTo: "/project/.cosmonauts/packages/my-pkg",
			domainMergeResults: [],
		});

		await installAction("./my-pkg", {
			local: true,
			projectRoot: "/project",
		});

		expect(mockInstallPackage).toHaveBeenCalledWith(
			expect.objectContaining({ scope: "project" }),
		);
		expect(stdoutOutput).toContain("local");
	});

	it("passes link: true to installPackage with --link", async () => {
		mockInstallPackage.mockResolvedValue({
			manifest: {
				name: "my-pkg",
				version: "1.0.0",
				description: "Test",
				domains: [{ name: "coding", path: "domains/coding" }],
			},
			installedTo: "/store/my-pkg",
			domainMergeResults: [],
		});

		await installAction("./my-pkg", {
			link: true,
			projectRoot: "/project",
		});

		expect(mockInstallPackage).toHaveBeenCalledWith(
			expect.objectContaining({ link: true }),
		);
	});

	it("passes branch to installPackage with --branch", async () => {
		mockInstallPackage.mockResolvedValue({
			manifest: {
				name: "my-pkg",
				version: "1.0.0",
				description: "Test",
				domains: [{ name: "coding", path: "domains/coding" }],
			},
			installedTo: "/store/my-pkg",
			domainMergeResults: [],
		});

		await installAction("https://github.com/owner/repo", {
			branch: "main",
			projectRoot: "/project",
		});

		expect(mockInstallPackage).toHaveBeenCalledWith(
			expect.objectContaining({ branch: "main" }),
		);
	});

	it("resolves catalog short name before calling installPackage", async () => {
		mockResolveCatalogEntry.mockReturnValue({
			name: "coding",
			description: "Coding domain",
			source: "./bundled/coding",
		});
		mockInstallPackage.mockResolvedValue({
			manifest: {
				name: "coding",
				version: "1.0.0",
				description: "Test",
				domains: [{ name: "coding", path: "coding" }],
			},
			installedTo: "/store/coding",
			domainMergeResults: [],
		});

		await installAction("coding", { projectRoot: "/project" });

		const call = mockInstallPackage.mock.calls[0]?.[0];
		expect(call?.source).toMatch(/bundled[\\/]coding$/);
	});
});

// ============================================================================
// installAction — --yes flag (non-interactive merge)
// ============================================================================

describe("installAction — --yes flag", () => {
	it("with --yes, proceeds without prompting when conflicts exist", async () => {
		mockInstallPackage.mockResolvedValue({
			manifest: {
				name: "new-pkg",
				version: "1.0.0",
				description: "Test",
				domains: [{ name: "coding", path: "domains/coding" }],
			},
			installedTo: "/store/new-pkg",
			domainMergeResults: [{ domainId: "coding", existingPackage: "old-pkg" }],
		});

		await installAction("./new-pkg", {
			yes: true,
			projectRoot: "/project",
		});

		// uninstallPackage should NOT be called (merge = keep both)
		expect(mockUninstallPackage).not.toHaveBeenCalled();
		// Install should succeed
		expect(stdoutOutput).toContain('"new-pkg"');
		expect(process.exitCode).toBeUndefined();
	});
});

// ============================================================================
// installAction — errors
// ============================================================================

describe("installAction — errors", () => {
	it("sets exitCode = 1 and prints error when installPackage throws", async () => {
		mockInstallPackage.mockRejectedValue(new Error("Missing cosmonauts.json"));

		await installAction("./nonexistent", { projectRoot: "/project" });

		expect(stderrOutput).toContain("Missing cosmonauts.json");
		expect(process.exitCode).toBe(1);
	});

	it("sets exitCode = 1 when install source is unknown (installPackage throws)", async () => {
		mockInstallPackage.mockRejectedValue(
			new Error('Missing or unreadable cosmonauts.json in "./unknown-pkg"'),
		);

		await installAction("./unknown-pkg", { projectRoot: "/project" });

		expect(stderrOutput).toContain("cosmonauts.json");
		expect(process.exitCode).toBe(1);
	});
});

// ============================================================================
// uninstallAction — success
// ============================================================================

describe("uninstallAction — success", () => {
	it("uninstalls a package and prints confirmation", async () => {
		mockUninstallPackage.mockResolvedValue(true);

		await uninstallAction("my-pkg", { projectRoot: "/project" });

		expect(stdoutOutput).toContain('"my-pkg"');
		expect(stdoutOutput).toContain("global"); // default scope
		expect(process.exitCode).toBeUndefined();
	});

	it("targets project-local scope with --local", async () => {
		mockUninstallPackage.mockResolvedValue(true);

		await uninstallAction("my-pkg", {
			local: true,
			projectRoot: "/project",
		});

		expect(mockUninstallPackage).toHaveBeenCalledWith(
			"my-pkg",
			"project",
			"/project",
		);
		expect(stdoutOutput).toContain("local");
	});
});

// ============================================================================
// uninstallAction — errors
// ============================================================================

describe("uninstallAction — not installed", () => {
	it("sets exitCode = 1 when package is not installed", async () => {
		mockUninstallPackage.mockResolvedValue(false);

		await uninstallAction("missing-pkg", { projectRoot: "/project" });

		expect(stderrOutput).toContain('"missing-pkg"');
		expect(stderrOutput).toContain("not installed");
		expect(process.exitCode).toBe(1);
	});
});

// ============================================================================
// packagesListAction
// ============================================================================

describe("packagesListAction — no packages", () => {
	it("prints 'No packages installed' when stores are empty", async () => {
		mockListInstalledPackages.mockResolvedValue([]);

		await packagesListAction({ projectRoot: "/project" });

		expect(stdoutOutput).toContain("No packages installed");
	});
});

describe("packagesListAction — with packages", () => {
	it("prints package name, version, scope, and domain info", async () => {
		const pkg = makeInstalledPackage("my-pkg", "user");
		mockListInstalledPackages
			.mockResolvedValueOnce([pkg]) // global
			.mockResolvedValueOnce([]); // local

		await packagesListAction({ projectRoot: "/project" });

		expect(stdoutOutput).toContain("my-pkg");
		expect(stdoutOutput).toContain("1.0.0");
		expect(stdoutOutput).toContain("global");
		expect(stdoutOutput).toContain("coding");
	});

	it("lists both global and local packages", async () => {
		const globalPkg = makeInstalledPackage("global-pkg", "user");
		const localPkg = makeInstalledPackage("local-pkg", "project");

		mockListInstalledPackages
			.mockResolvedValueOnce([globalPkg])
			.mockResolvedValueOnce([localPkg]);

		await packagesListAction({ projectRoot: "/project" });

		expect(stdoutOutput).toContain("global-pkg");
		expect(stdoutOutput).toContain("local-pkg");
		expect(stdoutOutput).toContain("global");
		expect(stdoutOutput).toContain("local");
	});

	it("shows header row", async () => {
		const pkg = makeInstalledPackage("my-pkg");
		mockListInstalledPackages
			.mockResolvedValueOnce([pkg])
			.mockResolvedValueOnce([]);

		await packagesListAction({ projectRoot: "/project" });

		expect(stdoutOutput).toContain("PACKAGE");
		expect(stdoutOutput).toContain("VERSION");
		expect(stdoutOutput).toContain("SCOPE");
		expect(stdoutOutput).toContain("DOMAINS");
	});
});

// ============================================================================
// Program structure
// ============================================================================

describe("createInstallProgram", () => {
	it("returns a Commander program named 'cosmonauts install'", () => {
		const program = createInstallProgram();
		expect(program.name()).toBe("cosmonauts install");
	});

	it("has --link, --local, --branch, and --yes options", () => {
		const program = createInstallProgram();
		const optionNames = program.options.map((o) => o.long);
		expect(optionNames).toContain("--link");
		expect(optionNames).toContain("--local");
		expect(optionNames).toContain("--branch");
		expect(optionNames).toContain("--yes");
	});
});

describe("createUninstallProgram", () => {
	it("returns a Commander program named 'cosmonauts uninstall'", () => {
		const program = createUninstallProgram();
		expect(program.name()).toBe("cosmonauts uninstall");
	});

	it("has --local option", () => {
		const program = createUninstallProgram();
		const optionNames = program.options.map((o) => o.long);
		expect(optionNames).toContain("--local");
	});
});

describe("createPackagesProgram", () => {
	it("returns a Commander program named 'cosmonauts packages'", () => {
		const program = createPackagesProgram();
		expect(program.name()).toBe("cosmonauts packages");
	});

	it("registers list subcommand", () => {
		const program = createPackagesProgram();
		const commandNames = program.commands.map((c) => c.name());
		expect(commandNames).toContain("list");
	});
});
