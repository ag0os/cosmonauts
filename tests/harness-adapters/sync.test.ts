import { execFile } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readFile,
	readlink,
	realpath,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import {
	manifestEntryKey,
	observeStableHarnessState,
	resolveAssetOwnerIdentity,
	resolveHarnessTransactionPaths,
	sha256,
} from "../../lib/harness-adapters/provenance.ts";
import type {
	HarnessManifestSnapshot,
	HarnessNodeSnapshot,
	OwnerRootEvidenceReceipt,
	OwnerRootTransactionJournal,
} from "../../lib/harness-adapters/sync.ts";
import {
	applySyncPlanInTransaction,
	createSkillsExportSyncRequest,
	observeHarnessNodeSnapshot,
	planHarnessSync,
	serializeOwnerRootJournal,
	withOwnerRootTransaction,
} from "../../lib/harness-adapters/sync.ts";
import type {
	HarnessAsset,
	HarnessManifestEntry,
	HarnessSyncInventoryRow,
	OwnerIdentity,
	SyncRequest,
	TargetObservation,
} from "../../lib/harness-adapters/types.ts";

const tempRoots: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe("harness sync planning", () => {
	test("recovers every phase vector through one sibling lock while retaining evidence holds", async () => {
		// @cosmo-behavior plan:harness-adapters#B-007
		const applyFixture = await createTransactionFixture("apply", 2);
		let lockAcquisitions = 0;
		let observedWaitTimeout: number | undefined;
		const applied = await withOwnerRootTransaction(
			{
				ownerRoot: applyFixture.ownerRoot,
				targetId: "claude",
				lockRunner: async (_path, action, options) => {
					lockAcquisitions += 1;
					observedWaitTimeout = options.waitTimeoutMs;
					return action();
				},
			},
			async (transaction) =>
				applySyncPlanInTransaction(transaction, {
					oldManifest: applyFixture.oldManifest,
					newManifestContents: applyFixture.newManifest.contents,
					members: applyFixture.members.map((member) => ({
						targetPath: member.targetPath,
						oldState: member.oldState,
						newState: member.newState,
						writeStage: (path) => writeNode(path, member.newBytes),
					})),
					onPhasePersisted: async (phase, journal) => {
						if (phase !== "prepared") return;
						expect(await readFile(applyFixture.journalPath, "utf8")).toBe(
							serializeOwnerRootJournal(journal),
						);
						for (const member of journal.members) {
							expect(
								(await observeHarnessNodeSnapshot(member.stagePath)).kind,
							).toBe("absent");
							expect(
								(await observeHarnessNodeSnapshot(member.backupPath)).kind,
							).toBe("absent");
						}
					},
				}),
		);
		expect(applied).toMatchObject({
			state: "completed",
			result: { state: "committed" },
		});
		expect(lockAcquisitions).toBe(1);
		expect(observedWaitTimeout).toBeGreaterThan(0);
		expect(await readFile(applyFixture.manifestPath, "utf8")).toBe(
			applyFixture.newManifest.contents,
		);
		for (const member of applyFixture.members) {
			expect(await readFile(member.targetPath, "utf8")).toBe(
				member.newBytes.toString("utf8"),
			);
		}

		const aliasPath = join(applyFixture.root, "owner-alias");
		await symlink(dirname(applyFixture.ownerRoot), aliasPath, "dir");
		let aliasedLockPath = "";
		const aliased = await withOwnerRootTransaction(
			{
				ownerRoot: join(aliasPath, ".claude"),
				targetId: "claude",
				lockRunner: async (path, action) => {
					aliasedLockPath = path;
					return action();
				},
			},
			async (transaction) => ({
				ownerRoot: transaction.canonicalOwnerRoot,
				manifestPath: transaction.manifestPath,
			}),
		);
		expect(aliasedLockPath).toBe(applyFixture.lockPath);
		expect(aliased).toMatchObject({
			state: "completed",
			result: {
				ownerRoot: applyFixture.ownerRoot,
				manifestPath: applyFixture.manifestPath,
			},
		});

		const coveredRows = new Set<number>([1]);
		const absentJournal = await createTransactionFixture("row-1", 1);
		expect(await runFreshRecovery(absentJournal)).toMatchObject({
			state: "completed",
			recovery: { state: "none" },
		});

		const malformed = await createTransactionFixture("row-2", 1);
		await writeFile(malformed.journalPath, "{malformed\n");
		const malformedBefore = await snapshotTransactionFixture(malformed);
		expect(await runFreshRecovery(malformed)).toMatchObject({
			state: "recovery-required",
			recovery: { state: "ambiguous" },
		});
		expect(await snapshotTransactionFixture(malformed)).toEqual(
			malformedBefore,
		);
		coveredRows.add(2);

		const manifestOther = await seededRecoveryFixture("row-3", "prepared", {
			manifest: "other",
			targets: ["old"],
			backups: ["absent"],
			stages: ["absent"],
		});
		await expectAmbiguousAndUntouched(manifestOther);
		coveredRows.add(3);

		const targetOther = await seededRecoveryFixture("row-4", "installing", {
			manifest: "old",
			targets: ["other"],
			backups: ["absent"],
			stages: ["new"],
		});
		await expectAmbiguousAndUntouched(targetOther);
		coveredRows.add(4);
		const backupOther = await seededRecoveryFixture(
			"row-4-backup",
			"rolling-back",
			{
				manifest: "old",
				targets: ["missing"],
				backups: ["other"],
				stages: ["absent"],
			},
		);
		await expectAmbiguousAndUntouched(backupOther);
		const stageOther = await seededRecoveryFixture("row-4-stage", "prepared", {
			manifest: "old",
			targets: ["old"],
			backups: ["absent"],
			stages: ["other"],
		});
		await expectAmbiguousAndUntouched(stageOther);

		const prepared = await seededRecoveryFixture("row-5", "prepared", {
			manifest: "old",
			targets: ["old"],
			backups: ["absent"],
			stages: ["new"],
		});
		expect(await runFreshRecovery(prepared)).toMatchObject({
			state: "completed",
			recovery: { state: "restored-old", phase: "prepared" },
		});
		expect((await observeHarnessNodeSnapshot(prepared.journalPath)).kind).toBe(
			"absent",
		);
		coveredRows.add(5);

		const preparedInvalid = await seededRecoveryFixture("row-6", "prepared", {
			manifest: "old",
			targets: ["missing"],
			backups: ["old"],
			stages: ["new"],
		});
		await expectAmbiguousAndUntouched(preparedInvalid);
		coveredRows.add(6);

		const installing = await seededRecoveryFixture(
			"row-7",
			"installing",
			{
				manifest: "old",
				targets: ["old", "missing", "new"],
				backups: ["absent", "old", "old"],
				stages: ["new", "new", "absent"],
			},
			3,
		);
		expect(await runFreshRecovery(installing)).toMatchObject({
			state: "completed",
			recovery: { state: "restored-old", phase: "installing" },
		});
		for (const member of installing.members) {
			expect(await observeHarnessNodeSnapshot(member.targetPath)).toEqual(
				member.oldState,
			);
		}
		coveredRows.add(7);

		const installingInvalid = await seededRecoveryFixture(
			"row-8",
			"installing",
			{
				manifest: "old",
				targets: ["new"],
				backups: ["absent"],
				stages: ["absent"],
			},
		);
		await expectAmbiguousAndUntouched(installingInvalid);
		coveredRows.add(8);

		for (const [row, manifest] of [
			[9, "old"],
			[10, "new"],
		] as const) {
			const fixture = await seededRecoveryFixture(
				`row-${row}`,
				"commit-ready",
				{
					manifest,
					targets: ["new"],
					backups: ["old"],
					stages: ["absent"],
				},
			);
			expect(await runFreshRecovery(fixture)).toMatchObject({
				state: "completed",
				recovery: { state: "committed-new", phase: "commit-ready" },
			});
			expect(await readFile(fixture.manifestPath, "utf8")).toBe(
				fixture.newManifest.contents,
			);
			coveredRows.add(row);
		}

		const commitReadyInvalid = await seededRecoveryFixture(
			"row-11",
			"commit-ready",
			{
				manifest: "old",
				targets: ["old"],
				backups: ["absent"],
				stages: ["absent"],
			},
		);
		await expectAmbiguousAndUntouched(commitReadyInvalid);
		coveredRows.add(11);

		const committed = await seededRecoveryFixture("row-12", "committed", {
			manifest: "new",
			targets: ["new"],
			backups: ["old"],
			stages: ["absent"],
		});
		expect(await runFreshRecovery(committed)).toMatchObject({
			state: "completed",
			recovery: { state: "committed-new", phase: "committed" },
		});
		coveredRows.add(12);

		const evidenceHeld = await seededRecoveryFixture(
			"row-13",
			"committed",
			{
				manifest: "new",
				targets: ["new"],
				backups: ["old"],
				stages: ["absent"],
			},
			1,
			"after-evidence",
		);
		expect(await runFreshRecovery(evidenceHeld)).toMatchObject({
			state: "recovery-required",
			recovery: { state: "evidence-required" },
		});
		const checkBefore = await snapshotTransactionFixture(evidenceHeld);
		const checkObservation = await observeStableHarnessState({
			manifestPath: evidenceHeld.manifestPath,
			journalPath: evidenceHeld.journalPath,
			observeTarget: async () =>
				observeHarnessNodeSnapshot(evidenceHeld.members[0]?.targetPath ?? ""),
		});
		expect(checkObservation).toMatchObject({
			journalPresent: true,
			status: "source-ahead",
			reason: "pending-journal",
			exitCode: 1,
		});
		expect(await snapshotTransactionFixture(evidenceHeld)).toEqual(checkBefore);
		const heldBeforeReceipt = await snapshotTransactionFixture(evidenceHeld);
		const malformedEvidencePath = join(evidenceHeld.root, "evidence.json");
		await writeFile(malformedEvidencePath, "not evidence\n");
		const malformedReceipt = {
			transactionId: evidenceHeld.journal.transactionId,
			evidencePath: malformedEvidencePath,
			evidenceDigest: sha256("not evidence\n"),
		} satisfies OwnerRootEvidenceReceipt;
		expect(
			await runFreshRecovery(evidenceHeld, malformedReceipt),
		).toMatchObject({
			state: "recovery-required",
			recovery: { state: "ambiguous", reason: "evidence-receipt-invalid" },
		});
		expect((await snapshotTransactionFixture(evidenceHeld)).journal).toEqual(
			heldBeforeReceipt.journal,
		);
		const evidenceContents = `${JSON.stringify({
			schemaVersion: 1,
			transactionId: evidenceHeld.journal.transactionId,
			phase: "installed",
			newManifestDigest: evidenceHeld.newManifest.digest,
		})}\n`;
		await writeFile(malformedEvidencePath, evidenceContents);
		const receipt = {
			transactionId: evidenceHeld.journal.transactionId,
			evidencePath: malformedEvidencePath,
			evidenceDigest: sha256(evidenceContents),
		} satisfies OwnerRootEvidenceReceipt;
		expect(await runFreshRecovery(evidenceHeld, receipt)).toMatchObject({
			state: "completed",
			recovery: { state: "committed-new" },
		});
		expect(
			await observeHarnessNodeSnapshot(
				evidenceHeld.members[0]?.backupPath ?? "",
			),
		).toEqual(evidenceHeld.members[0]?.oldState);
		expect(await runFreshRecovery(evidenceHeld)).toMatchObject({
			state: "completed",
			recovery: { state: "none" },
		});
		expect(
			await observeHarnessNodeSnapshot(
				evidenceHeld.members[0]?.backupPath ?? "",
			),
		).toEqual(evidenceHeld.members[0]?.oldState);
		coveredRows.add(13);

		const committedInvalid = await seededRecoveryFixture(
			"row-14",
			"committed",
			{
				manifest: "old",
				targets: ["new"],
				backups: ["old"],
				stages: ["absent"],
			},
		);
		await expectAmbiguousAndUntouched(committedInvalid);
		coveredRows.add(14);

		const rollingBack = await seededRecoveryFixture(
			"row-15",
			"rolling-back",
			{
				manifest: "new",
				targets: ["old", "new", "missing"],
				backups: ["absent", "old", "old"],
				stages: ["absent", "absent", "new"],
			},
			3,
		);
		expect(await runFreshRecovery(rollingBack)).toMatchObject({
			state: "completed",
			recovery: { state: "restored-old", phase: "rolling-back" },
		});
		coveredRows.add(15);

		const rollingInvalid = await seededRecoveryFixture(
			"row-16",
			"rolling-back",
			{
				manifest: "new",
				targets: ["other"],
				backups: ["old"],
				stages: ["absent"],
			},
		);
		await expectAmbiguousAndUntouched(rollingInvalid);
		coveredRows.add(16);
		coveredRows.add(17); // final wildcard is exercised by each phase's remaining-vector case above.
		expect([...coveredRows].sort((left, right) => left - right)).toEqual(
			Array.from({ length: 17 }, (_value, index) => index + 1),
		);

		const contended = await createTransactionFixture("contended", 1);
		await writeFile(
			contended.lockPath,
			`${JSON.stringify({ pid: process.pid, uuid: "wedged", startedAt: new Date().toISOString() })}\n`,
		);
		const contentionStarted = Date.now();
		expect(
			await withOwnerRootTransaction(
				{
					ownerRoot: contended.ownerRoot,
					targetId: "claude",
					waitTimeoutMs: 30,
				},
				async () => "must-not-run",
			),
		).toMatchObject({
			state: "lock-contended",
			lockPath: contended.lockPath,
			ownerPid: process.pid,
			waitTimeoutMs: 30,
			exitCode: 1,
		});
		expect(Date.now() - contentionStarted).toBeLessThan(500);
		expect((await observeHarnessNodeSnapshot(contended.journalPath)).kind).toBe(
			"absent",
		);
		const stale = await createTransactionFixture("stale", 1);
		await writeFile(
			stale.lockPath,
			`${JSON.stringify({ pid: 99_999_999, uuid: "dead", startedAt: "2026-01-01T00:00:00.000Z" })}\n`,
		);
		expect(
			await withOwnerRootTransaction(
				{ ownerRoot: stale.ownerRoot, targetId: "claude", waitTimeoutMs: 100 },
				async () => "reclaimed",
			),
		).toMatchObject({ state: "completed", result: "reclaimed" });

		const releaseFixture = await createTransactionFixture("release", 1);
		let laterOwnerOperation = false;
		const releaseResult = await withOwnerRootTransaction(
			{
				ownerRoot: releaseFixture.ownerRoot,
				targetId: "claude",
				lockRunner: async (_path, action, options) => {
					const result = await action();
					options.onReleaseUnconfirmed?.(new Error("release uncertain"));
					return result;
				},
			},
			async (transaction) =>
				applySyncPlanInTransaction(transaction, {
					oldManifest: releaseFixture.oldManifest,
					newManifestContents: releaseFixture.newManifest.contents,
					cleanupPolicy: "after-evidence",
					members: releaseFixture.members.map((member) => ({
						targetPath: member.targetPath,
						oldState: member.oldState,
						newState: member.newState,
						writeStage: (path) => writeNode(path, member.newBytes),
					})),
				}),
		);
		if (releaseResult.state === "completed") laterOwnerOperation = true;
		expect(releaseResult).toMatchObject({
			state: "persisted-release-unconfirmed",
			persisted: {
				state: "completed",
				result: { state: "evidence-required" },
			},
			exitCode: 1,
		});
		expect(laterOwnerOperation).toBe(false);
		expect(
			JSON.parse(await readFile(releaseFixture.journalPath, "utf8")),
		).toMatchObject({ phase: "committed", cleanupPolicy: "after-evidence" });

		const containmentSwap = await createTransactionFixture(
			"containment-swap",
			1,
		);
		const displacedOwner = `${containmentSwap.ownerRoot}.displaced`;
		const outsideOwner = join(containmentSwap.root, "outside-owner");
		await mkdir(outsideOwner);
		await expect(
			withOwnerRootTransaction(
				{
					ownerRoot: containmentSwap.ownerRoot,
					targetId: "claude",
					lockRunner: async (_path, action) => action(),
				},
				async (transaction) =>
					applySyncPlanInTransaction(transaction, {
						oldManifest: containmentSwap.oldManifest,
						newManifestContents: containmentSwap.newManifest.contents,
						members: containmentSwap.members.map((member) => ({
							targetPath: member.targetPath,
							oldState: member.oldState,
							newState: member.newState,
							writeStage: (path) => writeNode(path, member.newBytes),
						})),
						onPhasePersisted: async (phase) => {
							if (phase !== "prepared") return;
							await rename(containmentSwap.ownerRoot, displacedOwner);
							await symlink(outsideOwner, containmentSwap.ownerRoot, "dir");
						},
					}),
			),
		).rejects.toThrow("containment changed");
		expect(
			JSON.parse(await readFile(containmentSwap.journalPath, "utf8")),
		).toMatchObject({ phase: "prepared" });
		expect(
			(
				await observeHarnessNodeSnapshot(
					containmentSwap.members[0]?.stagePath ?? "",
				)
			).kind,
		).toBe("absent");

		const escapingRoot = join(applyFixture.root, "escaping");
		await symlink(applyFixture.ownerRoot, escapingRoot, "dir");
		let acquiredEscapingLock = false;
		await expect(
			withOwnerRootTransaction(
				{
					ownerRoot: escapingRoot,
					targetId: "claude",
					lockRunner: async (_path, action) => {
						acquiredEscapingLock = true;
						return action();
					},
				},
				async () => undefined,
			),
		).rejects.toThrow("cannot be a symlink");
		expect(acquiredEscapingLock).toBe(false);
	});

	test("reconciles healthy complete partial transfer and source-removed inventories without destructive inference", async () => {
		// @cosmo-behavior plan:harness-adapters#B-004
		const fixture = await createFixture();
		const currentOwner = await resolveAssetOwnerIdentity(
			projectAsset("skill:current", "current"),
			fixture.projectA,
		);
		const foreignOwner = await resolveAssetOwnerIdentity(
			projectAsset("skill:current", "current"),
			fixture.projectB,
		);
		const authorityOwner = await resolveAssetOwnerIdentity(
			authorityAsset("external-skill:cosmonauts", "cosmonauts"),
			fixture.projectA,
		);

		// Authority ownership is independent of cwd, checkout, monorepo, and package path.
		const relocatedCommand = {
			...authorityAsset("command:implement-plan", "implement-plan.md"),
			sourceRoot: "/different/package",
		};
		await expect(
			resolveAssetOwnerIdentity(
				relocatedCommand,
				join(fixture.projectB, "packages", "nested"),
			),
		).resolves.toEqual({
			kind: "authority",
			ownerId: "authority:cosmonauts/core",
			authorityId: "cosmonauts/core",
		});
		expect(authorityOwner.ownerId).toBe("authority:cosmonauts/core");
		expect(currentOwner).not.toEqual(foreignOwner);
		expect(currentOwner).toMatchObject({
			kind: "project",
			projectRoot: await realpath(fixture.projectA),
		});

		const exactRemoved = projectAsset("skill:removed-exact", "removed-exact");
		const absentRemoved = projectAsset(
			"skill:removed-absent",
			"removed-absent",
		);
		const editedRemoved = projectAsset(
			"skill:removed-edited",
			"removed-edited",
		);
		const healthy = projectAsset("skill:healthy", "healthy");
		const incomplete = projectAsset(
			"skill:incomplete",
			"incomplete",
			"root:broken",
		);
		const bundle = authorityAsset("external-skill:cosmonauts", "cosmonauts");
		const command = authorityAsset(
			"command:implement-plan",
			"implement-plan.md",
			"command",
		);
		const rows = [
			inventory(healthy, "present", fixture, "absent"),
			inventory(
				incomplete,
				"absent",
				fixture,
				"edited",
				undefined,
				fixture.incompleteFile,
			),
			inventory(bundle, "present", fixture, "exact-baseline", authorityOwner),
			inventory(
				command,
				"present",
				fixture,
				"exact-baseline",
				authorityOwner,
				fixture.unselectedFile,
			),
		];
		const manifest = [
			entry(exactRemoved, currentOwner, fixture),
			entry(absentRemoved, currentOwner, fixture),
			entry(
				editedRemoved,
				currentOwner,
				fixture,
				editedRemoved.defaultScope,
				fixture.editedFile,
			),
			entry(bundle, authorityOwner, fixture, "personal"),
			entry(
				command,
				authorityOwner,
				fixture,
				"personal",
				fixture.unselectedFile,
			),
			entry(
				projectAsset("skill:foreign-stale", "foreign-stale"),
				foreignOwner,
				fixture,
				"project",
				fixture.linkPath,
			),
		] as const satisfies readonly HarnessManifestEntry[];
		const observations = [
			observation(manifest[0], "exact-baseline"),
			observation(manifest[1], "absent"),
			observation(manifest[2], "edited"),
			observation(manifest[3], "exact-baseline"),
			observation(manifest[4], "exact-baseline"),
			observation(manifest[5], "exact-baseline"),
		];
		const completeRequest: SyncRequest = {
			reconciliation: "complete",
			check: false,
		};

		const incompletePlan = await planHarnessSync({
			projectRoot: fixture.projectA,
			request: completeRequest,
			inventory: rows,
			manifestEntries: manifest,
			targetObservations: observations,
			sourceHealth: [
				health("root:healthy", "complete"),
				health("root:broken", "incomplete"),
				health("root:incomplete-with-no-candidates", "incomplete"),
			],
		});
		expect(incompletePlan.aborted).toBe(true);
		expect(incompletePlan.abortReason).toBe("inventory-incomplete");
		expect(
			incompletePlan.rows.every(
				(row) => !row.writesTarget && !row.writesManifest,
			),
		).toBe(true);
		expect(
			incompletePlan.rows.find((row) => row.assetId === healthy.assetId),
		).toMatchObject({
			status: "missing",
			action: "none",
			reason: "transaction-aborted-incomplete-inventory",
		});

		const healthyPlan = await planHarnessSync({
			projectRoot: fixture.projectA,
			request: completeRequest,
			inventory: rows.filter((row) => row.asset.sourceRootId !== "root:broken"),
			manifestEntries: manifest,
			targetObservations: observations,
			sourceHealth: [health("root:healthy", "complete")],
		});
		expect(planRow(healthyPlan.rows, exactRemoved.assetId)).toMatchObject({
			status: "source-ahead",
			reason: "source-removed",
			action: "remove-target-and-entry",
			writesTarget: true,
			writesManifest: true,
		});
		expect(planRow(healthyPlan.rows, absentRemoved.assetId)).toMatchObject({
			action: "forget-entry",
			writesTarget: false,
			writesManifest: true,
		});
		expect(planRow(healthyPlan.rows, editedRemoved.assetId)).toMatchObject({
			status: "locally-edited",
			reason: "source-removed",
			action: "none",
			writesTarget: false,
			writesManifest: false,
		});
		expect(planRow(healthyPlan.rows, "skill:foreign-stale")).toMatchObject({
			reason: "foreign-owner",
			action: "none",
		});

		const checkPlan = await planHarnessSync({
			projectRoot: fixture.projectA,
			request: { ...completeRequest, check: true },
			inventory: rows.filter((row) => row.asset.sourceRootId !== "root:broken"),
			manifestEntries: manifest,
			targetObservations: observations,
			sourceHealth: [health("root:healthy", "complete")],
		});
		expect(planRow(checkPlan.rows, exactRemoved.assetId)).toMatchObject({
			status: "source-ahead",
			reason: "source-removed",
			action: "none",
			writesTarget: false,
			writesManifest: false,
		});

		const forgetPlan = await planHarnessSync({
			projectRoot: fixture.projectA,
			request: {
				reconciliation: "complete",
				check: false,
				forgetRemovedAssetIds: [editedRemoved.assetId],
			},
			inventory: [],
			manifestEntries: manifest,
			targetObservations: observations,
			sourceHealth: [health("root:healthy", "complete")],
		});
		expect(forgetPlan.rows).toHaveLength(1);
		expect(forgetPlan.rows[0]).toMatchObject({
			action: "forget-entry",
			writesTarget: false,
			writesManifest: true,
		});

		const partialRequest = createSkillsExportSyncRequest([
			healthy.assetId,
			healthy.assetId,
		]);
		expect(partialRequest).toEqual({
			reconciliation: "partial",
			check: false,
			kinds: ["skill"],
			assetIds: [healthy.assetId],
		});
		const partialPlan = await planHarnessSync({
			projectRoot: fixture.projectA,
			request: partialRequest,
			inventory: rows,
			manifestEntries: manifest,
			targetObservations: observations,
			sourceHealth: [
				health("root:healthy", "complete"),
				health("root:broken", "incomplete"),
			],
		});
		expect(partialPlan.rows.map((row) => row.assetId)).toEqual([
			healthy.assetId,
		]);
		expect(partialPlan.rows[0]).toMatchObject({
			action: "create",
			writesTarget: true,
		});
		expect(partialPlan.rows.some((row) => row.assetId === bundle.assetId)).toBe(
			false,
		);
		expect(partialPlan.rows.some((row) => row.kind === "command")).toBe(false);
		expect(
			partialPlan.rows.some((row) => row.reason === "source-removed"),
		).toBe(false);

		const commandOnly = await planHarnessSync({
			projectRoot: fixture.projectA,
			request: {
				reconciliation: "complete",
				check: false,
				kinds: ["command", "command"],
				assetIds: [command.assetId, command.assetId],
			},
			inventory: rows,
			manifestEntries: manifest,
			targetObservations: observations,
			sourceHealth: [health("root:healthy", "complete")],
		});
		expect(commandOnly.rows.map((row) => row.assetId)).toEqual([
			command.assetId,
		]);

		const transferAsset = projectAsset("skill:transfer", "transfer");
		const editedTransferAsset = projectAsset(
			"skill:transfer-edited",
			"transfer-edited",
		);
		const absentTransferAsset = projectAsset(
			"skill:transfer-absent",
			"transfer-absent",
		);
		const transferEntries = [
			entry(transferAsset, foreignOwner, fixture),
			entry(editedTransferAsset, foreignOwner, fixture),
			entry(absentTransferAsset, foreignOwner, fixture),
		] as const satisfies readonly HarnessManifestEntry[];
		const transferRows = [
			inventory(
				transferAsset,
				"present",
				fixture,
				"exact-baseline",
				foreignOwner,
			),
			inventory(editedTransferAsset, "present", fixture, "edited"),
			inventory(absentTransferAsset, "present", fixture, "absent"),
		];
		const transferPlan = await planHarnessSync({
			projectRoot: fixture.projectA,
			request: transferRequest(
				foreignOwner.ownerId,
				transferEntries.map((row) => row.assetId),
			),
			inventory: transferRows,
			manifestEntries: transferEntries,
			targetObservations: [
				observation(transferEntries[0], "exact-baseline"),
				observation(transferEntries[1], "edited"),
				observation(transferEntries[2], "absent"),
			],
			sourceHealth: [health("root:healthy", "complete")],
		});
		expect(planRow(transferPlan.rows, transferAsset.assetId)).toMatchObject({
			action: "transfer-entry",
			writesTarget: false,
			writesManifest: true,
			previousManifestKey: manifestEntryKey(
				foreignOwner,
				transferAsset.assetId,
			),
			nextManifestKey: manifestEntryKey(currentOwner, transferAsset.assetId),
		});
		expect(
			planRow(transferPlan.rows, absentTransferAsset.assetId),
		).toMatchObject({
			action: "transfer-entry",
			writesTarget: false,
		});
		expect(
			planRow(transferPlan.rows, editedTransferAsset.assetId),
		).toMatchObject({
			action: "none",
			reason: "edited-target-cannot-transfer",
		});

		const pendingTransfer = await planHarnessSync({
			projectRoot: fixture.projectA,
			request: transferRequest(foreignOwner.ownerId, [transferAsset.assetId]),
			inventory: transferRows,
			manifestEntries: transferEntries,
			targetObservations: [observation(transferEntries[0], "exact-baseline")],
			sourceHealth: [health("root:healthy", "complete")],
			pendingJournalOwnerIds: [foreignOwner.ownerId],
		});
		expect(pendingTransfer.rows[0]).toMatchObject({
			action: "none",
			reason: "pending-journal",
		});

		// Planning, forget, and transfer never touch target bytes, node types, or links.
		expect(await readFile(fixture.editedFile, "utf8")).toBe("local edit\n");
		expect(await readFile(fixture.incompleteFile, "utf8")).toBe(
			"incomplete target\n",
		);
		expect(await readFile(fixture.unselectedFile, "utf8")).toBe(
			"unselected target\n",
		);
		expect(await readlink(fixture.linkPath)).toBe(fixture.linkTarget);
	});
});

