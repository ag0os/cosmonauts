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
import {
	getStaticHarnessAsset,
	resolveHarnessAssetTarget,
} from "./registry.ts";
import type {
	GeneratedHarnessNode,
	PreparedHarnessMaterialization,
	RenderedFileNode,
} from "./render.ts";
import {
	assertClaudeCommandFrontmatter,
	digestRenderedFiles,
	GENERATED_BY_MARKER_VERSION,
	prepareHarnessMaterialization,
	stripGeneratedByMarker,
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
	/** Reuse an enclosing owner-group check window instead of rereading state. */
	readonly checkObservation?: HarnessAssetCheckObservation;
}

export interface HarnessAssetCheckObservation {
	readonly manifest: HarnessProvenanceManifest;
	readonly target: TargetObservation;
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
	if (options.checkObservation && !options.check) {
		throw new Error("A harness check observation requires check mode.");
	}
	const explicitLinkPreparation =
		options.target.requestedMode === "link"
			? await prepareHarnessMaterialization({
					projectRoot: options.projectRoot,
					asset: options.asset,
					target: options.target,
					mode: "link",
					generatedNodes: options.generatedNodes,
				})
			: undefined;
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
		if (options.checkObservation) {
			manifest = options.checkObservation.manifest;
			observedTargetState =
				options.checkObservation.target.state === "exact-baseline"
					? "intact"
					: options.checkObservation.target.state;
		} else {
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
		}
	} else {
		manifest = await readHarnessManifest(manifestPath);
	}
	const key = manifestEntryKey(owner, options.asset.assetId);
	const recorded = manifest.entries[key];
	const requestedMode = resolveHarnessSyncMode(
		options.target.requestedMode,
		recorded?.mode,
	);
	const prepared =
		explicitLinkPreparation ??
		(await prepareHarnessMaterialization({
			projectRoot: options.projectRoot,
			asset: options.asset,
			target: options.target,
			mode: requestedMode,
			generatedNodes: options.generatedNodes,
		}));

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

export type ClaudeCommandBootstrapStop =
	| "prepared"
	| "installing"
	| "commit-ready"
	| "rolling-back"
	| "installed"
	| "checked"
	| "backup-cleanup";

export interface RunClaudeCommandPairBootstrapOptions {
	readonly projectRoot: string;
	readonly homeRoot: string;
	readonly now?: () => Date;
	readonly stopAfter?: ClaudeCommandBootstrapStop;
	readonly onTransactionLock?: () => void | Promise<void>;
	readonly onPhasePersisted?: (
		phase: OwnerRootTransactionPhase,
	) => void | Promise<void>;
	readonly lockRunner?: NonNullable<
		WithOwnerRootTransactionOptions["lockRunner"]
	>;
}

const CLAUDE_COMMAND_BOOTSTRAP_SPECS = [
	{
		assetId: "command:spec-to-backlog",
		name: "spec-to-backlog",
		nativeRelativePath: "external-commands/spec-to-backlog.md",
	},
	{
		assetId: "command:implement-plan",
		name: "implement-plan",
		nativeRelativePath: "external-commands/implement-plan.md",
	},
] as const;

type ClaudeCommandEvidencePhase =
	| "authorized"
	| "installed"
	| "checked"
	| "complete";

interface ClaudeCommandEvidenceRow {
	readonly assetId: (typeof CLAUDE_COMMAND_BOOTSTRAP_SPECS)[number]["assetId"];
	readonly livePath: string;
	readonly nativePath: string;
	readonly outputPath: string;
	readonly liveLength: number;
	readonly nativeLength: number;
	readonly renderLength: number;
	readonly finalLength?: number;
	readonly liveDigest: string;
	readonly nativeDigest: string;
	readonly renderDigest: string;
	readonly finalDigest?: string;
	readonly materializedDigest: string;
	readonly manifestKey: string;
	readonly oldState: HarnessNodeSnapshot;
	readonly newState: HarnessNodeSnapshot;
	readonly backupPath?: string;
	readonly backupExit?: "removed-exact";
}

interface ClaudeCommandCheckRow {
	readonly assetId: string;
	readonly targetPath: string;
	readonly exitCode: 0 | 1;
	readonly beforeStatus: SyncHarnessAssetResult["beforeStatus"];
	readonly reason: SyncHarnessAssetResult["reason"];
}

export interface ClaudeCommandMigrationEvidence {
	readonly schemaVersion: 1;
	readonly authorizationKind: "ratified-live-bootstrap";
	readonly phase: ClaudeCommandEvidencePhase;
	readonly transactionId: string;
	readonly ownerId: "authority:cosmonauts/core";
	readonly ownerRoot: string;
	readonly target: "claude";
	readonly scope: "personal";
	readonly cleanupPolicy: "after-evidence";
	readonly atomicSet: true;
	readonly markerVersion: 1;
	readonly newManifestDigest: string;
	readonly manifestKeys: readonly [string, string];
	readonly commands: readonly [
		ClaudeCommandEvidenceRow,
		ClaudeCommandEvidenceRow,
	];
	readonly recoveryOutcome?: string;
	readonly receipt?: OwnerRootEvidenceReceipt;
	readonly checkRows?: readonly [ClaudeCommandCheckRow, ClaudeCommandCheckRow];
	readonly authorizedAt: string;
	readonly installedAt?: string;
	readonly checkedAt?: string;
	readonly completedAt?: string;
}

