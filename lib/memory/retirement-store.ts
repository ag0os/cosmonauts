import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, readFile, realpath } from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import {
	EntityFileLockTimeoutError,
	withEntityFileLock,
} from "../entity-file-lock.ts";
import {
	createDurableRetirementFiles,
	DurableRemovalUnsupportedError,
	type DurableRetirementFiles,
} from "./durable-files.ts";
import {
	consolidationEvidenceKey,
	isSafePosixRelativePath,
} from "./path-safety.ts";
import {
	type RetirementReceiptInventory,
	readRetirementReceiptInventory,
} from "./retirement-receipts.ts";
import type {
	ConsolidationEvidenceRef,
	LivingMemoryRestorationResult,
	LivingMemoryRestorationStore,
	LivingMemoryRetirementCandidate,
	LivingMemoryRetirementRunDetails,
	LivingMemoryRetirementRunResult,
	LivingMemoryRetirementStore,
	MemoryWarning,
} from "./types.ts";

const LOCK_PATH = ".cosmonauts/living-memory.lock";
const JOURNAL_PATH = ".cosmonauts/living-memory-retirement.json";
const RETIREMENTS_PATH = "memory/agent/retirements";

export const LIVING_MEMORY_RETIREMENT_FAILPOINTS = [
	"after-journal-sync",
	"after-retired-link-sync",
	"after-manifest-sync",
	"after-live-tombstone-sync",
	"after-live-unlink-sync",
	"before-journal-remove",
] as const;

export type LivingMemoryRetirementFailpoint =
	(typeof LIVING_MEMORY_RETIREMENT_FAILPOINTS)[number];

interface CitationInventory {
	readonly healthy: boolean;
	readonly entries: readonly {
		readonly scope: "project" | "user";
		readonly path: string;
		readonly digest: string;
		readonly targets: readonly string[];
	}[];
	readonly warnings: readonly MemoryWarning[];
}

interface RetirementStoreOptions {
	readonly projectRoot: string;
	readonly userCosmonautsRoot?: string;
	readonly durableFiles?: DurableRetirementFiles;
	readonly inspectCitations?: () => Promise<CitationInventory>;
	readonly withLock?: typeof withEntityFileLock;
	readonly failpoint?: (
		point: LivingMemoryRetirementFailpoint,
	) => void | Promise<void>;
}

interface PreparedRetirement {
	readonly id: string;
	readonly originalPath: string;
	readonly retiredPath: string;
	readonly tombstonePath: string;
	readonly digest: string;
	readonly reason: LivingMemoryRetirementCandidate["reason"];
	readonly evidence: readonly ConsolidationEvidenceRef[];
	readonly evidenceReason: string;
	readonly date: string;
}

interface RetirementJournal {
	readonly schemaVersion: 1;
	readonly state: "prepared";
	readonly round: number;
	readonly manifestPath: string;
	readonly manifestContent: string;
	readonly entries: readonly PreparedRetirement[];
}

class RetirementUnlinkConflictError extends Error {
	readonly path: string;

	constructor(path: string, reason: string) {
		super(`Retirement unlink conflict for ${path}: ${reason}.`);
		this.name = "RetirementUnlinkConflictError";
		this.path = path;
	}
}

export function createLivingMemoryRetirementStore(
	options: RetirementStoreOptions,
): LivingMemoryRetirementStore & LivingMemoryRestorationStore {
	const projectRoot = resolve(options.projectRoot);
	const durableFiles = options.durableFiles ?? createDurableRetirementFiles();
	const lock = options.withLock ?? withEntityFileLock;
	const inspectCitations =
		options.inspectCitations ??
		(async () => {
			const { inspectLivingMemoryCitationInventory } = await import(
				"./living-memory.ts"
			);
			return inspectLivingMemoryCitationInventory({
				projectRoot,
				...(options.userCosmonautsRoot === undefined
					? {}
					: { userCosmonautsRoot: options.userCosmonautsRoot }),
			});
		});

	return {
		async inspect(records, inspectOptions = {}) {
			return inspectRetirementState({
				projectRoot,
				records,
				lockHeld: inspectOptions.lockHeld ?? false,
			});
		},
		async apply(input) {
			if (input.dryRun) {
				return previewRetirements({
					projectRoot,
					candidates: input.candidates,
					maxRetirements: input.maxRetirements,
					inspectCitations,
				});
			}

			let releaseReported = false;
			let releaseUnconfirmed: unknown;
			let result: LivingMemoryRetirementRunResult;
			try {
				await durableFiles.ensureDirectory(join(projectRoot, ".cosmonauts"));
				const action = () =>
					applyUnderLock({
						projectRoot,
						durableFiles,
						candidates: input.candidates,
						date: canonicalDate(input.date),
						maxRetirements: input.maxRetirements,
						inspectCitations,
						...(input.signal === undefined ? {} : { signal: input.signal }),
						...(options.failpoint === undefined
							? {}
							: { failpoint: options.failpoint }),
					});
				result = input.lockHeld
					? await action()
					: await lock(join(projectRoot, ...LOCK_PATH.split("/")), action, {
							retryDelayMs: input.lockOptions.retryMs,
							waitTimeoutMs: input.lockOptions.timeoutMs,
							onReleaseUnconfirmed(error) {
								releaseReported = true;
								releaseUnconfirmed = error;
								input.lockOptions.onReleaseUnconfirmed(error);
							},
						});
			} catch (error: unknown) {
				return failedResult({
					reason: error instanceof Error ? error.message : String(error),
					recovery:
						error instanceof EntityFileLockTimeoutError
							? "concurrent-mutation"
							: "none",
					warnings: [],
				});
			}
			if (releaseReported) {
				return {
					kind: "failed",
					reason: `Living-memory lock release could not be confirmed: ${
						releaseUnconfirmed instanceof Error
							? releaseUnconfirmed.message
							: String(releaseUnconfirmed)
					}.`,
					details: {
						...result.details,
						recovery: "release-unconfirmed",
					},
				};
			}
			return result;
		},
		async restore(input) {
			let releaseUnconfirmed: unknown;
			let result: LivingMemoryRestorationResult;
			try {
				if (
					!Number.isFinite(input.lockOptions.retryMs) ||
					input.lockOptions.retryMs <= 0 ||
					!Number.isFinite(input.lockOptions.timeoutMs) ||
					input.lockOptions.timeoutMs <= 0
				) {
					throw new Error("Living-memory restoration requires a finite lock.");
				}
				if (!isSafeKnowledgePath(input.path)) {
					throw new Error(`Unsafe restoration path: ${input.path}.`);
				}
				if (input.reason.trim() !== input.reason || input.reason.length === 0) {
					throw new Error(
						"Living-memory restoration reason must be non-empty.",
					);
				}
				const date = canonicalDate(input.date);
				throwIfAborted(input.signal);
				await durableFiles.ensureDirectory(join(projectRoot, ".cosmonauts"));
				result = await lock(
					join(projectRoot, ...LOCK_PATH.split("/")),
					async () =>
						restoreUnderLock({
							projectRoot,
							durableFiles,
							path: input.path,
							reason: input.reason,
							date,
							...(input.signal === undefined ? {} : { signal: input.signal }),
						}),
					{
						retryDelayMs: input.lockOptions.retryMs,
						waitTimeoutMs: input.lockOptions.timeoutMs,
						onReleaseUnconfirmed(error) {
							releaseUnconfirmed = error;
							input.lockOptions.onReleaseUnconfirmed(error);
						},
					},
				);
			} catch (error: unknown) {
				return restorationFailed({
					path: input.path,
					reason: error instanceof Error ? error.message : String(error),
					recovery:
						error instanceof EntityFileLockTimeoutError
							? "concurrent-mutation"
							: "none",
				});
			}
			if (releaseUnconfirmed !== undefined) {
				return restorationFailed({
					path: input.path,
					reason: `Living-memory lock release could not be confirmed after restoration: ${
						releaseUnconfirmed instanceof Error
							? releaseUnconfirmed.message
							: String(releaseUnconfirmed)
					}.`,
					recovery: "release-unconfirmed",
					writesCommitted: result.details.writesCommitted,
					...(result.details.digest === undefined
						? {}
						: { digest: result.details.digest }),
					...(result.details.manifestPath === undefined
						? {}
						: { manifestPath: result.details.manifestPath }),
				});
			}
			return result;
		},
	};
}

