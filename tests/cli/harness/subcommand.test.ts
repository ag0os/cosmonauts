import { existsSync } from "node:fs";
import {
	lstat,
	mkdir,
	readdir,
	readFile,
	readlink,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	createHarnessProgram,
	parseSyncRequest,
} from "../../../cli/harness/subcommand.ts";
import type { RuntimeSkillExportDiscovery } from "../../../cli/skills/subcommand.ts";
import {
	manifestEntryKey,
	readHarnessManifest,
	serializeHarnessManifest,
	sha256,
} from "../../../lib/harness-adapters/provenance.ts";
import type {
	HarnessAsset,
	OwnerIdentity,
} from "../../../lib/harness-adapters/types.ts";
import {
	type HarnessSyncReport,
	runHarnessSync,
} from "../../../lib/skills/exporter.ts";
import { captureCliOutput } from "../../helpers/cli.ts";
import { useTempDir } from "../../helpers/fs.ts";

const tmp = useTempDir("harness-cli-");

afterEach(() => {
	process.exitCode = undefined;
	vi.restoreAllMocks();
});

describe("cosmonauts harness sync", () => {
	test("registers the complete repeatable selector and reporting vocabulary", () => {
		const program = createHarnessProgram();
		const sync = program.commands.find((command) => command.name() === "sync");
		expect(sync).toBeDefined();
		expect(sync?.options.map((option) => option.long)).toEqual(
			expect.arrayContaining([
				"--target",
				"--scope",
				"--kind",
				"--asset",
				"--copy",
				"--link",
				"--check",
				"--forget-removed",
				"--transfer-owner",
			]),
		);
		expect(program.options.map((option) => option.long)).toEqual([
			"--json",
			"--plain",
		]);
		const help = `${program.helpInformation()}\n${sync?.helpInformation()}`;
		expect(help).not.toMatch(/--(?:force|adopt)\b/);
	});

	test("deduplicates selectors and makes explicit assets partial", () => {
		expect(
			parseSyncRequest({
				target: ["claude", "claude"],
				scope: ["project", "project"],
				kind: ["skill", "skill"],
				asset: ["skill:alpha/plan", "skill:alpha/plan"],
				forgetRemoved: [],
				check: true,
			}),
		).toEqual({
			targetIds: ["claude"],
			scopes: ["project"],
			kinds: ["skill"],
			assetIds: ["skill:alpha/plan"],
			reconciliation: "partial",
			check: true,
		});
	});

	test("rejects forget and transfer combinations before discovery or sync", async () => {
		const discover = vi.fn();
		const sync = vi.fn();
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		await createHarnessProgram({ discover, sync }).parseAsync(
			["sync", "--forget-removed", "skill:x", "--check"],
			{ from: "user" },
		);
		expect(discover).not.toHaveBeenCalled();
		expect(sync).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("--forget-removed cannot combine"),
		);
		expect(process.exitCode).toBe(1);
	});

	test("every invalid selector and option combination leaves arbitrary roots and mtimes unchanged", async () => {
		const fixture = await runtimeSkillFixture("invalid-options");
		const before = await snapshotRoots(fixture.projectRoot, fixture.homeRoot);
		const scenarios = [
			["invalid target", ["sync", "--target", "gemini"]],
			["invalid scope", ["sync", "--scope", "workspace"]],
			["invalid kind", ["sync", "--kind", "agent-package"]],
			["exclusive modes", ["sync", "--copy", "--link"]],
			[
				"forget with check",
				["sync", "--forget-removed", "skill:alpha/plan", "--check"],
			],
			[
				"forget with copy",
				["sync", "--forget-removed", "skill:alpha/plan", "--copy"],
			],
			[
				"forget with link",
				["sync", "--forget-removed", "skill:alpha/plan", "--link"],
			],
			[
				"forget with asset",
				[
					"sync",
					"--forget-removed",
					"skill:alpha/plan",
					"--asset",
					"skill:alpha/plan",
				],
			],
			[
				"forget with transfer",
				[
					"sync",
					"--forget-removed",
					"skill:alpha/plan",
					"--transfer-owner",
					"project:old",
				],
			],
			["transfer without asset", ["sync", "--transfer-owner", "project:old"]],
			[
				"transfer with check",
				[
					"sync",
					"--transfer-owner",
					"project:old",
					"--asset",
					"skill:alpha/plan",
					"--check",
				],
			],
			[
				"transfer with copy",
				[
					"sync",
					"--transfer-owner",
					"project:old",
					"--asset",
					"skill:alpha/plan",
					"--copy",
				],
			],
			[
				"transfer with link",
				[
					"sync",
					"--transfer-owner",
					"project:old",
					"--asset",
					"skill:alpha/plan",
					"--link",
				],
			],
			["unknown asset", ["sync", "--asset", "skill:missing"]],
			[
				"unsupported target kind",
				["sync", "--target", "codex", "--kind", "command"],
			],
		] as const;

		for (const [label, args] of scenarios) {
			process.exitCode = undefined;
			const error = vi.spyOn(console, "error").mockImplementation(() => {});
			const program = createHarnessProgram({
				projectRoot: fixture.projectRoot,
				homeRoot: fixture.homeRoot,
				assets: [suppliedCommand(fixture.projectRoot)],
				discover: async () => fixture.discovery,
			});
			program.exitOverride();
			program.configureOutput({ writeErr: () => {} });

			await program.parseAsync([...args], { from: "user" }).catch(() => {});

			expect(
				await snapshotRoots(fixture.projectRoot, fixture.homeRoot),
				label,
			).toEqual(before);
			error.mockRestore();
		}
	});

	test("emits every diagnostic report field in JSON and preserves exit status", async () => {
		const output = captureCliOutput();
		const report = reportFixture();
		await createHarnessProgram({
			projectRoot: tmp.path,
			homeRoot: join(tmp.path, "home"),
			discover: async () => emptyDiscovery(),
			sync: async () => report,
		}).parseAsync(["--json", "sync"], { from: "user" });
		const parsed = JSON.parse(output.stdout()) as HarnessSyncReport;
		expect(parsed).toEqual(report);
		expect(process.exitCode).toBe(1);
		output.restore();
	});

	test("check reports missing without creating roots locks manifests or targets", async () => {
		const fixture = await runtimeSkillFixture("check");
		const output = captureCliOutput();
		await createHarnessProgram({
			projectRoot: fixture.projectRoot,
			homeRoot: fixture.homeRoot,
			discover: async () => fixture.discovery,
		}).parseAsync(
			[
				"--json",
				"sync",
				"--target",
				"claude",
				"--asset",
				"skill:alpha/plan",
				"--check",
			],
			{ from: "user" },
		);
		const parsed = JSON.parse(output.stdout()) as HarnessSyncReport;
		expect(parsed.rows[0]).toMatchObject({
			asset: "skill:alpha/plan",
			before: "missing",
			final: "missing",
			action: "none",
		});
		expect(parsed.exitCode).toBe(1);
		expect(existsSync(join(fixture.projectRoot, ".claude"))).toBe(false);
		expect(
			existsSync(join(fixture.projectRoot, ".cosmonauts-harness-claude.lock")),
		).toBe(false);
		output.restore();
	});

	test("normal sync materializes through provenance and a subsequent check is current", async () => {
		const fixture = await runtimeSkillFixture("sync");
		const firstOutput = captureCliOutput();
		const dependencies = {
			projectRoot: fixture.projectRoot,
			homeRoot: fixture.homeRoot,
			discover: async () => fixture.discovery,
			sync: (options: Parameters<typeof runHarnessSync>[0]) =>
				runHarnessSync({
					...options,
					assets: options.assets.filter(
						(asset) => asset.assetId === "skill:alpha/plan",
					),
				}),
		};
		await createHarnessProgram(dependencies).parseAsync(
			["--json", "sync", "--target", "claude", "--asset", "skill:alpha/plan"],
			{ from: "user" },
		);
		const first = JSON.parse(firstOutput.stdout()) as HarnessSyncReport;
		expect(first).toMatchObject({ exitCode: 0 });
		expect(first.rows[0]).toMatchObject({
			before: "missing",
			final: "current",
			ownerDiagnostics: [`projectRoot=${await realpath(fixture.projectRoot)}`],
		});
		firstOutput.restore();

		const target = join(
			fixture.projectRoot,
			".claude",
			"skills",
			"plan",
			"SKILL.md",
		);
		expect(await readFile(target, "utf8")).toContain("Generated by cosmonauts");
		const beforeCheck = await snapshotRoots(
			fixture.projectRoot,
			fixture.homeRoot,
		);
		const secondOutput = captureCliOutput();
		await createHarnessProgram(dependencies).parseAsync(
			[
				"--json",
				"sync",
				"--target",
				"claude",
				"--asset",
				"skill:alpha/plan",
				"--check",
			],
			{ from: "user" },
		);
		const second = JSON.parse(secondOutput.stdout()) as HarnessSyncReport;
		expect(second).toMatchObject({ exitCode: 0 });
		expect(second.rows[0]).toMatchObject({
			before: "current",
			final: "current",
		});
		expect(await snapshotRoots(fixture.projectRoot, fixture.homeRoot)).toEqual(
			beforeCheck,
		);
		secondOutput.restore();
	});

	test("complete sync preserves an edited removed source and explicit forget changes only provenance", async () => {
		const fixture = await runtimeSkillFixture("forget");
		const dependencies = {
			projectRoot: fixture.projectRoot,
			homeRoot: fixture.homeRoot,
			discover: async () => fixture.discovery,
			sync: (options: Parameters<typeof runHarnessSync>[0]) =>
				runHarnessSync({
					...options,
					assets: options.assets.filter(
						(asset) => asset.assetId === "skill:alpha/plan",
					),
				}),
		};
		const initialOutput = captureCliOutput();
		await createHarnessProgram(dependencies).parseAsync(
			["--json", "sync", "--target", "claude", "--asset", "skill:alpha/plan"],
			{ from: "user" },
		);
		initialOutput.restore();
		const targetDir = join(fixture.projectRoot, ".claude", "skills", "plan");
		await writeFile(join(targetDir, "SKILL.md"), "local edit\n");
		await rm(join(fixture.projectRoot, "domain-alpha", "skills", "plan"), {
			recursive: true,
		});
		const removedDiscovery: RuntimeSkillExportDiscovery = {
			candidates: [],
			sourceHealth: fixture.discovery.sourceHealth,
		};

		const conflictOutput = captureCliOutput();
		await createHarnessProgram({
			...dependencies,
			discover: async () => removedDiscovery,
		}).parseAsync(["--json", "sync", "--target", "claude", "--kind", "skill"], {
			from: "user",
		});
		const conflict = JSON.parse(conflictOutput.stdout()) as HarnessSyncReport;
		expect(conflict).toMatchObject({ exitCode: 1 });
		expect(conflict.rows[0]).toMatchObject({
			before: "locally-edited",
			reason: "source-removed",
			action: "none",
		});
		expect(await readFile(join(targetDir, "SKILL.md"), "utf8")).toBe(
			"local edit\n",
		);
		conflictOutput.restore();

		process.exitCode = undefined;
		const forgetOutput = captureCliOutput();
		await createHarnessProgram({
			...dependencies,
			discover: async () => removedDiscovery,
		}).parseAsync(
			[
				"--json",
				"sync",
				"--target",
				"claude",
				"--scope",
				"project",
				"--forget-removed",
				"skill:alpha/plan",
			],
			{ from: "user" },
		);
		const forgotten = JSON.parse(forgetOutput.stdout()) as HarnessSyncReport;
		expect(forgotten).toMatchObject({ exitCode: 0 });
		expect(forgotten.rows[0]).toMatchObject({
			action: "forget-entry",
			final: "current",
		});
		expect(await readFile(join(targetDir, "SKILL.md"), "utf8")).toBe(
			"local edit\n",
		);
		const manifest = JSON.parse(
			await readFile(
				join(
					fixture.projectRoot,
					".claude",
					".cosmonauts-harness-manifest.json",
				),
				"utf8",
			),
		) as { entries: Record<string, unknown> };
		expect(manifest.entries).toEqual({});
		forgetOutput.restore();
	});

	test("rejects command link mode before owner-root or manifest writes", async () => {
		const projectRoot = join(tmp.path, "command-project");
		const homeRoot = join(tmp.path, "command-home");
		await Promise.all([
			mkdir(projectRoot, { recursive: true }),
			mkdir(homeRoot, { recursive: true }),
		]);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		await createHarnessProgram({
			projectRoot,
			homeRoot,
			assets: [suppliedCommand(join(tmp.path, "command-assets"))],
			discover: async () => emptyDiscovery(),
		}).parseAsync(
			["sync", "--target", "claude", "--kind", "command", "--link"],
			{ from: "user" },
		);
		expect(error).toHaveBeenCalledWith(
			expect.stringMatching(/command:supplied.*link.*copy/i),
		);
		expect(existsSync(join(homeRoot, ".claude"))).toBe(false);
		expect(existsSync(join(homeRoot, ".cosmonauts-harness-claude.lock"))).toBe(
			false,
		);
		expect(
			existsSync(join(homeRoot, ".cosmonauts-harness-claude.journal.json")),
		).toBe(false);
		expect(existsSync(join(homeRoot, ".agents"))).toBe(false);
	});

	test("an empty supplied catalog reports no rows and leaves no file behind", async () => {
		const projectRoot = join(tmp.path, "empty-project");
		const homeRoot = join(tmp.path, "empty-home");
		await Promise.all([
			mkdir(projectRoot, { recursive: true }),
			mkdir(homeRoot, { recursive: true }),
		]);
		const run = async (extra: readonly string[]) => {
			process.exitCode = undefined;
			const output = captureCliOutput();
			try {
				await createHarnessProgram({
					projectRoot,
					homeRoot,
					discover: async () => emptyDiscovery(),
				}).parseAsync(["--json", "sync", ...extra], { from: "user" });
				return JSON.parse(output.stdout()) as HarnessSyncReport;
			} finally {
				output.restore();
			}
		};
		const before = await snapshotRoots(projectRoot, homeRoot);

		expect(await run(["--check"])).toEqual({ rows: [], exitCode: 0 });
		expect(process.exitCode).toBeUndefined();
		expect(await snapshotRoots(projectRoot, homeRoot)).toEqual(before);

		// Complete reconciliation still takes and releases each owner-root lock.
		expect(await run([])).toEqual({ rows: [], exitCode: 0 });
		expect(process.exitCode).toBeUndefined();
		expect(Object.keys(await snapshotRoots(projectRoot, homeRoot))).toEqual(
			Object.keys(before),
		);
	});

	test("hands supplied assets to sync with one complete health row per unreported root", async () => {
		const fixture = await runtimeSkillFixture("supplied-catalog");
		const assetRoot = join(tmp.path, "supplied-catalog-assets");
		const skill = suppliedSkill(assetRoot, "supplied-skill");
		const command = suppliedCommand(assetRoot);
		const reportedRootCommand: HarnessAsset = {
			...suppliedCommand(assetRoot),
			assetId: "command:reported-root",
			sourceRootId: "alpha:test",
		};
		const sync = vi.fn(
			async (
				_options: Parameters<typeof runHarnessSync>[0],
			): Promise<HarnessSyncReport> => ({ rows: [], exitCode: 0 }),
		);
		await createHarnessProgram({
			projectRoot: fixture.projectRoot,
			homeRoot: fixture.homeRoot,
			assets: [skill, command, reportedRootCommand],
			discover: async () => fixture.discovery,
			sync,
		}).parseAsync(["sync"], { from: "user" });

		expect(sync).toHaveBeenCalledTimes(1);
		const options = sync.mock.calls[0]?.[0];
		if (!options) throw new Error("Expected one sync call.");
		expect(options.assets.map((asset) => asset.assetId)).toEqual([
			"skill:alpha/plan",
			skill.assetId,
			command.assetId,
			reportedRootCommand.assetId,
		]);
		expect(options.sourceHealth).toEqual([
			...fixture.discovery.sourceHealth,
			{
				sourceRootId: "consumer:assets",
				sourceRoot: assetRoot,
				domain: "injected",
				status: "complete",
				issues: [],
			},
		]);
		expect(process.exitCode).toBeUndefined();
	});

	test("a supplied skill that collides with a discovered skill blocks sync", async () => {
		const fixture = await runtimeSkillFixture("supplied-collision");
		const sync = vi.fn();
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		await createHarnessProgram({
			projectRoot: fixture.projectRoot,
			homeRoot: fixture.homeRoot,
			assets: [suppliedSkill(join(tmp.path, "collision-assets"), "plan")],
			discover: async () => fixture.discovery,
			sync,
		}).parseAsync(["sync"], { from: "user" });
		expect(sync).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("Skill output collisions: plan."),
		);
		expect(process.exitCode).toBe(1);
	});

	test("a supplied asset whose source is missing fails observation without writing", async () => {
		const projectRoot = join(tmp.path, "missing-source-project");
		const homeRoot = join(tmp.path, "missing-source-home");
		const assetRoot = join(tmp.path, "missing-source-assets");
		await Promise.all([
			mkdir(projectRoot, { recursive: true }),
			mkdir(homeRoot, { recursive: true }),
			mkdir(assetRoot, { recursive: true }),
		]);
		const before = await snapshotRoots(projectRoot, homeRoot);
		const output = captureCliOutput();
		await createHarnessProgram({
			projectRoot,
			homeRoot,
			assets: [{ ...suppliedCommand(assetRoot), sourcePath: "absent.md" }],
			discover: async () => emptyDiscovery(),
		}).parseAsync(
			["--json", "sync", "--target", "claude", "--kind", "command"],
			{
				from: "user",
			},
		);
		const report = JSON.parse(output.stdout()) as HarnessSyncReport;
		output.restore();
		expect(report.exitCode).toBe(1);
		expect(report.rows).toHaveLength(1);
		expect(report.rows[0]).toMatchObject({
			action: "failed",
			final: "source-ahead",
		});
		expect(report.rows[0]?.reason).toMatch(
			/^observation-failure:.*command:supplied.*missing or broken registered local source/,
		);
		expect(process.exitCode).toBe(1);
		expect(await snapshotRoots(projectRoot, homeRoot)).toEqual(before);
	});

	test("syncing a supplied command leaves unrelated target files alone", async () => {
		const projectRoot = join(tmp.path, "unrelated-project");
		const homeRoot = join(tmp.path, "unrelated-home");
		const assetRoot = join(tmp.path, "unrelated-assets");
		const commands = join(homeRoot, ".claude", "commands");
		const skills = join(homeRoot, ".claude", "skills", "hand-made");
		await Promise.all([
			mkdir(projectRoot, { recursive: true }),
			mkdir(commands, { recursive: true }),
			mkdir(skills, { recursive: true }),
		]);
		await writeSuppliedCommandSource(assetRoot);
		await writeFile(join(commands, "unrelated.md"), "hand-written command\n");
		await writeFile(join(skills, "SKILL.md"), "hand-written skill\n");
		const unrelatedBefore = {
			...(await snapshotTree(join(commands, "unrelated.md"), "command")),
			...(await snapshotTree(skills, "skill")),
		};
		const output = captureCliOutput();
		await createHarnessProgram({
			projectRoot,
			homeRoot,
			assets: [suppliedCommand(assetRoot)],
			discover: async () => emptyDiscovery(),
		}).parseAsync(
			["--json", "sync", "--target", "claude", "--scope", "personal"],
			{ from: "user" },
		);
		const report = JSON.parse(output.stdout()) as HarnessSyncReport;
		output.restore();
		expect(report).toMatchObject({ exitCode: 0 });
		expect(report.rows).toEqual([
			expect.objectContaining({
				asset: "command:supplied",
				ownerDiagnostics: ["authority=cosmonauts/core"],
				before: "missing",
				final: "current",
			}),
		]);
		expect(await readFile(join(commands, "supplied.md"), "utf8")).toContain(
			"Generated by cosmonauts",
		);
		expect({
			...(await snapshotTree(join(commands, "unrelated.md"), "command")),
			...(await snapshotTree(skills, "skill")),
		}).toEqual(unrelatedBefore);
	});

	test("a recorded generated-wrapper entry whose asset is no longer supplied parses, reports, and is forgotten without touching its target", async () => {
		const fixture = await recordedGeneratedWrapperFixture();
		const manifest = await readHarnessManifest(fixture.manifestPath);
		expect(manifest.entries[fixture.key]).toMatchObject({
			assetId: "external-skill:cosmonauts",
			owner: { kind: "authority", ownerId: "authority:cosmonauts/core" },
			provenance: { kind: "generated-wrapper" },
		});
		const targetBefore = await snapshotTree(fixture.targetPath, "target");
		const run = async (
			args: readonly string[],
			assets: readonly HarnessAsset[] = [],
		) => {
			process.exitCode = undefined;
			const output = captureCliOutput();
			try {
				await createHarnessProgram({
					projectRoot: fixture.projectRoot,
					homeRoot: fixture.homeRoot,
					assets,
					discover: async () => emptyDiscovery(),
				}).parseAsync(
					[
						"--json",
						"sync",
						"--target",
						"claude",
						"--scope",
						"personal",
						...args,
					],
					{ from: "user" },
				);
				return JSON.parse(output.stdout()) as HarnessSyncReport;
			} finally {
				output.restore();
			}
		};
		const recordedRow = (report: HarnessSyncReport) =>
			report.rows.find((row) => row.asset === "external-skill:cosmonauts");

		const undeclared = await run(["--check"]);
		expect(recordedRow(undeclared)).toMatchObject({
			owner: { kind: "authority", ownerId: "authority:cosmonauts/core" },
			before: "source-ahead",
			reason: "source-unavailable",
			action: "none",
		});

		const declaredRoot = await run(
			["--check"],
			[
				{
					...suppliedCommand(fixture.assetRoot),
					sourceRootId: "cosmonauts:package",
				},
			],
		);
		expect(recordedRow(declaredRoot)).toMatchObject({
			before: "source-ahead",
			reason: "source-removed",
			action: "none",
		});

		const forgotten = await run([
			"--forget-removed",
			"external-skill:cosmonauts",
		]);
		expect(forgotten.exitCode).toBe(0);
		expect(forgotten.rows).toEqual([
			expect.objectContaining({
				asset: "external-skill:cosmonauts",
				reason: "explicit-forget",
				action: "forget-entry",
				final: "current",
			}),
		]);
		expect((await readHarnessManifest(fixture.manifestPath)).entries).toEqual(
			{},
		);
		expect(await snapshotTree(fixture.targetPath, "target")).toEqual(
			targetBefore,
		);
	});
});