interface TransactionFixtureMember {
	readonly targetPath: string;
	readonly stagePath: string;
	readonly backupPath: string;
	readonly oldBytes: Buffer;
	readonly newBytes: Buffer;
	readonly oldState: Exclude<HarnessNodeSnapshot, { readonly kind: "absent" }>;
	readonly newState: Exclude<HarnessNodeSnapshot, { readonly kind: "absent" }>;
}

interface TransactionFixture {
	readonly root: string;
	readonly ownerRoot: string;
	readonly lockPath: string;
	readonly journalPath: string;
	readonly manifestPath: string;
	readonly oldManifest: Extract<
		HarnessManifestSnapshot,
		{ readonly kind: "file" }
	>;
	readonly newManifest: Extract<
		HarnessManifestSnapshot,
		{ readonly kind: "file" }
	>;
	readonly members: readonly TransactionFixtureMember[];
	readonly journal: OwnerRootTransactionJournal;
}

interface RecoveryVector {
	readonly manifest: "old" | "new" | "other";
	readonly targets: readonly ("old" | "new" | "missing" | "other")[];
	readonly backups: readonly ("old" | "absent" | "other")[];
	readonly stages: readonly ("new" | "absent" | "other")[];
}

async function createTransactionFixture(
	label: string,
	memberCount: number,
): Promise<TransactionFixture> {
	const rawRoot = await mkdtemp(
		join(tmpdir(), `harness-transaction-${label}-`),
	);
	tempRoots.push(rawRoot);
	const root = await realpath(rawRoot);
	const ownerRoot = join(root, "base", ".claude");
	const targetDirectory = join(ownerRoot, "skills");
	await mkdir(targetDirectory, { recursive: true });
	const { lockPath, journalPath } = resolveHarnessTransactionPaths(
		ownerRoot,
		"claude",
	);
	const manifestPath = join(ownerRoot, ".cosmonauts-harness-manifest.json");
	const transactionId = `tx-${label}`;
	const stem = `${basename(journalPath, ".journal.json")}-${transactionId}`;
	const members: TransactionFixtureMember[] = [];
	for (let index = 0; index < memberCount; index += 1) {
		const oldBytes = Buffer.from(`old:${label}:${index}\n`);
		const newBytes = Buffer.from(`new:${label}:${index}\n`);
		const targetPath = join(targetDirectory, `member-${index}.md`);
		await writeNode(targetPath, oldBytes);
		members.push({
			targetPath,
			stagePath: join(dirname(journalPath), `${stem}-${index}.stage`),
			backupPath: join(dirname(journalPath), `${stem}-${index}.backup`),
			oldBytes,
			newBytes,
			oldState: fileSnapshot(oldBytes),
			newState: fileSnapshot(newBytes),
		});
	}
	const oldContents = `${JSON.stringify({ schemaVersion: 1, entries: {}, state: "old", label })}\n`;
	const newContents = `${JSON.stringify({ schemaVersion: 1, entries: {}, state: "new", label })}\n`;
	await writeFile(manifestPath, oldContents);
	const oldManifest = manifestFileSnapshot(oldContents);
	const newManifest = manifestFileSnapshot(newContents);
	const journal: OwnerRootTransactionJournal = {
		schemaVersion: 1,
		transactionId,
		canonicalOwnerRoot: ownerRoot,
		targetId: "claude",
		phase: "prepared",
		cleanupPolicy: "after-commit",
		atomicSet: true,
		manifestPath,
		oldManifest,
		newManifest,
		members: members.map(
			({ targetPath, stagePath, backupPath, oldState, newState }) => ({
				targetPath,
				stagePath,
				backupPath,
				oldState,
				newState,
			}),
		),
	};
	return {
		root,
		ownerRoot,
		lockPath,
		journalPath,
		manifestPath,
		oldManifest,
		newManifest,
		members,
		journal,
	};
}

