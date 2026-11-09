import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import type { MaterializedHarnessManifestEntry } from "../../lib/harness-adapters/provenance.ts";
import {
	manifestEntryKey,
	resolveAssetOwnerIdentity,
	resolveHarnessTransactionPaths,
	sha256,
} from "../../lib/harness-adapters/provenance.ts";
import { resolveHarnessAssetTarget } from "../../lib/harness-adapters/registry.ts";
import type {
	HarnessManifestSnapshot,
	HarnessNodeSnapshot,
	OwnerRootTransactionJournal,
} from "../../lib/harness-adapters/sync.ts";
import {
	serializeOwnerRootJournal,
	syncHarnessAsset,
	withOwnerRootTransaction,
} from "../../lib/harness-adapters/sync.ts";
import type { HarnessAsset } from "../../lib/harness-adapters/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("harness-sync-characterization-");

describe("single-asset classification characterization", () => {
	test("reports missing, current, source drift, local edits, missing baselines, mode conversion, and pending journals without check-mode writes", async () => {
		const fixture = await createAssetFixture();
		const initialTree = await snapshotPaths(fixture);

		await expect(checkAsset(fixture)).resolves.toMatchObject({
			beforeStatus: "missing",
			reason: "missing",
			wroteTarget: false,
			wroteManifest: false,
			exitCode: 1,
		});
		expect(await snapshotPaths(fixture)).toEqual(initialTree);

		await syncHarnessAsset(fixture);
		const installedTarget = await readFile(
			join(fixture.target.targetPath, "SKILL.md"),
		);
		await expect(checkAsset(fixture)).resolves.toMatchObject({
			beforeStatus: "current",
			reason: "current",
			recordedMode: "copy",
			requestedMode: "copy",
			exitCode: 0,
		});

		await writeFile(fixture.sourcePath, "# Source changed\n");
		await expect(checkAsset(fixture)).resolves.toMatchObject({
			beforeStatus: "source-ahead",
			reason: "source-changed",
			exitCode: 1,
		});
		await writeFile(
			join(fixture.target.targetPath, "SKILL.md"),
			"local edit\n",
		);
		await expect(checkAsset(fixture)).resolves.toMatchObject({
			beforeStatus: "locally-edited",
			reason: "locally-edited",
			exitCode: 1,
		});

		await rm(fixture.target.targetPath, { recursive: true });
		await expect(checkAsset(fixture)).resolves.toMatchObject({
			beforeStatus: "missing",
			reason: "missing",
			recordedMode: "copy",
			exitCode: 1,
		});
		await mkdir(fixture.target.targetPath, { recursive: true });
		await writeFile(
			join(fixture.target.targetPath, "SKILL.md"),
			installedTarget,
		);
		await writeFile(fixture.sourcePath, "# Example\n");
		await expect(
			syncHarnessAsset({
				...fixture,
				target: { ...fixture.target, requestedMode: "link" },
				check: true,
			}),
		).resolves.toMatchObject({
			beforeStatus: "source-ahead",
			reason: "mode-conversion",
			recordedMode: "copy",
			requestedMode: "link",
			exitCode: 1,
		});

		await writeFile(fixture.journalPath, '{"phase":"prepared"}\n');
		const beforePending = await snapshotPaths(fixture);
		await expect(checkAsset(fixture)).resolves.toMatchObject({
			beforeStatus: "source-ahead",
			reason: "pending-journal",
			wroteTarget: false,
			wroteManifest: false,
			exitCode: 1,
		});
		expect(await snapshotPaths(fixture)).toEqual(beforePending);
	});

	test("distinguishes untraceable bytes from another project's manifest claim", async () => {
		const first = await createAssetFixture("first", "personal");
		await mkdir(first.target.targetPath, { recursive: true });
		await writeFile(join(first.target.targetPath, "SKILL.md"), "unmanaged\n");
		await expect(checkAsset(first)).resolves.toMatchObject({
			beforeStatus: "locally-edited",
			reason: "foreign-or-untraceable",
		});
		await rm(first.target.targetPath, { recursive: true });
		await syncHarnessAsset(first);

		const second = await createAssetFixture(
			"second",
			"personal",
			first.homeRoot,
		);
		await expect(checkAsset(second)).resolves.toMatchObject({
			beforeStatus: "locally-edited",
			reason: "foreign-owner",
			wroteTarget: false,
			wroteManifest: false,
		});
	});

	test("a link entry is current only while it records a direct link to the same source and shape", async () => {
		const projectRoot = join(tmp.path, "link-map-project");
		const sourceRoot = join(projectRoot, "skills");
		await Promise.all(
			["bundle", "moved"].map(async (name) => {
				await mkdir(join(sourceRoot, name), { recursive: true });
				await writeFile(join(sourceRoot, name, "SKILL.md"), `# ${name}\n`);
			}),
		);
		const asset: HarnessAsset = {
			assetId: "skill:bundle",
			kind: "skill",
			ownership: { kind: "project" },
			sourceRootId: "fixture:skills",
			sourceRoot,
			sourcePath: "bundle",
			logicalPath: "bundle",
			outputIdentity: "bundle",
			defaultScope: "project",
		};
		const target = resolveHarnessAssetTarget({
			targetId: "claude",
			asset,
			roots: { projectRoot, homeRoot: join(tmp.path, "link-map-home") },
		});
		const owner = await resolveAssetOwnerIdentity(asset, projectRoot);
		const source = await realpath(join(sourceRoot, "bundle"));
		const checkRecorded = (
			provenance: MaterializedHarnessManifestEntry["provenance"],
		) =>
			syncHarnessAsset({
				projectRoot,
				asset,
				target,
				check: true,
				checkObservation: {
					manifest: {
						schemaVersion: 1,
						entries: {
							[manifestEntryKey(owner, asset.assetId)]: {
								schemaVersion: 1,
								owner,
								assetId: asset.assetId,
								kind: "skill",
								target: "claude",
								scope: "project",
								sourceRootId: asset.sourceRootId,
								sourcePath: asset.sourcePath,
								logicalPath: asset.logicalPath,
								outputIdentity: asset.outputIdentity,
								outputPath: target.targetPath,
								mode: "link",
								exportedAt: "2026-08-26T00:00:00.000Z",
								provenance,
							},
						},
					},
					target: { state: "exact-baseline" },
				},
			});
		const directLink = {
			kind: "direct-link",
			expectedCanonicalSource: source,
			linkShape: "directory",
		} as const;

		await expect(checkRecorded(directLink)).resolves.toMatchObject({
			beforeStatus: "current",
			reason: "current",
		});
		for (const [label, provenance] of [
			[
				"moved source",
				{
					...directLink,
					expectedCanonicalSource: await realpath(join(sourceRoot, "moved")),
				},
			],
			["changed shape", { ...directLink, linkShape: "flat-skill" }],
			[
				"non-direct-link provenance carrying matching link fields",
				{
					...directLink,
					kind: "generated-wrapper",
					baselineDigest: "recorded",
					authoredLinks: [],
					generatedNodes: [],
				},
			],
		] as const) {
			await expect(
				checkRecorded(
					provenance as unknown as MaterializedHarnessManifestEntry["provenance"],
				),
				label,
			).resolves.toMatchObject({
				beforeStatus: "source-ahead",
				reason: "link-map-changed",
				wroteTarget: false,
				wroteManifest: false,
			});
		}
	});
});