async function snapshotRoots(
	projectRoot: string,
	homeRoot: string,
): Promise<Record<string, string>> {
	return {
		...(await snapshotTree(projectRoot, "project")),
		...(await snapshotTree(homeRoot, "home")),
	};
}

async function snapshotTree(
	root: string,
	label: string,
): Promise<Record<string, string>> {
	const snapshot: Record<string, string> = {};

	async function visit(path: string, relativePath: string): Promise<void> {
		const stats = await lstat(path);
		const kind = stats.isSymbolicLink()
			? "link"
			: stats.isDirectory()
				? "directory"
				: "file";
		const linkTarget = stats.isSymbolicLink() ? await readlink(path) : "";
		snapshot[`${label}/${relativePath}`] = [
			kind,
			stats.size,
			stats.mode,
			stats.mtimeMs,
			linkTarget,
		].join(":");
		if (!stats.isDirectory() || stats.isSymbolicLink()) return;
		for (const entry of (await readdir(path)).sort()) {
			await visit(join(path, entry), join(relativePath, entry));
		}
	}

	await visit(root, ".");
	return snapshot;
}

async function runtimeSkillFixture(label: string) {
	const projectRoot = join(tmp.path, `${label}-project`);
	const homeRoot = join(tmp.path, `${label}-home`);
	const sourceRoot = join(projectRoot, "domain-alpha");
	const skillDir = join(sourceRoot, "skills", "plan");
	await Promise.all([
		mkdir(skillDir, { recursive: true }),
		mkdir(homeRoot, { recursive: true }),
	]);
	await writeFile(
		join(skillDir, "SKILL.md"),
		"---\nname: plan\ndescription: Plans\n---\n# Plan\n",
	);
	return {
		projectRoot,
		homeRoot,
		discovery: {
			candidates: [
				{
					name: "plan",
					description: "Plans",
					domain: "alpha",
					dirPath: skillDir,
					sourceRootId: "alpha:test",
					sourceRoot,
					sourcePath: "skills/plan",
					logicalPath: "plan",
					outputIdentity: "plan",
					flatteningRule: "frontmatter-name" as const,
					targetShape: "directory" as const,
				},
			],
			sourceHealth: [
				{
					sourceRootId: "alpha:test",
					sourceRoot,
					domain: "alpha",
					status: "complete" as const,
					issues: [],
				},
			],
		} satisfies RuntimeSkillExportDiscovery,
	};
}