async function seededRecoveryFixture(
	label: string,
	phase: OwnerRootTransactionJournal["phase"],
	vector: RecoveryVector,
	memberCount = 1,
	cleanupPolicy: OwnerRootTransactionJournal["cleanupPolicy"] = "after-commit",
): Promise<TransactionFixture> {
	const fixture = await createTransactionFixture(label, memberCount);
	if (
		vector.targets.length !== memberCount ||
		vector.backups.length !== memberCount ||
		vector.stages.length !== memberCount
	) {
		throw new Error(`Recovery vector length mismatch for ${label}.`);
	}
	await writeFile(
		fixture.manifestPath,
		vector.manifest === "old"
			? fixture.oldManifest.contents
			: vector.manifest === "new"
				? fixture.newManifest.contents
				: "ambiguous manifest bytes\n",
	);
	for (let index = 0; index < memberCount; index += 1) {
		const member = fixture.members[index];
		if (!member) throw new Error(`Missing fixture member ${index}.`);
		await Promise.all([
			rm(member.targetPath, { recursive: true, force: true }),
			rm(member.stagePath, { recursive: true, force: true }),
			rm(member.backupPath, { recursive: true, force: true }),
		]);
		const targetState = vector.targets[index];
		if (targetState !== "missing") {
			await writeNode(
				member.targetPath,
				targetState === "old"
					? member.oldBytes
					: targetState === "new"
						? member.newBytes
						: Buffer.from("ambiguous target bytes\n"),
			);
		}
		const backupState = vector.backups[index];
		if (backupState !== "absent") {
			await writeNode(
				member.backupPath,
				backupState === "old"
					? member.oldBytes
					: Buffer.from("ambiguous backup bytes\n"),
			);
		}
		const stageState = vector.stages[index];
		if (stageState !== "absent") {
			await writeNode(
				member.stagePath,
				stageState === "new"
					? member.newBytes
					: Buffer.from("ambiguous stage bytes\n"),
			);
		}
	}
	const journal = { ...fixture.journal, phase, cleanupPolicy };
	await writeFile(fixture.journalPath, serializeOwnerRootJournal(journal));
	return { ...fixture, journal };
}