async function restoreUnderLock(options: {
	readonly projectRoot: string;
	readonly durableFiles: DurableRetirementFiles;
	readonly path: string;
	readonly reason: string;
	readonly date: string;
	readonly signal?: AbortSignal;
}): Promise<LivingMemoryRestorationResult> {
	throwIfAborted(options.signal);
	const receipts = await readRetirementReceiptInventory({
		projectRoot: options.projectRoot,
	});
	if (receipts.kind !== "healthy") {
		throw new Error(
			`Retirement receipt inventory is unhealthy: ${receipts.issues.join(", ")}.`,
		);
	}
	const state = latestStateForPath(receipts.inventory, options.path);
	if (state === undefined) {
		throw new Error(
			`No retirement history exists for restoration path: ${options.path}.`,
		);
	}
	const livePath = absolutePath(options.projectRoot, options.path);
	const retiredPath = absolutePath(
		options.projectRoot,
		deriveRetiredPath(options.path),
	);
	const [live, retired] = await Promise.all([
		readRegularBytes(livePath, options.projectRoot),
		readRegularBytes(retiredPath, options.projectRoot),
	]);
	if (live === undefined) {
		throw new Error(
			`Restoration requires the human-moved live path: ${options.path}.`,
		);
	}
	if (sha256(live) !== state.digest) {
		throw new Error(
			`Restoration digest conflict for ${options.path}; live bytes do not match the active retirement digest.`,
		);
	}
	if (retired !== undefined) {
		throw new Error(
			`Restoration destination conflict for ${options.path}; the retired path must be absent after the human move.`,
		);
	}

	if (state.status === "restored") {
		const event = receipts.inventory.retirementEvents.find(
			(candidate) =>
				candidate.kind === "restored" &&
				candidate.round === state.round &&
				candidate.retirementId === state.id,
		);
		if (event?.kind !== "restored" || event.reason !== options.reason) {
			throw new Error(
				`Living-memory restoration conflict for ${options.path}.`,
			);
		}
		return {
			kind: "completed",
			details: {
				path: options.path,
				digest: state.digest,
				status: "existing",
				manifestPath: absolutePath(
					options.projectRoot,
					`${RETIREMENTS_PATH}/round-${state.round}.md`,
				),
				recovery: "none",
				writesCommitted: false,
			},
		};
	}

	const round = nextRound(receipts.inventory);
	const manifestRelativePath = `${RETIREMENTS_PATH}/round-${round}.md`;
	const manifestPath = absolutePath(options.projectRoot, manifestRelativePath);
	await options.durableFiles.ensureDirectory(
		absolutePath(options.projectRoot, RETIREMENTS_PATH),
	);
	await assertRealContainedDirectory(
		options.projectRoot,
		absolutePath(options.projectRoot, RETIREMENTS_PATH),
	);
	throwIfAborted(options.signal);
	const [confirmedLive, confirmedRetired] = await Promise.all([
		readRegularBytes(livePath, options.projectRoot),
		readRegularBytes(retiredPath, options.projectRoot),
	]);
	if (confirmedLive === undefined || sha256(confirmedLive) !== state.digest) {
		throw new Error(
			`Restoration race detected for ${options.path}; live bytes changed before the receipt commit.`,
		);
	}
	if (confirmedRetired !== undefined) {
		throw new Error(
			`Restoration race detected for ${options.path}; the retired path reappeared before the receipt commit.`,
		);
	}
	await options.durableFiles.writeText({
		path: manifestPath,
		content: renderRestorationManifest({
			round,
			retirementId: state.id,
			path: options.path,
			digest: state.digest,
			reason: options.reason,
			date: options.date,
		}),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	return {
		kind: "completed",
		details: {
			path: options.path,
			digest: state.digest,
			status: "restored",
			manifestPath,
			recovery: "none",
			writesCommitted: true,
		},
	};
}

function renderRestorationManifest(options: {
	readonly round: number;
	readonly retirementId: string;
	readonly path: string;
	readonly digest: string;
	readonly reason: string;
	readonly date: string;
}): string {
	return [
		"---",
		"kind: knowledge-retirement-round",
		`round: ${options.round}`,
		"events:",
		"  - kind: restored",
		`    retirementId: ${options.retirementId}`,
		`    path: ${options.path}`,
		`    digest: ${options.digest}`,
		`    reason: ${JSON.stringify(options.reason)}`,
		`    date: ${JSON.stringify(options.date)}`,
		"---",
		"",
		"# Living-memory restoration round",
		"",
	].join("\n");
}

function restorationFailed(options: {
	readonly path: string;
	readonly reason: string;
	readonly recovery: "none" | "release-unconfirmed" | "concurrent-mutation";
	readonly writesCommitted?: boolean;
	readonly digest?: string;
	readonly manifestPath?: string;
}): LivingMemoryRestorationResult {
	return {
		kind: "failed",
		reason: options.reason,
		details: {
			path: options.path,
			...(options.digest === undefined ? {} : { digest: options.digest }),
			...(options.manifestPath === undefined
				? {}
				: { manifestPath: options.manifestPath }),
			recovery: options.recovery,
			writesCommitted: options.writesCommitted ?? false,
		},
	};
}

async function previewRetirements(options: {
	readonly projectRoot: string;
	readonly candidates: readonly LivingMemoryRetirementCandidate[];
	readonly maxRetirements: number;
	readonly inspectCitations: () => Promise<CitationInventory>;
}): Promise<LivingMemoryRetirementRunResult> {
	if (
		!Number.isSafeInteger(options.maxRetirements) ||
		options.maxRetirements < 1
	) {
		return failedResult({
			reason: "Retirement preview requires a positive bounded cap.",
			recovery: "none",
			warnings: [],
		});
	}
	const candidates = options.candidates.slice(0, options.maxRetirements);
	const deferred = options.candidates.slice(options.maxRetirements);
	const records = candidates.map((candidate) => candidate.record);
	const before = await inspectRetirementState({
		projectRoot: options.projectRoot,
		records,
	});
	if (before.recovery !== "none") {
		return {
			kind: "failed",
			reason:
				"Dry-run observes retirement state but never acquires a lock or performs recovery.",
			details: {
				retirements: [],
				declines: [
					{
						code:
							before.recovery === "pending"
								? "recovery-pending"
								: "concurrent-mutation",
						reason:
							"Dry-run observes retirement state but never acquires a lock or performs recovery.",
					},
				],
				warnings: before.warnings,
				recovery: before.recovery,
				writesCommitted: false,
			},
		};
	}
	const [citationsBefore, receiptsBefore] = await Promise.all([
		options.inspectCitations(),
		readRetirementReceiptInventory({ projectRoot: options.projectRoot }),
	]);
	const authorized = await authorizeCandidates({
		projectRoot: options.projectRoot,
		candidates,
		inspectCitations: options.inspectCitations,
		citations: citationsBefore,
		receipts: receiptsBefore,
	});
	const [after, citationsAfter, receiptsAfter] = await Promise.all([
		inspectRetirementState({ projectRoot: options.projectRoot, records }),
		options.inspectCitations(),
		readRetirementReceiptInventory({ projectRoot: options.projectRoot }),
	]);
	if (
		after.recovery !== "none" ||
		before.snapshot === undefined ||
		before.snapshot !== after.snapshot ||
		JSON.stringify(citationsBefore) !== JSON.stringify(citationsAfter) ||
		JSON.stringify(receiptsBefore) !== JSON.stringify(receiptsAfter)
	) {
		return failedResult({
			reason: "Dry-run snapshot changed during observation.",
			recovery: "concurrent-mutation",
			warnings: after.warnings,
		});
	}
	return completedResult({
		retirements: authorized.authorized.map((candidate) => ({
			path: candidate.record.path,
			digest: candidate.record.digest,
			status: "preview",
			reason: candidate.reason,
		})),
		declines: [
			...authorized.declines,
			...deferred.map((candidate) => ({
				code: "retirement-cap-deferred",
				path: candidate.record.path,
				reason: `Retirement preview cap is ${options.maxRetirements.toLocaleString("en-US")}; this candidate is deferred.`,
			})),
		],
		warnings: authorized.warnings,
	});
}

async function applyUnderLock(options: {
	readonly projectRoot: string;
	readonly durableFiles: DurableRetirementFiles;
	readonly candidates: readonly LivingMemoryRetirementCandidate[];
	readonly date: string;
	readonly maxRetirements: number;
	readonly inspectCitations: () => Promise<CitationInventory>;
	readonly signal?: AbortSignal;
	readonly failpoint?: (
		point: LivingMemoryRetirementFailpoint,
	) => void | Promise<void>;
}): Promise<LivingMemoryRetirementRunResult> {
	let recovered: "none" | "pending" | "rolled-back" | "rolled-forward" = "none";
	let committed = false;
	try {
		const initialRecovery = await recoverJournal(options);
		recovered = initialRecovery.recovery;
		if (initialRecovery.conflicts.length > 0) {
			const conflict = initialRecovery
				.conflicts[0] as RetirementUnlinkConflictError;
			return failedResult({
				reason: conflict.message,
				recovery: "pending",
				writesCommitted: true,
				declines: initialRecovery.conflicts.map((item) => ({
					code: "retirement-unlink-conflict",
					path: item.path,
					reason: item.message,
				})),
				warnings: [],
			});
		}
		throwIfAborted(options.signal);
		if (
			!Number.isSafeInteger(options.maxRetirements) ||
			options.maxRetirements < 1 ||
			options.candidates.length > options.maxRetirements
		) {
			throw new Error(
				`Retirement candidates exceed the bounded cap (${options.candidates.length} > ${options.maxRetirements}).`,
			);
		}
		const authorized = await authorizeCandidates(options);
		if (authorized.authorized.length === 0) {
			return completedResult({
				declines: authorized.declines,
				warnings: authorized.warnings,
				recovery: recovered,
				writesCommitted: recovered === "rolled-forward",
			});
		}
		const receiptInventory = await readRetirementReceiptInventory({
			projectRoot: options.projectRoot,
		});
		if (receiptInventory.kind !== "healthy") {
			throw new Error(
				`Retirement receipt inventory became unhealthy: ${receiptInventory.issues.join(", ")}.`,
			);
		}
		const round = nextRound(receiptInventory.inventory);
		const entries = authorized.authorized.map((candidate, index) =>
			prepareRetirement({ candidate, round, index, date: options.date }),
		);
		const manifestPath = `${RETIREMENTS_PATH}/round-${round}.md`;
		const manifestContent = renderManifest({ round, entries });
		const journal = {
			schemaVersion: 1,
			state: "prepared",
			round,
			manifestPath,
			manifestContent,
			entries,
		} satisfies RetirementJournal;

		await prepareCapabilities({
			projectRoot: options.projectRoot,
			durableFiles: options.durableFiles,
			entries,
		});
		await options.durableFiles.replaceText({
			path: absolutePath(options.projectRoot, JOURNAL_PATH),
			content: `${JSON.stringify(journal, null, 2)}\n`,
			...(options.signal === undefined ? {} : { signal: options.signal }),
		});
		await options.failpoint?.("after-journal-sync");
		for (const entry of entries) {
			await options.durableFiles.linkFile({
				sourcePath: absolutePath(options.projectRoot, entry.originalPath),
				destinationPath: absolutePath(options.projectRoot, entry.retiredPath),
			});
		}
		await options.failpoint?.("after-retired-link-sync");
		await options.durableFiles.writeText({
			path: absolutePath(options.projectRoot, manifestPath),
			content: manifestContent,
			...(options.signal === undefined ? {} : { signal: options.signal }),
		});
		committed = true;
		await options.failpoint?.("after-manifest-sync");
		for (const entry of entries) {
			await removeManifestedLiveThroughTombstone({
				projectRoot: options.projectRoot,
				durableFiles: options.durableFiles,
				entry,
				...(options.failpoint === undefined
					? {}
					: { failpoint: options.failpoint }),
			});
		}
		await options.failpoint?.("after-live-unlink-sync");
		await options.failpoint?.("before-journal-remove");
		await options.durableFiles.removeFile(
			absolutePath(options.projectRoot, JOURNAL_PATH),
		);
		return completedResult({
			retirements: entries.map((entry) => ({
				path: entry.originalPath,
				digest: entry.digest,
				status: "applied",
				reason: entry.reason,
			})),
			declines: authorized.declines,
			warnings: authorized.warnings,
			recovery: recovered,
			writesCommitted: true,
			manifestPath: absolutePath(options.projectRoot, manifestPath),
		});
	} catch (error: unknown) {
		const recoveryAttempt = await recoverJournal(options).catch(() => ({
			recovery: recovered,
			conflicts: Object.freeze([]),
		}));
		const journalPending = await pathExists(
			absolutePath(options.projectRoot, JOURNAL_PATH),
		).catch(() => false);
		const recovery = journalPending
			? "pending"
			: committed && recoveryAttempt.recovery === "none"
				? "pending"
				: recoveryAttempt.recovery;
		return failedResult({
			reason: error instanceof Error ? error.message : String(error),
			recovery,
			warnings: [],
			writesCommitted:
				committed || journalPending || recovery === "rolled-forward",
			...(error instanceof RetirementUnlinkConflictError
				? {
						declines: [
							{
								code: "retirement-unlink-conflict",
								path: error.path,
								reason: error.message,
							},
						],
					}
				: {}),
		});
	}
}

async function authorizeCandidates(options: {
	readonly projectRoot: string;
	readonly candidates: readonly LivingMemoryRetirementCandidate[];
	readonly inspectCitations: () => Promise<CitationInventory>;
	readonly citations?: CitationInventory;
	readonly receipts?: Awaited<
		ReturnType<typeof readRetirementReceiptInventory>
	>;
}): Promise<{
	readonly authorized: readonly LivingMemoryRetirementCandidate[];
	readonly declines: LivingMemoryRetirementRunDetails["declines"];
	readonly warnings: readonly MemoryWarning[];
}> {
	const receipts =
		options.receipts ??
		(await readRetirementReceiptInventory({
			projectRoot: options.projectRoot,
		}));
	if (receipts.kind !== "healthy") {
		return {
			authorized: [],
			declines: options.candidates.map((candidate) => ({
				code: "receipt-inventory-unhealthy",
				path: candidate.record.path,
				reason: receipts.issues.join(", "),
			})),
			warnings: [],
		};
	}
	const citations = options.citations ?? (await options.inspectCitations());
	if (!citations.healthy) {
		return {
			authorized: [],
			declines: options.candidates.map((candidate) => ({
				code: "citation-inventory-incomplete",
				path: candidate.record.path,
				reason: "Relevant citation discovery is incomplete.",
			})),
			warnings: citations.warnings,
		};
	}

	const authorized: LivingMemoryRetirementCandidate[] = [];
	const declines: Array<LivingMemoryRetirementRunDetails["declines"][number]> =
		[];
	for (const candidate of options.candidates) {
		const conflict = await candidateConflict({
			projectRoot: options.projectRoot,
			candidate,
			receipts: receipts.inventory,
			citations,
		});
		if (conflict === undefined) authorized.push(candidate);
		else declines.push(conflict);
	}
	return { authorized, declines, warnings: citations.warnings };
}

async function candidateConflict(options: {
	readonly projectRoot: string;
	readonly candidate: LivingMemoryRetirementCandidate;
	readonly receipts: RetirementReceiptInventory;
	readonly citations: CitationInventory;
}): Promise<LivingMemoryRetirementRunDetails["declines"][number] | undefined> {
	const { candidate } = options;
	const path = candidate.record.path;
	const blocked = (code: string, reason: string) => ({ code, path, reason });
	if (
		candidate.record.scope !== "project" ||
		candidate.record.kind !== "knowledge" ||
		!isSafeKnowledgePath(path) ||
		candidate.record.metadata.scopeRoot !== options.projectRoot
	) {
		return blocked(
			"retirement-path-conflict",
			"Retirement requires a contained project knowledge source.",
		);
	}
	if (
		candidate.evidence.length === 0 ||
		!candidate.evidence.every(validEvidence) ||
		!candidate.evidence.some(
			(evidence) =>
				evidence.scope === candidate.record.scope &&
				evidence.path === path &&
				evidence.digest === candidate.record.digest,
		) ||
		candidate.evidenceReason.trim().length === 0
	) {
		return blocked(
			"retirement-evidence-incomplete",
			"Retirement evidence must completely name the consumed scope, path, digest, and reason.",
		);
	}
	const current = await readRegularBytes(
		absolutePath(options.projectRoot, path),
		options.projectRoot,
	);
	if (current === undefined || sha256(current) !== candidate.record.digest) {
		return blocked(
			"retirement-digest-conflict",
			"Current source bytes do not match the observed digest.",
		);
	}
	const baseline = options.receipts.activeBaselines.find(
		(item) => item.path === path,
	);
	if (baseline === undefined || baseline.sha256 !== candidate.record.digest) {
		return blocked(
			"retirement-baseline-conflict",
			"No exact active promotion or human-ratified destination baseline matches the current bytes.",
		);
	}
	const state = latestStateForPath(options.receipts, path);
	if (state?.status === "retired") {
		return blocked(
			"restoration-in-progress",
			"The live path has an active retired event and must complete human restoration first.",
		);
	}
	if (
		state?.status === "restored" &&
		state.digest === candidate.record.digest
	) {
		return blocked(
			"restoration-suppressed",
			"The unchanged restored bytes remain under the human retirement veto.",
		);
	}
	const retiredPath = absolutePath(
		options.projectRoot,
		deriveRetiredPath(path),
	);
	if (
		(await readRegularBytes(retiredPath, options.projectRoot)) !== undefined
	) {
		return blocked(
			"retirement-destination-conflict",
			"The derived retired destination is already occupied.",
		);
	}
	const inbound = options.citations.entries.filter(
		(entry) =>
			entry.scope === "project" &&
			entry.path !== path &&
			entry.targets.includes(path),
	);
	if (inbound.length > 0) {
		return blocked(
			"retirement-inbound-citation",
			`Live inbound citations still target this record: ${inbound
				.map((entry) => entry.path)
				.join(", ")}.`,
		);
	}
	return undefined;
}

function prepareRetirement(options: {
	readonly candidate: LivingMemoryRetirementCandidate;
	readonly round: number;
	readonly index: number;
	readonly date: string;
}): PreparedRetirement {
	const path = options.candidate.record.path;
	const id = `retirement-${options.round}-${options.index + 1}-${options.candidate.record.digest.slice(0, 12)}`;
	return {
		id,
		originalPath: path,
		retiredPath: deriveRetiredPath(path),
		tombstonePath: deriveTombstonePath(path, id, randomUUID()),
		digest: options.candidate.record.digest,
		reason: options.candidate.reason,
		evidence: options.candidate.evidence,
		evidenceReason: options.candidate.evidenceReason,
		date: options.date,
	};
}

async function prepareCapabilities(options: {
	readonly projectRoot: string;
	readonly durableFiles: DurableRetirementFiles;
	readonly entries: readonly PreparedRetirement[];
}): Promise<void> {
	await options.durableFiles.ensureDirectory(
		absolutePath(options.projectRoot, RETIREMENTS_PATH),
	);
	await assertRealContainedDirectory(
		options.projectRoot,
		absolutePath(options.projectRoot, RETIREMENTS_PATH),
	);
	for (const entry of options.entries) {
		const destinationDirectory = dirname(
			absolutePath(options.projectRoot, entry.retiredPath),
		);
		await options.durableFiles.ensureDirectory(destinationDirectory);
		await assertRealContainedDirectory(
			options.projectRoot,
			destinationDirectory,
		);
		await options.durableFiles.assertRemovalSupported({
			sourcePath: absolutePath(options.projectRoot, entry.originalPath),
			destinationDirectory,
		});
	}
}

async function recoverJournal(options: {
	readonly projectRoot: string;
	readonly durableFiles: DurableRetirementFiles;
}): Promise<{
	readonly recovery: "none" | "pending" | "rolled-back" | "rolled-forward";
	readonly conflicts: readonly RetirementUnlinkConflictError[];
}> {
	const journal = await readJournal(options.projectRoot);
	if (journal === undefined) {
		return { recovery: "none", conflicts: Object.freeze([]) };
	}
	const manifestCommitted = await regularFileEquals(
		absolutePath(options.projectRoot, journal.manifestPath),
		journal.manifestContent,
	);
	if (manifestCommitted) {
		const conflicts: RetirementUnlinkConflictError[] = [];
		const manifestPath = absolutePath(
			options.projectRoot,
			journal.manifestPath,
		);
		await options.durableFiles.confirmFileDurability(manifestPath);
		if (!(await regularFileEquals(manifestPath, journal.manifestContent))) {
			throw new Error(
				`Committed retirement manifest changed during durability confirmation: ${journal.manifestPath}.`,
			);
		}
		for (const entry of journal.entries) {
			const conflict = await recoverCommittedEntry({
				projectRoot: options.projectRoot,
				durableFiles: options.durableFiles,
				entry,
			});
			if (conflict !== undefined) conflicts.push(conflict);
		}
		if (conflicts.length === 0) {
			await options.durableFiles.removeFile(
				absolutePath(options.projectRoot, JOURNAL_PATH),
			);
		}
		return {
			recovery: conflicts.length === 0 ? "rolled-forward" : "pending",
			conflicts: Object.freeze(conflicts),
		};
	}
	for (const entry of journal.entries) {
		const livePath = absolutePath(options.projectRoot, entry.originalPath);
		const tombstonePath = absolutePath(
			options.projectRoot,
			entry.tombstonePath,
		);
		if (await pathExists(tombstonePath)) {
			await options.durableFiles.restoreFile({
				sourcePath: tombstonePath,
				destinationPath: livePath,
			});
		}
		const live = await readRegularBytes(livePath, options.projectRoot);
		if (live === undefined || sha256(live) !== entry.digest) {
			throw new Error(
				`Uncommitted retirement cannot prove its live source: ${entry.originalPath}.`,
			);
		}
		const retiredPath = absolutePath(options.projectRoot, entry.retiredPath);
		const retired = await readRegularBytes(retiredPath, options.projectRoot);
		if (retired !== undefined) {
			if (
				sha256(retired) !== entry.digest ||
				!(await sameFileIdentity(livePath, retiredPath))
			) {
				throw new Error(
					`Uncommitted retirement destination is not the prepared hard link: ${entry.originalPath}.`,
				);
			}
			await options.durableFiles.removeFile(retiredPath);
		}
	}
	await options.durableFiles.removeFile(
		absolutePath(options.projectRoot, JOURNAL_PATH),
	);
	return { recovery: "rolled-back", conflicts: Object.freeze([]) };
}

async function recoverCommittedEntry(options: {
	readonly projectRoot: string;
	readonly durableFiles: DurableRetirementFiles;
	readonly entry: PreparedRetirement;
}): Promise<RetirementUnlinkConflictError | undefined> {
	const livePath = absolutePath(
		options.projectRoot,
		options.entry.originalPath,
	);
	const retiredPath = absolutePath(
		options.projectRoot,
		options.entry.retiredPath,
	);
	const tombstonePath = absolutePath(
		options.projectRoot,
		options.entry.tombstonePath,
	);
	if (await pathExists(tombstonePath)) {
		if (
			await manifestedTombstoneMatches({
				projectRoot: options.projectRoot,
				entry: options.entry,
			})
		) {
			await options.durableFiles.removeFile(tombstonePath);
			return undefined;
		}
		await options.durableFiles.restoreFile({
			sourcePath: tombstonePath,
			destinationPath: livePath,
		});
		await removeChangedRetiredDuplicate({
			livePath,
			retiredPath,
			digest: options.entry.digest,
			durableFiles: options.durableFiles,
		});
		return new RetirementUnlinkConflictError(
			options.entry.originalPath,
			"the transaction tombstone did not match the manifested retired object and was restored",
		);
	}

	const live = await readRegularBytes(livePath, options.projectRoot);
	if (live !== undefined) {
		if (
			(await sameFileIdentity(livePath, retiredPath).catch(() => false)) &&
			sha256(live) === options.entry.digest
		) {
			await removeManifestedLiveThroughTombstone(options);
			return undefined;
		}
		await removeChangedRetiredDuplicate({
			livePath,
			retiredPath,
			digest: options.entry.digest,
			durableFiles: options.durableFiles,
		});
		return new RetirementUnlinkConflictError(
			options.entry.originalPath,
			"the live path contains bytes other than the manifested retired object and remains live",
		);
	}

	const retired = await readRegularBytes(retiredPath, options.projectRoot);
	if (retired === undefined || sha256(retired) !== options.entry.digest) {
		throw new Error(
			`Committed retirement is missing its byte-identical destination: ${options.entry.originalPath}.`,
		);
	}
	return undefined;
}

async function removeChangedRetiredDuplicate(options: {
	readonly livePath: string;
	readonly retiredPath: string;
	readonly digest: string;
	readonly durableFiles: DurableRetirementFiles;
}): Promise<void> {
	if (
		!(await sameFileIdentity(options.livePath, options.retiredPath).catch(
			() => false,
		))
	) {
		return;
	}
	const live = await readRegularBytes(
		options.livePath,
		dirname(options.livePath),
	);
	if (live !== undefined && sha256(live) !== options.digest) {
		await options.durableFiles.removeFile(options.retiredPath);
	}
}

async function inspectRetirementState(options: {
	readonly projectRoot: string;
	readonly lockHeld?: boolean;
	readonly records: readonly {
		readonly path: string;
		readonly digest: string;
	}[];
}): Promise<{
	readonly recovery: "none" | "pending" | "concurrent-mutation";
	readonly warnings: readonly MemoryWarning[];
	readonly representedKeys: readonly string[];
	readonly snapshot: string;
}> {
	const receipts = await readRetirementReceiptInventory({
		projectRoot: options.projectRoot,
	});
	if (receipts.kind !== "healthy") {
		throw new Error(
			`Retirement receipt inventory is unhealthy: ${receipts.issues.join(", ")}.`,
		);
	}
	const journalPresent = await pathExists(
		absolutePath(options.projectRoot, JOURNAL_PATH),
	);
	const lockPresent = await pathExists(
		absolutePath(options.projectRoot, LOCK_PATH),
	);
	const foreignLockPresent = lockPresent && !options.lockHeld;
	const state: Array<unknown> = [journalPresent, foreignLockPresent];
	for (const record of [...options.records].sort((a, b) =>
		a.path.localeCompare(b.path),
	)) {
		const bytes = isSafeKnowledgePath(record.path)
			? await readRegularBytes(
					absolutePath(options.projectRoot, record.path),
					options.projectRoot,
				).catch(() => undefined)
			: undefined;
		state.push([record.path, bytes === undefined ? null : sha256(bytes)]);
	}
	state.push(await manifestFingerprint(options.projectRoot));
	return {
		recovery: journalPresent
			? "pending"
			: foreignLockPresent
				? "concurrent-mutation"
				: "none",
		warnings: [],
		representedKeys: Object.freeze([
			...new Set(
				receipts.inventory.retirementEvents.flatMap((event) => [
					consolidationEvidenceKey({
						scope: "project",
						path: event.path,
						digest: event.digest,
					}),
					...(event.kind === "retired"
						? event.evidence.map(consolidationEvidenceKey)
						: []),
				]),
			),
		]),
		snapshot: sha256(JSON.stringify(state)),
	};
}

async function manifestFingerprint(
	projectRoot: string,
): Promise<readonly string[]> {
	try {
		return (await readdir(absolutePath(projectRoot, RETIREMENTS_PATH))).sort();
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return [];
		throw error;
	}
}

async function readJournal(
	projectRoot: string,
): Promise<RetirementJournal | undefined> {
	let raw: string;
	try {
		raw = await readFile(absolutePath(projectRoot, JOURNAL_PATH), "utf-8");
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return undefined;
		throw error;
	}
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error: unknown) {
		throw new Error("Living-memory retirement journal is malformed.", {
			cause: error,
		});
	}
	if (!isRetirementJournal(value)) {
		throw new Error("Living-memory retirement journal has an invalid shape.");
	}
	return value;
}

function isRetirementJournal(value: unknown): value is RetirementJournal {
	if (!isRecord(value)) return false;
	if (
		!hasExactKeys(value, [
			"schemaVersion",
			"state",
			"round",
			"manifestPath",
			"manifestContent",
			"entries",
		]) ||
		value.schemaVersion !== 1 ||
		value.state !== "prepared" ||
		!Number.isSafeInteger(value.round) ||
		Number(value.round) < 1 ||
		!isManifestPath(value.manifestPath) ||
		value.manifestPath !== `${RETIREMENTS_PATH}/round-${value.round}.md` ||
		typeof value.manifestContent !== "string" ||
		!Array.isArray(value.entries) ||
		value.entries.length === 0
	) {
		return false;
	}
	return (
		value.entries.every((entry) => {
			if (!isRecord(entry)) return false;
			return (
				hasExactKeys(entry, [
					"id",
					"originalPath",
					"retiredPath",
					"tombstonePath",
					"digest",
					"reason",
					"evidence",
					"evidenceReason",
					"date",
				]) &&
				typeof entry.id === "string" &&
				/^[a-z0-9][a-z0-9._-]*$/u.test(entry.id) &&
				isSafeKnowledgePath(entry.originalPath) &&
				entry.retiredPath === deriveRetiredPath(entry.originalPath) &&
				isRetirementTombstonePath({
					originalPath: entry.originalPath,
					id: entry.id,
					tombstonePath: entry.tombstonePath,
				}) &&
				isSha256(entry.digest) &&
				isRetirementReason(entry.reason) &&
				Array.isArray(entry.evidence) &&
				entry.evidence.length > 0 &&
				entry.evidence.every(
					(evidence) =>
						isRecord(evidence) &&
						hasExactKeys(evidence, [
							"id",
							"sourceId",
							"scope",
							"path",
							"digest",
						]) &&
						validEvidence(evidence),
				) &&
				typeof entry.evidenceReason === "string" &&
				entry.evidenceReason.trim().length > 0 &&
				isCanonicalDate(entry.date)
			);
		}) &&
		value.manifestContent ===
			renderManifest({
				round: Number(value.round),
				entries: value.entries as unknown as readonly PreparedRetirement[],
			})
	);
}

function renderManifest(options: {
	readonly round: number;
	readonly entries: readonly PreparedRetirement[];
}): string {
	const lines = [
		"---",
		"kind: knowledge-retirement-round",
		`round: ${options.round}`,
		"events:",
	];
	for (const entry of options.entries) {
		lines.push(
			"  - kind: retired",
			`    id: ${entry.id}`,
			`    path: ${entry.originalPath}`,
			`    digest: ${entry.digest}`,
			`    reason: ${entry.reason}`,
			"    evidence:",
		);
		for (const evidence of entry.evidence) {
			lines.push(
				`      - scope: ${evidence.scope}`,
				`        path: ${evidence.path}`,
				`        digest: ${evidence.digest}`,
			);
		}
		lines.push(
			`    evidenceReason: ${JSON.stringify(entry.evidenceReason)}`,
			`    date: ${JSON.stringify(entry.date)}`,
		);
	}
	lines.push("---", "", "# Living-memory retirement round", "");
	return lines.join("\n");
}

function nextRound(inventory: RetirementReceiptInventory): number {
	return (
		inventory.retirementEvents.reduce(
			(maximum, event) => Math.max(maximum, event.round),
			0,
		) + 1
	);
}

function latestStateForPath(
	inventory: RetirementReceiptInventory,
	path: string,
): RetirementReceiptInventory["retirementStates"][number] | undefined {
	return inventory.retirementStates
		.filter((state) => state.path === path)
		.toSorted((left, right) => right.round - left.round)[0];
}

function deriveRetiredPath(path: string): string {
	if (!isSafeKnowledgePath(path)) {
		throw new Error(`Unsafe retirement source path: ${path}.`);
	}
	return `knowledge/retired/${path.slice("knowledge/".length)}`;
}

function deriveTombstonePath(
	originalPath: string,
	id: string,
	nonce: string,
): string {
	return `${dirname(originalPath)}/.${basename(originalPath)}.${id}.${nonce}.tombstone`;
}

function isRetirementTombstonePath(options: {
	readonly originalPath: string;
	readonly id: string;
	readonly tombstonePath: unknown;
}): boolean {
	return (
		typeof options.tombstonePath === "string" &&
		isSafePosixRelativePath(options.tombstonePath) &&
		dirname(options.tombstonePath) === dirname(options.originalPath) &&
		basename(options.tombstonePath).startsWith(
			`.${basename(options.originalPath)}.${options.id}.`,
		) &&
		basename(options.tombstonePath).endsWith(".tombstone")
	);
}

function isSafeKnowledgePath(value: unknown): value is string {
	return (
		typeof value === "string" &&
		isSafePosixRelativePath(value) &&
		value.startsWith("knowledge/") &&
		!value.startsWith("knowledge/retired/") &&
		value !== "knowledge/retired.md" &&
		value.endsWith(".md")
	);
}

function isManifestPath(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^memory\/agent\/retirements\/round-[1-9]\d*\.md$/u.test(value)
	);
}

