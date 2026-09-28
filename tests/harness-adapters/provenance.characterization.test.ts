import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	manifestEntryKey,
	readHarnessManifest,
} from "../../lib/harness-adapters/provenance.ts";
import { resolveHarnessAssetTarget } from "../../lib/harness-adapters/registry.ts";
import { syncHarnessAsset } from "../../lib/harness-adapters/sync.ts";
import type { HarnessAsset } from "../../lib/harness-adapters/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("harness-provenance-characterization-");

describe("harness manifest entry characterization", () => {
	test("accepts each provenance variant through the persisted manifest reader", async () => {
		const fixture = await createInstalledCopy();
		const variants = [
			fixture.entry.provenance,
			{
				kind: "direct-link",
				expectedCanonicalSource: fixture.sourceRoot,
				linkShape: "directory",
			},
			{
				kind: "generated-wrapper",
				baselineDigest: "baseline",
				authoredLinks: [
					{
						relativePath: "references/source.md",
						expectedCanonicalSource: join(fixture.sourceRoot, "source.md"),
					},
				],
				generatedNodes: [
					{
						relativePath: "SKILL.md",
						inputDigest: "input",
						renderedDigest: "rendered",
						targetDigest: "target",
					},
				],
			},
		] as const;

		for (const provenance of variants) {
			await writeManifest(fixture, { ...fixture.entry, provenance });
			await expect(
				readHarnessManifest(fixture.manifestPath),
			).resolves.toMatchObject({
				entries: {
					[fixture.key]: { provenance },
				},
			});
		}
	});

	test("rejects every manifest-entry return-site family without changing persisted bytes", async () => {
		const fixture = await createInstalledCopy();
		const invalidEntries: Array<readonly [string, unknown]> = [
			["entry record and schema", null],
			["required scalar fields", { ...fixture.entry, assetId: 7 }],
			[
				"owner identity",
				{
					...fixture.entry,
					owner: { ...fixture.entry.owner, ownerId: "wrong" },
				},
			],
			["manifest key", fixture.entry],
			["output identity", { ...fixture.entry, outputIdentity: "" }],
			[
				"registered output path",
				{
					...fixture.entry,
					outputPath: join(fixture.ownerRoot, "settings.json"),
				},
			],
			[
				"generated asset project root",
				{
					...fixture.entry,
					assetId: "external-skill:cosmonauts",
					generatingProjectRoot: "relative/project",
				},
			],
			[
				"copy provenance",
				{
					...fixture.entry,
					provenance: { ...fixture.entry.provenance, markerVersion: 2 },
				},
			],
			[
				"direct-link provenance",
				{
					...fixture.entry,
					provenance: {
						kind: "direct-link",
						expectedCanonicalSource: fixture.sourceRoot,
						linkShape: "file",
					},
				},
			],
			[
				"unknown provenance",
				{ ...fixture.entry, provenance: { kind: "unknown" } },
			],
			[
				"generated-wrapper provenance",
				{
					...fixture.entry,
					provenance: {
						kind: "generated-wrapper",
						baselineDigest: "baseline",
						authoredLinks: [{ relativePath: 1 }],
						generatedNodes: [],
					},
				},
			],
		];

		for (const [label, entry] of invalidEntries) {
			const key = label === "manifest key" ? "wrong-key" : fixture.key;
			await writeFile(
				fixture.manifestPath,
				`${JSON.stringify({ schemaVersion: 1, entries: { [key]: entry } }, null, 2)}\n`,
			);
			const before = await readFile(fixture.manifestPath, "utf8");
			await expect(
				readHarnessManifest(fixture.manifestPath),
				label,
			).rejects.toThrow(/Invalid harness provenance manifest entry/);
			expect(await readFile(fixture.manifestPath, "utf8")).toBe(before);
		}
	});
});

interface InstalledCopyFixture {
	readonly projectRoot: string;
	readonly sourceRoot: string;
	readonly ownerRoot: string;
	readonly manifestPath: string;
	readonly key: string;
	readonly entry: Record<string, unknown> & {
		readonly owner: Record<string, unknown>;
		readonly provenance: Record<string, unknown>;
	};
}

async function createInstalledCopy(): Promise<InstalledCopyFixture> {
	const projectRoot = join(tmp.path, "project");
	const homeRoot = join(tmp.path, "home");
	const sourceRoot = join(projectRoot, "source");
	await Promise.all([
		mkdir(join(sourceRoot, "example"), { recursive: true }),
		mkdir(homeRoot, { recursive: true }),
	]);
	await writeFile(join(sourceRoot, "example", "SKILL.md"), "# Example\n");
	const asset = {
		assetId: "skill:characterized",
		kind: "skill",
		ownership: { kind: "project" },
		sourceRootId: "characterization:root",
		sourceRoot,
		sourcePath: "example",
		logicalPath: "example",
		outputIdentity: "characterized",
		defaultScope: "project",
	} as const satisfies HarnessAsset;
	const target = resolveHarnessAssetTarget({
		targetId: "claude",
		asset,
		scope: "project",
		roots: { projectRoot, homeRoot },
	});
	const installed = await syncHarnessAsset({
		projectRoot,
		asset,
		target,
		now: () => new Date("2026-01-01T00:00:00.000Z"),
	});
	const entry =
		installed.manifestEntry as unknown as InstalledCopyFixture["entry"];
	return {
		projectRoot,
		sourceRoot,
		ownerRoot: target.ownerRoot,
		manifestPath: join(target.ownerRoot, ".cosmonauts-harness-manifest.json"),
		key: manifestEntryKey(installed.manifestEntry.owner, asset.assetId),
		entry,
	};
}

async function writeManifest(
	fixture: InstalledCopyFixture,
	entry: unknown,
): Promise<void> {
	await writeFile(
		fixture.manifestPath,
		`${JSON.stringify({ schemaVersion: 1, entries: { [fixture.key]: entry } }, null, 2)}\n`,
	);
}