describe("owner-root journal recovery characterization", () => {
	test("returns none, restored-old, committed-new, evidence-required, and ambiguous through the transaction entry point", async () => {
		const none = await createRecoveryFixture("none", "prepared", false);
		await expect(runRecovery(none)).resolves.toMatchObject({
			state: "completed",
			recovery: { state: "none" },
			result: "continued",
		});

		const prepared = await createRecoveryFixture("prepared", "prepared");
		await expect(runRecovery(prepared)).resolves.toMatchObject({
			state: "completed",
			recovery: { state: "restored-old", phase: "prepared" },
		});
		await expect(readFile(prepared.journalPath)).rejects.toMatchObject({
			code: "ENOENT",
		});

		const commitReady = await createRecoveryFixture(
			"commit-ready",
			"commit-ready",
			true,
			"after-commit",
			"new",
			"old",
		);
		await expect(runRecovery(commitReady)).resolves.toMatchObject({
			state: "completed",
			recovery: { state: "committed-new", phase: "commit-ready" },
		});
		expect(await readFile(commitReady.manifestPath, "utf8")).toBe(
			commitReady.newManifest.contents,
		);

		const evidenceHeld = await createRecoveryFixture(
			"evidence",
			"committed",
			true,
			"after-evidence",
			"new",
			"new",
		);
		await expect(runRecovery(evidenceHeld)).resolves.toMatchObject({
			state: "recovery-required",
			recovery: {
				state: "evidence-required",
				phase: "committed",
				transactionId: "tx-evidence",
			},
		});
		await expect(readFile(evidenceHeld.journalPath)).resolves.toBeDefined();

		const malformed = await createRecoveryFixture(
			"malformed",
			"prepared",
			false,
		);
		await writeFile(malformed.journalPath, "{malformed\n");
		const before = await readFile(malformed.journalPath, "utf8");
		await expect(runRecovery(malformed)).resolves.toMatchObject({
			state: "recovery-required",
			recovery: { state: "ambiguous" },
		});
		expect(await readFile(malformed.journalPath, "utf8")).toBe(before);
	});
});

type Target = ReturnType<typeof resolveHarnessAssetTarget>;

interface AssetFixture {
	readonly projectRoot: string;
	readonly homeRoot: string;
	readonly sourcePath: string;
	readonly asset: HarnessAsset;
	readonly target: Target;
	readonly manifestPath: string;
	readonly journalPath: string;
}

