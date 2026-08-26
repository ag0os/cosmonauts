import {
	manifestEntryKey,
	ownersMatch,
	resolveAssetOwnerIdentity,
} from "./provenance.ts";
import type {
	HarnessAsset,
	HarnessManifestEntry,
	HarnessSyncInventoryRow,
	HarnessSyncPlan,
	HarnessSyncPlanRow,
	ObservedHarnessTarget,
	OwnerIdentity,
	SourceHealthRow,
	SyncPlanAction,
	SyncPlanReason,
	SyncRequest,
	SyncStatus,
	TargetObservation,
} from "./types.ts";

export interface PlanHarnessSyncOptions {
	readonly projectRoot: string;
	readonly request: SyncRequest;
	readonly inventory: readonly HarnessSyncInventoryRow[];
	readonly manifestEntries: readonly HarnessManifestEntry[];
	readonly targetObservations?: readonly ObservedHarnessTarget[];
	readonly sourceHealth: readonly Pick<
		SourceHealthRow,
		"sourceRootId" | "status"
	>[];
	readonly pendingJournalOwnerIds?: readonly string[];
}

interface RowContext {
	readonly request: SyncRequest;
	readonly asset: HarnessAsset;
	readonly targetId: HarnessSyncInventoryRow["targetId"];
	readonly scope: HarnessSyncInventoryRow["scope"];
	readonly targetPath: string;
	readonly owner: OwnerIdentity;
}

/**
 * Build the compatibility request used by both named and `--all` skill export.
 * Supplying the currently discovered IDs makes the operation partial by
 * construction; omitted manifest rows can never become removal candidates.
 */
export function createSkillsExportSyncRequest(
	assetIds: readonly string[],
	options: { readonly check?: boolean } = {},
): SyncRequest {
	return {
		reconciliation: "partial",
		check: options.check ?? false,
		kinds: ["skill"],
		assetIds: deduplicate(assetIds),
	};
}

/**
 * Classify a normalized inventory and return explicit mutation intent. This
 * planner is deliberately I/O-free apart from canonical project identity
 * resolution; transaction code must be the only consumer that applies writes.
 */
export async function planHarnessSync(
	options: PlanHarnessSyncOptions,
): Promise<HarnessSyncPlan> {
	validateRequest(options.request);
	const request = normalizeRequest(options.request);
	const currentProjectOwner = await resolveAssetOwnerIdentity(
		{ ownership: { kind: "project" } },
		options.projectRoot,
	);
	const observations = new Map(
		(options.targetObservations ?? []).map((row) => [row.targetPath, row]),
	);
	const health = new Map(
		options.sourceHealth.map((row) => [row.sourceRootId, row.status]),
	);

	if (request.transferOwner) {
		return planTransfers({
			...options,
			request,
			currentProjectOwner,
			observations,
		});
	}
	if (request.forgetRemovedAssetIds) {
		return planForgets({
			...options,
			request,
			currentProjectOwner,
			observations,
		});
	}

	const selectedInventory = options.inventory.filter((row) =>
		matchesRequest(row, request),
	);
	const inventoryRows: HarnessSyncPlanRow[] = [];
	for (const row of selectedInventory) {
		const owner = await resolveAssetOwnerIdentity(
			row.asset,
			options.projectRoot,
		);
		const observation =
			observations.get(row.targetPath) ?? row.targetObservation;
		const claims = options.manifestEntries.filter(
			(entry) =>
				entry.assetId === row.asset.assetId &&
				entry.target === row.targetId &&
				entry.scope === row.scope &&
				entry.outputPath === row.targetPath,
		);
		inventoryRows.push(
			classifyInventoryRow({
				request,
				row,
				owner,
				observation,
				claims,
				health,
			}),
		);
	}

	const representedEntries = new Set(
		options.inventory.map((row) =>
			entryLocationKey(
				row.targetId,
				row.scope,
				row.asset.assetId,
				row.targetPath,
			),
		),
	);
	const staleRows =
		request.reconciliation === "complete"
			? options.manifestEntries
					.filter((entry) => matchesManifestRequest(entry, request))
					.filter(
						(entry) =>
							!representedEntries.has(
								entryLocationKey(
									entry.target,
									entry.scope,
									entry.assetId,
									entry.outputPath,
								),
							),
					)
					.map((entry) =>
						classifyStaleEntry({
							request,
							entry,
							currentProjectOwner,
							observation: observations.get(entry.outputPath) ?? {
								state: "absent",
							},
							health,
						}),
					)
			: [];
	let rows = [...inventoryRows, ...staleRows];

	const selectsSkills =
		request.kinds === undefined || request.kinds.includes("skill");
	const incompleteSelectedRoot =
		(selectsSkills &&
			options.sourceHealth.some((row) => row.status === "incomplete")) ||
		rows.some((row) => row.reason === "inventory-incomplete");
	if (request.reconciliation === "complete" && incompleteSelectedRoot) {
		rows = rows.map(abortMutation);
		return {
			request,
			rows,
			aborted: true,
			abortReason: "inventory-incomplete",
		};
	}

	return { request, rows, aborted: false };
}

