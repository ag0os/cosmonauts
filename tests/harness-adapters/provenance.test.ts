import {
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	readlink,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
	manifestEntryKey,
	observeStableHarnessState,
	readHarnessManifest,
	resolveAssetOwnerIdentity,
	resolveHarnessTransactionPaths,
	serializeHarnessManifest,
	sha256,
	verifyLegacyMigrationProof,
} from "../../lib/harness-adapters/provenance.ts";
import { renderIdentityMarkdown } from "../../lib/harness-adapters/render.ts";
import {
	planHarnessSync,
	syncHarnessAsset,
} from "../../lib/harness-adapters/sync.ts";
import type {
	HarnessAsset,
	HarnessManifestEntry,
	HarnessSyncInventoryRow,
	OwnerIdentity,
	ResolvedHarnessAssetTarget,
} from "../../lib/harness-adapters/types.ts";

const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe("harness provenance", () => {
	test("classifies the complete owner source target mode and concurrent-read grid without writing", async () => {
		// @cosmo-behavior plan:harness-adapters#B-006
		const root = await mkdtemp(join(tmpdir(), "harness-provenance-"));
		tempRoots.push(root);
		const projectA = join(root, "project-a");
		const projectB = join(root, "project-b");
		const packageA = join(root, "package-a");
		const packageB = join(root, "package-b");
		const homeRoot = join(root, "home");
		await Promise.all(
			[projectA, projectB, packageA, packageB, homeRoot].map((path) =>
				mkdir(path, { recursive: true }),
			),
		);

		const rawSource = Buffer.from(
			"---\nname: raw\ndescription: raw\nunknown-target-key: [keep, bytes]\n---\n# Raw\n",
		);
		const copyAsset = asset("project:copy", projectA, "copy", "project");
		await writeSource(copyAsset, rawSource);
		const copyTarget = target(copyAsset, homeRoot);
		const installedCopy = await syncHarnessAsset({
			projectRoot: projectA,
			asset: copyAsset,
			target: copyTarget,
			now: fixedNow,
		});
		expect(installedCopy.beforeStatus).toBe("missing");

		const linkAsset = asset("project:link", projectA, "link", "project");
		await writeSource(linkAsset, Buffer.from("# Linked\n"));
		const linkTarget = target(linkAsset, homeRoot, "link");
		await syncHarnessAsset({
			projectRoot: projectA,
			asset: linkAsset,
			target: linkTarget,
			now: fixedNow,
		});

		const authorityA = asset(
			"authority:command",
			packageA,
			"command.md",
			"authority",
			"command",
		);
		const authorityB = { ...authorityA, sourceRoot: packageB };
		await Promise.all([
			writeSource(authorityA, Buffer.from("# Stable authority\n")),
			writeSource(authorityB, Buffer.from("# Stable authority\n")),
		]);
		const authorityTarget = target(authorityA, homeRoot);
		await syncHarnessAsset({
			projectRoot: projectA,
			asset: authorityA,
			target: authorityTarget,
			now: fixedNow,
		});

		const missingAsset = asset(
			"project:missing",
			projectA,
			"missing",
			"project",
		);
		await writeSource(missingAsset, Buffer.from("# Missing\n"));
		const missingTarget = target(missingAsset, homeRoot);
		const unmanagedAsset = asset(
			"project:unmanaged",
			projectA,
			"unmanaged",
			"project",
		);
		const unmanagedBytes = Buffer.from("# Exact desired bytes\n");
		await writeSource(unmanagedAsset, unmanagedBytes);
		const unmanagedTarget = target(unmanagedAsset, homeRoot);
		await mkdir(unmanagedTarget.targetPath, { recursive: true });
		await writeFile(
			join(unmanagedTarget.targetPath, "SKILL.md"),
			renderIdentityMarkdown(unmanagedBytes),
		);

		// Link provenance observes pointer shape, never the live source bytes.
		await writeFile(
			join(linkAsset.sourceRoot, linkAsset.sourcePath, "SKILL.md"),
			"changed\n",
		);
		await writeFile(
			join(linkAsset.sourceRoot, linkAsset.sourcePath, "new.md"),
			"live\n",
		);

		const beforeCheck = await snapshotTree(root);
		const bareCheck = await syncHarnessAsset({
			projectRoot: projectA,
			asset: copyAsset,
			target: target(copyAsset, homeRoot),
			check: true,
			now: laterNow,
		});
		const bareSync = await syncHarnessAsset({
			projectRoot: projectA,
			asset: copyAsset,
			target: target(copyAsset, homeRoot),
			now: laterNow,
		});
		expect(bareCheck).toMatchObject({
			beforeStatus: "current",
			reason: "current",
			recordedMode: "copy",
			requestedMode: "copy",
			wroteTarget: false,
			wroteManifest: false,
			exitCode: 0,
		});
		expect(bareSync.requestedMode).toBe(bareCheck.requestedMode);
		expect(await readFile(join(copyTarget.targetPath, "SKILL.md"))).toEqual(
			renderIdentityMarkdown(rawSource),
		);

		const linked = await syncHarnessAsset({
			projectRoot: projectA,
			asset: linkAsset,
			target: target(linkAsset, homeRoot),
			check: true,
			now: laterNow,
		});
		expect(linked).toMatchObject({
			beforeStatus: "current",
			recordedMode: "link",
			requestedMode: "link",
		});
		const conversion = await syncHarnessAsset({
			projectRoot: projectA,
			asset: linkAsset,
			target: target(linkAsset, homeRoot, "copy"),
			check: true,
			now: laterNow,
		});
		expect(conversion).toMatchObject({
			beforeStatus: "source-ahead",
			reason: "mode-conversion",
			recordedMode: "link",
			requestedMode: "copy",
			wroteTarget: false,
			wroteManifest: false,
			exitCode: 1,
		});

		const authorityAfterRelocation = await syncHarnessAsset({
			projectRoot: projectB,
			asset: authorityB,
			target: target(authorityB, homeRoot),
			check: true,
			now: laterNow,
		});
		expect(authorityAfterRelocation.beforeStatus).toBe("current");
		expect(authorityAfterRelocation.manifestEntry.owner).toEqual({
			kind: "authority",
			ownerId: "authority:cosmonauts/core",
			authorityId: "cosmonauts/core",
		});

		const missing = await syncHarnessAsset({
			projectRoot: projectA,
			asset: missingAsset,
			target: missingTarget,
			check: true,
			now: laterNow,
		});
		expect(missing).toMatchObject({
			beforeStatus: "missing",
			reason: "missing",
			wroteTarget: false,
			wroteManifest: false,
			exitCode: 1,
		});
		const unmanaged = await syncHarnessAsset({
			projectRoot: projectA,
			asset: unmanagedAsset,
			target: unmanagedTarget,
			check: true,
			now: laterNow,
		});
		expect(unmanaged).toMatchObject({
			beforeStatus: "locally-edited",
			reason: "foreign-or-untraceable",
			wroteTarget: false,
			wroteManifest: false,
			exitCode: 1,
		});
		expect(await snapshotTree(root)).toEqual(beforeCheck);

		await writeFile(
			join(copyAsset.sourceRoot, copyAsset.sourcePath, "SKILL.md"),
			Buffer.from("# Source advanced\n"),
		);
		const sourceAhead = await syncHarnessAsset({
			projectRoot: projectA,
			asset: copyAsset,
			target: copyTarget,
			check: true,
			now: laterNow,
		});
		expect(sourceAhead).toMatchObject({
			beforeStatus: "source-ahead",
			reason: "source-changed",
			exitCode: 1,
		});
		await writeFile(join(copyTarget.targetPath, "SKILL.md"), "local edit\n");
		const localOutranksSource = await syncHarnessAsset({
			projectRoot: projectA,
			asset: copyAsset,
			target: copyTarget,
			check: true,
			now: laterNow,
		});
		expect(localOutranksSource).toMatchObject({
			beforeStatus: "locally-edited",
			reason: "locally-edited",
			exitCode: 1,
		});

		const manifestPath = join(
			copyTarget.ownerRoot,
			".cosmonauts-harness-manifest.json",
		);
		const manifest = await readHarnessManifest(manifestPath);
		const projectOwner = await resolveAssetOwnerIdentity(copyAsset, projectA);
		const foreignOwner = await resolveAssetOwnerIdentity(copyAsset, projectB);
		const copyEntry =
			manifest.entries[manifestEntryKey(projectOwner, copyAsset.assetId)];
		if (!copyEntry) throw new Error("copy entry missing");
		const foreignClaim = { ...copyEntry, owner: foreignOwner };
		const foreignPlan = await planHarnessSync({
			projectRoot: projectA,
			request: { reconciliation: "complete", check: true },
			inventory: [
				inventory(
					copyAsset,
					copyTarget.targetPath,
					"exact-baseline",
					foreignOwner,
				),
			],
			manifestEntries: [foreignClaim],
			sourceHealth: [health(copyAsset.sourceRootId, "complete")],
		});
		expect(foreignPlan).toMatchObject({ exitCode: 1 });
		expect(foreignPlan.rows).toHaveLength(1);
		expect(foreignPlan.rows[0]).toMatchObject({
			status: "locally-edited",
			reason: "foreign-owner",
			action: "none",
		});
		const transferPlan = await planHarnessSync({
			projectRoot: projectA,
			request: {
				reconciliation: "partial",
				check: false,
				assetIds: [copyAsset.assetId],
				transferOwner: {
					oldOwnerId: foreignOwner.ownerId,
					assetIds: [copyAsset.assetId],
				},
			},
			inventory: [
				inventory(
					copyAsset,
					copyTarget.targetPath,
					"exact-baseline",
					foreignOwner,
				),
			],
			manifestEntries: [foreignClaim],
			targetObservations: [
				{
					targetPath: copyTarget.targetPath,
					state: "exact-baseline",
					baselineOwnerId: foreignOwner.ownerId,
					baselineAssetId: copyAsset.assetId,
				},
			],
			sourceHealth: [health(copyAsset.sourceRootId, "complete")],
		});
		expect(transferPlan.rows[0]).toMatchObject({
			action: "transfer-entry",
			previousManifestKey: manifestEntryKey(foreignOwner, copyAsset.assetId),
			writesTarget: false,
		});

		const incompletePlan = await planHarnessSync({
			projectRoot: projectA,
			request: { reconciliation: "complete", check: true },
			inventory: [
				inventory(copyAsset, copyTarget.targetPath, "edited", projectOwner),
			],
			manifestEntries: [copyEntry],
			sourceHealth: [health(copyAsset.sourceRootId, "incomplete")],
		});
		expect(incompletePlan).toMatchObject({
			aborted: true,
			exitCode: 1,
		});
		expect(incompletePlan.rows[0]).toMatchObject({
			status: "source-ahead",
			reason: "inventory-incomplete",
			action: "none",
			writesTarget: false,
			writesManifest: false,
		});
		const unavailablePlan = await planHarnessSync({
			projectRoot: projectA,
			request: { reconciliation: "complete", check: true },
			inventory: [],
			manifestEntries: [copyEntry],
			targetObservations: [
				{
					targetPath: copyTarget.targetPath,
					state: "exact-baseline",
					baselineOwnerId: projectOwner.ownerId,
					baselineAssetId: copyAsset.assetId,
				},
			],
			sourceHealth: [],
		});
		expect(unavailablePlan).toMatchObject({ exitCode: 1 });
		expect(unavailablePlan.rows[0]).toMatchObject({
			status: "source-ahead",
			reason: "source-unavailable",
			action: "none",
		});

		const removedExact = cloneEntry(
			copyEntry,
			"removed-exact",
			join(homeRoot, "removed-exact"),
		);
		const removedAbsent = cloneEntry(
			copyEntry,
			"removed-absent",
			join(homeRoot, "removed-absent"),
		);
		const removedEdited = cloneEntry(
			copyEntry,
			"removed-edited",
			join(homeRoot, "removed-edited"),
		);
		const removedEntries = [removedExact, removedAbsent, removedEdited];
		const removedPlan = await planHarnessSync({
			projectRoot: projectA,
			request: { reconciliation: "complete", check: true },
			inventory: [],
			manifestEntries: removedEntries,
			targetObservations: [
				observation(removedExact, "exact-baseline"),
				observation(removedAbsent, "absent"),
				observation(removedEdited, "edited"),
			],
			sourceHealth: [health(copyAsset.sourceRootId, "complete")],
		});
		expect(removedPlan).toMatchObject({ exitCode: 1 });
		expect(removedPlan.rows).toHaveLength(3);
		expect(
			removedPlan.rows.map(({ assetId, status, reason, action }) => ({
				assetId,
				status,
				reason,
				action,
			})),
		).toEqual([
			{
				assetId: "removed-exact",
				status: "source-ahead",
				reason: "source-removed",
				action: "none",
			},
			{
				assetId: "removed-absent",
				status: "source-ahead",
				reason: "source-removed",
				action: "none",
			},
			{
				assetId: "removed-edited",
				status: "locally-edited",
				reason: "source-removed",
				action: "none",
			},
		]);

		const explicitModePlan = await planHarnessSync({
			projectRoot: projectA,
			request: {
				reconciliation: "partial",
				check: true,
				requestedMode: "link",
			},
			inventory: [
				inventory(
					copyAsset,
					copyTarget.targetPath,
					"exact-baseline",
					projectOwner,
				),
			],
			manifestEntries: [copyEntry],
			sourceHealth: [health(copyAsset.sourceRootId, "complete")],
		});
		expect(explicitModePlan.rows).toEqual([
			expect.objectContaining({
				status: "source-ahead",
				reason: "mode-conversion",
				recordedMode: "copy",
				requestedMode: "link",
				beforeStatus: "source-ahead",
				action: "none",
			}),
		]);
		const zeroPlan = await planHarnessSync({
			projectRoot: projectA,
			request: { reconciliation: "partial", check: true },
			inventory: [
				inventory(
					copyAsset,
					copyTarget.targetPath,
					"exact-baseline",
					projectOwner,
				),
			],
			manifestEntries: [copyEntry],
			sourceHealth: [health(copyAsset.sourceRootId, "complete")],
		});
		expect(zeroPlan).toMatchObject({ exitCode: 0 });
		expect(zeroPlan.rows.map((row) => row.status)).toEqual(["current"]);

		const transactionPaths = resolveHarnessTransactionPaths(
			copyTarget.ownerRoot,
			copyTarget.targetId,
		);
		const concurrentManifest = await observeStableHarnessState({
			manifestPath,
			journalPath: transactionPaths.journalPath,
			observeTarget: async () => {
				await writeFile(
					manifestPath,
					serializeHarnessManifest({
						...manifest,
						entries: {
							...manifest.entries,
							[manifestEntryKey(projectOwner, copyAsset.assetId)]: {
								...copyEntry,
								exportedAt: "2035-01-01T00:00:00.000Z",
							},
						},
					}),
				);
				return { state: "exact-baseline" as const };
			},
		});
		expect(concurrentManifest).toMatchObject({
			status: "source-ahead",
			reason: "concurrent-change",
			concurrentChange: true,
			exitCode: 1,
		});
		const stableManifest = await readHarnessManifest(manifestPath);
		const concurrentJournal = await observeStableHarnessState({
			manifestPath,
			journalPath: transactionPaths.journalPath,
			observeTarget: async () => {
				await writeFile(transactionPaths.journalPath, '{"version":1}\n');
				return { state: "exact-baseline" as const };
			},
		});
		expect(concurrentJournal).toMatchObject({
			status: "source-ahead",
			reason: "concurrent-change",
			concurrentChange: true,
			exitCode: 1,
		});
		expect(concurrentJournal.manifest).toEqual(stableManifest);
		const beforePendingCheck = await snapshotTree(root);
		const pendingCheck = await syncHarnessAsset({
			projectRoot: projectA,
			asset: copyAsset,
			target: copyTarget,
			check: true,
			now: laterNow,
		});
		expect(pendingCheck).toMatchObject({
			beforeStatus: "source-ahead",
			reason: "pending-journal",
			exitCode: 1,
			wroteTarget: false,
			wroteManifest: false,
		});
		expect(await snapshotTree(root)).toEqual(beforePendingCheck);

		const packageScripts = JSON.parse(
			await readFile(join(process.cwd(), "package.json"), "utf8"),
		) as { scripts: Record<string, string> };
		expect(Object.values(packageScripts.scripts).join(" ")).not.toMatch(
			/harness\s+sync\b.*--check/,
		);
	});

	test("preserves edited foreign and untraceable targets and permits only safe lineage or owner transfer", async () => {
		// @cosmo-behavior plan:harness-adapters#B-008
		const root = await mkdtemp(join(tmpdir(), "harness-conflicts-"));
		tempRoots.push(root);
		const projectA = join(root, "project-a");
		const projectB = join(root, "project-b");
		const homeRoot = join(root, "home");
		await Promise.all(
			[projectA, projectB, homeRoot].map((path) =>
				mkdir(path, { recursive: true }),
			),
		);

		const editedAsset = asset("skill:edited", projectA, "edited", "project");
		const wrongLinkAsset = asset(
			"skill:wrong-link",
			projectA,
			"wrong-link",
			"project",
		);
		const foreignAssetA = asset(
			"skill:foreign",
			projectA,
			"foreign",
			"project",
		);
		const foreignAssetB = { ...foreignAssetA, sourceRoot: projectB };
		const unmanagedAsset = asset(
			"skill:shared/plan",
			projectA,
			"plan",
			"project",
		);
		const unknownFrontmatterBytes = Buffer.from(
			"---\nname: plan\ndescription: plan\nunknown-rich-key: [opaque, bytes]\n---\n# Plan\n",
		);
		await Promise.all([
			writeSource(editedAsset, Buffer.from("# Edited baseline\n")),
			writeSource(wrongLinkAsset, Buffer.from("# Linked baseline\n")),
			writeSource(foreignAssetA, Buffer.from("# Project A\n")),
			writeSource(foreignAssetB, Buffer.from("# Project B\n")),
			writeSource(unmanagedAsset, unknownFrontmatterBytes),
		]);

		const editedTarget = target(editedAsset, homeRoot);
		const wrongLinkTarget = target(wrongLinkAsset, homeRoot, "link");
		const foreignTarget = target(foreignAssetB, homeRoot);
		const unmanagedTarget = target(unmanagedAsset, homeRoot);
		await syncHarnessAsset({
			projectRoot: projectA,
			asset: editedAsset,
			target: editedTarget,
			now: fixedNow,
		});
		await syncHarnessAsset({
			projectRoot: projectA,
			asset: wrongLinkAsset,
			target: wrongLinkTarget,
			now: fixedNow,
		});
		await syncHarnessAsset({
			projectRoot: projectB,
			asset: foreignAssetB,
			target: foreignTarget,
			now: fixedNow,
		});
		await writeFile(join(editedTarget.targetPath, "SKILL.md"), "local edit\n");
		const wrongSource = join(root, "wrong-source");
		await mkdir(wrongSource);
		await rm(wrongLinkTarget.targetPath, { recursive: true });
		await symlink(wrongSource, wrongLinkTarget.targetPath, "dir");
		await mkdir(unmanagedTarget.targetPath, { recursive: true });
		await writeFile(
			join(unmanagedTarget.targetPath, "SKILL.md"),
			renderIdentityMarkdown(unknownFrontmatterBytes),
		);

		const transferExactA = asset(
			"skill:transfer-exact",
			projectA,
			"transfer-exact",
			"project",
		);
		const transferEditedA = asset(
			"skill:transfer-edited",
			projectA,
			"transfer-edited",
			"project",
		);
		const transferAbsentA = asset(
			"skill:transfer-absent",
			projectA,
			"transfer-absent",
			"project",
		);
		const transferAssetsB = [
			{ ...transferExactA, sourceRoot: projectB },
			{ ...transferEditedA, sourceRoot: projectB },
			{ ...transferAbsentA, sourceRoot: projectB },
		] as const;
		await Promise.all([
			...transferAssetsB.map((transferAsset) =>
				writeSource(transferAsset, Buffer.from(`# ${transferAsset.assetId}\n`)),
			),
			writeSource(transferExactA, Buffer.from("# transfer exact\n")),
			writeSource(transferEditedA, Buffer.from("# transfer edited\n")),
			writeSource(transferAbsentA, Buffer.from("# transfer absent\n")),
		]);
		for (const transferAsset of transferAssetsB) {
			await syncHarnessAsset({
				projectRoot: projectB,
				asset: transferAsset,
				target: target(transferAsset, homeRoot),
				now: fixedNow,
			});
		}
		const transferEditedTarget = target(transferEditedA, homeRoot);
		const transferAbsentTarget = target(transferAbsentA, homeRoot);
		await writeFile(
			join(transferEditedTarget.targetPath, "SKILL.md"),
			"edited transfer target\n",
		);
		await rm(transferAbsentTarget.targetPath, { recursive: true });

		const manifestPath = join(
			editedTarget.ownerRoot,
			".cosmonauts-harness-manifest.json",
		);
		const manifest = await readHarnessManifest(manifestPath);
		const ownerA = await resolveAssetOwnerIdentity(editedAsset, projectA);
		const ownerB = await resolveAssetOwnerIdentity(foreignAssetB, projectB);
		const beforeProtected = await snapshotTree(editedTarget.ownerRoot);

		const attempts = await Promise.all([
			syncHarnessAsset({
				projectRoot: projectA,
				asset: editedAsset,
				target: editedTarget,
				now: laterNow,
			}),
			syncHarnessAsset({
				projectRoot: projectA,
				asset: wrongLinkAsset,
				target: wrongLinkTarget,
				now: laterNow,
			}),
			syncHarnessAsset({
				projectRoot: projectA,
				asset: foreignAssetA,
				target: target(foreignAssetA, homeRoot),
				now: laterNow,
			}),
			syncHarnessAsset({
				projectRoot: projectA,
				asset: unmanagedAsset,
				target: unmanagedTarget,
				now: laterNow,
			}),
		]);
		expect(
			attempts.map(({ beforeStatus, reason, wroteTarget, wroteManifest }) => ({
				beforeStatus,
				reason,
				wroteTarget,
				wroteManifest,
			})),
		).toEqual([
			{
				beforeStatus: "locally-edited",
				reason: "locally-edited",
				wroteTarget: false,
				wroteManifest: false,
			},
			{
				beforeStatus: "locally-edited",
				reason: "locally-edited",
				wroteTarget: false,
				wroteManifest: false,
			},
			{
				beforeStatus: "locally-edited",
				reason: "foreign-owner",
				wroteTarget: false,
				wroteManifest: false,
			},
			{
				beforeStatus: "locally-edited",
				reason: "foreign-or-untraceable",
				wroteTarget: false,
				wroteManifest: false,
			},
		]);

		const conflictPlan = await planHarnessSync({
			projectRoot: projectA,
			request: {
				reconciliation: "partial",
				check: false,
				assetIds: [
					editedAsset.assetId,
					wrongLinkAsset.assetId,
					foreignAssetA.assetId,
					unmanagedAsset.assetId,
				],
			},
			inventory: [
				inventory(editedAsset, editedTarget.targetPath, "edited", ownerA),
				inventory(wrongLinkAsset, wrongLinkTarget.targetPath, "edited", ownerA),
				inventory(
					foreignAssetA,
					foreignTarget.targetPath,
					"exact-baseline",
					ownerB,
				),
				inventory(unmanagedAsset, unmanagedTarget.targetPath, "exact-baseline"),
			],
			manifestEntries: Object.values(manifest.entries),
			sourceHealth: [
				health(editedAsset.sourceRootId, "complete"),
				health(wrongLinkAsset.sourceRootId, "complete"),
				health(foreignAssetA.sourceRootId, "complete"),
				health(unmanagedAsset.sourceRootId, "complete"),
			],
		});
		for (const row of conflictPlan.rows) {
			expect(row).toMatchObject({
				status: "locally-edited",
				action: "none",
				writesTarget: false,
				writesManifest: false,
				conflict: {
					sourcePath: join(
						projectA,
						row.assetId === "skill:shared/plan"
							? "plan"
							: row.assetId.replace("skill:", ""),
					),
					targetPath: row.targetPath,
					owner: ownerA,
					reason: row.reason,
					guidance: expect.arrayContaining([
						expect.objectContaining({ action: "preserve" }),
					]),
				},
			});
		}
		expect(
			conflictPlan.rows.find((row) => row.assetId === foreignAssetA.assetId),
		).toMatchObject({
			reason: "foreign-owner",
			conflict: {
				conflictingOwner: ownerB,
				guidance: expect.arrayContaining([
					expect.objectContaining({ action: "safe-transfer" }),
				]),
			},
		});
		expect(
			conflictPlan.rows.find((row) => row.assetId === unmanagedAsset.assetId),
		).toMatchObject({
			reason: "foreign-or-untraceable",
			conflict: {
				guidance: expect.arrayContaining([
					expect.objectContaining({ action: "port" }),
				]),
			},
		});

		const transferEntries = transferAssetsB.map((transferAsset) => {
			const entry =
				manifest.entries[manifestEntryKey(ownerB, transferAsset.assetId)];
			if (!entry) throw new Error(`missing ${transferAsset.assetId}`);
			return entry;
		});
		const transferPlan = await planHarnessSync({
			projectRoot: projectA,
			request: {
				reconciliation: "partial",
				check: false,
				assetIds: [
					transferExactA.assetId,
					transferEditedA.assetId,
					transferAbsentA.assetId,
				],
				transferOwner: {
					oldOwnerId: ownerB.ownerId,
					assetIds: [
						transferExactA.assetId,
						transferEditedA.assetId,
						transferAbsentA.assetId,
					],
				},
			},
			inventory: [
				inventory(
					transferExactA,
					target(transferExactA, homeRoot).targetPath,
					"exact-baseline",
					ownerB,
				),
				inventory(
					transferEditedA,
					transferEditedTarget.targetPath,
					"edited",
					ownerB,
				),
				inventory(
					transferAbsentA,
					transferAbsentTarget.targetPath,
					"absent",
					ownerB,
				),
			],
			manifestEntries: transferEntries,
			sourceHealth: [health(transferExactA.sourceRootId, "complete")],
		});
		expect(transferPlan.rows).toEqual([
			expect.objectContaining({
				assetId: transferExactA.assetId,
				action: "transfer-entry",
				previousManifestKey: manifestEntryKey(ownerB, transferExactA.assetId),
				nextManifestKey: manifestEntryKey(ownerA, transferExactA.assetId),
				writesTarget: false,
				writesManifest: true,
			}),
			expect.objectContaining({
				assetId: transferEditedA.assetId,
				action: "none",
				reason: "edited-target-cannot-transfer",
				writesTarget: false,
				writesManifest: false,
				conflict: expect.objectContaining({
					sourcePath: join(projectA, "transfer-edited"),
					targetPath: transferEditedTarget.targetPath,
					owner: ownerA,
					reason: "edited-target-cannot-transfer",
					guidance: expect.arrayContaining([
						expect.objectContaining({ action: "preserve" }),
						expect.objectContaining({ action: "safe-transfer" }),
					]),
				}),
			}),
			expect.objectContaining({
				assetId: transferAbsentA.assetId,
				action: "transfer-entry",
				previousManifestKey: manifestEntryKey(ownerB, transferAbsentA.assetId),
				nextManifestKey: manifestEntryKey(ownerA, transferAbsentA.assetId),
				writesTarget: false,
				writesManifest: true,
			}),
		]);

		const copiedNodes = [
			{ relativePath: "", nodeType: "directory" },
			{ relativePath: "SKILL.md", nodeType: "file" },
		] as const;
		const targetDigest = sha256(
			renderIdentityMarkdown(unknownFrontmatterBytes),
		);
		const expectedLineage = {
			revision: "0123456789abcdef0123456789abcdef01234567",
			sourceRelativePath: "domains/shared/skills/plan",
			owner: ownerA,
			assetId: unmanagedAsset.assetId,
			outputPath: unmanagedTarget.targetPath,
			nodeShape: copiedNodes,
		} as const;
		const exactProof = {
			...expectedLineage,
			historicalRenderedDigest: targetDigest,
			currentTargetDigest: targetDigest,
			historicalNodeShape: copiedNodes,
			currentTargetNodeShape: copiedNodes,
		} as const;
		expect(verifyLegacyMigrationProof(exactProof, expectedLineage)).toEqual({
			authorizationKind: "legacy-copied-target",
			consumption: "one-time",
			...expectedLineage,
			historicalRenderedDigest: targetDigest,
			targetDigest,
		});
		const wrongNodes = [
			...copiedNodes,
			{ relativePath: "foreign.md", nodeType: "file" as const },
		];
		const failedProofs = [
			{ ...exactProof, revision: "different" },
			{ ...exactProof, sourceRelativePath: "domains/shared/skills/task" },
			{ ...exactProof, owner: ownerB },
			{ ...exactProof, assetId: "skill:shared/task" },
			{ ...exactProof, outputPath: join(homeRoot, ".claude/skills/task") },
			{ ...exactProof, historicalRenderedDigest: sha256("different") },
			{ ...exactProof, currentTargetDigest: sha256("different") },
			{ ...exactProof, historicalNodeShape: wrongNodes },
			{ ...exactProof, currentTargetNodeShape: wrongNodes },
		];
		for (const proof of failedProofs) {
			expect(
				verifyLegacyMigrationProof(proof, expectedLineage),
			).toBeUndefined();
		}
		const playwrightProof = {
			...exactProof,
			assetId: "skill:playwright-cli",
			outputPath: join(homeRoot, ".claude/skills/playwright-cli"),
		};
		expect(
			verifyLegacyMigrationProof(playwrightProof, {
				...expectedLineage,
				assetId: playwrightProof.assetId,
				outputPath: playwrightProof.outputPath,
			}),
		).toBeUndefined();

		expect(await snapshotTree(editedTarget.ownerRoot)).toEqual(beforeProtected);
	});
});

