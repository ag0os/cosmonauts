import { randomUUID } from "node:crypto";
import {
	lstat,
	mkdir,
	open,
	readdir,
	readFile,
	readlink,
	realpath,
	rename,
	rm,
	unlink,
	writeFile,
} from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import type { EntityFileLockOptions } from "../entity-file-lock.ts";
import {
	EntityFileLockTimeoutError,
	withEntityFileLock,
} from "../entity-file-lock.ts";
import type {
	HarnessProvenanceManifest,
	MaterializedHarnessManifestEntry,
} from "./provenance.ts";
import {
	manifestEntryKey,
	observeStableHarnessState,
	ownersMatch,
	readHarnessManifest,
	resolveAssetOwnerIdentity,
	resolveHarnessTransactionPaths,
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
		| "regenerated-from-other-project"
		| "locally-edited"
		| "foreign-owner"
		| "foreign-or-untraceable"
		| "pending-journal"
		| "concurrent-change";
	readonly wroteTarget: boolean;
	readonly wroteManifest: boolean;
	readonly exitCode: 0 | 1;
	readonly manifestEntry: MaterializedHarnessManifestEntry;
	readonly generatingProjectRoot?: string;
	readonly previousGeneratingProjectRoot?: string;
}

/**
 * Materialize one already-resolved catalogue asset. All source, generated-node,
 * and containment validation completes before an owner root can be created.
 * Multi-row locking/journaling is layered over this single-row primitive.
 */
export async function syncHarnessAsset(
	options: SyncHarnessAssetOptions,
): Promise<SyncHarnessAssetResult> {
	const result = await syncHarnessAssetCore(options);
	const reconciled = result.wroteTarget || result.wroteManifest;
	return {
		...result,
		...(result.manifestEntry.generatingProjectRoot
			? { generatingProjectRoot: result.manifestEntry.generatingProjectRoot }
			: {}),
		exitCode:
			result.beforeStatus === "current" || (!options.check && reconciled)
				? 0
				: 1,
	};
}