function classifyInventoryRow(options: {
	readonly request: SyncRequest;
	readonly row: HarnessSyncInventoryRow;
	readonly owner: OwnerIdentity;
	readonly observation: TargetObservation;
	readonly claims: readonly HarnessManifestEntry[];
	readonly health: ReadonlyMap<string, SourceHealthRow["status"]>;
}): HarnessSyncPlanRow {
	const { request, row, owner, observation, claims, health } = options;
	const context: RowContext = {
		request,
		asset: row.asset,
		targetId: row.targetId,
		scope: row.scope,
		targetPath: row.targetPath,
		owner,
	};
	const matchingClaim = claims.find((entry) => ownersMatch(entry.owner, owner));
	const foreignClaim = claims.find((entry) => !ownersMatch(entry.owner, owner));

	if (health.get(row.asset.sourceRootId) === "incomplete") {
		return makeRow(context, "source-ahead", "inventory-incomplete", "none");
	}
	if (foreignClaim) {
		return makeRow(context, "locally-edited", "foreign-owner", "none");
	}
	if (row.source === "absent") {
		if (request.reconciliation === "partial") {
			return makeRow(context, "source-ahead", "partial-observation", "none");
		}
		if (health.get(row.asset.sourceRootId) !== "complete") {
			return makeRow(context, "source-ahead", "source-unavailable", "none");
		}
		if (!matchingClaim) {
			return makeRow(context, "locally-edited", "unmanaged", "none");
		}
		return classifyRemovedSource(context, matchingClaim, observation);
	}

	if (!matchingClaim) {
		return observation.state === "absent"
			? makeRow(context, "missing", "missing", "create")
			: makeRow(context, "locally-edited", "unmanaged", "none");
	}
	if (observation.state === "absent") {
		return makeRow(context, "missing", "missing", "create");
	}
	if (!isExactBaselineFor(observation, matchingClaim)) {
		return makeRow(context, "locally-edited", "locally-edited", "none");
	}
	return makeRow(context, "current", "current", "none");
}

function classifyStaleEntry(options: {
	readonly request: SyncRequest;
	readonly entry: HarnessManifestEntry;
	readonly currentProjectOwner: OwnerIdentity;
	readonly observation: TargetObservation;
	readonly health: ReadonlyMap<string, SourceHealthRow["status"]>;
}): HarnessSyncPlanRow {
	const { request, entry, currentProjectOwner, observation, health } = options;
	const context = contextFromEntry(request, entry);
	if (!ownersMatch(entry.owner, currentProjectOwner)) {
		return makeRow(context, "locally-edited", "foreign-owner", "none");
	}
	const rootHealth = health.get(entry.sourceRootId);
	if (rootHealth === "incomplete") {
		return makeRow(context, "source-ahead", "inventory-incomplete", "none");
	}
	if (rootHealth !== "complete") {
		return makeRow(context, "source-ahead", "source-unavailable", "none");
	}
	return classifyRemovedSource(context, entry, observation);
}

function classifyRemovedSource(
	context: RowContext,
	entry: HarnessManifestEntry,
	observation: TargetObservation,
): HarnessSyncPlanRow {
	if (observation.state === "absent") {
		return makeRow(context, "source-ahead", "source-removed", "forget-entry");
	}
	if (isExactBaselineFor(observation, entry)) {
		return makeRow(
			context,
			"source-ahead",
			"source-removed",
			"remove-target-and-entry",
		);
	}
	return makeRow(context, "locally-edited", "source-removed", "none");
}