async function runFreshRecovery(
	fixture: TransactionFixture,
	evidenceReceipt?: OwnerRootEvidenceReceipt,
): Promise<Record<string, unknown>> {
	const moduleUrl = pathToFileURL(
		join(process.cwd(), "lib/harness-adapters/sync.ts"),
	).href;
	const script = `
		import { withOwnerRootTransaction } from ${JSON.stringify(moduleUrl)};
		const result = await withOwnerRootTransaction(
			${JSON.stringify({
				ownerRoot: fixture.ownerRoot,
				targetId: "claude",
				waitTimeoutMs: 250,
				evidenceReceipt,
			})},
			async () => "continued"
		);
		console.log(JSON.stringify(result));
	`;
	const { stdout } = await execFileAsync("bun", ["-e", script], {
		cwd: process.cwd(),
		timeout: 2_000,
	});
	return JSON.parse(stdout.trim()) as Record<string, unknown>;
}

async function expectAmbiguousAndUntouched(
	fixture: TransactionFixture,
): Promise<void> {
	const before = await snapshotTransactionFixture(fixture);
	expect(await runFreshRecovery(fixture)).toMatchObject({
		state: "recovery-required",
		recovery: { state: "ambiguous" },
	});
	expect(await snapshotTransactionFixture(fixture)).toEqual(before);
}