async function createAssetFixture(
	label = "default",
	scope: "project" | "personal" = "project",
	existingHomeRoot?: string,
): Promise<AssetFixture> {
	const projectRoot = join(tmp.path, `${label}-project`);
	const homeRoot = existingHomeRoot ?? join(tmp.path, `${label}-home`);
	const sourceRoot = join(projectRoot, "source");
	const sourcePath = join(sourceRoot, "example", "SKILL.md");
	await Promise.all([
		mkdir(dirname(sourcePath), { recursive: true }),
		mkdir(homeRoot, { recursive: true }),
	]);
	await writeFile(sourcePath, "# Example\n");
	const asset = {
		assetId: "skill:characterized-sync",
		kind: "skill",
		ownership: { kind: "project" },
		sourceRootId: `characterization:${label}`,
		sourceRoot,
		sourcePath: "example",
		logicalPath: "example",
		outputIdentity: "characterized-sync",
		defaultScope: scope,
	} as const satisfies HarnessAsset;
	const target = resolveHarnessAssetTarget({
		targetId: "claude",
		asset,
		scope,
		roots: { projectRoot, homeRoot },
	});
	return {
		projectRoot,
		homeRoot,
		sourcePath,
		asset,
		target,
		manifestPath: join(target.ownerRoot, ".cosmonauts-harness-manifest.json"),
		journalPath: resolveHarnessTransactionPaths(target.ownerRoot, "claude")
			.journalPath,
	};
}

function checkAsset(fixture: AssetFixture) {
	return syncHarnessAsset({ ...fixture, check: true });
}

async function snapshotPaths(fixture: AssetFixture) {
	return Promise.all(
		[fixture.manifestPath, fixture.journalPath, fixture.target.targetPath].map(
			async (path) => {
				try {
					return await readFile(path);
				} catch (error) {
					return (error as NodeJS.ErrnoException).code;
				}
			},
		),
	);
}

interface RecoveryFixture {
	readonly ownerRoot: string;
	readonly journalPath: string;
	readonly manifestPath: string;
	readonly oldManifest: Extract<HarnessManifestSnapshot, { kind: "file" }>;
	readonly newManifest: Extract<HarnessManifestSnapshot, { kind: "file" }>;
}

async function createRecoveryFixture(
	label: string,
	phase: OwnerRootTransactionJournal["phase"],
	persistJournal = true,
	cleanupPolicy: OwnerRootTransactionJournal["cleanupPolicy"] = "after-commit",
	targetState: "old" | "new" = "old",
	manifestState: "old" | "new" = "old",
): Promise<RecoveryFixture> {
	const ownerRoot = await realpath(
		await mkdir(join(tmp.path, `recovery-${label}`, ".claude", "skills"), {
			recursive: true,
		}).then(() => join(tmp.path, `recovery-${label}`, ".claude")),
	);
	const paths = resolveHarnessTransactionPaths(ownerRoot, "claude");
	const manifestPath = join(ownerRoot, ".cosmonauts-harness-manifest.json");
	const oldContents = '{"state":"old"}\n';
	const newContents = '{"state":"new"}\n';
	const oldManifest = manifestSnapshot(oldContents);
	const newManifest = manifestSnapshot(newContents);
	await writeFile(
		manifestPath,
		manifestState === "old" ? oldContents : newContents,
	);
	const oldBytes = Buffer.from("old target\n");
	const newBytes = Buffer.from("new target\n");
	const targetPath = join(ownerRoot, "skills", "target.md");
	await writeFile(targetPath, targetState === "old" ? oldBytes : newBytes);
	const transactionId = `tx-${label}`;
	const stem = `${basename(paths.journalPath, ".journal.json")}-${transactionId}-0`;
	const backupPath = join(dirname(paths.journalPath), `${stem}.backup`);
	const stagePath = join(dirname(paths.journalPath), `${stem}.stage`);
	if (targetState === "new") await writeFile(backupPath, oldBytes);
	if (phase === "prepared") await writeFile(stagePath, newBytes);
	const journal: OwnerRootTransactionJournal = {
		schemaVersion: 1,
		transactionId,
		canonicalOwnerRoot: ownerRoot,
		targetId: "claude",
		phase,
		cleanupPolicy,
		atomicSet: true,
		manifestPath,
		oldManifest,
		newManifest,
		members: [
			{
				targetPath,
				stagePath,
				backupPath,
				oldState: fileSnapshot(oldBytes),
				newState: fileSnapshot(newBytes),
			},
		],
	};
	if (persistJournal) {
		await writeFile(paths.journalPath, serializeOwnerRootJournal(journal));
	}
	return {
		ownerRoot,
		journalPath: paths.journalPath,
		manifestPath,
		oldManifest,
		newManifest,
	};
}

function runRecovery(fixture: RecoveryFixture) {
	return withOwnerRootTransaction(
		{ ownerRoot: fixture.ownerRoot, targetId: "claude" },
		async () => "continued",
	);
}

function fileSnapshot(
	bytes: Uint8Array,
): Exclude<HarnessNodeSnapshot, { kind: "absent" }> {
	return {
		kind: "file",
		digest: sha256(Buffer.concat([Buffer.from("file\0"), Buffer.from(bytes)])),
	};
}

function manifestSnapshot(
	contents: string,
): Extract<HarnessManifestSnapshot, { kind: "file" }> {
	return { kind: "file", digest: sha256(contents), contents };
}