function validEvidence(value: unknown): value is ConsolidationEvidenceRef {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.sourceId === "string" &&
		(value.scope === "project" || value.scope === "user") &&
		typeof value.path === "string" &&
		isSafePosixRelativePath(value.path) &&
		isSha256(value.digest)
	);
}

async function readRegularBytes(
	path: string,
	projectRoot: string,
): Promise<Buffer | undefined> {
	try {
		const [realRoot, realPath] = await Promise.all([
			realpath(projectRoot),
			realpath(path),
		]);
		if (!isContained(realRoot, realPath)) {
			throw new Error(`Retirement path escapes the project root: ${path}.`);
		}
		const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const metadata = await handle.stat();
			if (!metadata.isFile()) {
				throw new Error(`Retirement path is not a regular file: ${path}.`);
			}
			return await handle.readFile();
		} finally {
			await handle.close();
		}
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return undefined;
		throw error;
	}
}

async function regularFileEquals(
	path: string,
	expected: string,
): Promise<boolean> {
	try {
		const metadata = await lstat(path);
		if (metadata.isSymbolicLink() || !metadata.isFile()) return false;
		return (await readFile(path, "utf-8")) === expected;
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return false;
		throw error;
	}
}

async function sameFileIdentity(left: string, right: string): Promise<boolean> {
	const [leftMetadata, rightMetadata] = await Promise.all([
		lstat(left),
		lstat(right),
	]);
	return (
		!leftMetadata.isSymbolicLink() &&
		leftMetadata.isFile() &&
		!rightMetadata.isSymbolicLink() &&
		rightMetadata.isFile() &&
		leftMetadata.dev === rightMetadata.dev &&
		leftMetadata.ino === rightMetadata.ino
	);
}

