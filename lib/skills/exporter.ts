/** Shared compatibility facade for harness skill export and harness sync. */

import { lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { MaterializedHarnessManifestEntry } from "../harness-adapters/provenance.ts";
import {
	manifestEntryKey,
	ownersMatch,
	readHarnessManifest,
	resolveAssetOwnerIdentity,
	serializeHarnessManifest,
	sha256,
} from "../harness-adapters/provenance.ts";
import {
	getHarnessTarget,
	listImplementedHarnessTargetIds,
	resolveHarnessAssetTarget,
	resolveHarnessTargetDirectory,
} from "../harness-adapters/registry.ts";
import {
	type GeneratedHarnessNode,
	prepareHarnessMaterialization,
	writePreparedTarget,
} from "../harness-adapters/render.ts";
import type {
	ApplySyncPlanResult,
	ClassifiedHarnessSyncPlanRow,
	HarnessManifestSnapshot,
	HarnessNodeSnapshot,
	OwnerRootRecoveryResult,
	OwnerRootTransactionResult,
} from "../harness-adapters/sync.ts";
import {
	applySyncPlanInTransaction,
	observeHarnessManifestTarget,
	observeHarnessNodeSnapshot,
	planHarnessSync,
	syncHarnessAsset,
	withOwnerRootTransaction,
} from "../harness-adapters/sync.ts";
import type {
	HarnessAsset,
	HarnessScope,
	HarnessSyncInventoryRow,
	ImplementedHarnessTargetId,
	ObservedHarnessTarget,
	OwnerIdentity,
	ResolvedHarnessAssetTarget,
	SourceHealthRow,
	SyncMode,
	SyncRequest,
	SyncStatus,
} from "../harness-adapters/types.ts";

/** Supported export targets. */
export type ExportTarget = ImplementedHarnessTargetId;

/** Scope of the export: project-local or user-level (personal). */
export type ExportScope = HarnessScope;

export interface ExportResult {
	readonly name: string;
	readonly targetPath: string;
}

export interface ExportOptions {
	readonly target: ExportTarget;
	readonly projectRoot: string;
	readonly personal?: boolean;
	/** Injectable home root for tests and embedding. */
	readonly homeRoot?: string;
}

export interface HarnessSyncOptions {
	readonly projectRoot: string;
	readonly homeRoot: string;
	readonly assets: readonly HarnessAsset[];
	readonly sourceHealth: readonly SourceHealthRow[];
	readonly request: SyncRequest;
	readonly generatedNodesByAssetId?: Readonly<
		Record<string, readonly GeneratedHarnessNode[]>
	>;
}

export interface HarnessSyncReportRow {
	readonly owner: OwnerIdentity;
	readonly ownerDiagnostics: readonly string[];
	readonly target: ImplementedHarnessTargetId;
	readonly scope: HarnessScope;
	readonly kind: HarnessAsset["kind"];
	readonly asset: string;
	readonly source: string;
	readonly targetPath: string;
	readonly recordedMode?: SyncMode;
	readonly requestedMode: SyncMode;
	readonly before: SyncStatus;
	readonly reason: string;
	readonly action: string;
	readonly final: SyncStatus;
	readonly recovery?:
		| OwnerRootRecoveryResult
		| { readonly state: string; readonly detail: string };
	readonly evidence?: string;
	readonly discovery: readonly string[];
	readonly releaseWarning?: string;
	readonly generatingProjectRoot?: string;
	readonly previousGeneratingProjectRoot?: string;
}

export interface HarnessSyncReport {
	readonly rows: readonly HarnessSyncReportRow[];
	readonly exitCode: 0 | 1;
}

interface ResolvedCatalogueRow {
	readonly asset: HarnessAsset;
	readonly target: ResolvedHarnessAssetTarget;
}

interface OwnerGroup {
	readonly ownerRoot: string;
	readonly targetId: ImplementedHarnessTargetId;
	readonly rows: readonly ResolvedCatalogueRow[];
}

interface EvaluatedGroup {
	readonly planRows: readonly ClassifiedHarnessSyncPlanRow[];
	readonly desired: ReadonlyMap<string, MaterializedHarnessManifestEntry>;
	readonly manifestEntries: readonly MaterializedHarnessManifestEntry[];
	readonly oldManifest: HarnessManifestSnapshot;
}

type GroupTransactionActionResult =
	| { readonly state: "noop"; readonly current: EvaluatedGroup }
	| {
			readonly state: "applied";
			readonly current: EvaluatedGroup;
			readonly applied: ApplySyncPlanResult;
	  };

export function resolveTargetDir(name: string, options: ExportOptions): string {
	const scope: HarnessScope = options.personal ? "personal" : "project";
	const target = resolveHarnessTargetDirectory({
		targetId: options.target,
		scope,
		kind: "skill",
		roots: {
			projectRoot: options.projectRoot,
			homeRoot: options.homeRoot ?? homedir(),
		},
	});
	return join(target.targetDirectory, name);
}

/**
 * Compatibility export for one skill. It is deliberately a partial request
 * over the same provenance-aware renderer, classifier, and transaction path
 * as `harness sync`.
 */
export async function exportSkill(
	sourcePath: string,
	name: string,
	options: ExportOptions,
): Promise<ExportResult> {
	const sourceRoot = dirname(resolve(sourcePath));
	const asset: HarnessAsset = {
		assetId: `skill:${name}`,
		kind: "skill",
		ownership: { kind: "project" },
		sourceRootId: `compat:${sourceRoot}`,
		sourceRoot,
		sourcePath: basename(sourcePath),
		logicalPath: name,
		outputIdentity: name,
		defaultScope: options.personal ? "personal" : "project",
	};
	const report = await runHarnessSync({
		projectRoot: options.projectRoot,
		homeRoot: options.homeRoot ?? homedir(),
		assets: [asset],
		sourceHealth: [
			{
				sourceRootId: asset.sourceRootId,
				sourceRoot,
				domain: "compatibility",
				status: "complete",
				issues: [],
			},
		],
		request: {
			targetIds: [options.target],
			scopes: [asset.defaultScope],
			kinds: ["skill"],
			assetIds: [asset.assetId],
			reconciliation: "partial",
			check: false,
		},
	});
	const row = report.rows[0];
	if (!row || report.exitCode !== 0) {
		throw new Error(
			row ? `${row.asset}: ${row.reason}` : "Skill export produced no row.",
		);
	}
	return { name, targetPath: resolveTargetDir(name, options) };
}

/** Execute a normalized sync request over already-discovered plain assets. */
export async function runHarnessSync(
	options: HarnessSyncOptions,
): Promise<HarnessSyncReport> {
	const normalizedOptions: HarnessSyncOptions = {
		...options,
		projectRoot: await canonicalExistingRoot(options.projectRoot),
		homeRoot: await canonicalExistingRoot(options.homeRoot),
	};
	const catalogue = resolveCatalogue(normalizedOptions);
	const groups = await groupCatalogue(normalizedOptions, catalogue);
	const reports: HarnessSyncReportRow[] = [];

	for (const group of groups) {
		let evaluated: EvaluatedGroup;
		try {
			evaluated = await evaluateGroup(normalizedOptions, group);
		} catch (error) {
			reports.push(
				await syntheticFailureRow(
					normalizedOptions,
					group,
					error,
					"observation",
				),
			);
			continue;
		}
		const baseRows = evaluated.planRows.map((row) =>
			reportRow(normalizedOptions, row),
		);
		if (normalizedOptions.request.check) {
			reports.push(...baseRows);
			continue;
		}

		let transactionResult: OwnerRootTransactionResult<GroupTransactionActionResult>;
		try {
			transactionResult = await withOwnerRootTransaction(
				{ ownerRoot: group.ownerRoot, targetId: group.targetId },
				async (transaction) => {
					const current = await evaluateGroup(normalizedOptions, group);
					if (current.planRows.every((row) => row.action === "none")) {
						return { state: "noop" as const, current };
					}
					const applied = await applyEvaluatedGroup(
						transaction,
						normalizedOptions,
						group,
						current,
					);
					return { state: "applied" as const, current, applied };
				},
			);
		} catch (error) {
			if (baseRows.length === 0) {
				reports.push(
					await syntheticFailureRow(normalizedOptions, group, error, "write"),
				);
			} else {
				reports.push(
					...baseRows.map((row) => ({
						...row,
						reason: `write-failure:${errorMessage(error)}`,
						action: "failed",
						final: "source-ahead" as const,
						evidence: errorMessage(error),
					})),
				);
			}
			continue;
		}

		if (transactionResult.state === "completed") {
			const actionResult = transactionResult.result;
			const currentRows = actionResult.current.planRows;
			for (const row of currentRows) {
				reports.push({
					...reportRow(normalizedOptions, row),
					final:
						actionResult.state === "applied" &&
						row.action !== "none" &&
						actionResult.applied.state === "committed"
							? "current"
							: row.beforeStatus,
					recovery: transactionResult.recovery,
					...(actionResult.state === "applied" &&
					actionResult.applied.state !== "committed"
						? { evidence: actionResult.applied.state }
						: {}),
				});
			}
			continue;
		}

		const recovery =
			transactionResult.state === "recovery-required"
				? transactionResult.recovery
				: transactionResult.state === "lock-contended"
					? {
							state: "lock-contended",
							detail: `${transactionResult.lockPath}${transactionResult.ownerPid ? ` pid=${transactionResult.ownerPid}` : ""}`,
						}
					: {
							state: "persisted-release-unconfirmed",
							detail: errorMessage(transactionResult.error),
						};
		for (const row of baseRows) {
			reports.push({
				...row,
				recovery,
				...(transactionResult.state === "persisted-release-unconfirmed"
					? { releaseWarning: errorMessage(transactionResult.error) }
					: {}),
			});
		}
		if (baseRows.length === 0) {
			reports.push(
				await syntheticRecoveryRow(normalizedOptions, group, recovery),
			);
		}
		if (transactionResult.state === "persisted-release-unconfirmed") break;
	}

	const exitCode = reports.some((row) =>
		normalizedOptions.request.check
			? row.final !== "current"
			: row.final !== "current" || row.releaseWarning !== undefined,
	)
		? 1
		: 0;
	return { rows: reports, exitCode };
}

function resolveCatalogue(options: HarnessSyncOptions): ResolvedCatalogueRow[] {
	const request = options.request;
	const targetIds = deduplicate(
		request.targetIds ?? listImplementedHarnessTargetIds(),
	);
	const assets = options.assets.filter(
		(asset) =>
			(!request.kinds || request.kinds.includes(asset.kind)) &&
			(!request.assetIds || request.assetIds.includes(asset.assetId)),
	);
	const rows: ResolvedCatalogueRow[] = [];
	for (const asset of assets) {
		const scopes = deduplicate(request.scopes ?? [asset.defaultScope]);
		for (const targetId of targetIds) {
			const descriptor = getHarnessTarget(targetId);
			if (!descriptor)
				throw new Error(`Harness target "${targetId}" is not registered.`);
			if (descriptor.status !== "implemented") {
				throw new Error(
					`Harness target "${targetId}" is declared but unimplemented.`,
				);
			}
			const supportsKind = descriptor.adapters.some(
				(adapter) => adapter.kind === asset.kind,
			);
			if (!supportsKind) {
				if (request.targetIds) {
					throw new Error(
						`Harness target "${targetId}" does not support asset kind "${asset.kind}".`,
					);
				}
				continue;
			}
			for (const scope of scopes) {
				rows.push({
					asset,
					target: resolveHarnessAssetTarget({
						targetId,
						asset,
						scope,
						requestedMode: request.requestedMode,
						roots: {
							projectRoot: options.projectRoot,
							homeRoot: options.homeRoot,
						},
					}),
				});
			}
		}
	}
	return rows;
}

async function groupCatalogue(
	options: HarnessSyncOptions,
	rows: readonly ResolvedCatalogueRow[],
): Promise<OwnerGroup[]> {
	const byKey = new Map<string, ResolvedCatalogueRow[]>();
	for (const row of rows) {
		const key = JSON.stringify([
			resolve(row.target.ownerRoot),
			row.target.targetId,
		]);
		const current = byKey.get(key) ?? [];
		current.push(row);
		byKey.set(key, current);
	}
	if (
		options.request.reconciliation === "complete" &&
		(!options.request.kinds || options.request.kinds.includes("skill"))
	) {
		const targets =
			options.request.targetIds ?? listImplementedHarnessTargetIds("skill");
		const scopes = options.request.scopes ?? (["project"] as const);
		for (const targetId of targets) {
			const descriptor = getHarnessTarget(targetId);
			if (
				!descriptor ||
				descriptor.status !== "implemented" ||
				!descriptor.adapters.some((adapter) => adapter.kind === "skill")
			) {
				continue;
			}
			for (const scope of scopes) {
				const ownerRoot = join(
					scope === "project" ? options.projectRoot : options.homeRoot,
					descriptor.ownerDirectory,
				);
				const key = JSON.stringify([resolve(ownerRoot), targetId]);
				if (!byKey.has(key)) byKey.set(key, []);
			}
		}
	}
	if (options.request.forgetRemovedAssetIds) {
		const targets =
			options.request.targetIds ?? listImplementedHarnessTargetIds();
		const scopes = options.request.scopes ?? (["project", "personal"] as const);
		for (const targetId of targets) {
			for (const scope of scopes) {
				const descriptor = getHarnessTarget(targetId);
				if (!descriptor || descriptor.status !== "implemented") continue;
				const ownerRoot = join(
					scope === "project" ? options.projectRoot : options.homeRoot,
					descriptor.ownerDirectory,
				);
				const key = JSON.stringify([resolve(ownerRoot), targetId]);
				if (!byKey.has(key)) byKey.set(key, []);
			}
		}
	}
	return [...byKey.entries()].map(([key, groupedRows]) => {
		const [ownerRoot, targetId] = JSON.parse(key) as [
			string,
			ImplementedHarnessTargetId,
		];
		return { ownerRoot, targetId, rows: groupedRows };
	});
}

async function evaluateGroup(
	options: HarnessSyncOptions,
	group: OwnerGroup,
): Promise<EvaluatedGroup> {
	const manifestPath = join(
		group.ownerRoot,
		".cosmonauts-harness-manifest.json",
	);
	const [manifest, oldManifest] = await Promise.all([
		readHarnessManifest(manifestPath),
		observeManifestFile(manifestPath),
	]);
	const manifestEntries = Object.values(manifest.entries);
	const observations = await Promise.all(
		manifestEntries.map(observeHarnessManifestTarget),
	);
	const observationByPath = new Map(
		observations.map((observation) => [observation.targetPath, observation]),
	);
	const inventory = await Promise.all(
		group.rows.map(
			async ({ asset, target }): Promise<HarnessSyncInventoryRow> => {
				const owner = await resolveAssetOwnerIdentity(
					asset,
					options.projectRoot,
				);
				const claim =
					manifestEntries.find(
						(entry) =>
							entry.assetId === asset.assetId &&
							entry.target === target.targetId &&
							entry.scope === target.scope &&
							entry.outputPath === target.targetPath &&
							ownersMatch(entry.owner, owner),
					) ??
					manifestEntries.find(
						(entry) => entry.outputPath === target.targetPath,
					);
				const targetObservation = claim
					? (observationByPath.get(claim.outputPath) ?? {
							state: "edited" as const,
						})
					: await observeUnmanagedTarget(target.targetPath);
				return {
					asset,
					targetId: target.targetId,
					scope: target.scope,
					targetPath: target.targetPath,
					source: "present",
					targetObservation,
				};
			},
		),
	);
	const plan = await planHarnessSync({
		projectRoot: options.projectRoot,
		request: options.request,
		inventory,
		manifestEntries,
		targetObservations: observations,
		sourceHealth: options.sourceHealth,
	});
	const desired = new Map<string, MaterializedHarnessManifestEntry>();
	const enhancedRows = await Promise.all(
		plan.rows.map(async (row): Promise<ClassifiedHarnessSyncPlanRow> => {
			if (
				plan.aborted ||
				row.reason === "inventory-incomplete" ||
				row.reason === "transaction-aborted-incomplete-inventory" ||
				row.reason === "foreign-owner" ||
				row.reason === "source-removed" ||
				row.reason === "source-unavailable" ||
				row.reason === "explicit-forget" ||
				row.reason === "owner-transfer"
			) {
				return row;
			}
			const catalogue = group.rows.find(
				(candidate) => candidate.target.targetPath === row.targetPath,
			);
			if (!catalogue) return row;
			const checked = await syncHarnessAsset({
				projectRoot: options.projectRoot,
				asset: catalogue.asset,
				target: catalogue.target,
				check: true,
				generatedNodes: generatedNodesFor(options, catalogue.asset),
			});
			desired.set(row.targetPath, checked.manifestEntry);
			if (row.status === "locally-edited") return row;
			const action = options.request.check
				? "none"
				: checked.beforeStatus === "missing"
					? "create"
					: checked.beforeStatus === "source-ahead"
						? "replace"
						: "none";
			return {
				...row,
				status: checked.beforeStatus,
				beforeStatus: checked.beforeStatus,
				reason: checked.reason,
				action,
				recordedMode: checked.recordedMode,
				requestedMode: checked.requestedMode,
				...(checked.generatingProjectRoot
					? { generatingProjectRoot: checked.generatingProjectRoot }
					: {}),
				...(checked.previousGeneratingProjectRoot
					? {
							previousGeneratingProjectRoot:
								checked.previousGeneratingProjectRoot,
						}
					: {}),
				writesTarget: action === "create" || action === "replace",
				writesManifest: action !== "none",
			};
		}),
	);
	return { planRows: enhancedRows, desired, manifestEntries, oldManifest };
}

async function applyEvaluatedGroup(
	transaction: Parameters<typeof applySyncPlanInTransaction>[0],
	options: HarnessSyncOptions,
	group: OwnerGroup,
	evaluated: EvaluatedGroup,
): Promise<ApplySyncPlanResult> {
	const entries: Record<string, MaterializedHarnessManifestEntry> =
		Object.fromEntries(
			evaluated.manifestEntries.map((entry) => [
				manifestEntryKey(entry.owner, entry.assetId),
				entry,
			]),
		);
	const members = [] as Array<{
		targetPath: string;
		oldState: Awaited<ReturnType<typeof observeHarnessNodeSnapshot>>;
		newState: Awaited<ReturnType<typeof observeHarnessNodeSnapshot>>;
		writeStage: (stagePath: string) => Promise<void>;
	}>;

	for (const row of evaluated.planRows) {
		if (row.action === "none") continue;
		if (
			row.action === "forget-entry" ||
			row.action === "remove-target-and-entry"
		) {
			const key = findManifestKey(entries, row);
			if (key) delete entries[key];
			if (row.action === "remove-target-and-entry") {
				members.push({
					targetPath: row.targetPath,
					oldState: await observeHarnessNodeSnapshot(row.targetPath),
					newState: { kind: "absent" },
					writeStage: async () => {},
				});
			}
			continue;
		}
		if (row.action === "transfer-entry") {
			if (!row.previousManifestKey || !row.nextManifestKey) continue;
			const previous = entries[row.previousManifestKey];
			if (!previous) continue;
			delete entries[row.previousManifestKey];
			entries[row.nextManifestKey] = { ...previous, owner: row.owner };
			continue;
		}
		const catalogue = group.rows.find(
			(candidate) => candidate.target.targetPath === row.targetPath,
		);
		const desired = evaluated.desired.get(row.targetPath);
		if (!catalogue || !desired) {
			throw new Error(`Missing prepared catalogue row for ${row.assetId}.`);
		}
		const prepared = await prepareHarnessMaterialization({
			projectRoot: options.projectRoot,
			asset: catalogue.asset,
			target: catalogue.target,
			mode: desired.mode,
			generatedNodes: generatedNodesFor(options, catalogue.asset),
		});
		const scratch = await mkdtemp(join(tmpdir(), "cosmonauts-harness-render-"));
		const scratchTarget = join(scratch, "target");
		let newState: HarnessNodeSnapshot;
		try {
			await writePreparedTarget({ targetPath: scratchTarget, prepared });
			newState = await observeHarnessNodeSnapshot(scratchTarget);
		} finally {
			await rm(scratch, { recursive: true, force: true });
		}
		entries[manifestEntryKey(desired.owner, desired.assetId)] = desired;
		members.push({
			targetPath: row.targetPath,
			oldState: await observeHarnessNodeSnapshot(row.targetPath),
			newState,
			writeStage: (stagePath) =>
				writePreparedTarget({ targetPath: stagePath, prepared }),
		});
	}

	return applySyncPlanInTransaction(transaction, {
		oldManifest: evaluated.oldManifest,
		newManifestContents: serializeHarnessManifest({
			schemaVersion: 1,
			entries,
		}),
		members,
	});
}

function generatedNodesFor(
	options: HarnessSyncOptions,
	asset: HarnessAsset,
): readonly GeneratedHarnessNode[] | undefined {
	return options.generatedNodesByAssetId?.[asset.assetId];
}

function reportRow(
	options: HarnessSyncOptions,
	row: ClassifiedHarnessSyncPlanRow,
): HarnessSyncReportRow {
	const health = options.sourceHealth.find((candidate) =>
		row.sourcePath.startsWith(resolve(candidate.sourceRoot)),
	);
	return {
		owner: row.owner,
		ownerDiagnostics: [
			...(row.owner.kind === "project"
				? [`projectRoot=${row.owner.projectRoot}`]
				: [`authority=${row.owner.authorityId}`]),
			...(row.generatingProjectRoot
				? [`generatingProjectRoot=${row.generatingProjectRoot}`]
				: []),
			...(row.previousGeneratingProjectRoot
				? [`previousGeneratingProjectRoot=${row.previousGeneratingProjectRoot}`]
				: []),
		],
		target: row.targetId,
		scope: row.scope,
		kind: row.kind,
		asset: row.assetId,
		source: row.sourcePath,
		targetPath: row.targetPath,
		...(row.recordedMode ? { recordedMode: row.recordedMode } : {}),
		requestedMode: row.requestedMode,
		before: row.beforeStatus,
		reason: row.reason,
		action: row.action,
		final: row.beforeStatus,
		discovery: health
			? health.issues.map(
					(issue) => `${issue.kind}:${issue.path}:${issue.message}`,
				)
			: [],
		...(row.generatingProjectRoot
			? { generatingProjectRoot: row.generatingProjectRoot }
			: {}),
		...(row.previousGeneratingProjectRoot
			? {
					previousGeneratingProjectRoot: row.previousGeneratingProjectRoot,
				}
			: {}),
	};
}

async function syntheticRecoveryRow(
	options: HarnessSyncOptions,
	group: OwnerGroup,
	recovery: HarnessSyncReportRow["recovery"],
): Promise<HarnessSyncReportRow> {
	const owner = await resolveAssetOwnerIdentity(
		{
			ownership: { kind: "project" },
		} as Pick<HarnessAsset, "ownership">,
		options.projectRoot,
	);
	return {
		owner,
		ownerDiagnostics: [`projectRoot=${options.projectRoot}`],
		target: group.targetId,
		scope: "project",
		kind: "skill",
		asset: "(owner-root)",
		source: "",
		targetPath: group.ownerRoot,
		requestedMode: options.request.requestedMode ?? "copy",
		before: "source-ahead",
		reason: recovery?.state ?? "recovery-required",
		action: "none",
		final: "source-ahead",
		recovery,
		discovery: [],
	};
}

async function syntheticFailureRow(
	options: HarnessSyncOptions,
	group: OwnerGroup,
	error: unknown,
	phase: "observation" | "write",
): Promise<HarnessSyncReportRow> {
	const row = await syntheticRecoveryRow(options, group, {
		state: `${phase}-failure`,
		detail: errorMessage(error),
	});
	return {
		...row,
		reason: `${phase}-failure:${errorMessage(error)}`,
		action: "failed",
		evidence: errorMessage(error),
	};
}

async function observeUnmanagedTarget(
	path: string,
): Promise<ObservedHarnessTarget> {
	try {
		await lstat(path);
		return { targetPath: path, state: "edited" };
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return { targetPath: path, state: "absent" };
		}
		throw error;
	}
}

async function observeManifestFile(
	path: string,
): Promise<HarnessManifestSnapshot> {
	try {
		const contents = await readFile(path, "utf8");
		return { kind: "file", digest: sha256(contents), contents };
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT")
			return { kind: "absent" };
		throw error;
	}
}

function findManifestKey(
	entries: Readonly<Record<string, MaterializedHarnessManifestEntry>>,
	row: ClassifiedHarnessSyncPlanRow,
): string | undefined {
	return Object.entries(entries).find(
		([, entry]) =>
			entry.assetId === row.assetId &&
			entry.target === row.targetId &&
			entry.scope === row.scope &&
			entry.outputPath === row.targetPath &&
			ownersMatch(entry.owner, row.owner),
	)?.[0];
}

function deduplicate<T>(values: readonly T[]): T[] {
	return [...new Set(values)];
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function canonicalExistingRoot(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return resolve(path);
		throw error;
	}
}