function emptyDiscovery(): RuntimeSkillExportDiscovery {
	return { candidates: [], sourceHealth: [] };
}

function reportFixture(): HarnessSyncReport {
	return {
		exitCode: 1,
		rows: [
			{
				owner: {
					kind: "authority",
					ownerId: "authority:cosmonauts/core",
					authorityId: "cosmonauts/core",
				},
				ownerDiagnostics: ["authority=cosmonauts/core"],
				target: "claude",
				scope: "personal",
				kind: "command",
				asset: "command:implement-plan",
				source: "/source/implement-plan.md",
				targetPath: "/home/.claude/commands/implement-plan.md",
				recordedMode: "copy",
				requestedMode: "copy",
				before: "locally-edited",
				reason: "locally-edited",
				action: "none",
				final: "locally-edited",
				recovery: { state: "ambiguous", reason: "transaction-vector-other" },
				evidence: "required",
				discovery: ["read:/source:denied"],
				releaseWarning: "release unconfirmed",
			},
		],
	};
}

const CORE_AUTHORITY = {
	kind: "authority",
	ownerId: "authority:cosmonauts/core",
	authorityId: "cosmonauts/core",
} as const satisfies OwnerIdentity;

function suppliedSkill(sourceRoot: string, name: string): HarnessAsset {
	return {
		assetId: `skill:supplied/${name}`,
		kind: "skill",
		ownership: { kind: "project" },
		sourceRootId: "consumer:assets",
		sourceRoot,
		sourcePath: name,
		logicalPath: name,
		outputIdentity: name,
		defaultScope: "project",
	};
}

