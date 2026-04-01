/**
 * Tests for cli/update/subcommand.ts
 * Covers each source type branch: catalog, git, link, local, missing metadata.
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}));

vi.mock("../../../lib/packages/installer.ts", () => ({
	installPackage: vi.fn(),
	uninstallPackage: vi.fn(),
}));

vi.mock("../../../lib/packages/store.ts", () => ({
	listInstalledPackages: vi.fn(),
	resolveStorePath: vi.fn(),
}));

vi.mock("../../../lib/packages/catalog.ts", () => ({
	resolveCatalogEntry: vi.fn(),
}));

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
	createUpdateProgram,
	updateAction,
} from "../../../cli/update/subcommand.ts";
import { resolveCatalogEntry } from "../../../lib/packages/catalog.ts";
import {
	installPackage,
	uninstallPackage,
} from "../../../lib/packages/installer.ts";
import {
	listInstalledPackages,
	resolveStorePath,
} from "../../../lib/packages/store.ts";
import type { InstalledPackage } from "../../../lib/packages/types.ts";

const mockReadFile = vi.mocked(readFile);
const mockSpawn = vi.mocked(spawn);
const mockInstallPackage = vi.mocked(installPackage);
const mockUninstallPackage = vi.mocked(uninstallPackage);
const mockListInstalledPackages = vi.mocked(listInstalledPackages);
const mockResolveStorePath = vi.mocked(resolveStorePath);
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

function makeMeta(source: string, extra: Record<string, unknown> = {}): string {
	return JSON.stringify({
		source,
		installedAt: "2024-01-01T00:00:00.000Z",
		...extra,
	});
}

/** Creates a mock spawn child process that exits with the given code. */
function mockSpawnProcess(exitCode: number, stderrData?: string): EventEmitter {
	const proc = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
	const stderrEmitter = new EventEmitter();
	proc.stderr = stderrEmitter;
	if (stderrData) {
		process.nextTick(() => stderrEmitter.emit("data", Buffer.from(stderrData)));
	}
	process.nextTick(() => proc.emit("close", exitCode));
	return proc;
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

	// Default: resolveStorePath returns a path based on the package name
	mockResolveStorePath.mockImplementation((name: string) => `/store/${name}`);
	// Default: catalog entry not found
	mockResolveCatalogEntry.mockReturnValue(undefined);
	// Default: install/uninstall succeed
	mockInstallPackage.mockResolvedValue({
		manifest: {
			name: "coding",
			version: "1.0.0",
			description: "test",
			domains: [{ name: "coding", path: "domains/coding" }],
		},
		installedTo: "/store/coding",
		domainMergeResults: [],
	});
	mockUninstallPackage.mockResolvedValue(true);
});

afterEach(() => {
	vi.restoreAllMocks();
	process.exitCode = originalExitCode;
});

// ============================================================================
// catalog source
// ============================================================================

describe("catalog source", () => {
	it("uninstalls and re-installs from the catalog source path", async () => {
		mockReadFile.mockResolvedValue(
			makeMeta("catalog", { catalogName: "coding" }),
		);
		mockResolveCatalogEntry.mockReturnValue({
			name: "coding",
			description: "Coding domain",
			source: "./bundled/coding",
		});

		await updateAction({ target: "coding", projectRoot: "/project" });

		expect(mockUninstallPackage).toHaveBeenCalledWith(
			"coding",
			"user",
			"/project",
		);
		expect(mockInstallPackage).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: "user",
				projectRoot: "/project",
				catalogName: "coding",
			}),
		);
		expect(stdoutOutput).toContain('Updated "coding"');
		expect(stdoutOutput).toContain("catalog");
		expect(process.exitCode).toBeUndefined();
	});

	it("falls back to ./bundled/<catalogName> when catalog entry not found", async () => {
		mockReadFile.mockResolvedValue(
			makeMeta("catalog", { catalogName: "custom-domain" }),
		);
		mockResolveCatalogEntry.mockReturnValue(undefined);

		await updateAction({ target: "custom-domain", projectRoot: "/project" });

		const call = mockInstallPackage.mock.calls[0]?.[0];
		expect(call?.source).toMatch(/bundled[\\/]custom-domain/);
		expect(call?.catalogName).toBe("custom-domain");
	});

	it("writes an error and sets exitCode when re-install fails", async () => {
		mockReadFile.mockResolvedValue(
			makeMeta("catalog", { catalogName: "coding" }),
		);
		mockInstallPackage.mockRejectedValue(new Error("disk full"));

		await updateAction({ target: "coding", projectRoot: "/project" });

		expect(stderrOutput).toContain("failed to update");
		expect(stderrOutput).toContain("disk full");
		expect(process.exitCode).toBe(1);
	});
});

// ============================================================================
// git source
// ============================================================================