async function assertManifestedLinkBeforeTombstone(options: {
	readonly projectRoot: string;
	readonly entry: PreparedRetirement;
}): Promise<void> {
	const livePath = absolutePath(
		options.projectRoot,
		options.entry.originalPath,
	);
	const retiredPath = absolutePath(
		options.projectRoot,
		options.entry.retiredPath,
	);
	if (!(await sameFileIdentity(livePath, retiredPath).catch(() => false))) {
		throw new RetirementUnlinkConflictError(
			options.entry.originalPath,
			"the live and retired paths no longer identify the same no-follow file",
		);
	}
	const live = await readRegularBytes(livePath, options.projectRoot);
	if (live === undefined || sha256(live) !== options.entry.digest) {
		throw new RetirementUnlinkConflictError(
			options.entry.originalPath,
			"the live bytes no longer match the manifested digest",
		);
	}
}

async function manifestedTombstoneMatches(options: {
	readonly projectRoot: string;
	readonly entry: PreparedRetirement;
}): Promise<boolean> {
	const tombstonePath = absolutePath(
		options.projectRoot,
		options.entry.tombstonePath,
	);
	const retiredPath = absolutePath(
		options.projectRoot,
		options.entry.retiredPath,
	);
	if (
		!(await sameFileIdentity(tombstonePath, retiredPath).catch(() => false))
	) {
		return false;
	}
	const tombstone = await readRegularBytes(tombstonePath, options.projectRoot);
	return tombstone !== undefined && sha256(tombstone) === options.entry.digest;
}

