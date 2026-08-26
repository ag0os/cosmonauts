import {
	lstat,
	mkdir,
	readdir,
	readFile,
	realpath,
	writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
	HarnessProvenanceManifest,
	MaterializedHarnessManifestEntry,
} from "./provenance.ts";
import {
	manifestEntryKey,
	ownersMatch,
	readHarnessManifest,
	resolveAssetOwnerIdentity,
	serializeHarnessManifest,
	sha256,
} from "./provenance.ts";
import type {
	GeneratedHarnessNode,
	PreparedHarnessMaterialization,
	RenderedFileNode,
} from "./render.ts";
import {
	digestRenderedFiles,
	GENERATED_BY_MARKER_VERSION,
	prepareHarnessMaterialization,
	writePreparedTarget,
} from "./render.ts";
import type {
	HarnessAsset,
	HarnessManifestEntry,
	HarnessSyncInventoryRow,
	HarnessSyncPlan,
	HarnessSyncPlanRow,
	ObservedHarnessTarget,
	OwnerIdentity,
	ResolvedHarnessAssetTarget,
	SourceHealthRow,
	SyncMode,
	SyncPlanAction,
	SyncPlanReason,
	SyncRequest,
	SyncStatus,
	TargetObservation,
} from "./types.ts";

export interface SyncHarnessAssetOptions {
	readonly projectRoot: string;
	readonly asset: HarnessAsset;
	readonly target: ResolvedHarnessAssetTarget;
	readonly check?: boolean;
	readonly generatedNodes?: readonly GeneratedHarnessNode[];
	readonly now?: () => Date;
}

export interface SyncHarnessAssetResult {
	readonly recordedMode?: SyncMode;
	readonly requestedMode: SyncMode;
	readonly beforeStatus:
		| "missing"
		| "current"
		| "source-ahead"
		| "locally-edited";
	readonly reason:
		| "missing"
		| "current"
		| "mode-conversion"
		| "source-changed"
		| "link-map-changed"
		| "generated-input-changed"
		| "locally-edited"
		| "unmanaged";
	readonly wroteTarget: boolean;
	readonly wroteManifest: boolean;
	readonly manifestEntry: MaterializedHarnessManifestEntry;
}

/**
 * Materialize one already-resolved catalogue asset. All source, generated-node,
 * and containment validation completes before an owner root can be created.
 * Multi-row locking/journaling is layered over this single-row primitive.
 */
export async function syncHarnessAsset(
	options: SyncHarnessAssetOptions,
): Promise<SyncHarnessAssetResult> {
	await validateOwnerTarget(options.target);
	const manifestPath = join(
		options.target.ownerRoot,
		".cosmonauts-harness-manifest.json",
	);
	const manifest = await readHarnessManifest(manifestPath);
	const owner = await resolveAssetOwnerIdentity(
		options.asset,
		options.projectRoot,
	);
	const key = manifestEntryKey(owner, options.asset.assetId);
	const recorded = manifest.entries[key];
	const requestedMode =
		options.target.requestedMode ?? recorded?.mode ?? "copy";
	const prepared = await prepareHarnessMaterialization({
		projectRoot: options.projectRoot,
		asset: options.asset,
		target: options.target,
		mode: requestedMode,
		generatedNodes: options.generatedNodes,
	});

	const foreignClaim = Object.values(manifest.entries).find(
		(entry) =>
			entry.outputPath === options.target.targetPath &&
			!ownersMatch(entry.owner, owner),
	);
	const targetState = recorded
		? await observeRecordedTarget(options.target.targetPath, recorded)
		: await pathState(options.target.targetPath);

	if (!recorded) {
		const entry = makeManifestEntry(options, owner, requestedMode, prepared);
		if (foreignClaim || targetState !== "absent") {
			return noWriteResult(entry, {
				requestedMode,
				beforeStatus: "locally-edited",
				reason: foreignClaim ? "locally-edited" : "unmanaged",
			});
		}
		if (options.check) {
			return noWriteResult(entry, {
				requestedMode,
				beforeStatus: "missing",
				reason: "missing",
			});
		}
		await commitMaterialization(
			options.target,
			prepared,
			manifest,
			key,
			entry,
			manifestPath,
		);
		return {
			requestedMode,
			beforeStatus: "missing",
			reason: "missing",
			wroteTarget: true,
			wroteManifest: true,
			manifestEntry: entry,
		};
	}

	const explicitConversion =
		options.target.requestedMode !== undefined &&
		options.target.requestedMode !== recorded.mode;
	if (targetState !== "intact") {
		if (explicitConversion && !options.check) {
			throw new Error(
				`Asset "${options.asset.assetId}" can convert from recorded mode "${recorded.mode}" to requested mode "${requestedMode}" only from an intact recorded baseline.`,
			);
		}
		return noWriteResult(recorded, {
			recordedMode: recorded.mode,
			requestedMode,
			beforeStatus: targetState === "absent" ? "missing" : "locally-edited",
			reason: targetState === "absent" ? "missing" : "locally-edited",
		});
	}

	const difference = explicitConversion
		? "mode-conversion"
		: desiredDifference(recorded, prepared);
	if (!difference) {
		return noWriteResult(recorded, {
			recordedMode: recorded.mode,
			requestedMode,
			beforeStatus: "current",
			reason: "current",
		});
	}

	const entry = makeManifestEntry(options, owner, requestedMode, prepared);
	if (options.check) {
		return noWriteResult(entry, {
			recordedMode: recorded.mode,
			requestedMode,
			beforeStatus: "source-ahead",
			reason: difference,
		});
	}
	await commitMaterialization(
		options.target,
		prepared,
		manifest,
		key,
		entry,
		manifestPath,
	);
	return {
		recordedMode: recorded.mode,
		requestedMode,
		beforeStatus: "source-ahead",
		reason: difference,
		wroteTarget: true,
		wroteManifest: true,
		manifestEntry: entry,
	};
}