describe("git source", () => {
	it("runs git pull in the install path on success", async () => {
		mockReadFile.mockResolvedValue(
			makeMeta("git", { url: "https://github.com/owner/repo", branch: null }),
		);
		mockSpawn.mockReturnValue(mockSpawnProcess(0) as ReturnType<typeof spawn>);

		await updateAction({ target: "my-pkg", projectRoot: "/project" });

		expect(mockSpawn).toHaveBeenCalledWith(
			"git",
			["-C", "/store/my-pkg", "pull"],
			{ stdio: "pipe" },
		);
		expect(stdoutOutput).toContain('Updated "my-pkg" via git pull');
		expect(process.exitCode).toBeUndefined();
	});

	it("sets exitCode and writes error when git pull fails", async () => {
		mockReadFile.mockResolvedValue(
			makeMeta("git", { url: "https://github.com/owner/repo", branch: null }),
		);
		mockSpawn.mockReturnValue(
			mockSpawnProcess(1, "fatal: no upstream") as ReturnType<typeof spawn>,
		);

		await updateAction({ target: "my-pkg", projectRoot: "/project" });

		expect(stderrOutput).toContain("failed to update");
		expect(stderrOutput).toContain("git pull failed");
		expect(process.exitCode).toBe(1);
	});
});

// ============================================================================
// link source
// ============================================================================

describe("link source", () => {
	it("skips with a message — no error, no exitCode", async () => {
		mockReadFile.mockResolvedValue(
			makeMeta("link", { targetPath: "/abs/path/to/pkg" }),
		);

		await updateAction({ target: "my-pkg", projectRoot: "/project" });

		expect(stdoutOutput).toContain(
			"Symlinked package — already live, no update needed",
		);
		expect(process.exitCode).toBeUndefined();
		expect(mockInstallPackage).not.toHaveBeenCalled();
		expect(mockSpawn).not.toHaveBeenCalled();
	});
});

// ============================================================================
// local source
// ============================================================================

describe("local source", () => {
	it("warns and suggests re-install — no exitCode", async () => {
		mockReadFile.mockResolvedValue(
			makeMeta("local", { originalPath: "/original/path" }),
		);

		await updateAction({ target: "my-pkg", projectRoot: "/project" });

		expect(stderrOutput).toContain("Local package source unknown");
		expect(stderrOutput).toContain("cosmonauts install <path>");
		expect(process.exitCode).toBeUndefined();
		expect(mockInstallPackage).not.toHaveBeenCalled();
	});
});

// ============================================================================
// missing metadata
// ============================================================================

describe("missing .cosmonauts-meta.json", () => {
	it("warns with a clear message — no exitCode", async () => {
		mockReadFile.mockRejectedValue(
			Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
		);

		await updateAction({ target: "my-pkg", projectRoot: "/project" });

		expect(stderrOutput).toContain("No metadata found");
		expect(stderrOutput).toContain('"my-pkg"');
		expect(stderrOutput).toContain("cannot determine update strategy");
		expect(process.exitCode).toBeUndefined();
		expect(mockInstallPackage).not.toHaveBeenCalled();
	});
});

// ============================================================================
// --all flag
// ============================================================================

describe("--all flag", () => {
	it("iterates all installed packages and applies the correct strategy to each", async () => {
		mockListInstalledPackages.mockResolvedValue([
			makeInstalledPackage("pkg-a"),
			makeInstalledPackage("pkg-b"),
			makeInstalledPackage("pkg-c"),
		]);

		// pkg-a: catalog, pkg-b: link, pkg-c: missing meta
		mockReadFile.mockImplementation((path: unknown) => {
			const p = String(path);
			if (p.includes("pkg-a")) {
				return Promise.resolve(makeMeta("catalog", { catalogName: "coding" }));
			}
			if (p.includes("pkg-b")) {
				return Promise.resolve(makeMeta("link", { targetPath: "/abs" }));
			}
			return Promise.reject(
				Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
			);
		});

		await updateAction({ all: true, projectRoot: "/project" });

		// catalog update should have been attempted
		expect(mockUninstallPackage).toHaveBeenCalledWith(
			"pkg-a",
			"user",
			"/project",
		);
		expect(mockInstallPackage).toHaveBeenCalledTimes(1);

		// link: skip message
		expect(stdoutOutput).toContain("already live, no update needed");

		// missing meta: warning
		expect(stderrOutput).toContain('No metadata found for "pkg-c"');
	});

	it("reports no packages when none are installed", async () => {
		mockListInstalledPackages.mockResolvedValue([]);

		await updateAction({ all: true, projectRoot: "/project" });

		expect(stdoutOutput).toContain("No packages installed.");
		expect(process.exitCode).toBeUndefined();
	});

	it("uses project scope with --local", async () => {
		mockListInstalledPackages.mockResolvedValue([
			makeInstalledPackage("pkg-a", "project"),
		]);
		mockReadFile.mockResolvedValue(makeMeta("link", { targetPath: "/abs" }));

		await updateAction({ all: true, local: true, projectRoot: "/project" });

		expect(mockListInstalledPackages).toHaveBeenCalledWith(
			"project",
			"/project",
		);
	});
});

// ============================================================================
// Error: no target and no --all
// ============================================================================

describe("no target and no --all", () => {
	it("writes an error and sets exitCode", async () => {
		await updateAction({ projectRoot: "/project" });

		expect(stderrOutput).toContain("specify a package name or use --all");
		expect(process.exitCode).toBe(1);
	});
});

// ============================================================================
// Commander program
// ============================================================================

describe("createUpdateProgram", () => {
	it("returns a Command with the name 'cosmonauts update'", () => {
		const program = createUpdateProgram();
		expect(program.name()).toBe("cosmonauts update");
	});

	it("includes --all and --local options in the help output", () => {
		const program = createUpdateProgram();
		const helpText = program.helpInformation();
		expect(helpText).toContain("--all");
		expect(helpText).toContain("--local");
	});
});