interface PreparedClaudeCommand {
	readonly spec: (typeof CLAUDE_COMMAND_BOOTSTRAP_SPECS)[number];
	readonly asset: HarnessAsset;
	readonly target: ResolvedHarnessAssetTarget;
	readonly liveBytes: Buffer;
	readonly nativeBytes: Buffer;
	readonly renderedBytes: Buffer;
	readonly strippedRenderedBytes: Buffer;
	readonly oldState: HarnessNodeSnapshot;
	readonly newState: HarnessNodeSnapshot;
	readonly manifestEntry: MaterializedHarnessManifestEntry;
	readonly manifestKey: string;
}

export async function runClaudeCommandPairBootstrap(
	options: RunClaudeCommandPairBootstrapOptions,
): Promise<ClaudeCommandMigrationEvidence> {
	const projectRoot = await realpath(options.projectRoot);
	const homeRoot = await realpath(options.homeRoot);
	const evidencePath = join(
		projectRoot,
		"missions/plans/harness-adapters/command-migration-evidence.json",
	);
	await assertCommandBootstrapPrerequisites(projectRoot);
	const existing = await readCommandMigrationEvidence(evidencePath);
	if (existing?.phase === "complete") {
		await validateCompleteCommandEvidence(existing, projectRoot, homeRoot);
		return existing;
	}

	if (existing?.phase === "installed" || existing?.phase === "checked") {
		return finishClaudeCommandEvidence({
			...options,
			projectRoot,
			homeRoot,
			evidencePath,
			evidence: existing,
		});
	}

	let recoveryOutcome: string | undefined;
	if (existing?.phase === "authorized") {
		validateCommandEvidenceIdentity(existing, projectRoot, homeRoot);
		const ownerRoot = join(homeRoot, ".claude");
		const journalPath = resolveHarnessTransactionPaths(
			ownerRoot,
			"claude",
		).journalPath;
		if (await pathExists(journalPath)) {
			const recoveryResult = await withOwnerRootTransaction(
				{
					ownerRoot,
					targetId: "claude",
					...(options.lockRunner ? { lockRunner: options.lockRunner } : {}),
				},
				async () => "recovered" as const,
			);
			assertConfirmedOwnerRootResult(recoveryResult);
			if (recoveryResult.state === "recovery-required") {
				if (
					recoveryResult.recovery.state !== "evidence-required" ||
					recoveryResult.recovery.transactionId !== existing.transactionId
				) {
					throw new Error(
						`Claude command recovery is ambiguous: ${JSON.stringify(recoveryResult.recovery)}.`,
					);
				}
				const installed = await makeInstalledCommandEvidence(
					existing,
					ownerRoot,
					"committed:evidence-required",
					(options.now ?? (() => new Date()))().toISOString(),
				);
				await persistAndReadCommandEvidence(evidencePath, installed);
				if (options.stopAfter === "installed") {
					throw new Error("injected stop after installed");
				}
				return finishClaudeCommandEvidence({
					...options,
					projectRoot,
					homeRoot,
					evidencePath,
					evidence: installed,
				});
			}
			recoveryOutcome = describeOwnerRootRecovery(recoveryResult.recovery);
		}
	}

	const timestamp = (options.now ?? (() => new Date()))().toISOString();
	const exportedAt = existing?.authorizedAt ?? timestamp;
	const prepared = await prepareClaudeCommandPair(
		projectRoot,
		homeRoot,
		true,
		exportedAt,
	);
	const ownerRoot = prepared[0].target.ownerRoot;
	const manifestPath = join(ownerRoot, ".cosmonauts-harness-manifest.json");
	const manifest = await readHarnessManifest(manifestPath);
	assertCommandManifestIsBootstrapReady(manifest, prepared);
	const oldManifest = await observeManifestSnapshot(manifestPath);
	const newManifestContents = serializeHarnessManifest({
		schemaVersion: 1,
		entries: {
			...manifest.entries,
			...Object.fromEntries(
				prepared.map((row) => [row.manifestKey, row.manifestEntry]),
			),
		},
	});
	const transactionId = existing?.transactionId ?? randomUUID();
	const authorized =
		existing ??
		makeAuthorizedCommandEvidence({
			projectRoot,
			homeRoot,
			transactionId,
			timestamp,
			newManifestContents,
			prepared,
		});
	await persistAndReadCommandEvidence(evidencePath, authorized);

	const transactionResult = await withOwnerRootTransaction(
		{
			ownerRoot,
			targetId: "claude",
			...(options.lockRunner ? { lockRunner: options.lockRunner } : {}),
		},
		async (transaction) => {
			await options.onTransactionLock?.();
			const lockedPrepared = await prepareClaudeCommandPair(
				projectRoot,
				homeRoot,
				false,
				exportedAt,
			);
			await assertLockedCommandPairMatchesEvidence(
				lockedPrepared,
				authorized,
				projectRoot,
				homeRoot,
			);
			const result = await applySyncPlanInTransaction(transaction, {
				oldManifest,
				newManifestContents,
				cleanupPolicy: "after-evidence",
				transactionId,
				members: lockedPrepared.map((row) => ({
					targetPath: row.target.targetPath,
					oldState: row.oldState,
					newState: row.newState,
					writeStage: (stagePath) => writeFile(stagePath, row.renderedBytes),
				})),
				onPhasePersisted: async (phase) => {
					await options.onPhasePersisted?.(phase);
					if (phase === options.stopAfter) {
						throw new Error(`injected stop after ${phase}`);
					}
					if (phase === "installing" && options.stopAfter === "rolling-back") {
						throw new Error("injected failure before rolling back");
					}
				},
			});
			if (result.state === "evidence-required") {
				try {
					await assertInstalledCommandPairMatchesEvidence(authorized, homeRoot);
				} catch (error) {
					throw new Error(
						"Installed Claude command verification is ambiguous; committed recovery state was preserved.",
						{ cause: error },
					);
				}
			}
			return result;
		},
	);
	assertConfirmedOwnerRootResult(transactionResult);
	if (transactionResult.state === "recovery-required") {
		throw new Error(
			`Claude command recovery is ambiguous: ${JSON.stringify(transactionResult.recovery)}.`,
		);
	}
	if (transactionResult.result.state !== "evidence-required") {
		throw new Error(
			transactionResult.result.state === "restored-old"
				? "Claude command transaction restored old command bytes."
				: `Claude command transaction did not reach evidence hold: ${JSON.stringify(transactionResult.result)}.`,
		);
	}
	const installed = await makeInstalledCommandEvidence(
		authorized,
		ownerRoot,
		recoveryOutcome ?? describeOwnerRootRecovery(transactionResult.recovery),
		(options.now ?? (() => new Date()))().toISOString(),
	);
	await persistAndReadCommandEvidence(evidencePath, installed);
	if (options.stopAfter === "installed") {
		throw new Error("injected stop after installed");
	}
	return finishClaudeCommandEvidence({
		...options,
		projectRoot,
		homeRoot,
		evidencePath,
		evidence: installed,
	});
}