async function validateOwnerTarget(
	target: ResolvedHarnessAssetTarget,
): Promise<void> {
	if (!isAbsolute(target.ownerRoot)) {
		throw new Error(
			`Harness owner root must be absolute: ${target.ownerRoot}.`,
		);
	}
	assertContained(target.ownerRoot, target.targetDirectory, "target directory");
	assertContained(target.ownerRoot, target.targetPath, "target path");
	if (resolve(dirname(target.targetDirectory)) !== resolve(target.ownerRoot)) {
		throw new Error(
			`Harness target directory must be a registered direct child of its owner root: ${target.targetDirectory}.`,
		);
	}
	if (resolve(dirname(target.targetPath)) !== resolve(target.targetDirectory)) {
		throw new Error(
			`Harness target path must be a registered direct child of its target directory: ${target.targetPath}.`,
		);
	}
	for (const path of [target.ownerRoot, target.targetDirectory]) {
		try {
			const stats = await lstat(path);
			if (stats.isSymbolicLink()) {
				throw new Error(
					`Harness ${path === target.ownerRoot ? "owner root" : "target directory"} cannot be a symlink: ${path}.`,
				);
			}
			if (!stats.isDirectory()) {
				throw new Error(`Harness directory path is not a directory: ${path}.`);
			}
		} catch (error) {
			if (isNodeError(error) && error.code === "ENOENT") continue;
			throw error;
		}
	}
}

function makeManifestEntry(
	options: SyncHarnessAssetOptions,
	owner: OwnerIdentity,
	mode: SyncMode,
	prepared: PreparedHarnessMaterialization,
): MaterializedHarnessManifestEntry {
	const base = {
		schemaVersion: 1,
		owner,
		assetId: options.asset.assetId,
		kind: options.asset.kind,
		target: options.target.targetId,
		scope: options.target.scope,
		sourceRootId: options.asset.sourceRootId,
		sourcePath: options.asset.sourcePath,
		logicalPath: options.asset.logicalPath,
		outputPath: options.target.targetPath,
		mode,
		exportedAt: (options.now ?? (() => new Date()))().toISOString(),
	} as const;
	if (mode === "copy") {
		return {
			...base,
			provenance: {
				kind: "copy",
				baselineDigest: prepared.baselineDigest,
				sourceDigest: prepared.sourceDigest,
				renderedDigest: prepared.renderedDigest,
				targetDigest: prepared.renderedDigest,
				markerVersion: GENERATED_BY_MARKER_VERSION,
			},
		};
	}
	if (options.asset.generatedInputs) {
		return {
			...base,
			provenance: {
				kind: "generated-wrapper",
				baselineDigest: prepared.baselineDigest,
				authoredLinks: prepared.authoredLinks,
				generatedNodes: prepared.generatedNodes.map(
					({ relativePath, inputDigest, renderedDigest, targetDigest }) => ({
						relativePath,
						inputDigest,
						renderedDigest,
						targetDigest,
					}),
				),
			},
		};
	}
	if (!prepared.directLinkShape) {
		throw new Error(
			`Link asset "${options.asset.assetId}" has no registered direct-link shape.`,
		);
	}
	return {
		...base,
		provenance: {
			kind: "direct-link",
			expectedCanonicalSource: prepared.canonicalSource,
			linkShape: prepared.directLinkShape,
		},
	};
}