function suppliedCommand(sourceRoot: string): HarnessAsset {
	return {
		assetId: "command:supplied",
		kind: "command",
		ownership: { kind: "authority", authorityId: "cosmonauts/core" },
		sourceRootId: "consumer:assets",
		sourceRoot,
		sourcePath: "supplied.md",
		logicalPath: "supplied.md",
		outputIdentity: "supplied.md",
		defaultScope: "personal",
	};
}

async function writeSuppliedCommandSource(sourceRoot: string): Promise<void> {
	await mkdir(sourceRoot, { recursive: true });
	await writeFile(
		join(sourceRoot, "supplied.md"),
		"---\ndescription: Supplied\nargument-hint: <arg>\n---\n# Supplied\n",
	);
}

/**
 * A personal Claude install as an earlier release left it: a generated-wrapper
 * bundle owned by the core authority, from a source this release no longer
 * supplies.
 */
async function recordedGeneratedWrapperFixture() {
	const projectRoot = join(tmp.path, "recorded-project");
	const homeRoot = join(tmp.path, "recorded-home");
	const assetRoot = join(tmp.path, "recorded-assets");
	const retiredSource = join(tmp.path, "retired-package", "cosmonauts");
	await Promise.all([
		mkdir(projectRoot, { recursive: true }),
		mkdir(retiredSource, { recursive: true }),
		mkdir(join(homeRoot, ".claude", "skills", "cosmonauts", "references"), {
			recursive: true,
		}),
	]);
	await writeSuppliedCommandSource(assetRoot);
	const authoredSource = join(retiredSource, "SKILL.md");
	await writeFile(authoredSource, "---\nname: cosmonauts\n---\n# Bundle\n");
	const ownerRoot = join(await realpath(homeRoot), ".claude");
	const targetPath = join(ownerRoot, "skills", "cosmonauts");
	const generatedBytes = Buffer.from("# Generated inventory\n");
	await symlink(await realpath(authoredSource), join(targetPath, "SKILL.md"));
	await writeFile(
		join(targetPath, "references", "generated-inventory.md"),
		generatedBytes,
	);
	const key = manifestEntryKey(CORE_AUTHORITY, "external-skill:cosmonauts");
	const manifestPath = join(ownerRoot, ".cosmonauts-harness-manifest.json");
	await writeFile(
		manifestPath,
		serializeHarnessManifest({
			schemaVersion: 1,
			entries: {
				[key]: {
					schemaVersion: 1,
					owner: CORE_AUTHORITY,
					assetId: "external-skill:cosmonauts",
					kind: "skill",
					target: "claude",
					scope: "personal",
					sourceRootId: "cosmonauts:package",
					sourcePath: "external-skills/cosmonauts",
					logicalPath: "external-skills/cosmonauts",
					outputIdentity: "cosmonauts",
					outputPath: targetPath,
					mode: "link",
					exportedAt: "2026-08-26T00:00:00.000Z",
					generatingProjectRoot: await realpath(projectRoot),
					provenance: {
						kind: "generated-wrapper",
						baselineDigest: "recorded-baseline",
						authoredLinks: [
							{
								relativePath: "SKILL.md",
								expectedCanonicalSource: await realpath(authoredSource),
							},
						],
						generatedNodes: [
							{
								relativePath: "references/generated-inventory.md",
								inputDigest: "recorded-input",
								renderedDigest: sha256(generatedBytes),
								targetDigest: sha256(generatedBytes),
							},
						],
					},
				},
			},
		}),
	);
	return {
		projectRoot,
		homeRoot,
		assetRoot,
		key,
		manifestPath,
		targetPath,
	};
}