async function assertCommandBootstrapPrerequisites(
	projectRoot: string,
): Promise<void> {
	const prerequisitePath = join(
		projectRoot,
		"missions/plans/harness-adapters/repo-export-validation-evidence.json",
	);
	let value: unknown;
	try {
		value = JSON.parse(await readFile(prerequisitePath, "utf8"));
	} catch (error) {
		throw new Error(
			`Project and personal-bundle evidence must be durable and complete before Claude command bootstrap: ${prerequisitePath}.`,
			{ cause: error },
		);
	}
	if (
		!isRecordValue(value) ||
		value.schemaVersion !== 1 ||
		value.phase !== "complete" ||
		!isRecordValue(value.externalBundle) ||
		value.externalBundle.phase !== "complete"
	) {
		throw new Error(
			"Project and personal-bundle evidence must be durable and complete before Claude command bootstrap.",
		);
	}
}

async function prepareClaudeCommandPair(
	projectRoot: string,
	homeRoot: string,
	createNativeSources: boolean,
	exportedAt: string,
): Promise<readonly [PreparedClaudeCommand, PreparedClaudeCommand]> {
	const livePaths = CLAUDE_COMMAND_BOOTSTRAP_SPECS.map((spec) =>
		join(homeRoot, ".claude", "commands", `${spec.name}.md`),
	);
	const nativePaths = CLAUDE_COMMAND_BOOTSTRAP_SPECS.map((spec) =>
		join(projectRoot, spec.nativeRelativePath),
	);
	const liveBytes = await Promise.all(livePaths.map((path) => readFile(path)));
	for (const bytes of liveBytes) assertClaudeCommandFrontmatter(bytes);

	const nativeExists = await Promise.all(nativePaths.map(pathExists));
	if (nativeExists.some(Boolean) && !nativeExists.every(Boolean)) {
		throw new Error(
			"Claude command native bootstrap is partial; pair equality cannot be established.",
		);
	}
	if (!nativeExists.some(Boolean)) {
		if (!createNativeSources) {
			throw new Error(
				"Claude command native sources are missing under the transaction lock.",
			);
		}
		for (let index = 0; index < nativePaths.length; index += 1) {
			await writeDurableFile(
				nativePaths[index] ?? "",
				liveBytes[index] ?? Buffer.alloc(0),
			);
		}
	}
	const nativeBytes = await Promise.all(
		nativePaths.map((path) => readFile(path)),
	);
	for (const bytes of nativeBytes) assertClaudeCommandFrontmatter(bytes);

	const rows: PreparedClaudeCommand[] = [];
	for (
		let index = 0;
		index < CLAUDE_COMMAND_BOOTSTRAP_SPECS.length;
		index += 1
	) {
		const spec = CLAUDE_COMMAND_BOOTSTRAP_SPECS[index];
		const live = liveBytes[index];
		const native = nativeBytes[index];
		if (!spec || !live || !native) {
			throw new Error("Claude command pair preparation is incomplete.");
		}
		const registered = getStaticHarnessAsset(spec.assetId);
		if (!registered || registered.kind !== "command") {
			throw new Error(
				`Fixed Claude command asset is not registered: ${spec.assetId}.`,
			);
		}
		const asset = { ...registered, sourceRoot: projectRoot };
		const target = resolveHarnessAssetTarget({
			targetId: "claude",
			asset,
			roots: { projectRoot, homeRoot },
			scope: "personal",
			requestedMode: "copy",
		});
		if (
			target.targetPath !== livePaths[index] ||
			resolve(projectRoot, asset.sourcePath) !== nativePaths[index]
		) {
			throw new Error(
				`Fixed Claude command path contract changed for ${spec.assetId}.`,
			);
		}
		const materialization = await prepareHarnessMaterialization({
			projectRoot,
			asset,
			target,
			mode: "copy",
		});
		const rendered = materialization.copyNodes[0];
		if (
			materialization.copyNodes.length !== 1 ||
			!rendered ||
			rendered.relativePath !== ""
		) {
			throw new Error(
				`Claude command render shape changed for ${spec.assetId}.`,
			);
		}
		const stripped = stripGeneratedByMarker(rendered.bytes);
		if (!live.equals(native) || !live.equals(stripped)) {
			throw new Error(
				`Claude command pair equality failed for ${spec.assetId}; live, native, and marker-stripped render bytes must match before either command moves.`,
			);
		}
		const desired = await syncHarnessAsset({
			projectRoot,
			asset,
			target,
			check: true,
			now: () => new Date(exportedAt),
		});
		const owner = await resolveAssetOwnerIdentity(asset, projectRoot);
		rows.push({
			spec,
			asset,
			target,
			liveBytes: live,
			nativeBytes: native,
			renderedBytes: rendered.bytes,
			strippedRenderedBytes: stripped,
			oldState: await observeHarnessNodeSnapshot(target.targetPath),
			newState: fileNodeSnapshot(rendered.bytes),
			manifestEntry: desired.manifestEntry,
			manifestKey: manifestEntryKey(owner, spec.assetId),
		});
	}
	return rows as unknown as readonly [
		PreparedClaudeCommand,
		PreparedClaudeCommand,
	];
}

