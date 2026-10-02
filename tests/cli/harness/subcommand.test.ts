import { existsSync } from "node:fs";
import {
	lstat,
	mkdir,
	readdir,
	readFile,
	readlink,
	rm,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	createHarnessProgram,
	parseSyncRequest,
} from "../../../cli/harness/subcommand.ts";
import type { RuntimeSkillExportDiscovery } from "../../../cli/skills/subcommand.ts";
import type { GeneratedHarnessNode } from "../../../lib/harness-adapters/render.ts";
import {
	type HarnessSyncOptions,
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

	test("exports the lean bundle with its contract templates to Claude Code and Codex project scope", async () => {
		const projectRoot = join(tmp.path, "lean-project");
		const homeRoot = join(tmp.path, "lean-home");
		await Promise.all([
			mkdir(projectRoot, { recursive: true }),
			mkdir(homeRoot, { recursive: true }),
		]);
		const dependencies = {
			projectRoot,
			homeRoot,
			discover: async () => emptyDiscovery(),
		};
		const args = [
			"--json",
			"sync",
			"--target",
			"claude",
			"--target",
			"codex",
			"--scope",
			"project",
			"--asset",
			"external-skill:cosmonauts-lean",
		];
		const syncOutput = captureCliOutput();
		await createHarnessProgram(dependencies).parseAsync(args, { from: "user" });
		const synced = JSON.parse(syncOutput.stdout()) as HarnessSyncReport;
		syncOutput.restore();
		expect(synced.exitCode).toBe(0);
		expect(synced.rows.map((row) => [row.target, row.final])).toEqual([
			["claude", "current"],
			["codex", "current"],
		]);

		const contract = await readFile(
			join(process.cwd(), "bundled", "lean", "skills", "contract", "SKILL.md"),
		);
		for (const ownerDirectory of [".claude", ".agents"]) {
			const bundle = join(
				projectRoot,
				ownerDirectory,
				"skills",
				"cosmonauts-lean",
			);
			expect((await readdir(bundle)).sort()).toEqual([
				"SKILL.md",
				"contract.md",
			]);
			expect(
				(await readFile(join(bundle, "contract.md"))).equals(contract),
			).toBe(true);
			expect(await readFile(join(bundle, "SKILL.md"), "utf8")).toMatch(
				/^---\nname: cosmonauts-lean\n/,
			);
		}
		expect(await readdir(homeRoot)).toEqual([]);

		const checkOutput = captureCliOutput();
		await createHarnessProgram(dependencies).parseAsync([...args, "--check"], {
			from: "user",
		});
		const checked = JSON.parse(checkOutput.stdout()) as HarnessSyncReport;
		checkOutput.restore();
		expect(checked.exitCode).toBe(0);
		expect(checked.rows.map((row) => row.before)).toEqual([
			"current",
			"current",
		]);
	});

	test("a personal lean bundle synced from one project checks current from another", async () => {
		const homeRoot = join(tmp.path, "lean-shared-home");
		const projects = [join(tmp.path, "lean-a"), join(tmp.path, "lean-b")];
		await Promise.all(
			[homeRoot, ...projects].map((dir) => mkdir(dir, { recursive: true })),
		);
		const run = async (projectRoot: string, extra: string[]) => {
			const output = captureCliOutput();
			await createHarnessProgram({
				projectRoot,
				homeRoot,
				discover: async () => emptyDiscovery(),
			}).parseAsync(
				[
					"--json",
					"sync",
					"--target",
					"claude",
					"--asset",
					"external-skill:cosmonauts-lean",
					...extra,
				],
				{ from: "user" },
			);
			const report = JSON.parse(output.stdout()) as HarnessSyncReport;
			output.restore();
			return report;
		};

		expect((await run(projects[0] as string, [])).exitCode).toBe(0);
		const checked = await run(projects[1] as string, ["--check"]);
		expect(checked.exitCode).toBe(0);
		expect(checked.rows[0]).toMatchObject({
			scope: "personal",
			before: "current",
			reason: "current",
		});
	});

	test("a sync that does not select the lean bundle never reads the contract skill", async () => {
		const leanContractNode = vi.fn(async () => {
			throw new Error("contract skill read");
		});
		const sync = vi.fn(
			async (_options: HarnessSyncOptions): Promise<HarnessSyncReport> => ({
				...reportFixture(),
				exitCode: 0,
			}),
		);
		const output = captureCliOutput();
		await createHarnessProgram({
			projectRoot: tmp.path,
			homeRoot: join(tmp.path, "home"),
			discover: async () => emptyDiscovery(),
			sync,
			leanContractNode,
		}).parseAsync(["--json", "sync", "--asset", "external-skill:cosmonauts"], {
			from: "user",
		});
		output.restore();
		expect(process.exitCode).toBeUndefined();
		expect(leanContractNode).not.toHaveBeenCalled();
		expect(sync.mock.calls[0]?.[0].generatedNodesByAssetId).not.toHaveProperty(
			"external-skill:cosmonauts-lean",
		);
	});

	test("a change to the contract skill shows the synced lean bundle as drift on check", async () => {
		const projectRoot = join(tmp.path, "lean-drift-project");
		const homeRoot = join(tmp.path, "lean-drift-home");
		await Promise.all([
			mkdir(projectRoot, { recursive: true }),
			mkdir(homeRoot, { recursive: true }),
		]);
		const run = async (
			leanContractNode: (() => Promise<GeneratedHarnessNode>) | undefined,
			extra: string[],
		) => {
			const output = captureCliOutput();
			await createHarnessProgram({
				projectRoot,
				homeRoot,
				discover: async () => emptyDiscovery(),
				...(leanContractNode ? { leanContractNode } : {}),
			}).parseAsync(
				[
					"--json",
					"sync",
					"--target",
					"claude",
					"--scope",
					"project",
					"--asset",
					"external-skill:cosmonauts-lean",
					...extra,
				],
				{ from: "user" },
			);
			const report = JSON.parse(output.stdout()) as HarnessSyncReport;
			output.restore();
			return report;
		};
		expect((await run(undefined, [])).exitCode).toBe(0);

		const edited = Buffer.from("# edited contract\n");
		const checked = await run(
			async () => ({
				relativePath: "contract.md",
				inputBytes: edited,
				renderedBytes: edited,
			}),
			["--check"],
		);
		expect(checked.exitCode).toBe(1);
		expect(checked.rows[0]).toMatchObject({
			before: "source-ahead",
			reason: "source-changed",
		});
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
			discover: async () => emptyDiscovery(),
		}).parseAsync(
			["sync", "--target", "claude", "--kind", "command", "--link"],
			{ from: "user" },
		);
		expect(error).toHaveBeenCalledWith(
			expect.stringMatching(/command:spec-to-backlog.*link.*copy/i),
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