function desiredDifference(
	recorded: MaterializedHarnessManifestEntry,
	prepared: PreparedHarnessMaterialization,
): SyncHarnessAssetResult["reason"] | undefined {
	if (recorded.mode === "copy") {
		return recorded.provenance.kind === "copy" &&
			recorded.provenance.baselineDigest === prepared.baselineDigest &&
			recorded.provenance.sourceDigest === prepared.sourceDigest &&
			recorded.provenance.renderedDigest === prepared.renderedDigest
			? undefined
			: "source-changed";
	}
	if (recorded.provenance.kind === "direct-link") {
		return recorded.provenance.expectedCanonicalSource ===
			prepared.canonicalSource &&
			recorded.provenance.linkShape === prepared.directLinkShape
			? undefined
			: "link-map-changed";
	}
	if (recorded.provenance.kind !== "generated-wrapper") {
		return "link-map-changed";
	}
	if (!sameJson(recorded.provenance.authoredLinks, prepared.authoredLinks)) {
		return "link-map-changed";
	}
	const recordedNodes = recorded.provenance.generatedNodes ?? [];
	const preparedNodes = prepared.generatedNodes.map(
		({ relativePath, inputDigest, renderedDigest, targetDigest }) => ({
			relativePath,
			inputDigest,
			renderedDigest,
			targetDigest,
		}),
	);
	if (
		recordedNodes.length !== preparedNodes.length ||
		recordedNodes.some(
			(node, index) =>
				node.relativePath !== preparedNodes[index]?.relativePath ||
				node.inputDigest !== preparedNodes[index]?.inputDigest,
		)
	) {
		return "generated-input-changed";
	}
	return sameJson(recordedNodes, preparedNodes) ? undefined : "source-changed";
}

async function commitMaterialization(
	target: ResolvedHarnessAssetTarget,
	prepared: PreparedHarnessMaterialization,
	manifest: HarnessProvenanceManifest,
	key: string,
	entry: MaterializedHarnessManifestEntry,
	manifestPath: string,
): Promise<void> {
	await writePreparedTarget({ targetPath: target.targetPath, prepared });
	const installed = await observeRecordedTarget(target.targetPath, entry);
	if (installed !== "intact") {
		throw new Error(
			`Installed target for asset "${entry.assetId}" did not match its prepared provenance.`,
		);
	}
	await mkdir(target.ownerRoot, { recursive: true });
	await writeFile(
		manifestPath,
		serializeHarnessManifest({
			schemaVersion: 1,
			entries: { ...manifest.entries, [key]: entry },
		}),
	);
}

function noWriteResult(
	manifestEntry: MaterializedHarnessManifestEntry,
	fields: Pick<
		SyncHarnessAssetResult,
		"beforeStatus" | "reason" | "requestedMode"
	> &
		Partial<Pick<SyncHarnessAssetResult, "recordedMode">>,
): SyncHarnessAssetResult {
	return {
		...fields,
		wroteTarget: false,
		wroteManifest: false,
		manifestEntry,
	};
}

async function observeRecordedTarget(
	targetPath: string,
	entry: MaterializedHarnessManifestEntry,
): Promise<"absent" | "intact" | "edited"> {
	const state = await pathState(targetPath);
	if (state === "absent") return "absent";
	try {
		if (entry.provenance.kind === "copy") {
			const nodes = await readCopiedTarget(targetPath);
			return digestRenderedFiles(nodes) === entry.provenance.baselineDigest
				? "intact"
				: "edited";
		}
		if (entry.provenance.kind === "direct-link") {
			return (await directLinkMatches(targetPath, entry.provenance))
				? "intact"
				: "edited";
		}
		return (await generatedWrapperMatches(targetPath, entry.provenance))
			? "intact"
			: "edited";
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return "edited";
		return "edited";
	}
}

