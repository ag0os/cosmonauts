/**
 * Tests for cli/update/subcommand.ts
 * Covers each source type branch: retired catalog, git, link, local, missing metadata.
 */

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureCommandOutput } from "../../helpers/cli.ts";
import {
	createInstalledPackageFixture,
	createInstallMetaFixture,
} from "../../helpers/packages.ts";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}));

vi.mock("../../../lib/packages/installer.ts", () => ({
	installPackage: vi.fn(),
	uninstallPackage: vi.fn(),
	loadInstallMeta: vi.fn(),
}));

vi.mock("../../../lib/packages/store.ts", () => ({
	listInstalledPackages: vi.fn(),
	resolveStorePath: vi.fn(),
}));

import { spawn } from "node:child_process";
import {
	createUpdateProgram,
	updateAction,
} from "../../../cli/update/subcommand.ts";
import {
	installPackage,
	loadInstallMeta,
	uninstallPackage,
} from "../../../lib/packages/installer.ts";
import {
	listInstalledPackages,
	resolveStorePath,
} from "../../../lib/packages/store.ts";

const mockLoadInstallMeta = vi.mocked(loadInstallMeta);
const mockSpawn = vi.mocked(spawn);
const mockInstallPackage = vi.mocked(installPackage);
const mockUninstallPackage = vi.mocked(uninstallPackage);
const mockListInstalledPackages = vi.mocked(listInstalledPackages);
const mockResolveStorePath = vi.mocked(resolveStorePath);

// ============================================================================
// Helpers
// ============================================================================

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

let output: ReturnType<typeof captureCommandOutput>;
let originalExitCode: number | undefined;

beforeEach(() => {
	output = captureCommandOutput();
	originalExitCode = process.exitCode as number | undefined;

	process.exitCode = undefined;

	// Default: resolveStorePath returns a path based on the package name
	mockResolveStorePath.mockImplementation((name: string) => `/store/${name}`);
	// Default: install/uninstall succeed
	mockInstallPackage.mockResolvedValue({
		manifest: {
			name: "alpha",
			version: "1.0.0",
			description: "test",
			domains: [{ name: "alpha", path: "domains/alpha" }],
		},
		installedTo: "/store/alpha",
		domainMergeResults: [],
	});
	mockUninstallPackage.mockResolvedValue(true);
});

afterEach(() => {
	output.restore();
	vi.restoreAllMocks();
	process.exitCode = originalExitCode;
});

// ============================================================================
// retired catalog source
// ============================================================================

describe("retired catalog source", () => {
	it("refuses to update a package installed from the retired catalog", async () => {
		mockLoadInstallMeta.mockResolvedValue(
			createInstallMetaFixture("catalog", { catalogName: "alpha" }),
		);

		await updateAction({ target: "my-pkg", projectRoot: "/project" });

		expect(output.stderr()).toContain("cosmonauts update");
		expect(output.stderr()).toContain('"my-pkg"');
		expect(output.stderr()).toMatch(/retired package catalog/i);
		expect(output.stderr()).toContain("cosmonauts install");
		expect(output.stderr()).toContain("github:owner/repo");
		expect(output.stdout()).not.toContain("Updated");
		expect(process.exitCode).toBe(1);
	});

	it("leaves the installed copy untouched", async () => {
		mockLoadInstallMeta.mockResolvedValue(
			createInstallMetaFixture("catalog", { catalogName: "custom-domain" }),
		);

		await updateAction({ target: "custom-domain", projectRoot: "/project" });

		expect(mockUninstallPackage).not.toHaveBeenCalled();
		expect(mockInstallPackage).not.toHaveBeenCalled();
		expect(mockSpawn).not.toHaveBeenCalled();
	});
});

// ============================================================================
// git source
// ============================================================================