function assertCommandManifestIsBootstrapReady(
	manifest: HarnessProvenanceManifest,
	prepared: readonly PreparedClaudeCommand[],
): void {
	for (const row of prepared) {
		if (manifest.entries[row.manifestKey]) {
			throw new Error(
				`Claude command ${row.spec.assetId} already has manifest provenance; ratified bootstrap cannot run again.`,
			);
		}
		const claim = Object.values(manifest.entries).find(
			(entry) => entry.outputPath === row.target.targetPath,
		);
		if (claim) {
			throw new Error(
				`Claude command output is already claimed by ${claim.assetId}: ${row.target.targetPath}.`,
			);
		}
	}
}

function makeAuthorizedCommandEvidence(options: {
	readonly projectRoot: string;
	readonly homeRoot: string;
	readonly transactionId: string;
	readonly timestamp: string;
	readonly newManifestContents: string;
	readonly prepared: readonly [PreparedClaudeCommand, PreparedClaudeCommand];
}): ClaudeCommandMigrationEvidence {
	const commands = options.prepared.map((row) => {
		const digest = sha256(row.liveBytes);
		return {
			assetId: row.spec.assetId,
			livePath: displayCommandPath(
				row.target.targetPath,
				options.projectRoot,
				options.homeRoot,
			),
			nativePath: displayCommandPath(
				resolve(options.projectRoot, row.asset.sourcePath),
				options.projectRoot,
				options.homeRoot,
			),
			outputPath: displayCommandPath(
				row.target.targetPath,
				options.projectRoot,
				options.homeRoot,
			),
			liveLength: row.liveBytes.length,
			nativeLength: row.nativeBytes.length,
			renderLength: row.strippedRenderedBytes.length,
			liveDigest: digest,
			nativeDigest: sha256(row.nativeBytes),
			renderDigest: sha256(row.strippedRenderedBytes),
			materializedDigest: sha256(row.renderedBytes),
			manifestKey: row.manifestKey,
			oldState: row.oldState,
			newState: row.newState,
		};
	}) as unknown as readonly [
		ClaudeCommandEvidenceRow,
		ClaudeCommandEvidenceRow,
	];
	return {
		schemaVersion: 1,
		authorizationKind: "ratified-live-bootstrap",
		phase: "authorized",
		transactionId: options.transactionId,
		ownerId: "authority:cosmonauts/core",
		ownerRoot: "~/.claude",
		target: "claude",
		scope: "personal",
		cleanupPolicy: "after-evidence",
		atomicSet: true,
		markerVersion: GENERATED_BY_MARKER_VERSION,
		newManifestDigest: sha256(options.newManifestContents),
		manifestKeys: [commands[0].manifestKey, commands[1].manifestKey],
		commands,
		authorizedAt: options.timestamp,
	};
}

async function makeInstalledCommandEvidence(
	evidence: ClaudeCommandMigrationEvidence,
	ownerRoot: string,
	recoveryOutcome: string,
	installedAt: string,
): Promise<ClaudeCommandMigrationEvidence> {
	const journalPath = resolveHarnessTransactionPaths(
		ownerRoot,
		"claude",
	).journalPath;
	const value: unknown = JSON.parse(await readFile(journalPath, "utf8"));
	if (
		!isOwnerRootJournal(value) ||
		value.transactionId !== evidence.transactionId ||
		value.phase !== "committed" ||
		value.cleanupPolicy !== "after-evidence" ||
		value.members.length !== 2 ||
		value.newManifest.kind !== "file" ||
		value.newManifest.digest !== evidence.newManifestDigest
	) {
		throw new Error(
			"Committed Claude command journal does not match evidence.",
		);
	}
	await assertInstalledCommandPairMatchesEvidence(evidence, dirname(ownerRoot));
	const commands = evidence.commands.map((row, index) => {
		const member = value.members[index];
		if (
			!member ||
			!nodeSnapshotsEqual(member.oldState, row.oldState) ||
			!nodeSnapshotsEqual(member.newState, row.newState)
		) {
			throw new Error(
				"Committed Claude command member does not match evidence.",
			);
		}
		return {
			...row,
			finalLength: row.liveLength,
			finalDigest: row.liveDigest,
			backupPath: displayCommandHomePath(member.backupPath, dirname(ownerRoot)),
		};
	}) as unknown as readonly [
		ClaudeCommandEvidenceRow,
		ClaudeCommandEvidenceRow,
	];
	return {
		...evidence,
		phase: "installed",
		commands,
		recoveryOutcome,
		installedAt,
	};
}