async function readCopiedTarget(
	targetPath: string,
): Promise<readonly RenderedFileNode[]> {
	const rootStats = await lstat(targetPath);
	if (rootStats.isSymbolicLink()) return [];
	if (rootStats.isFile()) {
		return [{ relativePath: "", bytes: await readFile(targetPath) }];
	}
	if (!rootStats.isDirectory()) return [];
	const nodes: RenderedFileNode[] = [];
	async function walk(directory: string, prefix: string): Promise<void> {
		const entries = await readdir(directory, { withFileTypes: true });
		entries.sort((left, right) => left.name.localeCompare(right.name));
		for (const child of entries) {
			const childPath = join(directory, child.name);
			const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
			const stats = await lstat(childPath);
			if (stats.isSymbolicLink()) {
				nodes.push({
					relativePath: `${relativePath}\0link`,
					bytes: Buffer.alloc(0),
				});
				continue;
			}
			if (stats.isDirectory()) {
				await walk(childPath, relativePath);
				continue;
			}
			if (!stats.isFile()) {
				nodes.push({
					relativePath: `${relativePath}\0special`,
					bytes: Buffer.alloc(0),
				});
				continue;
			}
			nodes.push({ relativePath, bytes: await readFile(childPath) });
		}
	}
	await walk(targetPath, "");
	return nodes;
}

async function directLinkMatches(
	targetPath: string,
	provenance: Extract<
		MaterializedHarnessManifestEntry["provenance"],
		{ readonly kind: "direct-link" }
	>,
): Promise<boolean> {
	if (provenance.linkShape === "directory") {
		const stats = await lstat(targetPath);
		return (
			stats.isSymbolicLink() &&
			(await realpath(targetPath)) === provenance.expectedCanonicalSource
		);
	}
	if (provenance.linkShape !== "flat-skill") return false;
	const stats = await lstat(targetPath);
	if (!stats.isDirectory() || stats.isSymbolicLink()) return false;
	const children = await readdir(targetPath);
	if (children.length !== 1 || children[0] !== "SKILL.md") return false;
	const link = join(targetPath, "SKILL.md");
	return (
		(await lstat(link)).isSymbolicLink() &&
		(await realpath(link)) === provenance.expectedCanonicalSource
	);
}

async function generatedWrapperMatches(
	targetPath: string,
	provenance: Extract<
		MaterializedHarnessManifestEntry["provenance"],
		{ readonly kind: "generated-wrapper" }
	>,
): Promise<boolean> {
	const authored = provenance.authoredLinks;
	const generated = provenance.generatedNodes;
	if (!authored || !generated) return false;
	const expectedPaths = new Set([
		...authored.map((node) => node.relativePath),
		...generated.map((node) => node.relativePath),
	]);
	const actualPaths = await listLeafPaths(targetPath);
	if (!sameJson([...expectedPaths].sort(), actualPaths)) return false;
	for (const link of authored) {
		const path = join(targetPath, ...link.relativePath.split("/"));
		if (!(await lstat(path)).isSymbolicLink()) return false;
		if ((await realpath(path)) !== link.expectedCanonicalSource) return false;
	}
	for (const node of generated) {
		const path = join(targetPath, ...node.relativePath.split("/"));
		const stats = await lstat(path);
		if (!stats.isFile() || stats.isSymbolicLink()) return false;
		if (sha256(await readFile(path)) !== node.targetDigest) return false;
	}
	return true;
}

async function listLeafPaths(root: string): Promise<readonly string[]> {
	const paths: string[] = [];
	async function walk(directory: string, prefix: string): Promise<void> {
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries) {
			const path = join(directory, entry.name);
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
			const stats = await lstat(path);
			if (stats.isDirectory() && !stats.isSymbolicLink()) {
				await walk(path, relativePath);
			} else {
				paths.push(relativePath);
			}
		}
	}
	await walk(root, "");
	return paths.sort();
}

async function pathState(path: string): Promise<"absent" | "present"> {
	try {
		await lstat(path);
		return "present";
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return "absent";
		throw error;
	}
}

function assertContained(root: string, candidate: string, label: string): void {
	const relativePath = relative(resolve(root), resolve(candidate));
	if (
		relativePath === "" ||
		(!relativePath.startsWith(`..${sep}`) &&
			relativePath !== ".." &&
			!isAbsolute(relativePath))
	) {
		return;
	}
	throw new Error(`${label} escapes harness owner root: ${candidate}.`);
}

function sameJson(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

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