async function removeManifestedLiveThroughTombstone(options: {
	readonly projectRoot: string;
	readonly durableFiles: DurableRetirementFiles;
	readonly entry: PreparedRetirement;
	readonly failpoint?: (
		point: LivingMemoryRetirementFailpoint,
	) => void | Promise<void>;
}): Promise<void> {
	await assertManifestedLinkBeforeTombstone(options);
	const livePath = absolutePath(
		options.projectRoot,
		options.entry.originalPath,
	);
	const tombstonePath = absolutePath(
		options.projectRoot,
		options.entry.tombstonePath,
	);
	await options.durableFiles.renameFile({
		sourcePath: livePath,
		destinationPath: tombstonePath,
	});
	await options.failpoint?.("after-live-tombstone-sync");
	if (await manifestedTombstoneMatches(options)) {
		await options.durableFiles.removeFile(tombstonePath);
		return;
	}
	if (await pathExists(livePath)) {
		throw new RetirementUnlinkConflictError(
			options.entry.originalPath,
			"the transaction tombstone could not be restored because the live path is occupied",
		);
	}
	await options.durableFiles.restoreFile({
		sourcePath: tombstonePath,
		destinationPath: livePath,
	});
	throw new RetirementUnlinkConflictError(
		options.entry.originalPath,
		"the transaction tombstone did not match the manifested retired object and was restored",
	);
}

