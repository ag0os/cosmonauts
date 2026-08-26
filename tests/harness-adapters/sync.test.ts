import {
	mkdir,
	mkdtemp,
	readFile,
	readlink,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
	manifestEntryKey,
	resolveAssetOwnerIdentity,
} from "../../lib/harness-adapters/provenance.ts";
import {
	createSkillsExportSyncRequest,
	planHarnessSync,
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

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true })),
	);
});

describe("harness sync planning", () => {
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