function asset(
	assetId: string,
	sourceRoot: string,
	sourcePath: string,
	ownership: "project" | "authority",
	kind: "skill" | "command" = "skill",
): HarnessAsset {
	return {
		assetId,
		kind,
		ownership:
			ownership === "authority"
				? { kind: "authority", authorityId: "cosmonauts/core" }
				: { kind: "project" },
		sourceRootId: `root:${assetId}`,
		sourceRoot,
		sourcePath,
		logicalPath: sourcePath,
		outputIdentity: sourcePath.replace(/\.md$/, ""),
		defaultScope: "personal",
	};
}

async function writeSource(asset: HarnessAsset, bytes: Buffer): Promise<void> {
	const source = join(asset.sourceRoot, asset.sourcePath);
	if (asset.kind === "command" || asset.sourcePath.endsWith(".md")) {
		await mkdir(dirname(source), { recursive: true });
		await writeFile(source, bytes);
		return;
	}
	await mkdir(source, { recursive: true });
	await writeFile(join(source, "SKILL.md"), bytes);
}

function target(
	asset: HarnessAsset,
	homeRoot: string,
	requestedMode?: "copy" | "link",
): ResolvedHarnessAssetTarget {
	const ownerRoot = join(homeRoot, ".claude");
	const directory = asset.kind === "skill" ? "skills" : "commands";
	const targetDirectory = join(ownerRoot, directory);
	return {
		targetId: "claude",
		scope: "personal",
		kind: asset.kind,
		ownerRoot,
		targetDirectory,
		transform: asset.kind === "skill" ? "identity" : "claude-command",
		supportedModes: asset.kind === "skill" ? ["copy", "link"] : ["copy"],
		supportedLinkShapes:
			asset.kind === "skill"
				? ["directory", "flat-skill", "generated-wrapper"]
				: [],
		assetId: asset.assetId,
		targetPath: join(targetDirectory, asset.outputIdentity),
		...(requestedMode ? { requestedMode } : {}),
	};
}