async function finishClaudeCommandEvidence(options: {
	readonly projectRoot: string;
	readonly homeRoot: string;
	readonly evidencePath: string;
	readonly evidence: ClaudeCommandMigrationEvidence;
	readonly now?: () => Date;
	readonly stopAfter?: ClaudeCommandBootstrapStop;
	readonly lockRunner?: NonNullable<
		WithOwnerRootTransactionOptions["lockRunner"]
	>;
}): Promise<ClaudeCommandMigrationEvidence> {
	validateCommandEvidenceIdentity(
		options.evidence,
		options.projectRoot,
		options.homeRoot,
	);
	await assertInstalledCommandPairMatchesEvidence(
		options.evidence,
		options.homeRoot,
	);
	const installedRaw = await readFile(options.evidencePath, "utf8");
	const receipt =
		options.evidence.phase === "installed"
			? {
					transactionId: options.evidence.transactionId,
					evidencePath: options.evidencePath,
					evidenceDigest: sha256(installedRaw),
				}
			: options.evidence.receipt;
	const ownerRoot = join(options.homeRoot, ".claude");
	const result = await withOwnerRootTransaction(
		{
			ownerRoot,
			targetId: "claude",
			...(receipt && options.evidence.phase === "installed"
				? { evidenceReceipt: receipt }
				: {}),
			...(options.lockRunner ? { lockRunner: options.lockRunner } : {}),
		},
		async (transaction) => {
			let current = options.evidence;
			if (current.phase === "installed") {
				const checkRows = await runClaudeCommandSelectedCheck(
					options.projectRoot,
					options.homeRoot,
				);
				if (
					checkRows.some(
						(row) => row.exitCode !== 0 || row.reason !== "current",
					)
				) {
					throw new Error(
						`Claude command selected check did not reach zero: ${JSON.stringify(checkRows)}.`,
					);
				}
				const timestamp = (options.now ?? (() => new Date()))().toISOString();
				current = {
					...current,
					phase: "checked",
					receipt,
					checkRows,
					checkedAt: timestamp,
				};
				await persistAndReadCommandEvidence(options.evidencePath, current);
				if (options.stopAfter === "checked") {
					throw new Error("injected stop after checked");
				}
			}

			const commands: ClaudeCommandEvidenceRow[] = [];
			for (let index = 0; index < current.commands.length; index += 1) {
				const row = current.commands[index];
				if (!row) throw new Error("Claude command evidence row is missing.");
				const backupPath = commandBackupPath(
					ownerRoot,
					current.transactionId,
					index,
				);
				const backup = await observeHarnessNodeSnapshot(backupPath);
				if (backup.kind !== "absent") {
					if (!nodeSnapshotsEqual(backup, row.oldState)) {
						throw new Error(
							`Retained Claude command backup is ambiguous: ${backupPath}.`,
						);
					}
					await revalidateBeforeSiblingMutation(transaction, backupPath);
					await rm(backupPath, { recursive: true, force: true });
				}
				commands.push({ ...row, backupExit: "removed-exact" });
			}
			await syncDirectory(
				dirname(commandBackupPath(ownerRoot, current.transactionId, 0)),
			);
			current = {
				...current,
				commands: commands as unknown as readonly [
					ClaudeCommandEvidenceRow,
					ClaudeCommandEvidenceRow,
				],
			};
			await persistAndReadCommandEvidence(options.evidencePath, current);
			if (options.stopAfter === "backup-cleanup") {
				throw new Error("injected stop after backup cleanup");
			}
			const timestamp = (options.now ?? (() => new Date()))().toISOString();
			const complete = {
				...current,
				phase: "complete",
				completedAt: timestamp,
			} as const satisfies ClaudeCommandMigrationEvidence;
			return persistAndReadCommandEvidence(options.evidencePath, complete);
		},
	);
	assertConfirmedOwnerRootResult(result);
	if (result.state !== "completed") {
		throw new Error(
			`Cannot finalize Claude command evidence: ${JSON.stringify(result)}.`,
		);
	}
	return result.result;
}

async function runClaudeCommandSelectedCheck(
	projectRoot: string,
	homeRoot: string,
): Promise<readonly [ClaudeCommandCheckRow, ClaudeCommandCheckRow]> {
	const rows: ClaudeCommandCheckRow[] = [];
	for (const spec of CLAUDE_COMMAND_BOOTSTRAP_SPECS) {
		const registered = getStaticHarnessAsset(spec.assetId);
		if (!registered) throw new Error(`Missing command asset: ${spec.assetId}.`);
		const asset = { ...registered, sourceRoot: projectRoot };
		const target = resolveHarnessAssetTarget({
			targetId: "claude",
			asset,
			roots: { projectRoot, homeRoot },
			scope: "personal",
			requestedMode: "copy",
		});
		const result = await syncHarnessAsset({
			projectRoot,
			asset,
			target,
			check: true,
		});
		rows.push({
			assetId: spec.assetId,
			targetPath: displayCommandPath(target.targetPath, projectRoot, homeRoot),
			exitCode: result.exitCode,
			beforeStatus: result.beforeStatus,
			reason: result.reason,
		});
	}
	return rows as unknown as readonly [
		ClaudeCommandCheckRow,
		ClaudeCommandCheckRow,
	];
}