interface SpecialPlanContext extends PlanHarnessSyncOptions {
	readonly request: SyncRequest;
	readonly currentProjectOwner: OwnerIdentity;
	readonly observations: ReadonlyMap<string, ObservedHarnessTarget>;
}

async function planTransfers(
	options: SpecialPlanContext,
): Promise<HarnessSyncPlan> {
	const transfer = options.request.transferOwner;
	if (!transfer) throw new Error("transfer request is missing transferOwner");
	const pending = new Set(options.pendingJournalOwnerIds ?? []);
	const rows: HarnessSyncPlanRow[] = [];

	for (const assetId of transfer.assetIds) {
		const inventory = options.inventory.find(
			(row) =>
				row.asset.assetId === assetId && matchesRequest(row, options.request),
		);
		const entry = options.manifestEntries.find(
			(candidate) =>
				candidate.owner.kind === "project" &&
				candidate.owner.ownerId === transfer.oldOwnerId &&
				candidate.assetId === assetId &&
				(!inventory ||
					(candidate.outputPath === inventory.targetPath &&
						candidate.target === inventory.targetId &&
						candidate.scope === inventory.scope &&
						candidate.kind === inventory.asset.kind)),
		);
		if (!inventory || !entry || inventory.asset.ownership.kind !== "project") {
			if (entry) {
				rows.push(
					makeRow(
						contextFromEntry(options.request, entry),
						"locally-edited",
						"transfer-entry-mismatch",
						"none",
					),
				);
			}
			continue;
		}
		const owner = await resolveAssetOwnerIdentity(
			inventory.asset,
			options.projectRoot,
		);
		const context: RowContext = {
			request: options.request,
			asset: inventory.asset,
			targetId: inventory.targetId,
			scope: inventory.scope,
			targetPath: inventory.targetPath,
			owner,
		};
		if (pending.has(entry.owner.ownerId) || pending.has(owner.ownerId)) {
			rows.push(makeRow(context, "source-ahead", "pending-journal", "none"));
			continue;
		}
		const observation =
			options.observations.get(inventory.targetPath) ??
			inventory.targetObservation;
		if (
			observation.state !== "absent" &&
			!isExactBaselineFor(observation, entry)
		) {
			rows.push(
				makeRow(
					context,
					"locally-edited",
					"edited-target-cannot-transfer",
					"none",
				),
			);
			continue;
		}
		rows.push({
			...makeRow(context, "locally-edited", "owner-transfer", "transfer-entry"),
			previousManifestKey: manifestEntryKey(entry.owner, entry.assetId),
			nextManifestKey: manifestEntryKey(owner, entry.assetId),
		});
	}

	return { request: options.request, rows, aborted: false };
}

function planForgets(options: SpecialPlanContext): HarnessSyncPlan {
	const forgetIds = new Set(options.request.forgetRemovedAssetIds ?? []);
	const rows: HarnessSyncPlanRow[] = [];
	for (const entry of options.manifestEntries) {
		if (
			!forgetIds.has(entry.assetId) ||
			!matchesManifestRequest(entry, options.request)
		) {
			continue;
		}
		const descriptor = options.inventory.find(
			(row) =>
				row.asset.assetId === entry.assetId &&
				row.targetId === entry.target &&
				row.scope === entry.scope &&
				row.targetPath === entry.outputPath,
		);
		const invokingOwner =
			descriptor?.asset.ownership.kind === "authority"
				? entry.owner.kind === "authority"
					? entry.owner
					: options.currentProjectOwner
				: options.currentProjectOwner;
		const context = contextFromEntry(options.request, entry);
		if (!ownersMatch(entry.owner, invokingOwner)) {
			rows.push(makeRow(context, "locally-edited", "foreign-owner", "none"));
			continue;
		}
		if (descriptor?.source === "present") {
			rows.push(makeRow(context, "current", "source-still-present", "none"));
			continue;
		}
		rows.push(
			makeRow(context, "source-ahead", "explicit-forget", "forget-entry"),
		);
	}
	return { request: options.request, rows, aborted: false };
}

function contextFromEntry(
	request: SyncRequest,
	entry: HarnessManifestEntry,
): RowContext {
	return {
		request,
		asset: {
			assetId: entry.assetId,
			kind: entry.kind,
			ownership:
				entry.owner.kind === "authority"
					? { kind: "authority", authorityId: entry.owner.authorityId }
					: { kind: "project" },
			sourceRootId: entry.sourceRootId,
			sourceRoot: "",
			sourcePath: entry.sourcePath,
			logicalPath: entry.logicalPath,
			outputIdentity: entry.outputPath,
			defaultScope: entry.scope,
		},
		targetId: entry.target,
		scope: entry.scope,
		targetPath: entry.outputPath,
		owner: entry.owner,
	};
}

