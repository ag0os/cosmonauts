import { existsSync } from "node:fs";
import {
	lstat,
	mkdir,
	readdir,
	readFile,
	readlink,
	realpath,
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
import type { RuntimeInventorySnapshot } from "../../../lib/harness-adapters/types.ts";
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

	test.each([
		"claude",
		"codex",
	])("generated inventory drift is read-only on check and repaired by sync for %s", async (target) => {
		const fixture = await runtimeSkillFixture("inventory-drift");
		const inventory = syntheticInventory("initial-chain");
		const run = (snapshot: RuntimeInventorySnapshot, extra: string[] = []) =>
			syncInventory({
				...fixture,
				inventory: snapshot,
				target,
				extra: ["--scope", "project", ...extra],
			});
		expect((await run(inventory)).exitCode).toBe(0);
		const ownerDirectory = target === "claude" ? ".claude" : ".agents";
		const generated = join(
			fixture.projectRoot,
			ownerDirectory,
			"skills",
			"cosmonauts",
			"references",
			"generated-inventory.md",
		);
		expect(await readFile(generated, "utf8")).toContain("initial-chain");
		const current = await run(inventory, ["--check"]);
		expect(current.exitCode).toBe(0);
		expect(current.rows[0]?.before).toBe("current");

		const before = await snapshotRoots(fixture.projectRoot, fixture.homeRoot);
		const changed = syntheticInventory("updated-chain");
		const drift = await run(changed, ["--check"]);
		expect(drift.exitCode).toBe(1);
		expect(drift.rows[0]).toMatchObject({
			before: "source-ahead",
			reason: "source-changed",
			action: "none",
		});
		expect(await snapshotRoots(fixture.projectRoot, fixture.homeRoot)).toEqual(
			before,
		);

		const repaired = await run(changed);
		expect(repaired.exitCode).toBe(0);
		expect(repaired.rows[0]).toMatchObject({
			before: "source-ahead",
			final: "current",
		});
		expect(await readFile(generated, "utf8")).toContain("updated-chain");
		expect(await readFile(generated, "utf8")).not.toContain("initial-chain");
		expect((await run(changed, ["--check"])).exitCode).toBe(0);
	});

	test("a personal generated inventory reports the other project and regenerates from its runtime", async () => {
		const fixture = await runtimeSkillFixture("inventory-a");
		const otherProject = join(tmp.path, "inventory-b");
		await mkdir(otherProject);
		const run = (
			projectRoot: string,
			inventory: RuntimeInventorySnapshot,
			extra: string[] = [],
		) =>
			syncInventory({
				...fixture,
				projectRoot,
				inventory,
				target: "claude",
				extra,
			});
		expect(
			(await run(fixture.projectRoot, syntheticInventory("project-a-chain")))
				.exitCode,
		).toBe(0);
		const generated = join(
			fixture.homeRoot,
			".claude",
			"skills",
			"cosmonauts",
			"references",
			"generated-inventory.md",
		);
		expect(await readFile(generated, "utf8")).toContain("project-a-chain");
		const before = await snapshotRoots(otherProject, fixture.homeRoot);
		const inventory = syntheticInventory("project-b-chain");
		const checked = await run(otherProject, inventory, ["--check"]);
		expect(checked.exitCode).toBe(1);
		expect(checked.rows[0]).toMatchObject({
			scope: "personal",
			before: "source-ahead",
			reason: "regenerated-from-other-project",
			action: "none",
			generatingProjectRoot: await realpath(otherProject),
			previousGeneratingProjectRoot: await realpath(fixture.projectRoot),
		});
		expect(await snapshotRoots(otherProject, fixture.homeRoot)).toEqual(before);
		const synced = await run(otherProject, inventory);
		expect(synced.exitCode).toBe(0);
		expect(synced.rows[0]?.final).toBe("current");
		expect(await readFile(generated, "utf8")).toContain("project-b-chain");
		expect(await readFile(generated, "utf8")).not.toContain("project-a-chain");
		const current = await run(otherProject, inventory, ["--check"]);
		expect(current.exitCode).toBe(0);
		expect(current.rows[0]).toMatchObject({
			before: "current",
			reason: "current",
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

function syntheticInventory(chainName: string): RuntimeInventorySnapshot {
	return {
		chains: [
			{
				name: chainName,
				description: "Synthetic chain",
				expression: "studio/author -> studio/reviewer",
			},
		],
		effectiveSkills: [],
		candidates: [],
		sourceHealth: [],
		paths: [
			{
				target: "claude",
				kind: "command",
				project: ".claude/commands",
				personal: "~/.claude/commands",
			},
			{
				target: "claude",
				kind: "skill",
				project: ".claude/skills",
				personal: "~/.claude/skills",
			},
			{
				target: "codex",
				kind: "skill",
				project: ".agents/skills",
				personal: "~/.agents/skills",
			},
		],
	};
}

async function syncInventory(options: {
	projectRoot: string;
	homeRoot: string;
	inventory: RuntimeInventorySnapshot;
	target: string;
	extra: string[];
}): Promise<HarnessSyncReport> {
	process.exitCode = undefined;
	const output = captureCliOutput();
	try {
		await createHarnessProgram({
			projectRoot: options.projectRoot,
			homeRoot: options.homeRoot,
			discover: async () => ({
				...emptyDiscovery(),
				runtimeInventory: options.inventory,
			}),
		}).parseAsync(
			[
				"--json",
				"sync",
				"--target",
				options.target,
				"--asset",
				"external-skill:cosmonauts",
				...options.extra,
			],
			{ from: "user" },
		);
		return JSON.parse(output.stdout()) as HarnessSyncReport;
	} finally {
		output.restore();
	}
}