async function assertLockedCommandPairMatchesEvidence(
	prepared: readonly PreparedClaudeCommand[],
	evidence: ClaudeCommandMigrationEvidence,
	projectRoot: string,
	homeRoot: string,
): Promise<void> {
	const reread = await Promise.all(
		CLAUDE_COMMAND_BOOTSTRAP_SPECS.flatMap((spec) => [
			readFile(join(homeRoot, ".claude", "commands", `${spec.name}.md`)),
			readFile(join(projectRoot, spec.nativeRelativePath)),
		]),
	);
	for (let index = 0; index < prepared.length; index += 1) {
		const row = prepared[index];
		const expected = evidence.commands[index];
		const rereadLive = reread[index * 2];
		const rereadNative = reread[index * 2 + 1];
		if (
			!row ||
			!expected ||
			!rereadLive ||
			!rereadNative ||
			row.spec.assetId !== expected.assetId ||
			!rereadLive.equals(row.liveBytes) ||
			!rereadNative.equals(row.nativeBytes) ||
			sha256(row.liveBytes) !== expected.liveDigest ||
			sha256(row.nativeBytes) !== expected.nativeDigest ||
			sha256(row.strippedRenderedBytes) !== expected.renderDigest
		) {
			throw new Error(
				"Claude command pair equality changed under the personal Claude transaction lock; no command was moved.",
			);
		}
	}
}

async function assertInstalledCommandPairMatchesEvidence(
	evidence: ClaudeCommandMigrationEvidence,
	homeRoot: string,
): Promise<void> {
	for (
		let index = 0;
		index < CLAUDE_COMMAND_BOOTSTRAP_SPECS.length;
		index += 1
	) {
		const spec = CLAUDE_COMMAND_BOOTSTRAP_SPECS[index];
		const row = evidence.commands[index];
		if (!spec || !row || row.assetId !== spec.assetId) {
			throw new Error("Claude command evidence pair identity is invalid.");
		}
		const final = await readFile(
			join(homeRoot, ".claude", "commands", `${spec.name}.md`),
		);
		const stripped = stripGeneratedByMarker(final);
		if (
			sha256(stripped) !== row.liveDigest ||
			stripped.length !== row.liveLength ||
			sha256(final) !== row.materializedDigest
		) {
			throw new Error(
				`Installed Claude command bytes are ambiguous for ${spec.assetId}; pending evidence and backups were preserved.`,
			);
		}
	}
}

async function validateCompleteCommandEvidence(
	evidence: ClaudeCommandMigrationEvidence,
	projectRoot: string,
	homeRoot: string,
): Promise<void> {
	validateCommandEvidenceIdentity(evidence, projectRoot, homeRoot);
	if (
		!evidence.receipt ||
		!evidence.checkRows ||
		evidence.checkRows.some(
			(row) => row.exitCode !== 0 || row.reason !== "current",
		) ||
		evidence.commands.some((row) => row.backupExit !== "removed-exact")
	) {
		throw new Error(
			"Complete Claude command evidence is missing receipt, check, or cleanup proof.",
		);
	}
	await assertInstalledCommandPairMatchesEvidence(evidence, homeRoot);
	for (let index = 0; index < evidence.commands.length; index += 1) {
		const native = await readFile(
			join(
				projectRoot,
				CLAUDE_COMMAND_BOOTSTRAP_SPECS[index]?.nativeRelativePath ?? "",
			),
		);
		if (sha256(native) !== evidence.commands[index]?.nativeDigest) {
			throw new Error(
				"Complete Claude command native bytes no longer match evidence.",
			);
		}
		if (
			(
				await observeHarnessNodeSnapshot(
					commandBackupPath(
						join(homeRoot, ".claude"),
						evidence.transactionId,
						index,
					),
				)
			).kind !== "absent"
		) {
			throw new Error(
				"Complete Claude command evidence still has a retained backup.",
			);
		}
	}
}

function validateCommandEvidenceIdentity(
	evidence: ClaudeCommandMigrationEvidence,
	projectRoot: string,
	homeRoot: string,
): void {
	if (
		evidence.schemaVersion !== 1 ||
		evidence.authorizationKind !== "ratified-live-bootstrap" ||
		evidence.ownerId !== "authority:cosmonauts/core" ||
		evidence.ownerRoot !== "~/.claude" ||
		evidence.target !== "claude" ||
		evidence.scope !== "personal" ||
		evidence.cleanupPolicy !== "after-evidence" ||
		evidence.atomicSet !== true ||
		evidence.markerVersion !== GENERATED_BY_MARKER_VERSION ||
		evidence.commands.length !== 2
	) {
		throw new Error("Claude command migration evidence identity is invalid.");
	}
	for (
		let index = 0;
		index < CLAUDE_COMMAND_BOOTSTRAP_SPECS.length;
		index += 1
	) {
		const spec = CLAUDE_COMMAND_BOOTSTRAP_SPECS[index];
		const row = evidence.commands[index];
		if (
			!spec ||
			!row ||
			row.assetId !== spec.assetId ||
			row.livePath !== `~/.claude/commands/${spec.name}.md` ||
			row.outputPath !== row.livePath ||
			row.nativePath !== spec.nativeRelativePath ||
			row.liveDigest !== row.nativeDigest ||
			row.liveDigest !== row.renderDigest ||
			row.liveLength !== row.nativeLength ||
			row.liveLength !== row.renderLength ||
			(evidence.phase !== "authorized" &&
				(row.finalDigest !== row.liveDigest ||
					row.finalLength !== row.liveLength ||
					row.backupPath !==
						`~/.cosmonauts-harness-claude-${evidence.transactionId}-${index}.backup`)) ||
			evidence.manifestKeys[index] !== row.manifestKey ||
			resolve(projectRoot, row.nativePath) !==
				join(projectRoot, spec.nativeRelativePath) ||
			join(homeRoot, row.livePath.slice(2)) !==
				join(homeRoot, ".claude", "commands", `${spec.name}.md`)
		) {
			throw new Error(
				"Claude command migration evidence path identity is invalid.",
			);
		}
	}
}