describe("git source", () => {
	it("runs git pull in the install path on success", async () => {
		mockLoadInstallMeta.mockResolvedValue(
			createInstallMetaFixture("git", {
				url: "https://github.com/owner/repo",
				branch: null,
			}),
		);
		mockSpawn.mockReturnValue(mockSpawnProcess(0) as ReturnType<typeof spawn>);

		await updateAction({ target: "my-pkg", projectRoot: "/project" });

		expect(mockSpawn).toHaveBeenCalledWith(
			"git",
			["-C", "/store/my-pkg", "pull"],
			{ stdio: "pipe" },
		);
		expect(output.stdout()).toContain('Updated "my-pkg" via git pull');
		expect(process.exitCode).toBeUndefined();
	});

	it("sets exitCode and writes error when git pull fails", async () => {
		mockLoadInstallMeta.mockResolvedValue(
			createInstallMetaFixture("git", {
				url: "https://github.com/owner/repo",
				branch: null,
			}),
		);
		mockSpawn.mockReturnValue(
			mockSpawnProcess(1, "fatal: no upstream") as ReturnType<typeof spawn>,
		);

		await updateAction({ target: "my-pkg", projectRoot: "/project" });

		expect(output.stderr()).toContain("failed to update");
		expect(output.stderr()).toContain("git pull failed");
		expect(process.exitCode).toBe(1);
	});
});

// ============================================================================
// link source
// ============================================================================

describe("link source", () => {
	it("skips with a message — no error, no exitCode", async () => {
		mockLoadInstallMeta.mockResolvedValue(
			createInstallMetaFixture("link", { targetPath: "/abs/path/to/pkg" }),
		);

		await updateAction({ target: "my-pkg", projectRoot: "/project" });

		expect(output.stdout()).toContain(
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
		mockLoadInstallMeta.mockResolvedValue(
			createInstallMetaFixture("local", { originalPath: "/original/path" }),
		);

		await updateAction({ target: "my-pkg", projectRoot: "/project" });

		expect(output.stderr()).toContain("Local package source unknown");
		expect(output.stderr()).toContain("cosmonauts install <path>");
		expect(process.exitCode).toBeUndefined();
		expect(mockInstallPackage).not.toHaveBeenCalled();
	});
});

// ============================================================================
// missing metadata
// ============================================================================

describe("missing .cosmonauts-meta.json", () => {
	it("warns with a clear message — no exitCode", async () => {
		mockLoadInstallMeta.mockResolvedValue(null);

		await updateAction({ target: "my-pkg", projectRoot: "/project" });

		expect(output.stderr()).toContain("No metadata found");
		expect(output.stderr()).toContain('"my-pkg"');
		expect(output.stderr()).toContain("cannot determine update strategy");
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
			createInstalledPackageFixture("pkg-a"),
			createInstalledPackageFixture("pkg-b"),
			createInstalledPackageFixture("pkg-c"),
		]);

		// pkg-a: retired catalog, pkg-b: link, pkg-c: missing meta
		mockLoadInstallMeta.mockImplementation((path: unknown) => {
			const p = String(path);
			if (p.includes("pkg-a")) {
				return Promise.resolve(
					createInstallMetaFixture("catalog", { catalogName: "alpha" }),
				);
			}
			if (p.includes("pkg-b")) {
				return Promise.resolve(
					createInstallMetaFixture("link", { targetPath: "/abs" }),
				);
			}
			return Promise.resolve(null);
		});

		await updateAction({ all: true, projectRoot: "/project" });

		// retired catalog: refused, installed copy untouched
		expect(output.stderr()).toContain('"pkg-a"');
		expect(output.stderr()).toMatch(/retired package catalog/i);
		expect(mockUninstallPackage).not.toHaveBeenCalled();
		expect(mockInstallPackage).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);

		// link: skip message
		expect(output.stdout()).toContain("already live, no update needed");

		// missing meta: warning
		expect(output.stderr()).toContain('No metadata found for "pkg-c"');
	});

	it("reports no packages when none are installed", async () => {
		mockListInstalledPackages.mockResolvedValue([]);

		await updateAction({ all: true, projectRoot: "/project" });

		expect(output.stdout()).toContain("No packages installed.");
		expect(process.exitCode).toBeUndefined();
	});

	it("uses project scope with --local", async () => {
		mockListInstalledPackages.mockResolvedValue([
			createInstalledPackageFixture("pkg-a", "project"),
		]);
		mockLoadInstallMeta.mockResolvedValue(
			createInstallMetaFixture("link", { targetPath: "/abs" }),
		);

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

		expect(output.stderr()).toContain("specify a package name or use --all");
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
