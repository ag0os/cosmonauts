/**
 * Tests for cli/packages/subcommand.ts
 * Covers install, uninstall, and packages list actions.
 */

import "../../helpers/readline.ts";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureCommandOutput } from "../../helpers/cli.ts";
import {
	createInstalledPackageFixture,
	createInstallResultFixture,
} from "../../helpers/packages.ts";
import { getReadlineMocks } from "../../helpers/readline.ts";

const readlineMocks = getReadlineMocks();

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

import {
	createInstallProgram,
	createPackagesProgram,
	createUninstallProgram,
	installAction,
	type PackageListRow,
	packagesListAction,
	renderInstallSuccess,
	renderPackagesList,
	resolveInstallRequest,
	uninstallAction,
} from "../../../cli/packages/subcommand.ts";
import {
	installPackage,
	uninstallPackage,
} from "../../../lib/packages/installer.ts";
import { listInstalledPackages } from "../../../lib/packages/store.ts";

const mockInstallPackage = vi.mocked(installPackage);
const mockUninstallPackage = vi.mocked(uninstallPackage);
const mockListInstalledPackages = vi.mocked(listInstalledPackages);

// ============================================================================
// Helpers
// ============================================================================

type QuestionCallback = (answer: string) => void;

function answerConflictPrompts(...answers: string[]): void {
	readlineMocks.question.mockImplementation(
		(_query: string, callback: QuestionCallback) => {
			const answer = answers.shift() ?? "";
			callback(answer);
		},
	);
}

function mockSingleConflictInstall(answer: string): void {
	answerConflictPrompts(answer);
	mockInstallPackage.mockResolvedValue(
		createInstallResultFixture({
			domainMergeResults: [{ domainId: "alpha", existingPackage: "old-pkg" }],
		}),
	);
	mockUninstallPackage.mockResolvedValue(true);
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
	readlineMocks.close.mockReset();
	readlineMocks.question.mockReset();
});

afterEach(() => {
	output.restore();
	vi.restoreAllMocks();
	process.exitCode = originalExitCode;
});

// ============================================================================
// install source resolution
// ============================================================================

const RETIRED_CATALOG_MESSAGE = /package-catalog installs were removed/i;