async function readCommandMigrationEvidence(
	path: string,
): Promise<ClaudeCommandMigrationEvidence | undefined> {
	let value: unknown;
	try {
		value = JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return undefined;
		throw new Error(`Cannot read Claude command migration evidence: ${path}.`, {
			cause: error,
		});
	}
	if (
		!isRecordValue(value) ||
		value.schemaVersion !== 1 ||
		value.authorizationKind !== "ratified-live-bootstrap" ||
		!(["authorized", "installed", "checked", "complete"] as const).includes(
			value.phase as ClaudeCommandEvidencePhase,
		) ||
		!Array.isArray(value.commands) ||
		value.commands.length !== 2
	) {
		throw new Error(`Malformed Claude command migration evidence: ${path}.`);
	}
	return value as unknown as ClaudeCommandMigrationEvidence;
}

async function persistAndReadCommandEvidence(
	path: string,
	evidence: ClaudeCommandMigrationEvidence,
): Promise<ClaudeCommandMigrationEvidence> {
	const raw = `${JSON.stringify(evidence, null, "\t")}\n`;
	await writeDurableFile(path, raw);
	const reread = await readFile(path, "utf8");
	if (reread !== raw) {
		throw new Error(`Claude command evidence durable re-read failed: ${path}.`);
	}
	const parsed = await readCommandMigrationEvidence(path);
	if (!parsed || JSON.stringify(parsed) !== JSON.stringify(evidence)) {
		throw new Error(
			`Claude command evidence semantic re-read failed: ${path}.`,
		);
	}
	return parsed;
}

function commandBackupPath(
	ownerRoot: string,
	transactionId: string,
	index: number,
): string {
	const journalPath = resolveHarnessTransactionPaths(
		ownerRoot,
		"claude",
	).journalPath;
	const stem = `${basename(journalPath, ".journal.json")}-${transactionId}-${index}`;
	return join(dirname(journalPath), `${stem}.backup`);
}

function displayCommandPath(
	path: string,
	projectRoot: string,
	homeRoot: string,
): string {
	const absolute = resolve(path);
	const projectRelative = relative(projectRoot, absolute);
	if (
		projectRelative !== "" &&
		!projectRelative.startsWith(`..${sep}`) &&
		projectRelative !== ".." &&
		!isAbsolute(projectRelative)
	) {
		return projectRelative.split(sep).join("/");
	}
	const homeRelative = relative(homeRoot, absolute);
	if (
		homeRelative !== "" &&
		!homeRelative.startsWith(`..${sep}`) &&
		homeRelative !== ".." &&
		!isAbsolute(homeRelative)
	) {
		return `~/${homeRelative.split(sep).join("/")}`;
	}
	throw new Error(
		`Claude command evidence path is outside fixed roots: ${path}.`,
	);
}

function displayCommandHomePath(path: string, homeRoot: string): string {
	const homeRelative = relative(homeRoot, resolve(path));
	if (
		homeRelative === "" ||
		homeRelative.startsWith(`..${sep}`) ||
		homeRelative === ".." ||
		isAbsolute(homeRelative)
	) {
		throw new Error(
			`Claude command evidence path is outside the fixed home root: ${path}.`,
		);
	}
	return `~/${homeRelative.split(sep).join("/")}`;
}

function fileNodeSnapshot(bytes: Uint8Array): HarnessNodeSnapshot {
	return {
		kind: "file",
		digest: sha256(Buffer.concat([Buffer.from("file\0"), Buffer.from(bytes)])),
	};
}

function describeOwnerRootRecovery(recovery: OwnerRootRecoveryResult): string {
	return recovery.state === "none"
		? "none"
		: recovery.state === "restored-old"
			? `restored-old:${recovery.phase}`
			: recovery.state === "committed-new"
				? `committed-new:${recovery.phase}`
				: recovery.state;
}

function assertConfirmedOwnerRootResult<T>(
	result: OwnerRootTransactionResult<T>,
): asserts result is Exclude<
	OwnerRootTransactionResult<T>,
	{ readonly state: "lock-contended" | "persisted-release-unconfirmed" }