async function syncHarnessAssetCore(
	options: SyncHarnessAssetOptions,
): Promise<Omit<SyncHarnessAssetResult, "exitCode">> {
	await validateOwnerTarget(options.target);
	const manifestPath = join(
		options.target.ownerRoot,
		".cosmonauts-harness-manifest.json",
	);
	const owner = await resolveAssetOwnerIdentity(
		options.asset,
		options.projectRoot,
	);
	const generatingProjectRoot = options.asset.generatedInputs
		? await realpath(options.projectRoot)
		: undefined;
	let consistencyReason: "pending-journal" | "concurrent-change" | undefined;
	let observedTargetState:
		| "absent"
		| "present"
		| "intact"
		| "edited"
		| undefined;
	let manifest: HarnessProvenanceManifest;
	if (options.check) {
		const transactionPaths = resolveHarnessTransactionPaths(
			options.target.ownerRoot,
			options.target.targetId,
		);
		const observation = await observeStableHarnessState({
			manifestPath,
			journalPath: transactionPaths.journalPath,
			observeTarget: async (observedManifest) => {
				const observedKey = manifestEntryKey(owner, options.asset.assetId);
				const observedRecorded = observedManifest.entries[observedKey];
				return observedRecorded
					? observeRecordedTarget(options.target.targetPath, observedRecorded)
					: pathState(options.target.targetPath);
			},
		});
		manifest = observation.manifest;
		observedTargetState = observation.target;
		consistencyReason = observation.reason;
	} else {
		manifest = await readHarnessManifest(manifestPath);
	}
	const key = manifestEntryKey(owner, options.asset.assetId);
	const recorded = manifest.entries[key];
	const requestedMode = resolveHarnessSyncMode(
		options.target.requestedMode,
		recorded?.mode,
	);
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
	const targetState =
		observedTargetState ??
		(recorded
			? await observeRecordedTarget(options.target.targetPath, recorded)
			: await pathState(options.target.targetPath));

	if (consistencyReason) {
		const entry =
			recorded ??
			makeManifestEntry(
				options,
				owner,
				requestedMode,
				prepared,
				generatingProjectRoot,
			);
		return noWriteResult(entry, {
			...(recorded ? { recordedMode: recorded.mode } : {}),
			requestedMode,
			beforeStatus: "source-ahead",
			reason: consistencyReason,
		});
	}

	if (!recorded) {
		const entry = makeManifestEntry(
			options,
			owner,
			requestedMode,
			prepared,
			generatingProjectRoot,
		);
		if (foreignClaim || targetState !== "absent") {
			return noWriteResult(entry, {
				requestedMode,
				beforeStatus: "locally-edited",
				reason: foreignClaim ? "foreign-owner" : "foreign-or-untraceable",
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

	const previousGeneratingProjectRoot = recorded.generatingProjectRoot;
	const generatedByOtherProject =
		generatingProjectRoot !== undefined &&
		previousGeneratingProjectRoot !== undefined &&
		generatingProjectRoot !== previousGeneratingProjectRoot;
	const difference = generatedByOtherProject
		? "regenerated-from-other-project"
		: explicitConversion
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

	const entry = makeManifestEntry(
		options,
		owner,
		requestedMode,
		prepared,
		generatingProjectRoot,
	);
	if (options.check) {
		return noWriteResult(entry, {
			recordedMode: recorded.mode,
			requestedMode,
			beforeStatus: "source-ahead",
			reason: difference,
			...(generatedByOtherProject ? { previousGeneratingProjectRoot } : {}),
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
		...(generatedByOtherProject ? { previousGeneratingProjectRoot } : {}),
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
	generatingProjectRoot?: string,
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
		...(generatingProjectRoot ? { generatingProjectRoot } : {}),
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
		Omit<SyncHarnessAssetResult, "exitCode">,
		"beforeStatus" | "reason" | "requestedMode"
	> &
		Partial<
			Pick<
				SyncHarnessAssetResult,
				"recordedMode" | "previousGeneratingProjectRoot"
			>
		>,
): Omit<SyncHarnessAssetResult, "exitCode"> {
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

const DEFAULT_HARNESS_LOCK_WAIT_TIMEOUT_MS = 2_000;
const activeOwnerRootTransactions = new WeakSet<object>();
declare const ownerRootTransactionBrand: unique symbol;

export type HarnessNodeSnapshot =
	| { readonly kind: "absent" }
	| {
			readonly kind: "file" | "directory" | "symlink";
			readonly digest: string;
	  };

export type HarnessManifestSnapshot =
	| { readonly kind: "absent" }
	| {
			readonly kind: "file";
			readonly digest: string;
			readonly contents: string;
	  };

export type OwnerRootTransactionPhase =
	| "prepared"
	| "installing"
	| "commit-ready"
	| "committed"
	| "rolling-back";

export type OwnerRootCleanupPolicy = "after-commit" | "after-evidence";

export interface OwnerRootJournalMember {
	readonly targetPath: string;
	readonly stagePath: string;
	readonly backupPath: string;
	readonly oldState: HarnessNodeSnapshot;
	readonly newState: HarnessNodeSnapshot;
}

export interface OwnerRootTransactionJournal {
	readonly schemaVersion: 1;
	readonly transactionId: string;
	readonly canonicalOwnerRoot: string;
	readonly targetId: ResolvedHarnessAssetTarget["targetId"];
	readonly phase: OwnerRootTransactionPhase;
	readonly cleanupPolicy: OwnerRootCleanupPolicy;
	readonly atomicSet: true;
	readonly manifestPath: string;
	readonly oldManifest: HarnessManifestSnapshot;
	readonly newManifest: HarnessManifestSnapshot;
	readonly members: readonly OwnerRootJournalMember[];
}

/** Opaque proof that the canonical owner-root sibling lock is currently held. */
export interface OwnerRootTransaction {
	readonly canonicalOwnerRoot: string;
	readonly lockPath: string;
	readonly journalPath: string;
	readonly manifestPath: string;
	readonly targetId: ResolvedHarnessAssetTarget["targetId"];
	readonly [ownerRootTransactionBrand]: true;
}

export interface OwnerRootEvidenceReceipt {
	readonly transactionId: string;
	readonly evidencePath: string;
	readonly evidenceDigest: string;
}

export type OwnerRootRecoveryResult =
	| { readonly state: "none" }
	| {
			readonly state: "restored-old";
			readonly phase: OwnerRootTransactionPhase;
	  }
	| {
			readonly state: "committed-new";
			readonly phase: OwnerRootTransactionPhase;
	  }
	| {
			readonly state: "evidence-required";
			readonly phase: "committed";
			readonly transactionId: string;
	  }
	| {
			readonly state: "ambiguous";
			readonly reason: string;
			readonly phase?: OwnerRootTransactionPhase;
	  };

export type OwnerRootTransactionResult<T> =
	| {
			readonly state: "completed";
			readonly result: T;
			readonly recovery: OwnerRootRecoveryResult;
	  }
	| {
			readonly state: "recovery-required";
			readonly recovery: Extract<
				OwnerRootRecoveryResult,
				{ readonly state: "ambiguous" | "evidence-required" }
			>;
	  }
	| {
			readonly state: "lock-contended";
			readonly lockPath: string;
			readonly ownerPid?: number;
			readonly waitTimeoutMs: number;
			exitCode: 1;
	  }
	| {
			readonly state: "persisted-release-unconfirmed";
			readonly persisted: Exclude<
				OwnerRootTransactionResult<T>,
				{ readonly state: "lock-contended" | "persisted-release-unconfirmed" }
			>;
			readonly error: unknown;
			exitCode: 1;
	  };

type EntityLockRunner = <T>(
	lockPath: string,
	fn: () => Promise<T>,
	options: EntityFileLockOptions,
) => Promise<T>;

export interface WithOwnerRootTransactionOptions {
	readonly ownerRoot: string;
	readonly targetId: ResolvedHarnessAssetTarget["targetId"];
	readonly waitTimeoutMs?: number;
	readonly evidenceReceipt?: OwnerRootEvidenceReceipt;
	/** Deterministic fault injection for the release-uncertainty contract. */
	readonly lockRunner?: EntityLockRunner;
}

/**
 * Validate first, acquire exactly one canonical sibling lock, recover once, and
 * pass one opaque lock-held capability to all apply/migration work.
 */
export async function withOwnerRootTransaction<T>(
	options: WithOwnerRootTransactionOptions,
	action: (transaction: OwnerRootTransaction) => Promise<T>,
): Promise<OwnerRootTransactionResult<T>> {
	const canonicalOwnerRoot = await canonicalizeOwnerRootReadOnly(
		options.ownerRoot,
	);
	const paths = resolveHarnessTransactionPaths(
		canonicalOwnerRoot,
		options.targetId,
	);
	const manifestPath = join(
		canonicalOwnerRoot,
		".cosmonauts-harness-manifest.json",
	);
	const waitTimeoutMs =
		options.waitTimeoutMs ?? DEFAULT_HARNESS_LOCK_WAIT_TIMEOUT_MS;
	const lockRunner = options.lockRunner ?? withEntityFileLock;
	let releaseError: unknown;

	try {
		const persisted = await lockRunner(
			paths.lockPath,
			async () => {
				await revalidateCanonicalOwnerRoot(canonicalOwnerRoot);
				const transaction = {
					canonicalOwnerRoot,
					lockPath: paths.lockPath,
					journalPath: paths.journalPath,
					manifestPath,
					targetId: options.targetId,
				} as OwnerRootTransaction;
				activeOwnerRootTransactions.add(transaction);
				try {
					const recovery = await recoverOwnerRootJournal(
						transaction,
						options.evidenceReceipt,
					);
					if (
						recovery.state === "ambiguous" ||
						recovery.state === "evidence-required"
					) {
						return { state: "recovery-required", recovery } as const;
					}
					return {
						state: "completed",
						result: await action(transaction),
						recovery,
					} as const;
				} finally {
					activeOwnerRootTransactions.delete(transaction);
				}
			},
			{
				waitTimeoutMs,
				onReleaseUnconfirmed: (error) => {
					releaseError = error;
				},
			},
		);
		if (releaseError !== undefined) {
			return {
				state: "persisted-release-unconfirmed",
				persisted,
				error: releaseError,
				exitCode: 1,
			};
		}
		return persisted;
	} catch (error) {
		if (!(error instanceof EntityFileLockTimeoutError)) throw error;
		return {
			state: "lock-contended",
			lockPath: error.lockPath,
			...(await readLockOwnerPid(error.lockPath)),
			waitTimeoutMs,
			exitCode: 1,
		};
	}
}

export interface OwnerRootTransactionMemberPlan {
	readonly targetPath: string;
	readonly oldState: HarnessNodeSnapshot;
	readonly newState: HarnessNodeSnapshot;
	readonly writeStage: (stagePath: string) => Promise<void>;
}

export interface ApplySyncPlanInTransactionOptions {
	readonly oldManifest: HarnessManifestSnapshot;
	readonly newManifestContents: string;
	readonly members: readonly OwnerRootTransactionMemberPlan[];
	readonly cleanupPolicy?: OwnerRootCleanupPolicy;
	readonly transactionId?: string;
	readonly onPhasePersisted?: (
		phase: OwnerRootTransactionPhase,
		journal: OwnerRootTransactionJournal,
	) => void | Promise<void>;
}

export type ApplySyncPlanResult =
	| { readonly state: "committed"; readonly transactionId: string }
	| { readonly state: "evidence-required"; readonly transactionId: string }
	| { readonly state: "restored-old"; readonly transactionId: string }
	| {
			readonly state: "ambiguous";
			readonly transactionId: string;
			readonly reason: string;
	  };

/** Apply an already-rendered atomic set without acquiring another lock. */
export async function applySyncPlanInTransaction(
	transaction: OwnerRootTransaction,
	options: ApplySyncPlanInTransactionOptions,
): Promise<ApplySyncPlanResult> {
	assertActiveTransaction(transaction);
	if (await pathExists(transaction.journalPath)) {
		throw new Error(
			"Cannot apply a harness sync plan while a journal is pending.",
		);
	}
	const transactionId = options.transactionId ?? randomUUID();
	if (!/^[A-Za-z0-9._-]+$/.test(transactionId)) {
		throw new Error(`Invalid harness transaction id: ${transactionId}.`);
	}
	const memberPaths = new Set<string>();
	const members: OwnerRootJournalMember[] = options.members.map(
		(member, index) => {
			assertContained(
				transaction.canonicalOwnerRoot,
				member.targetPath,
				"transaction target",
			);
			const targetPath = resolve(member.targetPath);
			if (memberPaths.has(targetPath)) {
				throw new Error(`Duplicate harness transaction target: ${targetPath}.`);
			}
			memberPaths.add(targetPath);
			const stem = `${basename(transaction.journalPath, ".journal.json")}-${transactionId}-${index}`;
			return {
				targetPath,
				stagePath: join(dirname(transaction.journalPath), `${stem}.stage`),
				backupPath: join(dirname(transaction.journalPath), `${stem}.backup`),
				oldState: member.oldState,
				newState: member.newState,
			};
		},
	);
	const newManifest = manifestSnapshot(options.newManifestContents);
	let journal: OwnerRootTransactionJournal = {
		schemaVersion: 1,
		transactionId,
		canonicalOwnerRoot: transaction.canonicalOwnerRoot,
		targetId: transaction.targetId,
		phase: "prepared",
		cleanupPolicy: options.cleanupPolicy ?? "after-commit",
		atomicSet: true,
		manifestPath: transaction.manifestPath,
		oldManifest: options.oldManifest,
		newManifest,
		members,
	};

	if (
		!(await nodeSnapshotsEqual(
			await observeManifestSnapshot(transaction.manifestPath),
			options.oldManifest,
		))
	) {
		return {
			state: "ambiguous",
			transactionId,
			reason: "old-manifest-mismatch",
		};
	}
	for (const member of members) {
		if (
			!nodeSnapshotsEqual(
				await observeHarnessNodeSnapshot(member.targetPath),
				member.oldState,
			)
		) {
			return {
				state: "ambiguous",
				transactionId,
				reason: `old-target-mismatch:${member.targetPath}`,
			};
		}
	}

	await persistJournal(transaction, journal);
	await options.onPhasePersisted?.("prepared", journal);
	try {
		for (let index = 0; index < members.length; index += 1) {
			const member = members[index];
			const planned = options.members[index];
			if (!member || !planned) throw new Error("Missing transaction member.");
			if (member.newState.kind !== "absent") {
				await revalidateBeforeSiblingMutation(transaction, member.stagePath);
				await planned.writeStage(member.stagePath);
			}
			if (
				!nodeSnapshotsEqual(
					await observeHarnessNodeSnapshot(member.stagePath),
					member.newState,
				)
			) {
				throw new Error(
					`Prepared stage does not match new snapshot: ${member.stagePath}.`,
				);
			}
		}
		journal = { ...journal, phase: "installing" };
		await persistJournal(transaction, journal);
		await options.onPhasePersisted?.("installing", journal);

		for (const member of members) {
			await revalidateBeforeOwnerMutation(transaction, member.targetPath);
			if (member.oldState.kind !== "absent") {
				await revalidateBeforeSiblingMutation(transaction, member.backupPath);
				await rename(member.targetPath, member.backupPath);
			}
			if (member.newState.kind !== "absent") {
				await revalidateBeforeOwnerMutation(transaction, member.targetPath);
				await mkdir(dirname(member.targetPath), { recursive: true });
				await revalidateBeforeOwnerMutation(transaction, member.targetPath);
				await revalidateBeforeSiblingMutation(transaction, member.stagePath);
				await rename(member.stagePath, member.targetPath);
			}
		}
		if (!(await allMembersMatch(journal, "new"))) {
			throw new Error(
				"Installed harness transaction did not verify as exact new state.",
			);
		}
		journal = { ...journal, phase: "commit-ready" };
		await persistJournal(transaction, journal);
		await options.onPhasePersisted?.("commit-ready", journal);
		await writeManifestSnapshot(transaction, journal.newManifest);
		if (
			!nodeSnapshotsEqual(
				await observeManifestSnapshot(transaction.manifestPath),
				journal.newManifest,
			)
		) {
			throw new Error("Committed harness manifest did not verify.");
		}
		journal = { ...journal, phase: "committed" };
		await persistJournal(transaction, journal);
		await options.onPhasePersisted?.("committed", journal);
		if (journal.cleanupPolicy === "after-evidence") {
			return { state: "evidence-required", transactionId };
		}
		const cleanup = await cleanupCommitted(transaction, journal);
		return cleanup.state === "ambiguous"
			? { ...cleanup, transactionId }
			: { state: "committed", transactionId };
	} catch {
		journal = { ...journal, phase: "rolling-back" };
		await persistJournal(transaction, journal);
		await options.onPhasePersisted?.("rolling-back", journal);
		const rollback = await rollbackJournal(transaction, journal);
		return rollback.state === "ambiguous"
			? { ...rollback, transactionId }
			: { state: "restored-old", transactionId };
	}
}

export function serializeOwnerRootJournal(
	journal: OwnerRootTransactionJournal,
): string {
	return `${JSON.stringify(journal, null, 2)}\n`;
}

export async function observeHarnessNodeSnapshot(
	path: string,
): Promise<HarnessNodeSnapshot> {
	let info: Awaited<ReturnType<typeof lstat>>;
	try {
		info = await lstat(path);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT")
			return { kind: "absent" };
		throw error;
	}
	if (info.isSymbolicLink()) {
		return { kind: "symlink", digest: sha256(`link\0${await readlink(path)}`) };
	}
	if (info.isFile()) {
		return {
			kind: "file",
			digest: sha256(
				Buffer.concat([Buffer.from("file\0"), await readFile(path)]),
			),
		};
	}
	if (!info.isDirectory()) {
		return { kind: "file", digest: sha256("unsupported-special-node") };
	}
	const children = await readdir(path);
	children.sort((left, right) => left.localeCompare(right));
	const vector: unknown[] = [];
	for (const child of children) {
		vector.push([child, await observeHarnessNodeSnapshot(join(path, child))]);
	}
	return { kind: "directory", digest: sha256(JSON.stringify(vector)) };
}

/** Observe one manifest-owned target using the same provenance classifier as sync. */
export async function observeHarnessManifestTarget(
	entry: MaterializedHarnessManifestEntry,
): Promise<ObservedHarnessTarget> {
	const state = await observeRecordedTarget(entry.outputPath, entry);
	return {
		targetPath: entry.outputPath,
		...(state === "absent"
			? { state: "absent" as const }
			: state === "intact"
				? {
						state: "exact-baseline" as const,
						baselineOwnerId: entry.owner.ownerId,
						baselineAssetId: entry.assetId,
					}
				: { state: "edited" as const }),
	};
}

async function recoverOwnerRootJournal(
	transaction: OwnerRootTransaction,
	receipt?: OwnerRootEvidenceReceipt,
): Promise<OwnerRootRecoveryResult> {
	let journal: OwnerRootTransactionJournal;
	try {
		const contents = await readFile(transaction.journalPath, "utf8");
		journal = parseOwnerRootJournal(contents, transaction);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return { state: "none" };
		return { state: "ambiguous", reason: errorMessage(error) };
	}
	const observed = await observeJournalVector(journal);
	if (observed.manifest === "other" || observed.hasOther) {
		return {
			state: "ambiguous",
			phase: journal.phase,
			reason: "transaction-vector-other",
		};
	}

	if (journal.phase === "prepared") {
		if (
			observed.manifest === "old" &&
			observed.members.every(
				(row) =>
					row.target === "old" &&
					row.backup === "absent" &&
					(row.stage === "new" || row.stage === "absent"),
			)
		) {
			await cleanupPrepared(transaction, journal);
			return { state: "restored-old", phase: journal.phase };
		}
		return {
			state: "ambiguous",
			phase: journal.phase,
			reason: "prepared-vector-invalid",
		};
	}

	if (journal.phase === "installing") {
		if (
			observed.manifest !== "old" ||
			!installingVectorCanRollback(journal, observed.members)
		) {
			return {
				state: "ambiguous",
				phase: journal.phase,
				reason: "installing-vector-invalid",
			};
		}
		const rollingBack = { ...journal, phase: "rolling-back" } as const;
		await persistJournal(transaction, rollingBack);
		const rolledBack = await rollbackJournal(transaction, rollingBack);
		return rolledBack.state === "ambiguous"
			? { ...rolledBack, phase: rollingBack.phase }
			: { state: "restored-old", phase: journal.phase };
	}

	if (journal.phase === "commit-ready") {
		if (
			(observed.manifest !== "old" && observed.manifest !== "new") ||
			!commitVectorIsNew(observed.members)
		) {
			return {
				state: "ambiguous",
				phase: journal.phase,
				reason: "commit-ready-vector-invalid",
			};
		}
		if (observed.manifest === "old")
			await writeManifestSnapshot(transaction, journal.newManifest);
		const committed = { ...journal, phase: "committed" } as const;
		await persistJournal(transaction, committed);
		return finishCommittedRecovery(
			transaction,
			committed,
			receipt,
			journal.phase,
		);
	}

	if (journal.phase === "committed") {
		if (observed.manifest !== "new" || !commitVectorIsNew(observed.members)) {
			return {
				state: "ambiguous",
				phase: journal.phase,
				reason: "committed-vector-invalid",
			};
		}
		return finishCommittedRecovery(
			transaction,
			journal,
			receipt,
			journal.phase,
		);
	}

	if (!rollingBackVectorCanRestore(journal, observed.members)) {
		return {
			state: "ambiguous",
			phase: journal.phase,
			reason: "rolling-back-vector-invalid",
		};
	}
	const rolledBack = await rollbackJournal(transaction, journal);
	return rolledBack.state === "ambiguous"
		? { ...rolledBack, phase: journal.phase }
		: { state: "restored-old", phase: journal.phase };
}

async function finishCommittedRecovery(
	transaction: OwnerRootTransaction,
	journal: OwnerRootTransactionJournal,
	receipt: OwnerRootEvidenceReceipt | undefined,
	originalPhase: OwnerRootTransactionPhase,
): Promise<OwnerRootRecoveryResult> {
	if (journal.cleanupPolicy === "after-evidence") {
		const observed = await observeJournalVector(journal);
		if (!evidenceCommitVectorIsNew(journal, observed.members)) {
			return {
				state: "ambiguous",
				phase: "committed",
				reason: "evidence-backup-required",
			};
		}
		if (!receipt) {
			return {
				state: "evidence-required",
				phase: "committed",
				transactionId: journal.transactionId,
			};
		}
		const valid = await verifyEvidenceReceipt(journal, receipt);
		if (!valid) {
			return {
				state: "ambiguous",
				phase: "committed",
				reason: "evidence-receipt-invalid",
			};
		}
		await revalidateBeforeSiblingMutation(transaction, transaction.journalPath);
		await unlink(transaction.journalPath);
		await syncDirectory(dirname(transaction.journalPath));
		return { state: "committed-new", phase: originalPhase };
	}
	const cleanup = await cleanupCommitted(transaction, journal);
	return cleanup.state === "ambiguous"
		? { ...cleanup, phase: originalPhase }
		: { state: "committed-new", phase: originalPhase };
}

type VectorState = "old" | "new" | "missing" | "absent" | "other";
interface ObservedJournalMember {
	readonly target: VectorState;
	readonly backup: VectorState;
	readonly stage: VectorState;
}

async function observeJournalVector(
	journal: OwnerRootTransactionJournal,
): Promise<{
	readonly manifest: "old" | "new" | "other";
	readonly members: readonly ObservedJournalMember[];
	readonly hasOther: boolean;
}> {
	const manifestSnapshot = await observeManifestSnapshot(journal.manifestPath);
	const manifest = nodeSnapshotsEqual(manifestSnapshot, journal.oldManifest)
		? "old"
		: nodeSnapshotsEqual(manifestSnapshot, journal.newManifest)
			? "new"
			: "other";
	const members = await Promise.all(
		journal.members.map(async (member) => ({
			target: classifyNode(
				await observeHarnessNodeSnapshot(member.targetPath),
				member.oldState,
				member.newState,
				true,
			),
			backup: classifyNode(
				await observeHarnessNodeSnapshot(member.backupPath),
				member.oldState,
				{ kind: "absent" },
				false,
			),
			stage: classifyNode(
				await observeHarnessNodeSnapshot(member.stagePath),
				{ kind: "absent" },
				member.newState,
				false,
			),
		})),
	);
	return {
		manifest,
		members,
		hasOther: members.some(
			(row) =>
				row.target === "other" ||
				row.backup === "other" ||
				row.stage === "other",
		),
	};
}

function classifyNode(
	actual: HarnessNodeSnapshot,
	oldState: HarnessNodeSnapshot,
	newState: HarnessNodeSnapshot,
	target: boolean,
): VectorState {
	if (actual.kind === "absent") {
		return target && newState.kind === "absent"
			? "new"
			: target
				? "missing"
				: "absent";
	}
	if (nodeSnapshotsEqual(actual, oldState)) return "old";
	if (nodeSnapshotsEqual(actual, newState))
		return newState.kind === "absent" ? "absent" : "new";
	return "other";
}

function installingVectorCanRollback(
	journal: OwnerRootTransactionJournal,
	rows: readonly ObservedJournalMember[],
): boolean {
	return rows.every((row, index) => {
		const member = journal.members[index];
		if (!member || (row.stage !== "new" && row.stage !== "absent"))
			return false;
		if (member.oldState.kind === "absent") {
			return (
				(row.target === "missing" || row.target === "new") &&
				row.backup === "absent"
			);
		}
		return (
			(row.target === "old" && row.backup === "absent") ||
			((row.target === "missing" || row.target === "new") &&
				row.backup === "old")
		);
	});
}

function commitVectorIsNew(rows: readonly ObservedJournalMember[]): boolean {
	return rows.every(
		(row) =>
			row.target === "new" &&
			(row.backup === "old" || row.backup === "absent") &&
			row.stage === "absent",
	);
}

function evidenceCommitVectorIsNew(
	journal: OwnerRootTransactionJournal,
	rows: readonly ObservedJournalMember[],
): boolean {
	return rows.every((row, index) => {
		const member = journal.members[index];
		return (
			member !== undefined &&
			row.target === "new" &&
			row.stage === "absent" &&
			row.backup === (member.oldState.kind === "absent" ? "absent" : "old")
		);
	});
}

function rollingBackVectorCanRestore(
	journal: OwnerRootTransactionJournal,
	rows: readonly ObservedJournalMember[],
): boolean {
	return rows.every((row, index) => {
		const member = journal.members[index];
		if (!member) return false;
		if (member.oldState.kind === "absent") {
			return (
				(row.target === "missing" || row.target === "new") &&
				row.backup === "absent"
			);
		}
		return (
			(row.target === "old" &&
				(row.backup === "old" || row.backup === "absent")) ||
			((row.target === "new" || row.target === "missing") &&
				row.backup === "old")
		);
	});
}

async function rollbackJournal(
	transaction: OwnerRootTransaction,
	journal: OwnerRootTransactionJournal,
): Promise<
	| { readonly state: "restored-old" }
	| { readonly state: "ambiguous"; readonly reason: string }
> {
	const observed = await observeJournalVector(journal);
	if (
		observed.manifest === "other" ||
		observed.hasOther ||
		!rollingBackVectorCanRestore(journal, observed.members)
	) {
		return { state: "ambiguous", reason: "rollback-vector-changed" };
	}
	for (let index = 0; index < journal.members.length; index += 1) {
		const member = journal.members[index];
		const row = observed.members[index];
		if (!member || !row)
			return { state: "ambiguous", reason: "rollback-member-missing" };
		if (member.oldState.kind === "absent") {
			if (row.target === "new")
				await removeExactTarget(
					transaction,
					member.targetPath,
					member.newState,
				);
		} else if (row.target !== "old") {
			if (row.target === "new") {
				await removeExactTarget(
					transaction,
					member.targetPath,
					member.newState,
				);
			}
			await revalidateBeforeOwnerMutation(transaction, member.targetPath);
			await revalidateBeforeSiblingMutation(transaction, member.backupPath);
			await mkdir(dirname(member.targetPath), { recursive: true });
			await revalidateBeforeOwnerMutation(transaction, member.targetPath);
			await rename(member.backupPath, member.targetPath);
		}
	}
	await writeManifestSnapshot(transaction, journal.oldManifest);
	if (!(await allMembersMatch(journal, "old")))
		return { state: "ambiguous", reason: "rollback-verification-failed" };
	await cleanupExactArtifacts(transaction, journal, true);
	return { state: "restored-old" };
}

async function cleanupPrepared(
	transaction: OwnerRootTransaction,
	journal: OwnerRootTransactionJournal,
): Promise<void> {
	await cleanupExactArtifacts(transaction, journal, true);
}

async function cleanupCommitted(
	transaction: OwnerRootTransaction,
	journal: OwnerRootTransactionJournal,
): Promise<
	| { readonly state: "committed" }
	| { readonly state: "ambiguous"; readonly reason: string }
> {
	for (const member of journal.members) {
		const backup = await observeHarnessNodeSnapshot(member.backupPath);
		if (
			backup.kind !== "absent" &&
			!nodeSnapshotsEqual(backup, member.oldState)
		) {
			return {
				state: "ambiguous",
				reason: `backup-changed:${member.backupPath}`,
			};
		}
		const stage = await observeHarnessNodeSnapshot(member.stagePath);
		if (
			stage.kind !== "absent" &&
			!nodeSnapshotsEqual(stage, member.newState)
		) {
			return {
				state: "ambiguous",
				reason: `stage-changed:${member.stagePath}`,
			};
		}
	}
	await cleanupExactArtifacts(transaction, journal, true);
	return { state: "committed" };
}

async function cleanupExactArtifacts(
	transaction: OwnerRootTransaction,
	journal: OwnerRootTransactionJournal,
	removeJournal: boolean,
): Promise<void> {
	for (const member of journal.members) {
		await removeIfExact(transaction, member.stagePath, member.newState);
		await removeIfExact(transaction, member.backupPath, member.oldState);
	}
	if (removeJournal) {
		await revalidateBeforeSiblingMutation(transaction, transaction.journalPath);
		await unlink(transaction.journalPath).catch(
			(error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") throw error;
			},
		);
		await syncDirectory(dirname(transaction.journalPath));
	}
}

async function removeExactTarget(
	transaction: OwnerRootTransaction,
	path: string,
	expected: HarnessNodeSnapshot,
): Promise<void> {
	if (!nodeSnapshotsEqual(await observeHarnessNodeSnapshot(path), expected)) {
		throw new Error(`Refusing to remove changed harness target: ${path}.`);
	}
	await revalidateBeforeOwnerMutation(transaction, path);
	await rm(path, { recursive: true, force: true });
}

async function removeIfExact(
	transaction: OwnerRootTransaction,
	path: string,
	expected: HarnessNodeSnapshot,
): Promise<void> {
	const actual = await observeHarnessNodeSnapshot(path);
	if (actual.kind === "absent") return;
	if (expected.kind === "absent" || !nodeSnapshotsEqual(actual, expected))
		return;
	await revalidateBeforeSiblingMutation(transaction, path);
	await rm(path, { recursive: true, force: true });
}

async function allMembersMatch(
	journal: OwnerRootTransactionJournal,
	state: "old" | "new",
): Promise<boolean> {
	const matches = await Promise.all(
		journal.members.map(async (member) =>
			nodeSnapshotsEqual(
				await observeHarnessNodeSnapshot(member.targetPath),
				state === "old" ? member.oldState : member.newState,
			),
		),
	);
	return matches.every(Boolean);
}

function parseOwnerRootJournal(
	contents: string,
	transaction: OwnerRootTransaction,
): OwnerRootTransactionJournal {
	const value: unknown = JSON.parse(contents);
	if (!isOwnerRootJournal(value))
		throw new Error("Malformed harness owner-root journal.");
	if (
		value.canonicalOwnerRoot !== transaction.canonicalOwnerRoot ||
		value.targetId !== transaction.targetId ||
		value.manifestPath !== transaction.manifestPath
	) {
		throw new Error("Harness owner-root journal identity mismatch.");
	}
	if (nodeSnapshotsEqual(value.oldManifest, value.newManifest)) {
		throw new Error(
			"Harness owner-root journal manifest snapshots are indistinguishable.",
		);
	}
	const expectedPrefix = `${basename(transaction.journalPath, ".journal.json")}-${value.transactionId}-`;
	const targetPaths = new Set<string>();
	for (let index = 0; index < value.members.length; index += 1) {
		const member = value.members[index];
		if (!member) throw new Error("Harness journal member missing.");
		assertContained(
			transaction.canonicalOwnerRoot,
			member.targetPath,
			"journal target",
		);
		if (targetPaths.has(member.targetPath)) {
			throw new Error("Harness owner-root journal has duplicate target paths.");
		}
		targetPaths.add(member.targetPath);
		if (
			member.stagePath !==
				join(
					dirname(transaction.journalPath),
					`${expectedPrefix}${index}.stage`,
				) ||
			member.backupPath !==
				join(
					dirname(transaction.journalPath),
					`${expectedPrefix}${index}.backup`,
				)
		) {
			throw new Error("Harness journal artifact path mismatch.");
		}
	}
	return value;
}

function isOwnerRootJournal(
	value: unknown,
): value is OwnerRootTransactionJournal {
	if (!isRecordValue(value)) return false;
	return (
		value.schemaVersion === 1 &&
		typeof value.transactionId === "string" &&
		typeof value.canonicalOwnerRoot === "string" &&
		(value.targetId === "claude" || value.targetId === "codex") &&
		[
			"prepared",
			"installing",
			"commit-ready",
			"committed",
			"rolling-back",
		].includes(String(value.phase)) &&
		(value.cleanupPolicy === "after-commit" ||
			value.cleanupPolicy === "after-evidence") &&
		value.atomicSet === true &&
		typeof value.manifestPath === "string" &&
		isManifestSnapshot(value.oldManifest) &&
		isManifestSnapshot(value.newManifest) &&
		Array.isArray(value.members) &&
		value.members.length > 0 &&
		value.members.every(isJournalMember)
	);
}

function isJournalMember(value: unknown): value is OwnerRootJournalMember {
	return (
		isRecordValue(value) &&
		typeof value.targetPath === "string" &&
		typeof value.stagePath === "string" &&
		typeof value.backupPath === "string" &&
		isNodeSnapshot(value.oldState) &&
		isNodeSnapshot(value.newState) &&
		value.newState.kind !== "absent"
	);
}

function isManifestSnapshot(value: unknown): value is HarnessManifestSnapshot {
	return (
		isRecordValue(value) &&
		(value.kind === "absent" ||
			(value.kind === "file" &&
				typeof value.digest === "string" &&
				typeof value.contents === "string" &&
				value.digest === sha256(value.contents)))
	);
}

function isNodeSnapshot(value: unknown): value is HarnessNodeSnapshot {
	return (
		isRecordValue(value) &&
		(value.kind === "absent" ||
			((value.kind === "file" ||
				value.kind === "directory" ||
				value.kind === "symlink") &&
				typeof value.digest === "string"))
	);
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function manifestSnapshot(contents: string): HarnessManifestSnapshot {
	return { kind: "file", digest: sha256(contents), contents };
}

async function observeManifestSnapshot(
	path: string,
): Promise<HarnessManifestSnapshot> {
	try {
		const contents = await readFile(path, "utf8");
		return manifestSnapshot(contents);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT")
			return { kind: "absent" };
		throw error;
	}
}

function nodeSnapshotsEqual(
	left: HarnessNodeSnapshot | HarnessManifestSnapshot,
	right: HarnessNodeSnapshot | HarnessManifestSnapshot,
): boolean {
	return (
		left.kind === right.kind &&
		(left.kind === "absent" ||
			(right.kind !== "absent" && left.digest === right.digest))
	);
}

async function persistJournal(
	transaction: OwnerRootTransaction,
	journal: OwnerRootTransactionJournal,
): Promise<void> {
	await revalidateBeforeSiblingMutation(transaction, transaction.journalPath);
	await writeDurableFile(
		transaction.journalPath,
		serializeOwnerRootJournal(journal),
	);
}

async function writeManifestSnapshot(
	transaction: OwnerRootTransaction,
	snapshot: HarnessManifestSnapshot,
): Promise<void> {
	await revalidateBeforeOwnerMutation(transaction, transaction.manifestPath);
	if (snapshot.kind === "absent") {
		await unlink(transaction.manifestPath).catch(
			(error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") throw error;
			},
		);
		await syncDirectory(dirname(transaction.manifestPath));
		return;
	}
	await writeDurableFile(transaction.manifestPath, snapshot.contents);
}

async function writeDurableFile(path: string, contents: string): Promise<void> {
	const directory = dirname(path);
	await mkdir(directory, { recursive: true });
	const temporary = join(
		directory,
		`.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
	);
	const handle = await open(temporary, "wx", 0o600);
	try {
		await handle.writeFile(contents, "utf8");
		await handle.sync();
	} finally {
		await handle.close();
	}
	try {
		await rename(temporary, path);
		await syncDirectory(directory);
	} catch (error) {
		await unlink(temporary).catch(() => undefined);
		throw error;
	}
}

async function syncDirectory(path: string): Promise<void> {
	const handle = await open(path, "r");
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}

async function verifyEvidenceReceipt(
	journal: OwnerRootTransactionJournal,
	receipt: OwnerRootEvidenceReceipt,
): Promise<boolean> {
	if (receipt.transactionId !== journal.transactionId) return false;
	let contents: string;
	try {
		contents = await readFile(receipt.evidencePath, "utf8");
	} catch {
		return false;
	}
	if (sha256(contents) !== receipt.evidenceDigest) return false;
	try {
		const parsed: unknown = JSON.parse(contents);
		return (
			isRecordValue(parsed) &&
			parsed.schemaVersion === 1 &&
			parsed.transactionId === journal.transactionId &&
			parsed.phase === "installed" &&
			journal.newManifest.kind === "file" &&
			parsed.newManifestDigest === journal.newManifest.digest &&
			(await allMembersMatch(journal, "new"))
		);
	} catch {
		return false;
	}
}

async function canonicalizeOwnerRootReadOnly(
	ownerRoot: string,
): Promise<string> {
	if (!isAbsolute(ownerRoot))
		throw new Error(`Harness owner root must be absolute: ${ownerRoot}.`);
	const resolved = resolve(ownerRoot);
	try {
		const declared = await lstat(resolved);
		if (declared.isSymbolicLink()) {
			throw new Error(`Harness owner root cannot be a symlink: ${resolved}.`);
		}
	} catch (error) {
		if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
	}
	const canonicalParent = await realpath(dirname(resolved));
	const candidate = join(canonicalParent, basename(resolved));
	try {
		const info = await lstat(candidate);
		if (info.isSymbolicLink() || !info.isDirectory()) {
			throw new Error(
				`Harness owner root must be a real directory: ${candidate}.`,
			);
		}
		if ((await realpath(candidate)) !== candidate) {
			throw new Error(
				`Harness owner root canonical identity changed: ${candidate}.`,
			);
		}
	} catch (error) {
		if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
	}
	return candidate;
}

async function revalidateCanonicalOwnerRoot(
	canonicalOwnerRoot: string,
): Promise<void> {
	const parent = dirname(canonicalOwnerRoot);
	if ((await realpath(parent)) !== parent)
		throw new Error(`Harness owner parent changed: ${parent}.`);
	try {
		const info = await lstat(canonicalOwnerRoot);
		if (
			info.isSymbolicLink() ||
			!info.isDirectory() ||
			(await realpath(canonicalOwnerRoot)) !== canonicalOwnerRoot
		) {
			throw new Error(
				`Harness owner root containment changed: ${canonicalOwnerRoot}.`,
			);
		}
	} catch (error) {
		if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
	}
}

async function revalidateBeforeOwnerMutation(
	transaction: OwnerRootTransaction,
	path: string,
): Promise<void> {
	assertActiveTransaction(transaction);
	assertContained(transaction.canonicalOwnerRoot, path, "owner-root mutation");
	await revalidateCanonicalOwnerRoot(transaction.canonicalOwnerRoot);
	await revalidateOwnerPathParents(transaction.canonicalOwnerRoot, path);
}

async function revalidateOwnerPathParents(
	canonicalOwnerRoot: string,
	path: string,
): Promise<void> {
	const relativePath = relative(canonicalOwnerRoot, resolve(path));
	const parentSegments = relativePath.split(sep).filter(Boolean).slice(0, -1);
	let current = canonicalOwnerRoot;
	for (const segment of parentSegments) {
		current = join(current, segment);
		try {
			const info = await lstat(current);
			if (info.isSymbolicLink() || !info.isDirectory()) {
				throw new Error(
					`Harness owner-root containment changed at ${current}.`,
				);
			}
		} catch (error) {
			if (isNodeError(error) && error.code === "ENOENT") return;
			throw error;
		}
	}
}

async function revalidateBeforeSiblingMutation(
	transaction: OwnerRootTransaction,
	path: string,
): Promise<void> {
	assertActiveTransaction(transaction);
	if (dirname(resolve(path)) !== dirname(transaction.canonicalOwnerRoot)) {
		throw new Error(
			`Harness transaction artifact escapes canonical sibling directory: ${path}.`,
		);
	}
	await revalidateCanonicalOwnerRoot(transaction.canonicalOwnerRoot);
}

function assertActiveTransaction(transaction: OwnerRootTransaction): void {
	if (!activeOwnerRootTransactions.has(transaction)) {
		throw new Error(
			"OwnerRootTransaction is not an active lock-held capability.",
		);
	}
}

async function readLockOwnerPid(
	lockPath: string,
): Promise<{ readonly ownerPid?: number }> {
	try {
		const parsed: unknown = JSON.parse(await readFile(lockPath, "utf8"));
		if (
			isRecordValue(parsed) &&
			Number.isInteger(parsed.pid) &&
			Number(parsed.pid) > 0
		) {
			return { ownerPid: Number(parsed.pid) };
		}
	} catch {
		// The timeout row still names the exact lock when its owner bytes are bad.
	}
	return {};
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return false;
		throw error;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
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

export type HarnessDriftReason =
	| SyncPlanReason
	| "foreign-or-untraceable"
	| "concurrent-change"
	| "mode-conversion"
	| "source-changed"
	| "link-map-changed"
	| "generated-input-changed"
	| "regenerated-from-other-project";

export interface ClassifiedHarnessSyncPlanRow
	extends Omit<HarnessSyncPlanRow, "reason"> {
	readonly sourcePath: string;
	readonly recordedMode?: SyncMode;
	readonly requestedMode: SyncMode;
	readonly beforeStatus: SyncStatus;
	readonly reason: HarnessDriftReason;
	readonly generatingProjectRoot?: string;
	readonly previousGeneratingProjectRoot?: string;
	readonly conflict?: HarnessConflictReport;
}

export interface HarnessConflictGuidance {
	readonly action: "port" | "preserve" | "safe-transfer";
	readonly message: string;
}

export interface HarnessConflictReport {
	readonly sourcePath: string;
	readonly targetPath: string;
	readonly owner: OwnerIdentity;
	readonly conflictingOwner?: OwnerIdentity;
	readonly reason: HarnessDriftReason;
	readonly guidance: readonly HarnessConflictGuidance[];
}

export interface ClassifiedHarnessSyncPlan
	extends Omit<HarnessSyncPlan, "rows"> {
	readonly rows: readonly ClassifiedHarnessSyncPlanRow[];
	readonly exitCode: 0 | 1;
}

interface RowContext {
	readonly request: SyncRequest;
	readonly asset: HarnessAsset;
	readonly targetId: HarnessSyncInventoryRow["targetId"];
	readonly scope: HarnessSyncInventoryRow["scope"];
	readonly sourcePath: string;
	readonly targetPath: string;
	readonly owner: OwnerIdentity;
	readonly conflictingOwner?: OwnerIdentity;
	readonly recordedMode?: SyncMode;
	readonly requestedMode: SyncMode;
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
): Promise<ClassifiedHarnessSyncPlan> {
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
		return withPlanExitCode(
			await planTransfers({
				...options,
				request,
				currentProjectOwner,
				observations,
			}),
		);
	}
	if (request.forgetRemovedAssetIds) {
		return withPlanExitCode(
			planForgets({
				...options,
				request,
				currentProjectOwner,
				observations,
			}),
		);
	}

	const selectedInventory = options.inventory.filter((row) =>
		matchesRequest(row, request),
	);
	const inventoryRows: ClassifiedHarnessSyncPlanRow[] = [];
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
							projectRoot: options.projectRoot,
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
			exitCode: 1,
		};
	}

	return withPlanExitCode({ request, rows, aborted: false });
}

function classifyInventoryRow(options: {
	readonly request: SyncRequest;
	readonly row: HarnessSyncInventoryRow;
	readonly owner: OwnerIdentity;
	readonly observation: TargetObservation;
	readonly claims: readonly HarnessManifestEntry[];
	readonly health: ReadonlyMap<string, SourceHealthRow["status"]>;
}): ClassifiedHarnessSyncPlanRow {
	const { request, row, owner, observation, claims, health } = options;
	const matchingClaim = claims.find((entry) => ownersMatch(entry.owner, owner));
	const foreignClaim = claims.find((entry) => !ownersMatch(entry.owner, owner));
	const context: RowContext = {
		request,
		asset: row.asset,
		targetId: row.targetId,
		scope: row.scope,
		sourcePath: resolve(row.asset.sourceRoot, row.asset.sourcePath),
		targetPath: resolve(row.targetPath),
		owner,
		...(foreignClaim ? { conflictingOwner: foreignClaim.owner } : {}),
		...(matchingClaim ? { recordedMode: matchingClaim.mode } : {}),
		requestedMode: resolveHarnessSyncMode(
			request.requestedMode,
			matchingClaim?.mode,
		),
	};

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
			return makeRow(
				context,
				"locally-edited",
				"foreign-or-untraceable",
				"none",
			);
		}
		return classifyRemovedSource(context, matchingClaim, observation);
	}

	if (!matchingClaim) {
		return observation.state === "absent"
			? makeRow(context, "missing", "missing", "create")
			: makeRow(context, "locally-edited", "foreign-or-untraceable", "none");
	}
	if (observation.state === "absent") {
		return makeRow(context, "missing", "missing", "create");
	}
	if (!isExactBaselineFor(observation, matchingClaim)) {
		return makeRow(context, "locally-edited", "locally-edited", "none");
	}
	if (context.requestedMode !== matchingClaim.mode) {
		return makeRow(context, "source-ahead", "mode-conversion", "replace");
	}
	return makeRow(context, "current", "current", "none");
}

function classifyStaleEntry(options: {
	readonly projectRoot: string;
	readonly request: SyncRequest;
	readonly entry: HarnessManifestEntry;
	readonly currentProjectOwner: OwnerIdentity;
	readonly observation: TargetObservation;
	readonly health: ReadonlyMap<string, SourceHealthRow["status"]>;
}): ClassifiedHarnessSyncPlanRow {
	const { request, entry, currentProjectOwner, observation, health } = options;
	const context = contextFromEntry(request, entry, options.projectRoot);
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
): ClassifiedHarnessSyncPlanRow {
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
): Promise<ClassifiedHarnessSyncPlan> {
	const transfer = options.request.transferOwner;
	if (!transfer) throw new Error("transfer request is missing transferOwner");
	const pending = new Set(options.pendingJournalOwnerIds ?? []);
	const rows: ClassifiedHarnessSyncPlanRow[] = [];

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
						contextFromEntry(options.request, entry, options.projectRoot),
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
			sourcePath: resolve(
				inventory.asset.sourceRoot,
				inventory.asset.sourcePath,
			),
			targetPath: resolve(inventory.targetPath),
			owner,
			recordedMode: entry.mode,
			requestedMode: resolveHarnessSyncMode(
				options.request.requestedMode,
				entry.mode,
			),
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

	return {
		request: options.request,
		rows,
		aborted: false,
		exitCode: 1,
	};
}

function planForgets(options: SpecialPlanContext): ClassifiedHarnessSyncPlan {
	const forgetIds = new Set(options.request.forgetRemovedAssetIds ?? []);
	const rows: ClassifiedHarnessSyncPlanRow[] = [];
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
		const context = contextFromEntry(
			options.request,
			entry,
			options.projectRoot,
		);
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
	return {
		request: options.request,
		rows,
		aborted: false,
		exitCode: rows.some((row) => row.status !== "current") ? 1 : 0,
	};
}

function contextFromEntry(
	request: SyncRequest,
	entry: HarnessManifestEntry,
	projectRoot: string,
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
		sourcePath: resolve(projectRoot, entry.sourcePath),
		targetPath: resolve(entry.outputPath),
		owner: entry.owner,
		recordedMode: entry.mode,
		requestedMode: resolveHarnessSyncMode(request.requestedMode, entry.mode),
	};
}

function makeRow(
	context: RowContext,
	status: SyncStatus,
	reason: HarnessDriftReason,
	action: SyncPlanAction,
): ClassifiedHarnessSyncPlanRow {
	const effectiveAction = context.request.check ? "none" : action;
	const conflict =
		status === "locally-edited" && effectiveAction === "none"
			? makeConflictReport(context, reason)
			: undefined;
	return {
		assetId: context.asset.assetId,
		kind: context.asset.kind,
		targetId: context.targetId,
		scope: context.scope,
		sourcePath: context.sourcePath,
		targetPath: context.targetPath,
		owner: context.owner,
		status,
		...(context.recordedMode ? { recordedMode: context.recordedMode } : {}),
		requestedMode: context.requestedMode,
		beforeStatus: status,
		reason,
		...(conflict ? { conflict } : {}),
		action: effectiveAction,
		writesTarget:
			effectiveAction === "create" ||
			effectiveAction === "replace" ||
			effectiveAction === "remove-target-and-entry",
		writesManifest: effectiveAction !== "none",
	};
}

function makeConflictReport(
	context: RowContext,
	reason: HarnessDriftReason,
): HarnessConflictReport {
	const guidance: HarnessConflictGuidance[] = [
		{
			action: "preserve",
			message: `Preserve the existing target at ${context.targetPath}; sync will not overwrite it.`,
		},
		{
			action: "port",
			message: `Port intentional local content into ${context.sourcePath}, then restore or remove the conflicting target before syncing again.`,
		},
	];
	if (
		reason === "foreign-owner" ||
		reason === "edited-target-cannot-transfer" ||
		reason === "transfer-entry-mismatch"
	) {
		guidance.push({
			action: "safe-transfer",
			message:
				"Use explicit owner transfer only when the asset/output identity matches and the target is absent or exactly matches the old baseline.",
		});
	}
	return {
		sourcePath: context.sourcePath,
		targetPath: context.targetPath,
		owner: context.owner,
		...(context.conflictingOwner
			? { conflictingOwner: context.conflictingOwner }
			: {}),
		reason,
		guidance,
	};
}

/** Explicit request, then sticky recorded mode, then copy for new assets. */
export function resolveHarnessSyncMode(
	requestedMode: SyncMode | undefined,
	recordedMode: SyncMode | undefined,
): SyncMode {
	return requestedMode ?? recordedMode ?? "copy";
}

function withPlanExitCode(
	plan: Omit<ClassifiedHarnessSyncPlan, "exitCode">,
): ClassifiedHarnessSyncPlan {
	return {
		...plan,
		exitCode: plan.rows.some((row) => row.status !== "current") ? 1 : 0,
	};
}

function abortMutation(
	row: ClassifiedHarnessSyncPlanRow,
): ClassifiedHarnessSyncPlanRow {
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