async function snapshotTransactionFixture(
	fixture: TransactionFixture,
): Promise<Record<string, unknown>> {
	return {
		manifest: await observeHarnessNodeSnapshot(fixture.manifestPath),
		journal: await observeHarnessNodeSnapshot(fixture.journalPath),
		members: await Promise.all(
			fixture.members.map(async (member) => ({
				target: await observeHarnessNodeSnapshot(member.targetPath),
				stage: await observeHarnessNodeSnapshot(member.stagePath),
				backup: await observeHarnessNodeSnapshot(member.backupPath),
			})),
		),
	};
}

async function writeNode(path: string, bytes: Uint8Array): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, bytes);
}

function fileSnapshot(
	bytes: Uint8Array,
): Exclude<HarnessNodeSnapshot, { readonly kind: "absent" }> {
	return {
		kind: "file",
		digest: sha256(Buffer.concat([Buffer.from("file\0"), Buffer.from(bytes)])),
	};
}

function manifestFileSnapshot(
	contents: string,
): Extract<HarnessManifestSnapshot, { readonly kind: "file" }> {
	return { kind: "file", digest: sha256(contents), contents };
}

interface Fixture {
	projectA: string;
	projectB: string;
	editedFile: string;
	incompleteFile: string;
	unselectedFile: string;
	linkPath: string;
	linkTarget: string;
}