async function assertRealContainedDirectory(
	projectRoot: string,
	directory: string,
): Promise<void> {
	const [realRoot, realDirectory] = await Promise.all([
		realpath(projectRoot),
		realpath(directory),
	]);
	if (!isContained(realRoot, realDirectory)) {
		throw new Error(
			`Durable retirement directory escapes the project: ${directory}.`,
		);
	}
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return false;
		throw error;
	}
}

function completedResult(
	options: Partial<LivingMemoryRetirementRunDetails> = {},
): LivingMemoryRetirementRunResult {
	return {
		kind: "completed",
		details: {
			retirements: options.retirements ?? [],
			declines: options.declines ?? [],
			warnings: options.warnings ?? [],
			recovery: options.recovery ?? "none",
			writesCommitted: options.writesCommitted ?? false,
			...(options.manifestPath === undefined
				? {}
				: { manifestPath: options.manifestPath }),
		},
	};
}

function failedResult(options: {
	readonly reason: string;
	readonly recovery: LivingMemoryRetirementRunDetails["recovery"];
	readonly warnings: readonly MemoryWarning[];
	readonly writesCommitted?: boolean;
	readonly declines?: LivingMemoryRetirementRunDetails["declines"];
}): LivingMemoryRetirementRunResult {
	return {
		kind: "failed",
		reason: options.reason,
		details: {
			retirements: [],
			declines: options.declines ?? [],
			warnings: options.warnings,
			recovery: options.recovery,
			writesCommitted: options.writesCommitted ?? false,
		},
	};
}