> {
	if (result.state === "lock-contended") {
		throw new Error(
			`Claude command transaction lock contended at ${result.lockPath}.`,
		);
	}
	if (result.state === "persisted-release-unconfirmed") {
		throw new Error(
			`Claude command transaction release is unconfirmed: ${errorMessage(result.error)}.`,
		);
	}
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
			readonly state: "local-edit-conflict";
			readonly transactionId: string;
			readonly targetPaths: readonly string[];
	  }
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
	const changedTargetPaths = (
		await Promise.all(
			members.map(async (member) => ({
				member,
				matches: nodeSnapshotsEqual(
					await observeHarnessNodeSnapshot(member.targetPath),
					member.oldState,
				),
			})),
		)
	)
		.filter(({ matches }) => !matches)
		.map(({ member }) => member.targetPath);
	if (changedTargetPaths.length > 0) {
		return {
			state: "local-edit-conflict",
			transactionId,
			targetPaths: changedTargetPaths,
		};
	}

	try {
		await persistJournal(transaction, journal);
		await options.onPhasePersisted?.("prepared", journal);
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
	} catch (error) {
		let persistedJournal: OwnerRootTransactionJournal;
		try {
			persistedJournal = parseOwnerRootJournal(
				await readFile(transaction.journalPath, "utf8"),
				transaction,
			);
		} catch (journalError) {
			return {
				state: "ambiguous",
				transactionId,
				reason: `transaction-failed-journal-unreadable:${errorMessage(journalError)}`,
			};
		}
		if (persistedJournal.transactionId !== transactionId) {
			return {
				state: "ambiguous",
				transactionId,
				reason: "transaction-failed-journal-changed",
			};
		}
		if (
			persistedJournal.phase === "commit-ready" ||
			persistedJournal.phase === "committed"
		) {
			return {
				state: "ambiguous",
				transactionId,
				reason: `${persistedJournal.phase}-recovery-required:${errorMessage(error)}`,
			};
		}
		journal = { ...persistedJournal, phase: "rolling-back" };
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
					row.target.matchesOld &&
					row.backup.isAbsent &&
					(row.stage.matchesNew || row.stage.isAbsent),
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

interface ObservedNodeRelation {
	readonly matchesOld: boolean;
	readonly matchesNew: boolean;
	readonly isAbsent: boolean;
	readonly isOther: boolean;
}

interface ObservedJournalMember {
	readonly target: ObservedNodeRelation;
	readonly backup: ObservedNodeRelation;
	readonly stage: ObservedNodeRelation;
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
			target: classifyNodeRelations(
				await observeHarnessNodeSnapshot(member.targetPath),
				member.oldState,
				member.newState,
			),
			backup: classifyNodeRelations(
				await observeHarnessNodeSnapshot(member.backupPath),
				member.oldState,
				{ kind: "absent" },
			),
			stage: classifyNodeRelations(
				await observeHarnessNodeSnapshot(member.stagePath),
				{ kind: "absent" },
				member.newState,
			),
		})),
	);
	return {
		manifest,
		members,
		hasOther: members.some(
			(row) => row.target.isOther || row.backup.isOther || row.stage.isOther,
		),
	};
}

function classifyNodeRelations(
	actual: HarnessNodeSnapshot,
	oldState: HarnessNodeSnapshot,
	newState: HarnessNodeSnapshot,
): ObservedNodeRelation {
	const matchesOld = nodeSnapshotsEqual(actual, oldState);
	const matchesNew = nodeSnapshotsEqual(actual, newState);
	const isAbsent = actual.kind === "absent";
	return {
		matchesOld,
		matchesNew,
		isAbsent,
		isOther: !matchesOld && !matchesNew && !isAbsent,
	};
}

function installingVectorCanRollback(
	journal: OwnerRootTransactionJournal,
	rows: readonly ObservedJournalMember[],
): boolean {
	return rows.every((row, index) => {
		const member = journal.members[index];
		if (!member || (!row.stage.matchesNew && !row.stage.isAbsent)) return false;
		if (member.oldState.kind === "absent") {
			return (
				(row.target.matchesOld || row.target.matchesNew) && row.backup.isAbsent
			);
		}
		return (
			(row.target.matchesOld && row.backup.isAbsent) ||
			((row.target.isAbsent || row.target.matchesNew) && row.backup.matchesOld)
		);
	});
}

function commitVectorIsNew(rows: readonly ObservedJournalMember[]): boolean {
	return rows.every(
		(row) =>
			row.target.matchesNew &&
			(row.backup.matchesOld || row.backup.isAbsent) &&
			row.stage.isAbsent,
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
			row.target.matchesNew &&
			row.stage.isAbsent &&
			(member.oldState.kind === "absent"
				? row.backup.isAbsent
				: row.backup.matchesOld)
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
				(row.target.matchesOld || row.target.matchesNew) && row.backup.isAbsent
			);
		}
		return (
			(row.target.matchesOld &&
				(row.backup.matchesOld || row.backup.isAbsent)) ||
			((row.target.matchesNew || row.target.isAbsent) && row.backup.matchesOld)
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
			if (row.target.matchesNew && !row.target.matchesOld)
				await removeExactTarget(
					transaction,
					member.targetPath,
					member.newState,
				);
		} else if (!row.target.matchesOld) {
			if (row.target.matchesNew) {
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
		isNodeSnapshot(value.newState)
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

async function writeDurableFile(
	path: string,
	contents: string | Uint8Array,
): Promise<void> {
	const directory = dirname(path);
	await mkdir(directory, { recursive: true });
	const temporary = join(
		directory,
		`.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
	);
	const handle = await open(temporary, "wx", 0o600);
	try {
		if (typeof contents === "string") {
			await handle.writeFile(contents, "utf8");
		} else {
			await handle.writeFile(contents);
		}
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
		if (
			options.sourceHealth.find(
				(row) => row.sourceRootId === entry.sourceRootId,
			)?.status === "incomplete"
		) {
			rows.push(
				makeRow(context, "source-ahead", "inventory-incomplete", "none"),
			);
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