async function createFixture(): Promise<Fixture> {
	const root = await mkdtemp(join(tmpdir(), "harness-sync-"));
	tempRoots.push(root);
	const projectA = join(root, "project-a");
	const projectB = join(root, "project-b");
	const targetRoot = join(root, "targets");
	await Promise.all([
		mkdir(projectA, { recursive: true }),
		mkdir(projectB, { recursive: true }),
		mkdir(targetRoot, { recursive: true }),
	]);
	const editedFile = join(targetRoot, "edited.md");
	const incompleteFile = join(targetRoot, "incomplete.md");
	const unselectedFile = join(targetRoot, "unselected.md");
	const linkTarget = join(targetRoot, "authored.md");
	const linkPath = join(targetRoot, "linked.md");
	await writeFile(editedFile, "local edit\n");
	await writeFile(incompleteFile, "incomplete target\n");
	await writeFile(unselectedFile, "unselected target\n");
	await writeFile(linkTarget, "authored\n");
	await symlink(linkTarget, linkPath);
	return {
		projectA,
		projectB,
		editedFile,
		incompleteFile,
		unselectedFile,
		linkPath,
		linkTarget,
	};
}

function projectAsset(
	assetId: string,
	outputIdentity: string,
	sourceRootId = "root:healthy",
): HarnessAsset {
	return {
		assetId,
		kind: "skill",
		ownership: { kind: "project" },
		sourceRootId,
		sourceRoot: "/catalogue",
		sourcePath: `skills/${outputIdentity}`,
		logicalPath: outputIdentity,
		outputIdentity,
		defaultScope: "project",
	};
}