function absolutePath(projectRoot: string, relativePath: string): string {
	if (!isSafePosixRelativePath(relativePath)) {
		throw new Error(`Living-memory path is unsafe: ${relativePath}.`);
	}
	const path = resolve(projectRoot, ...relativePath.split("/"));
	if (!isContainedOrEqual(projectRoot, path)) {
		throw new Error(
			`Living-memory path escapes its project root: ${relativePath}.`,
		);
	}
	return path;
}

function isContained(parent: string, child: string): boolean {
	const path = relative(parent, child);
	return (
		path.length > 0 &&
		!path.startsWith(`..${sep}`) &&
		path !== ".." &&
		!isAbsolute(path)
	);
}

function isContainedOrEqual(parent: string, child: string): boolean {
	return parent === child || isContained(parent, child);
}

function sha256(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}

function canonicalDate(value: Date): string {
	const date = value.toISOString();
	if (!isCanonicalDate(date)) throw new Error("Retirement date is invalid.");
	return date;
}

function isCanonicalDate(value: unknown): value is string {
	if (typeof value !== "string") return false;
	try {
		return new Date(value).toISOString() === value;
	} catch {
		return false;
	}
}

function isRetirementReason(
	value: unknown,
): value is LivingMemoryRetirementCandidate["reason"] {
	return (
		typeof value === "string" &&
		["superseded", "merged", "obsolete", "retire-when-met"].includes(value)
	);
}

function isSha256(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
	value: Record<string, unknown>,
	keys: readonly string[],
): boolean {
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	return (
		actual.length === expected.length &&
		actual.every((key, index) => key === expected[index])
	);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) {
		throw signal.reason instanceof Error
			? signal.reason
			: new Error("Living-memory retirement was cancelled.");
	}
}

function errorCode(error: unknown): string | undefined {
	return isRecord(error) && typeof error.code === "string"
		? error.code
		: error instanceof DurableRemovalUnsupportedError
			? "UNSUPPORTED"
			: undefined;
}
