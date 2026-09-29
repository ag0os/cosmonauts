import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveHarnessTransactionPaths } from "../../lib/harness-adapters/provenance.ts";
import type {
	HarnessAsset,
	SourceHealthRow,
	SyncRequest,
} from "../../lib/harness-adapters/types.ts";
import { runHarnessSync } from "../../lib/skills/exporter.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("exporter-sync-failure-");

async function fixture(names: readonly string[]) {
	const projectRoot = join(tmp.path, "project");
	const homeRoot = join(tmp.path, "home");
	const sourceRoot = join(projectRoot, "src");
	await mkdir(homeRoot, { recursive: true });
	await mkdir(projectRoot, { recursive: true });
	for (const name of names) {
		await mkdir(join(sourceRoot, name), { recursive: true });
		await writeFile(join(sourceRoot, name, "SKILL.md"), `# ${name}\n`);
	}
	const assets: HarnessAsset[] = names.map((name) => ({
		assetId: `skill:${name}`,
		kind: "skill",
		ownership: { kind: "project" },
		sourceRootId: "fixture",
		sourceRoot,
		sourcePath: name,
		logicalPath: name,
		outputIdentity: name,
		defaultScope: "project",
	}));
	const sourceHealth: SourceHealthRow[] = [
		{
			sourceRootId: "fixture",
			sourceRoot,
			domain: "fixture",
			status: "complete",
			issues: [],
		},
	];
	const request: SyncRequest = {
		targetIds: ["claude"],
		scopes: ["project"],
		reconciliation: "partial",
		check: false,
	};
	const run = (
		overrides: Partial<SyncRequest> = {},
		selected: readonly HarnessAsset[] = assets,
		health: readonly SourceHealthRow[] = sourceHealth,
	) =>
		runHarnessSync({
			projectRoot,
			homeRoot,
			assets: selected,
			sourceHealth: health,
			request: { ...request, ...overrides },
		});
	return { projectRoot, sourceRoot, assets, sourceHealth, run };
}

async function ownerId(projectRoot: string): Promise<string> {
	const manifest = JSON.parse(
		await readFile(
			join(projectRoot, ".claude/.cosmonauts-harness-manifest.json"),
			"utf8",
		),
	) as { entries: Record<string, { owner: { ownerId: string } }> };
	const entry = Object.values(manifest.entries)[0];
	if (!entry) throw new Error("Missing seeded manifest entry");
	return entry.owner.ownerId;
}