describe("resolveInstallRequest", () => {
	it("passes through git URLs, github shorthand, and paths unchanged", () => {
		for (const source of [
			"https://github.com/owner/repo",
			"github:owner/repo",
			"file:///abs/repo",
			"./my-pkg",
			"../my-pkg",
			"/abs/my-pkg",
			"nested/my-pkg",
		]) {
			expect(
				resolveInstallRequest(source, { projectRoot: "/project" }),
			).toStrictEqual({ source, scope: "user", cwd: "/project" });
		}
	});

	it("resolves project scope with --local", () => {
		expect(
			resolveInstallRequest("./my-pkg", {
				local: true,
				projectRoot: "/project",
			}),
		).toStrictEqual({ source: "./my-pkg", scope: "project", cwd: "/project" });
	});

	it("rejects a bare name that is not a local path as a retired catalog install", () => {
		expect(() =>
			resolveInstallRequest("some-package", {
				projectRoot: "/nonexistent-project-root",
			}),
		).toThrow(RETIRED_CATALOG_MESSAGE);
	});

	it("names the rejected argument and the supported install sources", () => {
		let message = "";
		try {
			resolveInstallRequest("some-package", {
				projectRoot: "/nonexistent-project-root",
			});
		} catch (err: unknown) {
			message = err instanceof Error ? err.message : String(err);
		}
		expect(message).toContain('"some-package"');
		expect(message).toContain("local path");
		expect(message).toContain("git URL");
		expect(message).toContain("github:owner/repo");
	});

	it("accepts a bare name that exists as a local path under the project root", async () => {
		const root = await mkdtemp(join(tmpdir(), "install-bare-name-"));
		try {
			await mkdir(join(root, "some-package"));
			expect(
				resolveInstallRequest("some-package", { projectRoot: root }),
			).toStrictEqual({ source: "some-package", scope: "user", cwd: root });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("leaves a slashless github: source to the installer instead of rejecting it as a catalog name", () => {
		expect(
			resolveInstallRequest("github:my-pkg", {
				projectRoot: "/nonexistent-project-root",
			}),
		).toStrictEqual({
			source: "github:my-pkg",
			scope: "user",
			cwd: "/nonexistent-project-root",
		});
	});

	it("treats a slashless dot-prefixed argument as a path, not a catalog name", () => {
		expect(
			resolveInstallRequest(".my-pkg", {
				projectRoot: "/nonexistent-project-root",
			}),
		).toStrictEqual({
			source: ".my-pkg",
			scope: "user",
			cwd: "/nonexistent-project-root",
		});
	});
});

describe("renderInstallSuccess", () => {
	it("renders global install success lines", () => {
		const lines = renderInstallSuccess(
			createInstallResultFixture({
				manifest: {
					name: "my-pkg",
					version: "1.2.3",
					description: "Test",
					domains: [
						{ name: "alpha", path: "domains/alpha" },
						{ name: "review", path: "domains/review" },
					],
				},
				installedTo: "/store/my-pkg",
			}),
			"user",
		);

		expect(lines).toEqual([
			'Installed "my-pkg" v1.2.3 [global]',
			"  Domains: alpha, review",
			"  Path:    /store/my-pkg",
		]);
	});

	it("renders local install success lines", () => {
		const lines = renderInstallSuccess(
			createInstallResultFixture({
				manifest: {
					name: "my-pkg",
					version: "1.2.3",
					description: "Test",
					domains: [{ name: "alpha", path: "domains/alpha" }],
				},
				installedTo: "/project/.cosmonauts/packages/my-pkg",
			}),
			"project",
		);

		expect(lines[0]).toBe('Installed "my-pkg" v1.2.3 [local]');
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
				domains: [{ name: "alpha", path: "domains/alpha" }],
			},
			installedTo: "/home/user/.cosmonauts/packages/my-pkg",
			domainMergeResults: [],
		});

		await installAction("./my-pkg", {
			projectRoot: "/project",
		});

		expect(output.stdout()).toContain('"my-pkg"');
		expect(output.stdout()).toContain("1.2.3");
		expect(output.stdout()).toContain("global"); // default scope
		expect(process.exitCode).toBeUndefined();
	});

	it("installs to project-local scope with --local", async () => {
		mockInstallPackage.mockResolvedValue({
			manifest: {
				name: "my-pkg",
				version: "1.0.0",
				description: "Test",
				domains: [{ name: "alpha", path: "domains/alpha" }],
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
		expect(output.stdout()).toContain("local");
	});

	it("passes link: true to installPackage with --link", async () => {
		mockInstallPackage.mockResolvedValue({
			manifest: {
				name: "my-pkg",
				version: "1.0.0",
				description: "Test",
				domains: [{ name: "alpha", path: "domains/alpha" }],
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
				domains: [{ name: "alpha", path: "domains/alpha" }],
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

	it("does not pass catalog metadata to installPackage", async () => {
		mockInstallPackage.mockResolvedValue({
			manifest: {
				name: "my-pkg",
				version: "1.0.0",
				description: "Test",
				domains: [{ name: "alpha", path: "alpha" }],
			},
			installedTo: "/store/my-pkg",
			domainMergeResults: [],
		});

		await installAction("https://github.com/owner/repo", {
			projectRoot: "/project",
		});

		const call = mockInstallPackage.mock.calls[0]?.[0];
		expect(call).not.toHaveProperty("catalogName");
	});
});

// ============================================================================
// installAction — retired package catalog
// ============================================================================

describe("installAction — retired package catalog", () => {
	it("fails a bare-name install without calling installPackage", async () => {
		await installAction("some-package", {
			projectRoot: "/nonexistent-project-root",
		});

		expect(mockInstallPackage).not.toHaveBeenCalled();
		expect(output.stderr()).toContain("cosmonauts install");
		expect(output.stderr()).toMatch(RETIRED_CATALOG_MESSAGE);
		expect(output.stderr()).toContain('"some-package"');
		expect(output.stdout()).not.toContain("Installed");
		expect(process.exitCode).toBe(1);
	});

	it("rejects every bare name the same way, with no special-cased names", async () => {
		for (const name of ["alpha", "coding", "my-domain"]) {
			mockInstallPackage.mockClear();
			await installAction(name, { projectRoot: "/nonexistent-project-root" });
			expect(mockInstallPackage).not.toHaveBeenCalled();
			expect(output.stderr()).toContain(`"${name}"`);
		}
		expect(process.exitCode).toBe(1);
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
				domains: [{ name: "alpha", path: "domains/alpha" }],
			},
			installedTo: "/store/new-pkg",
			domainMergeResults: [{ domainId: "alpha", existingPackage: "old-pkg" }],
		});

		await installAction("./new-pkg", {
			yes: true,
			projectRoot: "/project",
		});

		// uninstallPackage should NOT be called (merge = keep both)
		expect(mockUninstallPackage).not.toHaveBeenCalled();
		// Install should succeed
		expect(output.stdout()).toContain('"new-pkg"');
		expect(process.exitCode).toBeUndefined();
	});
});

// ============================================================================
// installAction — conflict prompt
// ============================================================================

describe("installAction — conflict prompt", () => {
	it("skips installation and rolls back the installed package", async () => {
		mockSingleConflictInstall("s");

		await installAction("./new-pkg", {
			projectRoot: "/project",
		});

		expect(mockUninstallPackage).toHaveBeenCalledWith(
			"new-pkg",
			"user",
			"/project",
		);
		expect(output.stdout()).toContain('Skipped: "new-pkg" was not installed.');
		expect(output.stdout()).not.toContain('Installed "new-pkg"');
		expect(process.exitCode).toBeUndefined();
	});

	it("cancels installation, rolls back, and sets exitCode = 1", async () => {
		mockSingleConflictInstall("c");

		await installAction("./new-pkg", {
			projectRoot: "/project",
		});

		expect(mockUninstallPackage).toHaveBeenCalledWith(
			"new-pkg",
			"user",
			"/project",
		);
		expect(output.stderr()).toContain(
			'cosmonauts install: cancelled — "new-pkg" was not installed.',
		);
		expect(output.stdout()).not.toContain('Installed "new-pkg"');
		expect(process.exitCode).toBe(1);
	});

	it("replaces each unique conflicting package before printing success", async () => {
		answerConflictPrompts("r");
		mockInstallPackage.mockResolvedValue(
			createInstallResultFixture({
				domainMergeResults: [
					{ domainId: "alpha", existingPackage: "old-pkg" },
					{ domainId: "alpha-tools", existingPackage: "old-pkg" },
					{ domainId: "review", existingPackage: "review-pkg" },
				],
			}),
		);
		mockUninstallPackage.mockResolvedValue(true);

		await installAction("./new-pkg", {
			projectRoot: "/project",
		});

		expect(mockUninstallPackage).toHaveBeenCalledTimes(2);
		expect(mockUninstallPackage).toHaveBeenNthCalledWith(
			1,
			"old-pkg",
			"user",
			"/project",
		);
		expect(mockUninstallPackage).toHaveBeenNthCalledWith(
			2,
			"review-pkg",
			"user",
			"/project",
		);
		expect(output.stdout()).toContain('Removed conflicting package: "old-pkg"');
		expect(output.stdout()).toContain(
			'Removed conflicting package: "review-pkg"',
		);
		expect(output.stdout()).toContain('Installed "new-pkg"');
		expect(process.exitCode).toBeUndefined();
	});

	it("prompts again after an invalid answer", async () => {
		answerConflictPrompts("invalid", "m");
		mockInstallPackage.mockResolvedValue(
			createInstallResultFixture({
				domainMergeResults: [{ domainId: "alpha", existingPackage: "old-pkg" }],
			}),
		);

		await installAction("./new-pkg", {
			projectRoot: "/project",
		});

		expect(readlineMocks.question).toHaveBeenCalledTimes(2);
		expect(mockUninstallPackage).not.toHaveBeenCalled();
		expect(output.stdout()).toContain('Installed "new-pkg"');
		expect(process.exitCode).toBeUndefined();
	});

	it("propagates rollback failures when skip is selected", async () => {
		answerConflictPrompts("s");
		mockInstallPackage.mockResolvedValue(
			createInstallResultFixture({
				domainMergeResults: [{ domainId: "alpha", existingPackage: "old-pkg" }],
			}),
		);
		mockUninstallPackage.mockRejectedValue(new Error("rollback failed"));

		await expect(
			installAction("./new-pkg", {
				projectRoot: "/project",
			}),
		).rejects.toThrow("rollback failed");

		expect(output.stdout()).not.toContain("Skipped:");
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

		expect(output.stderr()).toContain("Missing cosmonauts.json");
		expect(process.exitCode).toBe(1);
	});

	it("sets exitCode = 1 when install source is unknown (installPackage throws)", async () => {
		mockInstallPackage.mockRejectedValue(
			new Error('Missing or unreadable cosmonauts.json in "./unknown-pkg"'),
		);

		await installAction("./unknown-pkg", { projectRoot: "/project" });

		expect(output.stderr()).toContain("cosmonauts.json");
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

		expect(output.stdout()).toContain('"my-pkg"');
		expect(output.stdout()).toContain("global"); // default scope
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
		expect(output.stdout()).toContain("local");
	});
});

// ============================================================================
// uninstallAction — errors
// ============================================================================

describe("uninstallAction — not installed", () => {
	it("sets exitCode = 1 when package is not installed", async () => {
		mockUninstallPackage.mockResolvedValue(false);

		await uninstallAction("missing-pkg", { projectRoot: "/project" });

		expect(output.stderr()).toContain('"missing-pkg"');
		expect(output.stderr()).toContain("not installed");
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

		expect(output.stdout()).toContain("No packages installed");
	});
});

describe("packagesListAction — with packages", () => {
	it("prints package name, version, scope, and domain info", async () => {
		const pkg = createInstalledPackageFixture("my-pkg", "user");
		mockListInstalledPackages
			.mockResolvedValueOnce([pkg]) // global
			.mockResolvedValueOnce([]); // local

		await packagesListAction({ projectRoot: "/project" });

		expect(output.stdout()).toContain("my-pkg");
		expect(output.stdout()).toContain("1.0.0");
		expect(output.stdout()).toContain("global");
		expect(output.stdout()).toContain("alpha");
	});

	it("lists both global and local packages", async () => {
		const globalPkg = createInstalledPackageFixture("global-pkg", "user");
		const localPkg = createInstalledPackageFixture("local-pkg", "project");

		mockListInstalledPackages
			.mockResolvedValueOnce([globalPkg])
			.mockResolvedValueOnce([localPkg]);

		await packagesListAction({ projectRoot: "/project" });

		expect(output.stdout()).toContain("global-pkg");
		expect(output.stdout()).toContain("local-pkg");
		expect(output.stdout()).toContain("global");
		expect(output.stdout()).toContain("local");
	});

	it("shows header row", async () => {
		const pkg = createInstalledPackageFixture("my-pkg");
		mockListInstalledPackages
			.mockResolvedValueOnce([pkg])
			.mockResolvedValueOnce([]);

		await packagesListAction({ projectRoot: "/project" });

		expect(output.stdout()).toContain("PACKAGE");
		expect(output.stdout()).toContain("VERSION");
		expect(output.stdout()).toContain("SCOPE");
		expect(output.stdout()).toContain("DOMAINS");
	});
});

// ============================================================================
// renderPackagesList — pure renderer
// ============================================================================

describe("renderPackagesList", () => {
	const sample: PackageListRow[] = [
		{
			name: "alpha",
			version: "1.0.0",
			scope: "global",
			portable: true,
			domains: [{ name: "alpha", portable: true }],
		},
		{
			name: "devops",
			version: "0.2.1",
			scope: "local",
			portable: false,
			domains: [
				{ name: "devops", portable: false },
				{ name: "infra", portable: false },
			],
		},
	];

	it("emits the structured rows verbatim in JSON mode", () => {
		expect(renderPackagesList(sample, "json")).toEqual({
			kind: "json",
			value: sample,
		});
	});

	it("plain mode emits one tab-separated row per package", () => {
		expect(renderPackagesList(sample, "plain")).toEqual({
			kind: "lines",
			lines: [
				"alpha\t1.0.0\tglobal\tyes\talpha(portable)",
				"devops\t0.2.1\tlocal\tno\tdevops(local),infra(local)",
			],
		});
	});

	it("human mode includes a header and dashed separator", () => {
		const rendered = renderPackagesList(sample, "human");
		expect(rendered.kind).toBe("lines");
		if (rendered.kind === "lines") {
			expect(rendered.lines[0]).toMatch(
				/^PACKAGE.*VERSION.*SCOPE.*PORTABLE.*DOMAINS/,
			);
			expect(rendered.lines[1]).toMatch(/^-+/);
		}
	});

	it("human mode falls back to 'No packages installed.' on empty", () => {
		expect(renderPackagesList([], "human")).toEqual({
			kind: "lines",
			lines: ["No packages installed."],
		});
	});

	it("JSON mode on empty input emits an empty array, not a sentinel", () => {
		expect(renderPackagesList([], "json")).toEqual({ kind: "json", value: [] });
	});
});

describe("packagesListAction — JSON mode", () => {
	it("emits a JSON array of rows when mode is 'json'", async () => {
		const pkg = createInstalledPackageFixture("json-pkg", "user");
		mockListInstalledPackages
			.mockResolvedValueOnce([pkg])
			.mockResolvedValueOnce([]);

		await packagesListAction({ projectRoot: "/project", mode: "json" });

		const parsed = JSON.parse(output.stdout()) as PackageListRow[];
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.name).toBe("json-pkg");
		expect(parsed[0]?.scope).toBe("global");
	});

	it("emits an empty JSON array when no packages are installed", async () => {
		mockListInstalledPackages.mockResolvedValue([]);

		await packagesListAction({ projectRoot: "/project", mode: "json" });

		expect(JSON.parse(output.stdout())).toEqual([]);
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

	it("exposes --json and --plain output options", () => {
		const program = createPackagesProgram();
		const optionNames = program.options.map((o) => o.long);
		expect(optionNames).toContain("--json");
		expect(optionNames).toContain("--plain");
	});
});