function makeRow(
	context: RowContext,
	status: SyncStatus,
	reason: SyncPlanReason,
	action: SyncPlanAction,
): HarnessSyncPlanRow {
	const effectiveAction = context.request.check ? "none" : action;
	return {
		assetId: context.asset.assetId,
		kind: context.asset.kind,
		targetId: context.targetId,
		scope: context.scope,
		targetPath: context.targetPath,
		owner: context.owner,
		status,
		reason,
		action: effectiveAction,
		writesTarget:
			effectiveAction === "create" ||
			effectiveAction === "replace" ||
			effectiveAction === "remove-target-and-entry",
		writesManifest: effectiveAction !== "none",
	};
}

function abortMutation(row: HarnessSyncPlanRow): HarnessSyncPlanRow {
	if (!row.writesTarget && !row.writesManifest) return row;
	return {
		...row,
		action: "none",
		reason: "transaction-aborted-incomplete-inventory",
		writesTarget: false,
		writesManifest: false,
	};
}

function isExactBaselineFor(
	observation: TargetObservation,
	entry: HarnessManifestEntry,
): boolean {
	return (
		observation.state === "exact-baseline" &&
		observation.baselineOwnerId === entry.owner.ownerId &&
		observation.baselineAssetId === entry.assetId
	);
}

function matchesRequest(
	row: HarnessSyncInventoryRow,
	request: SyncRequest,
): boolean {
	return (
		matches(request.targetIds, row.targetId) &&
		matches(request.scopes, row.scope) &&
		matches(request.kinds, row.asset.kind) &&
		matches(request.assetIds, row.asset.assetId)
	);
}

function matchesManifestRequest(
	entry: HarnessManifestEntry,
	request: SyncRequest,
): boolean {
	return (
		matches(request.targetIds, entry.target) &&
		matches(request.scopes, entry.scope) &&
		matches(request.kinds, entry.kind) &&
		matches(request.assetIds, entry.assetId)
	);
}

function matches<T>(values: readonly T[] | undefined, value: T): boolean {
	return values === undefined || values.includes(value);
}

function normalizeRequest(request: SyncRequest): SyncRequest {
	return {
		...request,
		...(request.targetIds ? { targetIds: deduplicate(request.targetIds) } : {}),
		...(request.scopes ? { scopes: deduplicate(request.scopes) } : {}),
		...(request.kinds ? { kinds: deduplicate(request.kinds) } : {}),
		...(request.assetIds ? { assetIds: deduplicate(request.assetIds) } : {}),
		...(request.forgetRemovedAssetIds
			? { forgetRemovedAssetIds: deduplicate(request.forgetRemovedAssetIds) }
			: {}),
		...(request.transferOwner
			? {
					transferOwner: {
						...request.transferOwner,
						assetIds: deduplicate(request.transferOwner.assetIds),
					},
				}
			: {}),
	};
}

function validateRequest(request: SyncRequest): void {
	if (request.forgetRemovedAssetIds) {
		if (
			request.check ||
			request.requestedMode ||
			request.transferOwner ||
			request.assetIds
		) {
			throw new Error(
				"Forget requests cannot combine with check, mode, asset selection, or owner transfer.",
			);
		}
	}
	if (request.transferOwner) {
		if (
			request.check ||
			request.requestedMode ||
			request.forgetRemovedAssetIds ||
			!request.assetIds ||
			request.assetIds.length === 0
		) {
			throw new Error(
				"Owner transfer requires explicit asset IDs and cannot combine with check, mode, or forget.",
			);
		}
		const selected = new Set(request.assetIds);
		if (
			request.transferOwner.assetIds.some((assetId) => !selected.has(assetId))
		) {
			throw new Error(
				"Every owner-transfer asset must be explicitly selected.",
			);
		}
	}
}

function deduplicate<T>(values: readonly T[]): T[] {
	return [...new Set(values)];
}

function entryLocationKey(
	targetId: string,
	scope: string,
	assetId: string,
	targetPath: string,
): string {
	return JSON.stringify([targetId, scope, assetId, targetPath]);
}