function inventory(
	asset: HarnessAsset,
	targetPath: string,
	state: "absent" | "edited" | "exact-baseline",
	baselineOwner?: OwnerIdentity,
): HarnessSyncInventoryRow {
	return {
		asset,
		targetId: "claude",
		scope: "personal",
		targetPath,
		source: "present",
		targetObservation: {
			state,
			...(state === "exact-baseline" && baselineOwner
				? {
						baselineOwnerId: baselineOwner.ownerId,
						baselineAssetId: asset.assetId,
					}
				: {}),
		},
	};
}

function health(sourceRootId: string, status: "complete" | "incomplete") {
	return {
		sourceRootId,
		status,
	};
}

function cloneEntry(
	entry: HarnessManifestEntry,
	assetId: string,
	outputPath: string,
): HarnessManifestEntry {
	return {
		...entry,
		assetId,
		logicalPath: assetId,
		outputPath,
	};
}

function observation(
	entry: HarnessManifestEntry,
	state: "absent" | "edited" | "exact-baseline",
) {
	return {
		targetPath: entry.outputPath,
		state,
		...(state === "exact-baseline"
			? {
					baselineOwnerId: entry.owner.ownerId,
					baselineAssetId: entry.assetId,
				}
			: {}),
	};
}

async function snapshotTree(root: string): Promise<Record<string, unknown>> {
	const snapshot: Record<string, unknown> = {};
	async function walk(path: string, relativePath: string): Promise<void> {
		const stats = await lstat(path);
		snapshot[relativePath || "."] = {
			kind: stats.isSymbolicLink()
				? "link"
				: stats.isDirectory()
					? "directory"
					: "file",
			mode: stats.mode,
			size: stats.size,
			mtimeMs: stats.mtimeMs,
			...(stats.isSymbolicLink() ? { link: await readlink(path) } : {}),
			...(stats.isFile()
				? { bytes: (await readFile(path)).toString("hex") }
				: {}),
		};
		if (!stats.isDirectory() || stats.isSymbolicLink()) return;
		const children = await readdir(path);
		children.sort();
		for (const child of children) {
			await walk(
				join(path, child),
				relativePath ? `${relativePath}/${child}` : child,
			);
		}
	}
	await walk(root, "");
	return snapshot;
}

function fixedNow(): Date {
	return new Date("2026-08-26T00:00:00.000Z");
}

function laterNow(): Date {
	return new Date("2030-01-01T00:00:00.000Z");
}