describe("runHarnessSync unclassified plan rows", () => {
	test("leaves a stale source with unknown health unclassified and does not remove its target", async () => {
		const f = await fixture(["a"]);
		await f.run();
		const target = join(f.projectRoot, ".claude/skills/a/SKILL.md");
		const before = await readFile(target, "utf8");
		const report = await f.run({ reconciliation: "complete" }, [], []);
		expect(report.rows).toMatchObject([
			{
				asset: "skill:a",
				reason: "source-unavailable",
				action: "none",
				final: "source-ahead",
			},
		]);
		expect(await readFile(target, "utf8")).toBe(before);
	});

	test("leaves a target claimed by a different owner unclassified", async () => {
		const f = await fixture(["a"]);
		await f.run();
		const target = join(f.projectRoot, ".claude/skills/a/SKILL.md");
		const before = await readFile(target, "utf8");
		const asset = f.assets[0];
		if (!asset) throw new Error("Missing fixture asset");
		const report = await f.run({}, [
			{
				...asset,
				ownership: { kind: "authority", authorityId: "cosmonauts/core" },
			},
		]);
		expect(report.rows).toMatchObject([
			{
				asset: "skill:a",
				reason: "foreign-owner",
				action: "none",
				final: "locally-edited",
			},
		]);
		expect(await readFile(target, "utf8")).toBe(before);
	});

	test("leaves an owner transfer row unclassified without syncing the asset", async () => {
		const f = await fixture(["a"]);
		await f.run();
		const target = join(f.projectRoot, ".claude/skills/a/SKILL.md");
		const before = await readFile(target, "utf8");
		const report = await f.run({
			assetIds: ["skill:a"],
			transferOwner: {
				oldOwnerId: await ownerId(f.projectRoot),
				assetIds: ["skill:a"],
			},
		});
		expect(report.rows).toMatchObject([
			{
				asset: "skill:a",
				reason: "owner-transfer",
				action: "transfer-entry",
				final: "current",
			},
		]);
		expect(await readFile(target, "utf8")).toBe(before);
	});

	test("aborts an actionable row when a separate source root is incomplete", async () => {
		const f = await fixture(["a"]);
		const report = await f.run({ reconciliation: "complete" }, f.assets, [
			...f.sourceHealth,
			{
				sourceRootId: "other",
				sourceRoot: join(f.projectRoot, "other"),
				domain: "fixture",
				status: "incomplete",
				issues: [],
			},
		]);
		expect(report.rows).toMatchObject([
			{
				asset: "skill:a",
				before: "missing",
				reason: "transaction-aborted-incomplete-inventory",
				action: "none",
				final: "missing",
			},
		]);
		await expect(
			lstat(join(f.projectRoot, ".claude/skills/a")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("does not sync an incomplete source when its complete plan is aborted", async () => {
		const f = await fixture(["a"]);
		const health = f.sourceHealth[0];
		if (!health) throw new Error("Missing fixture health");
		const report = await f.run({ reconciliation: "complete" }, f.assets, [
			{
				...health,
				status: "incomplete",
				issues: [],
			},
		]);
		expect(report.rows).toMatchObject([
			{
				asset: "skill:a",
				reason: "inventory-incomplete",
				action: "none",
				final: "source-ahead",
			},
		]);
		await expect(
			lstat(join(f.projectRoot, ".claude/skills/a")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("keeps an unmatched planned transfer row unchanged without syncing the asset", async () => {
		const f = await fixture(["a"]);
		await f.run();
		const target = join(f.projectRoot, ".claude/skills/a/SKILL.md");
		const before = await readFile(target, "utf8");
		const report = await f.run(
			{
				reconciliation: "complete",
				assetIds: ["skill:a"],
				transferOwner: {
					oldOwnerId: await ownerId(f.projectRoot),
					assetIds: ["skill:a"],
				},
			},
			[],
		);
		expect(report.rows).toMatchObject([
			{
				asset: "skill:a",
				reason: "transfer-entry-mismatch",
				action: "none",
				final: "locally-edited",
			},
		]);
		expect(await readFile(target, "utf8")).toBe(before);
	});
});

describe("runHarnessSync write-transaction failure", () => {
	test("maps each planned row to a write failure without changing targets", async () => {
		const f = await fixture(["a", "b"]);
		const { lockPath } = resolveHarnessTransactionPaths(
			join(f.projectRoot, ".claude"),
			"claude",
		);
		await mkdir(lockPath);
		const report = await f.run();
		expect(report.exitCode).toBe(1);
		expect(
			report.rows.map(({ asset, reason, action, final }) => ({
				asset,
				reason,
				action,
				final,
			})),
		).toEqual(
			["a", "b"].map((name) => ({
				asset: `skill:${name}`,
				reason: expect.stringMatching(/^write-failure:/),
				action: "failed",
				final: "source-ahead",
			})),
		);
		for (const name of ["a", "b"]) {
			await expect(
				lstat(join(f.projectRoot, `.claude/skills/${name}`)),
			).rejects.toMatchObject({ code: "ENOENT" });
		}
	});

	test("reports a synthetic write failure for an empty reconciliation group", async () => {
		const f = await fixture([]);
		const { lockPath } = resolveHarnessTransactionPaths(
			join(f.projectRoot, ".claude"),
			"claude",
		);
		await mkdir(lockPath);
		const report = await f.run({ reconciliation: "complete" });
		expect(report.exitCode).toBe(1);
		expect(report.rows).toHaveLength(1);
		expect(report.rows[0]).toMatchObject({
			asset: "(owner-root)",
			action: "failed",
			final: "source-ahead",
			reason: expect.stringMatching(/^write-failure:/),
			recovery: { state: "write-failure" },
		});
		await expect(
			lstat(join(f.projectRoot, ".claude/skills")),
		).rejects.toMatchObject({ code: "ENOENT" });
	});
});