function authorityAsset(
	assetId: string,
	outputIdentity: string,
	kind: "skill" | "command" = "skill",
): HarnessAsset {
	return {
		assetId,
		kind,
		ownership: { kind: "authority", authorityId: "cosmonauts/core" },
		sourceRootId: "root:healthy",
		sourceRoot: "/package",
		sourcePath: `${kind}s/${outputIdentity}`,
		logicalPath: outputIdentity,
		outputIdentity,
		defaultScope: "personal",
	};
}

function inventory(
	asset: HarnessAsset,
	source: "present" | "absent",
	fixture: Fixture,
	targetState: TargetObservation["state"],
	baselineOwner?: OwnerIdentity,
	targetPath = join(fixture.projectA, "outputs", asset.outputIdentity),
): HarnessSyncInventoryRow {
	const scope = asset.defaultScope;
	return {
		asset,
		targetId: "claude",
		scope,
		targetPath,
		source,
		targetObservation: {
			state: targetState,
			...(targetState === "exact-baseline" && baselineOwner
				? {
						baselineOwnerId: baselineOwner.ownerId,
						baselineAssetId: asset.assetId,
					}
				: {}),
		},
	};
}

function entry(
	asset: HarnessAsset,
	owner: OwnerIdentity,
	fixture: Fixture,
	scope: "project" | "personal" = asset.defaultScope,
	outputPath = join(fixture.projectA, "outputs", asset.outputIdentity),
): HarnessManifestEntry {
	return {
		schemaVersion: 1,
		owner,
		assetId: asset.assetId,
		kind: asset.kind,
		target: "claude",
		scope,
		sourceRootId: asset.sourceRootId,
		sourcePath: asset.sourcePath,
		logicalPath: asset.logicalPath,
		outputPath,
		mode: "copy",
		exportedAt: "2026-08-25T00:00:00.000Z",
		provenance: { kind: "copy", baselineDigest: `baseline:${asset.assetId}` },
	};
}

function observation(
	manifestEntry: HarnessManifestEntry,
	state: TargetObservation["state"],
): TargetObservation & { targetPath: string } {
	return {
		targetPath: manifestEntry.outputPath,
		state,
		...(state === "exact-baseline"
			? {
					baselineOwnerId: manifestEntry.owner.ownerId,
					baselineAssetId: manifestEntry.assetId,
				}
			: {}),
	};
}

function health(sourceRootId: string, status: "complete" | "incomplete") {
	return {
		sourceRootId,
		sourceRoot: `/source/${sourceRootId}`,
		domain: "test",
		status,
		issues:
			status === "complete"
				? []
				: [{ kind: "read" as const, path: "/source", message: "unreadable" }],
	};
}

function transferRequest(
	oldOwnerId: string,
	assetIds: readonly string[],
): SyncRequest {
	return {
		reconciliation: "partial",
		check: false,
		assetIds,
		transferOwner: { oldOwnerId, assetIds },
	};
}

function planRow<T extends { assetId: string }>(
	rows: readonly T[],
	assetId: string,
): T {
	const row = rows.find((candidate) => candidate.assetId === assetId);
	expect(row, `missing plan row for ${assetId}`).toBeDefined();
	return row as T;
}
