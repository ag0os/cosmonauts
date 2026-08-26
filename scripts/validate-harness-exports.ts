import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	lstat,
	mkdir,
	mkdtemp,
	open,
	readdir,
	readFile,
	realpath,
	rename,
	rm,
	unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type {
	HarnessProvenanceManifest,
	LegacyCopiedNodeShape,
	LegacyMigrationAuthorization,
	MaterializedHarnessManifestEntry,
} from "../lib/harness-adapters/provenance.ts";
import {
	manifestEntryKey,
	readHarnessManifest,
	resolveAssetOwnerIdentity,
	resolveHarnessTransactionPaths,
	serializeHarnessManifest,
	sha256,
	verifyLegacyMigrationProof,
} from "../lib/harness-adapters/provenance.ts";
import { resolveHarnessAssetTarget } from "../lib/harness-adapters/registry.ts";
import {
	prepareHarnessMaterialization,
	writePreparedTarget,
} from "../lib/harness-adapters/render.ts";
import type {
	HarnessManifestSnapshot,
	HarnessNodeSnapshot,
	OwnerRootRecoveryResult,
	OwnerRootTransactionJournal,
	WithOwnerRootTransactionOptions,
} from "../lib/harness-adapters/sync.ts";
import {
	applySyncPlanInTransaction,
	observeHarnessNodeSnapshot,
	syncHarnessAsset,
	withOwnerRootTransaction,
} from "../lib/harness-adapters/sync.ts";
import type {
	HarnessAsset,
	ResolvedHarnessAssetTarget,
} from "../lib/harness-adapters/types.ts";

const execFileAsync = promisify(execFile);
const DEFAULT_REVISION = "9290725704bb29f302dca9433061d13227c35bf8";
const EVIDENCE_RELATIVE_PATH =
	"missions/plans/harness-adapters/repo-export-validation-evidence.json";
const REQUIRED_IGNORE_RULES = [".agents/", ".cosmonauts-harness-*"] as const;

export const PROJECT_EXPORT_ROWS = [
	{
		name: "plan",
		assetId: "skill:shared/plan",
		sourceRelativePath: "domains/shared/skills/plan",
		outputRelativePath: ".claude/skills/plan",
	},
	{
		name: "roadmap",
		assetId: "skill:shared/roadmap",
		sourceRelativePath: "domains/shared/skills/roadmap",
		outputRelativePath: ".claude/skills/roadmap",
	},
	{
		name: "skills-cli",
		assetId: "skill:shared/skills-cli",
		sourceRelativePath: "domains/shared/skills/skills-cli",
		outputRelativePath: ".claude/skills/skills-cli",
	},
	{
		name: "task",
		assetId: "skill:shared/task",
		sourceRelativePath: "domains/shared/skills/task",
		outputRelativePath: ".claude/skills/task",
	},
] as const;

export type RepositoryExportAssetId =
	(typeof PROJECT_EXPORT_ROWS)[number]["assetId"];
export type RepositoryEvidencePhase =
	| "authorized"
	| "installed"
	| "checked"
	| "complete";
export type RepositoryValidationStop =
	| "prepared"
	| "installed"
	| "checked"
	| "backup-cleanup";

export interface RepositorySelectedCheckRow {
	readonly asset: string;
	readonly targetPath: string;
	readonly before: string;
	readonly reason: string;
	readonly action: string;
	readonly final: string;
}

export type RepositorySelectedCheck = (options: {
	readonly projectRoot: string;
	readonly rows: readonly RepositoryPreparedRow[];
}) => Promise<{
	readonly exitCode: number;
	readonly rows: readonly RepositorySelectedCheckRow[];
}>;

export interface RepositoryMigrationProof {
	readonly row: (typeof PROJECT_EXPORT_ROWS)[number];
	readonly authorization: LegacyMigrationAuthorization;
	readonly historicalDigest: string;
	readonly sourceDigest: string;
	readonly oldDigest: string;
	readonly nodeShape: readonly LegacyCopiedNodeShape[];
}

export interface RepositoryPreparedRow {
	readonly name: string;
	readonly assetId: RepositoryExportAssetId;
	readonly sourceRelativePath: string;
	readonly outputRelativePath: string;
	readonly outputPath: string;
	readonly target: ResolvedHarnessAssetTarget;
	readonly asset: HarnessAsset;
	readonly authorization: LegacyMigrationAuthorization;
	readonly historicalDigest: string;
	readonly sourceDigest: string;
	readonly oldDigest: string;
	readonly newDigest: string;
	readonly oldState: HarnessNodeSnapshot;
	readonly newState: HarnessNodeSnapshot;
	readonly manifestEntry: MaterializedHarnessManifestEntry;
	readonly writeStage: (stagePath: string) => Promise<void>;
}

export interface RepositoryEvidenceRow {
	readonly authorizationKind: "legacy-copied-target";
	readonly consumption: "one-time";
	readonly revision: string;
	readonly sourceRelativePath: string;
	readonly historicalDigest: string;
	readonly sourceDigest: string;
	readonly oldDigest: string;
	readonly newDigest: string;
	readonly ownerId: string;
	readonly assetId: RepositoryExportAssetId;
	readonly manifestKey: string;
	readonly outputPath: string;
	readonly nodeShape: readonly LegacyCopiedNodeShape[];
	readonly backupPath: string;
	readonly oldState: HarnessNodeSnapshot;
	readonly recoveryOutcome: string;
	readonly receipt?: RepositoryEvidenceReceipt;
	readonly checkRow?: RepositorySelectedCheckRow;
	readonly backupExit?: "removed-exact";
	readonly timestamp: string;
}

export interface RepositoryEvidenceReceipt {
	readonly transactionId: string;
	readonly evidencePath: string;
	readonly evidenceDigest: string;
}

export interface RepositoryExportValidationEvidence {
	readonly schemaVersion: 1;
	readonly kind: "repository-harness-export-validation";
	readonly phase: RepositoryEvidencePhase;
	readonly transactionId: string;
	readonly projectRoot: string;
	readonly ownerRoot: string;
	readonly target: "claude";
	readonly scope: "project";
	readonly cleanupPolicy: "after-evidence";
	readonly atomicSet: true;
	readonly selectedAssetIds: readonly RepositoryExportAssetId[];
	readonly newManifestDigest: string;
	readonly excludedTarget: {
		readonly assetId: "skill:coding/playwright-cli";
		readonly outputPath: string;
		readonly digest: string;
		readonly status: "locally-edited";
		readonly reason: "foreign-or-untraceable";
	};
	readonly protectedAssets: readonly ProtectedAssetEvidence[];
	readonly rows: readonly RepositoryEvidenceRow[];
	readonly receipt?: RepositoryEvidenceReceipt;
	readonly authorizedAt: string;
	readonly installedAt?: string;
	readonly checkedAt?: string;
	readonly completedAt?: string;
}

interface ProtectedAssetEvidence {
	readonly label:
		| "playwright-cli"
		| "personal-cosmonauts-bundle"
		| "live-spec-to-backlog-command"
		| "live-implement-plan-command";
	readonly path: string;
	readonly snapshot: HarnessNodeSnapshot;
}

export interface RunRepositoryExportValidationOptions {
	readonly projectRoot: string;
	readonly homeRoot?: string;
	readonly evidencePath?: string;
	readonly revisions?: Partial<Record<RepositoryExportAssetId, string>>;
	readonly now?: () => Date;
	readonly selectedCheck?: RepositorySelectedCheck;
	readonly stopAfter?: RepositoryValidationStop;
	readonly onTransactionLock?: () => void | Promise<void>;
	readonly lockRunner?: NonNullable<
		WithOwnerRootTransactionOptions["lockRunner"]
	>;
}

interface TreeBytes {
	readonly files: ReadonlyMap<string, Buffer>;
	readonly shape: readonly LegacyCopiedNodeShape[];
	readonly snapshot: HarnessNodeSnapshot;
}

/**
 * Read named git objects and live targets, then derive all four one-time
 * authorizations before any lock, journal, target, or manifest write.
 */
export async function proveRepositoryExportLineage(options: {
	readonly projectRoot: string;
	readonly revisions?: Partial<Record<RepositoryExportAssetId, string>>;
}): Promise<readonly RepositoryMigrationProof[]> {
	const projectRoot = await realpath(options.projectRoot);
	const owner = await resolveAssetOwnerIdentity(
		{ ownership: { kind: "project" } },
		projectRoot,
	);
	const proofs: RepositoryMigrationProof[] = [];

	for (const row of PROJECT_EXPORT_ROWS) {
		const revision = options.revisions?.[row.assetId] ?? DEFAULT_REVISION;
		const outputPath = join(projectRoot, row.outputRelativePath);
		const [historical, currentTarget, source] = await Promise.all([
			readGitTree(projectRoot, revision, row.sourceRelativePath),
			readFilesystemTree(outputPath),
			readFilesystemTree(join(projectRoot, row.sourceRelativePath)),
		]);
		const expected = {
			revision,
			sourceRelativePath: row.sourceRelativePath,
			owner,
			assetId: row.assetId,
			outputPath,
			nodeShape: historical.shape,
		} as const;
		const authorization = verifyLegacyMigrationProof(
			{
				...expected,
				historicalRenderedDigest: snapshotDigest(historical.snapshot),
				currentTargetDigest: snapshotDigest(currentTarget.snapshot),
				historicalNodeShape: historical.shape,
				currentTargetNodeShape: currentTarget.shape,
			},
			expected,
		);
		if (!authorization) {
			throw new Error(
				`Historical byte lineage failed for ${row.assetId} at ${revision}:${row.sourceRelativePath}; target preserved with no migration authorization.`,
			);
		}
		proofs.push({
			row,
			authorization,
			historicalDigest: snapshotDigest(historical.snapshot),
			sourceDigest: snapshotDigest(source.snapshot),
			oldDigest: snapshotDigest(currentTarget.snapshot),
			nodeShape: historical.shape,
		});
	}
	return proofs;
}

export async function runRepositoryExportValidation(
	options: RunRepositoryExportValidationOptions,
): Promise<RepositoryExportValidationEvidence> {
	const requestedProjectRoot = resolve(options.projectRoot);
	const projectRoot = await realpath(options.projectRoot);
	const homeRoot = options.homeRoot
		? await realpath(options.homeRoot)
		: resolve(process.env.HOME ?? dirname(projectRoot));
	const requestedEvidencePath = resolve(
		options.evidencePath ?? join(requestedProjectRoot, EVIDENCE_RELATIVE_PATH),
	);
	const evidencePath = join(
		projectRoot,
		relative(requestedProjectRoot, requestedEvidencePath),
	);
	assertContained(projectRoot, evidencePath, "repository evidence");
	await assertIgnorePrerequisites(projectRoot);
	await assertNoVisibleTransactionArtifacts(projectRoot);

	const existing = await readEvidence(evidencePath);
	if (existing?.phase === "complete") {
		validateEvidenceIdentity(existing, projectRoot, evidencePath);
		await assertProtectedAssets(existing.protectedAssets);
		await assertNoVisibleTransactionArtifacts(projectRoot);
		return existing;
	}

	if (existing?.phase === "installed" || existing?.phase === "checked") {
		validateEvidenceIdentity(existing, projectRoot, evidencePath);
		return finishInstalledEvidence({
			...options,
			projectRoot,
			evidencePath,
			evidence: existing,
			selectedCheck: options.selectedCheck ?? runFreshSelectedCheck,
		});
	}

	let priorRecoveryOutcome: string | undefined;
	if (existing?.phase === "authorized") {
		validateEvidenceIdentity(existing, projectRoot, evidencePath);
		const journalPath = resolveHarnessTransactionPaths(
			existing.ownerRoot,
			"claude",
		).journalPath;
		if (await pathExists(journalPath)) {
			const recovered = await withOwnerRootTransaction(
				{
					ownerRoot: existing.ownerRoot,
					targetId: "claude",
					...(options.lockRunner ? { lockRunner: options.lockRunner } : {}),
				},
				async () => "recovered" as const,
			);
			if (recovered.state === "persisted-release-unconfirmed") {
				await assertNoVisibleTransactionArtifacts(projectRoot);
				throw new Error(
					`Harness transaction release is unconfirmed: ${errorMessage(recovered.error)}. Retry before later live work.`,
				);
			}
			if (recovered.state === "lock-contended") {
				throw new Error(
					`Harness transaction lock contended at ${recovered.lockPath}.`,
				);
			}
			if (recovered.state === "recovery-required") {
				if (
					recovered.recovery.state !== "evidence-required" ||
					recovered.recovery.transactionId !== existing.transactionId
				) {
					throw new Error(
						`Harness recovery is ambiguous: ${JSON.stringify(recovered.recovery)}.`,
					);
				}
				const journal = await readCommittedJournal(
					existing.ownerRoot,
					existing.transactionId,
				);
				const installed = makeInstalledEvidence(
					existing,
					journal,
					"committed:evidence-required",
					(options.now ?? (() => new Date()))().toISOString(),
				);
				await persistEvidence(evidencePath, installed);
				if (options.stopAfter === "installed") {
					await assertNoVisibleTransactionArtifacts(projectRoot);
					throw new Error("injected stop after installed");
				}
				return finishInstalledEvidence({
					...options,
					projectRoot,
					evidencePath,
					evidence: installed,
					selectedCheck: options.selectedCheck ?? runFreshSelectedCheck,
				});
			}
			priorRecoveryOutcome = describeRecovery(recovered.recovery);
		}
	}

	const proofs = await proveRepositoryExportLineage({
		projectRoot,
		revisions: options.revisions,
	});
	const protectedAssets = await observeProtectedAssets(projectRoot, homeRoot);
	const playwright = protectedAssets.find(
		(asset) => asset.label === "playwright-cli",
	);
	if (!playwright || playwright.snapshot.kind !== "directory") {
		throw new Error(
			"The excluded playwright-cli target is missing; the exact four-row migration cannot establish A-001 exclusion evidence.",
		);
	}

	const timestamp = (options.now ?? (() => new Date()))().toISOString();
	const materializedAt = existing?.authorizedAt ?? timestamp;
	const preparedRows = await prepareRows(
		projectRoot,
		proofs,
		() => new Date(materializedAt),
	);
	const ownerRoot = join(projectRoot, ".claude");
	const manifestPath = join(ownerRoot, ".cosmonauts-harness-manifest.json");
	const manifest = await readHarnessManifest(manifestPath);
	assertNoExistingClaims(manifest, preparedRows);
	const oldManifest = await observeManifest(manifestPath);
	const newManifestContents = mergeManifest(manifest, preparedRows);
	const transactionId = existing?.transactionId ?? randomUUID();
	const evidence =
		existing ??
		makeAuthorizedEvidence({
			projectRoot,
			ownerRoot,
			evidencePath,
			transactionId,
			timestamp,
			newManifestContents,
			preparedRows,
			protectedAssets,
			playwright,
		});
	if (existing) validateEvidenceIdentity(existing, projectRoot, evidencePath);
	await persistEvidence(evidencePath, evidence);

	const transactionResult = await withOwnerRootTransaction(
		{
			ownerRoot,
			targetId: "claude",
			...(options.lockRunner ? { lockRunner: options.lockRunner } : {}),
		},
		async (transaction) => {
			await options.onTransactionLock?.();
			const lockedProofs = await proveRepositoryExportLineage({
				projectRoot,
				revisions: options.revisions,
			});
			assertProofsMatchEvidence(lockedProofs, evidence);
			return applySyncPlanInTransaction(transaction, {
				oldManifest,
				newManifestContents,
				members: preparedRows.map((row) => ({
					targetPath: row.outputPath,
					oldState: row.oldState,
					newState: row.newState,
					writeStage: row.writeStage,
				})),
				cleanupPolicy: "after-evidence",
				transactionId,
				onPhasePersisted: (phase) => {
					if (phase === "prepared" && options.stopAfter === "prepared") {
						throw new Error("injected stop after prepared");
					}
				},
			});
		},
	);

	if (transactionResult.state === "persisted-release-unconfirmed") {
		await assertNoVisibleTransactionArtifacts(projectRoot);
		throw new Error(
			`Harness transaction release is unconfirmed: ${errorMessage(transactionResult.error)}. Retry before later live work.`,
		);
	}
	if (transactionResult.state === "lock-contended") {
		throw new Error(
			`Harness transaction lock contended at ${transactionResult.lockPath}.`,
		);
	}
	if (transactionResult.state === "recovery-required") {
		if (
			transactionResult.recovery.state !== "evidence-required" ||
			transactionResult.recovery.transactionId !== transactionId
		) {
			throw new Error(
				`Harness recovery is ambiguous: ${JSON.stringify(transactionResult.recovery)}.`,
			);
		}
	} else {
		const applied = transactionResult.result;
		if (applied.state !== "evidence-required") {
			await assertNoVisibleTransactionArtifacts(projectRoot);
			throw new Error(
				applied.state === "restored-old"
					? "Harness migration restored old bytes after a prepared/install failure."
					: `Harness migration did not reach evidence hold: ${JSON.stringify(applied)}.`,
			);
		}
	}

	const journal = await readCommittedJournal(ownerRoot, transactionId);
	const recovery =
		priorRecoveryOutcome ??
		(transactionResult.state === "completed"
			? describeRecovery(transactionResult.recovery)
			: "committed:evidence-required");
	const installed = makeInstalledEvidence(
		evidence,
		journal,
		recovery,
		(options.now ?? (() => new Date()))().toISOString(),
	);
	const installedRaw = await persistEvidence(evidencePath, installed);
	if (options.stopAfter === "installed") {
		await assertNoVisibleTransactionArtifacts(projectRoot);
		throw new Error("injected stop after installed");
	}

	return finishInstalledEvidence({
		...options,
		projectRoot,
		evidencePath,
		evidence: {
			...installed,
			receipt: makeReceipt(installed, evidencePath, installedRaw),
		},
		selectedCheck: options.selectedCheck ?? runFreshSelectedCheck,
		lockRunner: options.lockRunner,
	});
}

async function finishInstalledEvidence(options: {
	readonly projectRoot: string;
	readonly evidencePath: string;
	readonly evidence: RepositoryExportValidationEvidence;
	readonly selectedCheck: RepositorySelectedCheck;
	readonly stopAfter?: RepositoryValidationStop;
	readonly now?: () => Date;
	readonly lockRunner?: NonNullable<
		WithOwnerRootTransactionOptions["lockRunner"]
	>;
}): Promise<RepositoryExportValidationEvidence> {
	const evidenceRaw = await readFile(options.evidencePath, "utf8");
	const receipt =
		options.evidence.phase === "installed"
			? makeReceipt(options.evidence, options.evidencePath, evidenceRaw)
			: undefined;
	const result = await withOwnerRootTransaction(
		{
			ownerRoot: options.evidence.ownerRoot,
			targetId: "claude",
			...(receipt ? { evidenceReceipt: receipt } : {}),
			...(options.lockRunner ? { lockRunner: options.lockRunner } : {}),
		},
		async () => {
			let current = options.evidence;
			if (current.phase === "installed") {
				const checked = await options.selectedCheck({
					projectRoot: options.projectRoot,
					rows: evidenceRowsAsPrepared(current),
				});
				assertSelectedCheck(checked, current);
				const timestamp = (options.now ?? (() => new Date()))().toISOString();
				current = {
					...current,
					phase: "checked",
					receipt,
					checkedAt: timestamp,
					rows: current.rows.map((row) => ({
						...row,
						receipt,
						checkRow: checked.rows.find(
							(candidate) => candidate.asset === row.assetId,
						),
						timestamp,
					})),
				};
				await persistEvidence(options.evidencePath, current);
				if (options.stopAfter === "checked") {
					throw new Error("injected stop after checked");
				}
			}

			const cleanupTimestamp = (
				options.now ?? (() => new Date())
			)().toISOString();
			for (const row of current.rows) {
				const backup = await observeHarnessNodeSnapshot(row.backupPath);
				if (backup.kind === "absent" && row.backupExit === "removed-exact") {
					continue;
				}
				if (!sameSnapshot(backup, row.oldState)) {
					throw new Error(
						`Retained backup is ambiguous for ${row.assetId}: ${row.backupPath}.`,
					);
				}
				await rm(row.backupPath, { recursive: true, force: true });
			}
			current = {
				...current,
				rows: current.rows.map((row) => ({
					...row,
					backupExit: "removed-exact",
					timestamp: cleanupTimestamp,
				})),
			};
			if (options.stopAfter === "backup-cleanup") {
				await persistEvidence(options.evidencePath, current);
				throw new Error("injected stop after backup cleanup");
			}
			await assertProtectedAssets(current.protectedAssets);
			const complete = {
				...current,
				phase: "complete",
				completedAt: cleanupTimestamp,
			} as const satisfies RepositoryExportValidationEvidence;
			await persistEvidence(options.evidencePath, complete);
			return complete;
		},
	);

	if (result.state === "persisted-release-unconfirmed") {
		await assertNoVisibleTransactionArtifacts(options.projectRoot);
		throw new Error(
			`Harness transaction release is unconfirmed: ${errorMessage(result.error)}. Retry before later live work.`,
		);
	}
	if (result.state !== "completed") {
		throw new Error(
			`Cannot finalize repository export evidence: ${JSON.stringify(result)}.`,
		);
	}
	await assertNoVisibleTransactionArtifacts(options.projectRoot);
	return result.result;
}

async function prepareRows(
	projectRoot: string,
	proofs: readonly RepositoryMigrationProof[],
	now: () => Date,
): Promise<readonly RepositoryPreparedRow[]> {
	const rows: RepositoryPreparedRow[] = [];
	for (const proof of proofs) {
		const { row } = proof;
		const asset = projectAsset(projectRoot, row);
		const target = resolveHarnessAssetTarget({
			targetId: "claude",
			asset,
			scope: "project",
			requestedMode: "copy",
			roots: { projectRoot, homeRoot: projectRoot },
		});
		const prepared = await prepareHarnessMaterialization({
			projectRoot,
			asset,
			target,
			mode: "copy",
		});
		const desired = await syncHarnessAsset({
			projectRoot,
			asset,
			target,
			check: true,
			now,
		});
		const scratch = await mkdtemp(
			join(tmpdir(), "cosmonauts-repo-export-render-"),
		);
		const scratchTarget = join(scratch, row.name);
		let newState: HarnessNodeSnapshot;
		try {
			await writePreparedTarget({ targetPath: scratchTarget, prepared });
			newState = await observeHarnessNodeSnapshot(scratchTarget);
		} finally {
			await rm(scratch, { recursive: true, force: true });
		}
		const outputPath = join(projectRoot, row.outputRelativePath);
		const oldState = await observeHarnessNodeSnapshot(outputPath);
		if (snapshotDigest(oldState) !== proof.oldDigest) {
			throw new Error(
				`Historical byte lineage changed while preparing ${row.assetId}; no migration writes were made.`,
			);
		}
		rows.push({
			...row,
			outputPath,
			target,
			asset,
			authorization: proof.authorization,
			historicalDigest: proof.historicalDigest,
			sourceDigest: proof.sourceDigest,
			oldDigest: proof.oldDigest,
			newDigest: snapshotDigest(newState),
			oldState,
			newState,
			manifestEntry: desired.manifestEntry,
			writeStage: (stagePath) =>
				writePreparedTarget({ targetPath: stagePath, prepared }),
		});
	}
	return rows;
}

function projectAsset(
	projectRoot: string,
	row: (typeof PROJECT_EXPORT_ROWS)[number],
): HarnessAsset {
	return {
		assetId: row.assetId,
		kind: "skill",
		ownership: { kind: "project" },
		sourceRootId: `shared:${join(projectRoot, "domains")}`,
		sourceRoot: join(projectRoot, "domains/shared"),
		sourcePath: `skills/${row.name}`,
		logicalPath: row.name,
		outputIdentity: row.name,
		defaultScope: "project",
	};
}

function makeAuthorizedEvidence(options: {
	readonly projectRoot: string;
	readonly ownerRoot: string;
	readonly evidencePath: string;
	readonly transactionId: string;
	readonly timestamp: string;
	readonly newManifestContents: string;
	readonly preparedRows: readonly RepositoryPreparedRow[];
	readonly protectedAssets: readonly ProtectedAssetEvidence[];
	readonly playwright: ProtectedAssetEvidence;
}): RepositoryExportValidationEvidence {
	const journalPath = resolveHarnessTransactionPaths(
		options.ownerRoot,
		"claude",
	).journalPath;
	const journalStem = basename(journalPath, ".journal.json");
	return {
		schemaVersion: 1,
		kind: "repository-harness-export-validation",
		phase: "authorized",
		transactionId: options.transactionId,
		projectRoot: options.projectRoot,
		ownerRoot: options.ownerRoot,
		target: "claude",
		scope: "project",
		cleanupPolicy: "after-evidence",
		atomicSet: true,
		selectedAssetIds: PROJECT_EXPORT_ROWS.map((row) => row.assetId),
		newManifestDigest: sha256(options.newManifestContents),
		excludedTarget: {
			assetId: "skill:coding/playwright-cli",
			outputPath: options.playwright.path,
			digest: snapshotDigest(options.playwright.snapshot),
			status: "locally-edited",
			reason: "foreign-or-untraceable",
		},
		protectedAssets: options.protectedAssets,
		rows: options.preparedRows.map((row, index) => ({
			authorizationKind: "legacy-copied-target",
			consumption: "one-time",
			revision: row.authorization.revision,
			sourceRelativePath: row.sourceRelativePath,
			historicalDigest: row.historicalDigest,
			sourceDigest: row.sourceDigest,
			oldDigest: row.oldDigest,
			newDigest: row.newDigest,
			ownerId: row.authorization.owner.ownerId,
			assetId: row.assetId,
			manifestKey: manifestEntryKey(row.authorization.owner, row.assetId),
			outputPath: row.outputPath,
			nodeShape: row.authorization.nodeShape,
			backupPath: join(
				dirname(journalPath),
				`${journalStem}-${options.transactionId}-${index}.backup`,
			),
			oldState: row.oldState,
			recoveryOutcome: "not-started",
			timestamp: options.timestamp,
		})),
		authorizedAt: options.timestamp,
	};
}

function makeInstalledEvidence(
	evidence: RepositoryExportValidationEvidence,
	journal: OwnerRootTransactionJournal,
	recoveryOutcome: string,
	timestamp: string,
): RepositoryExportValidationEvidence {
	if (
		journal.phase !== "committed" ||
		journal.cleanupPolicy !== "after-evidence" ||
		journal.members.length !== PROJECT_EXPORT_ROWS.length ||
		journal.newManifest.kind !== "file" ||
		journal.newManifest.digest !== evidence.newManifestDigest
	) {
		throw new Error(
			"Committed repository migration journal does not match evidence.",
		);
	}
	return {
		...evidence,
		phase: "installed",
		installedAt: timestamp,
		rows: evidence.rows.map((row, index) => {
			const member = journal.members[index];
			if (
				!member ||
				member.targetPath !== row.outputPath ||
				member.backupPath !== row.backupPath ||
				!sameSnapshot(member.oldState, row.oldState) ||
				snapshotDigest(member.newState) !== row.newDigest
			) {
				throw new Error(`Committed journal row mismatch for ${row.assetId}.`);
			}
			return { ...row, recoveryOutcome, timestamp };
		}),
	};
}

function makeReceipt(
	evidence: RepositoryExportValidationEvidence,
	evidencePath: string,
	raw: string,
): RepositoryEvidenceReceipt {
	if (evidence.phase !== "installed") {
		throw new Error("Only installed evidence can authorize pending clear.");
	}
	return {
		transactionId: evidence.transactionId,
		evidencePath,
		evidenceDigest: sha256(raw),
	};
}

async function readCommittedJournal(
	ownerRoot: string,
	transactionId: string,
): Promise<OwnerRootTransactionJournal> {
	const journalPath = resolveHarnessTransactionPaths(
		ownerRoot,
		"claude",
	).journalPath;
	const parsed: unknown = JSON.parse(await readFile(journalPath, "utf8"));
	if (
		!isRecord(parsed) ||
		parsed.schemaVersion !== 1 ||
		parsed.transactionId !== transactionId ||
		parsed.phase !== "committed" ||
		!Array.isArray(parsed.members)
	) {
		throw new Error("Repository migration journal is absent or not committed.");
	}
	return parsed as unknown as OwnerRootTransactionJournal;
}

function mergeManifest(
	manifest: HarnessProvenanceManifest,
	rows: readonly RepositoryPreparedRow[],
): string {
	const entries = { ...manifest.entries } as Record<
		string,
		MaterializedHarnessManifestEntry
	>;
	for (const row of rows) {
		entries[manifestEntryKey(row.manifestEntry.owner, row.assetId)] =
			row.manifestEntry;
	}
	return serializeHarnessManifest({ schemaVersion: 1, entries });
}

function assertNoExistingClaims(
	manifest: HarnessProvenanceManifest,
	rows: readonly RepositoryPreparedRow[],
): void {
	for (const entry of Object.values(manifest.entries)) {
		if (rows.some((row) => row.outputPath === entry.outputPath)) {
			throw new Error(
				`Repository migration target already has a manifest claim: ${entry.outputPath}.`,
			);
		}
	}
}

function assertProofsMatchEvidence(
	proofs: readonly RepositoryMigrationProof[],
	evidence: RepositoryExportValidationEvidence,
): void {
	if (proofs.length !== evidence.rows.length) {
		throw new Error(
			"Locked lineage re-read did not preserve the four-row set.",
		);
	}
	for (const proof of proofs) {
		const row = evidence.rows.find(
			(candidate) => candidate.assetId === proof.row.assetId,
		);
		if (
			!row ||
			row.revision !== proof.authorization.revision ||
			row.historicalDigest !== proof.historicalDigest ||
			row.oldDigest !== proof.oldDigest ||
			row.ownerId !== proof.authorization.owner.ownerId ||
			row.outputPath !== proof.authorization.outputPath ||
			JSON.stringify(row.nodeShape) !== JSON.stringify(proof.nodeShape)
		) {
			throw new Error(
				`Historical byte lineage changed under lock for ${proof.row.assetId}.`,
			);
		}
	}
}

function evidenceRowsAsPrepared(
	evidence: RepositoryExportValidationEvidence,
): readonly RepositoryPreparedRow[] {
	return evidence.rows.map((row) => ({
		name:
			PROJECT_EXPORT_ROWS.find((candidate) => candidate.assetId === row.assetId)
				?.name ?? row.assetId,
		assetId: row.assetId,
		sourceRelativePath: row.sourceRelativePath,
		outputRelativePath: relative(evidence.projectRoot, row.outputPath),
		outputPath: row.outputPath,
		target: {} as ResolvedHarnessAssetTarget,
		asset: {} as HarnessAsset,
		authorization: {} as LegacyMigrationAuthorization,
		historicalDigest: row.historicalDigest,
		sourceDigest: row.sourceDigest,
		oldDigest: row.oldDigest,
		newDigest: row.newDigest,
		oldState: row.oldState,
		newState: { kind: "directory", digest: row.newDigest },
		manifestEntry: {} as MaterializedHarnessManifestEntry,
		writeStage: async () => {},
	}));
}

function assertSelectedCheck(
	check: Awaited<ReturnType<RepositorySelectedCheck>>,
	evidence: RepositoryExportValidationEvidence,
): void {
	const expected = evidence.selectedAssetIds;
	if (
		check.exitCode !== 0 ||
		check.rows.length !== expected.length ||
		new Set(check.rows.map((row) => row.asset)).size !== expected.length ||
		check.rows.some(
			(row) =>
				!expected.includes(row.asset as RepositoryExportAssetId) ||
				row.final !== "current",
		)
	) {
		throw new Error(
			`The exact four-row selected harness check was not zero/current: ${JSON.stringify(check)}.`,
		);
	}
}

const runFreshSelectedCheck: RepositorySelectedCheck = async ({
	projectRoot,
	rows,
}) => {
	const args = [
		"harness",
		"--json",
		"sync",
		"--target",
		"claude",
		"--scope",
		"project",
		"--kind",
		"skill",
	];
	for (const row of rows) args.push("--asset", row.assetId);
	args.push("--check");
	try {
		const { stdout } = await execFileAsync("cosmonauts", args, {
			cwd: projectRoot,
			maxBuffer: 10 * 1024 * 1024,
		});
		return parseSelectedCheck(stdout, 0);
	} catch (error) {
		if (isRecord(error) && typeof error.stdout === "string") {
			return parseSelectedCheck(error.stdout, 1);
		}
		throw error;
	}
};

function parseSelectedCheck(
	stdout: string,
	exitCode: number,
): Awaited<ReturnType<RepositorySelectedCheck>> {
	const parsed: unknown = JSON.parse(stdout);
	if (!isRecord(parsed) || !Array.isArray(parsed.rows)) {
		throw new Error("Fresh selected harness check did not return JSON rows.");
	}
	return {
		exitCode,
		rows: parsed.rows as RepositorySelectedCheckRow[],
	};
}

async function observeProtectedAssets(
	projectRoot: string,
	homeRoot: string,
): Promise<readonly ProtectedAssetEvidence[]> {
	const paths = [
		{
			label: "playwright-cli" as const,
			path: join(projectRoot, ".claude/skills/playwright-cli"),
		},
		{
			label: "personal-cosmonauts-bundle" as const,
			path: join(homeRoot, ".claude/skills/cosmonauts"),
		},
		{
			label: "live-spec-to-backlog-command" as const,
			path: join(homeRoot, ".claude/commands/spec-to-backlog.md"),
		},
		{
			label: "live-implement-plan-command" as const,
			path: join(homeRoot, ".claude/commands/implement-plan.md"),
		},
	];
	return Promise.all(
		paths.map(async (entry) => ({
			...entry,
			snapshot: await observeHarnessNodeSnapshot(entry.path),
		})),
	);
}

async function assertProtectedAssets(
	assets: readonly ProtectedAssetEvidence[],
): Promise<void> {
	for (const asset of assets) {
		const current = await observeHarnessNodeSnapshot(asset.path);
		if (!sameSnapshot(current, asset.snapshot)) {
			throw new Error(`Protected live asset changed during 8a: ${asset.path}.`);
		}
	}
}

async function assertIgnorePrerequisites(projectRoot: string): Promise<void> {
	const ignore = await readFile(join(projectRoot, ".gitignore"), "utf8");
	const rules = new Set(
		ignore
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith("#")),
	);
	for (const rule of REQUIRED_IGNORE_RULES) {
		if (!rules.has(rule)) {
			throw new Error(
				`D-003 prerequisite is missing from .gitignore before transaction preparation: ${rule}.`,
			);
		}
	}
	for (const path of [
		".agents/.migration-probe",
		".cosmonauts-harness-claude.lock",
		".cosmonauts-harness-claude.journal.json",
		".cosmonauts-harness-claude-probe.stage",
		".cosmonauts-harness-claude-probe.backup",
	]) {
		try {
			await execFileAsync("git", ["check-ignore", "-q", "--no-index", path], {
				cwd: projectRoot,
			});
		} catch {
			throw new Error(
				`D-003 prerequisite does not ignore transaction path: ${path}.`,
			);
		}
	}
}

async function assertNoVisibleTransactionArtifacts(
	projectRoot: string,
): Promise<void> {
	const { stdout } = await execFileAsync(
		"git",
		["status", "--porcelain", "--untracked-files=all"],
		{ cwd: projectRoot },
	);
	const visible = stdout
		.split(/\r?\n/)
		.filter((line) =>
			/(?:^|\/)\.cosmonauts-harness-|(?:^|\/)\.agents\//.test(line),
		);
	if (visible.length > 0) {
		throw new Error(
			`D-003 transaction artifacts are visible to git status:\n${visible.join("\n")}`,
		);
	}
}

async function readGitTree(
	projectRoot: string,
	revision: string,
	sourceRelativePath: string,
): Promise<TreeBytes> {
	if (!/^[0-9a-f]{40}$/i.test(revision)) {
		throw new Error(
			`Historical revision must be a full git object id: ${revision}.`,
		);
	}
	const { stdout } = await execFileAsync(
		"git",
		["ls-tree", "-r", "-z", "--full-tree", revision, "--", sourceRelativePath],
		{ cwd: projectRoot, encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
	);
	const records = Buffer.from(stdout)
		.toString("utf8")
		.split("\0")
		.filter(Boolean);
	if (records.length === 0) {
		throw new Error(
			`Historical source is absent: ${revision}:${sourceRelativePath}.`,
		);
	}
	const files = new Map<string, Buffer>();
	for (const record of records) {
		const match = /^(\d+) (\w+) ([0-9a-f]+)\t(.+)$/.exec(record);
		if (!match || match[2] !== "blob" || match[1] === "120000") {
			throw new Error(
				`Historical source has unsupported node shape: ${record}.`,
			);
		}
		const relativePath = portableRelative(sourceRelativePath, match[4] ?? "");
		const blob = await execFileAsync(
			"git",
			["cat-file", "blob", match[3] ?? ""],
			{
				cwd: projectRoot,
				encoding: "buffer",
				maxBuffer: 10 * 1024 * 1024,
			},
		);
		files.set(relativePath, Buffer.from(blob.stdout));
	}
	return treeFromFiles(files);
}

async function readFilesystemTree(root: string): Promise<TreeBytes> {
	const rootInfo = await lstat(root).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return undefined;
		throw error;
	});
	if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) {
		return {
			files: new Map(),
			shape: [],
			snapshot: { kind: "absent" },
		};
	}
	const files = new Map<string, Buffer>();
	await walkFilesystemTree(root, root, files);
	return treeFromFiles(files);
}

async function walkFilesystemTree(
	root: string,
	directory: string,
	files: Map<string, Buffer>,
): Promise<void> {
	const entries = await readdir(directory, { withFileTypes: true });
	entries.sort((left, right) => left.name.localeCompare(right.name));
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isSymbolicLink()) {
			throw new Error(`Legacy copied target contains a symlink: ${path}.`);
		}
		if (entry.isDirectory()) {
			await walkFilesystemTree(root, path, files);
			continue;
		}
		if (!entry.isFile()) {
			throw new Error(`Legacy copied target contains a special node: ${path}.`);
		}
		files.set(portableRelative(root, path), await readFile(path));
	}
}

function treeFromFiles(files: ReadonlyMap<string, Buffer>): TreeBytes {
	const directories = new Set<string>([""]);
	for (const path of files.keys()) {
		const parts = path.split("/");
		for (let index = 1; index < parts.length; index += 1) {
			directories.add(parts.slice(0, index).join("/"));
		}
	}
	const shape: LegacyCopiedNodeShape[] = [
		...[...directories].map((relativePath) => ({
			relativePath,
			nodeType: "directory" as const,
		})),
		...[...files.keys()].map((relativePath) => ({
			relativePath,
			nodeType: "file" as const,
		})),
	].sort(compareShape);
	return { files, shape, snapshot: snapshotDirectory("", files, directories) };
}

function snapshotDirectory(
	directory: string,
	files: ReadonlyMap<string, Buffer>,
	directories: ReadonlySet<string>,
): HarnessNodeSnapshot {
	const children = new Set<string>();
	const prefix = directory === "" ? "" : `${directory}/`;
	for (const path of [...files.keys(), ...directories]) {
		if (path === directory || !path.startsWith(prefix)) continue;
		const suffix = path.slice(prefix.length);
		const child = suffix.split("/")[0];
		if (child) children.add(child);
	}
	const vector: unknown[] = [];
	for (const child of [...children].sort((left, right) =>
		left.localeCompare(right),
	)) {
		const childPath = prefix + child;
		const bytes = files.get(childPath);
		vector.push([
			child,
			bytes
				? {
						kind: "file",
						digest: sha256(Buffer.concat([Buffer.from("file\0"), bytes])),
					}
				: snapshotDirectory(childPath, files, directories),
		]);
	}
	return { kind: "directory", digest: sha256(JSON.stringify(vector)) };
}

function compareShape(
	left: LegacyCopiedNodeShape,
	right: LegacyCopiedNodeShape,
): number {
	if (left.relativePath === "") return -1;
	if (right.relativePath === "") return 1;
	return left.relativePath.localeCompare(right.relativePath);
}

async function observeManifest(path: string): Promise<HarnessManifestSnapshot> {
	try {
		const contents = await readFile(path, "utf8");
		return { kind: "file", digest: sha256(contents), contents };
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return { kind: "absent" };
		}
		throw error;
	}
}

async function persistEvidence(
	path: string,
	evidence: RepositoryExportValidationEvidence,
): Promise<string> {
	const raw = `${JSON.stringify(evidence, null, "\t")}\n`;
	await writeDurableFile(path, raw);
	const reread = await readFile(path, "utf8");
	if (reread !== raw)
		throw new Error(`Durable evidence re-read failed: ${path}.`);
	return reread;
}

async function readEvidence(
	path: string,
): Promise<RepositoryExportValidationEvidence | undefined> {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		if (!isEvidence(parsed)) {
			throw new Error(`Invalid repository export evidence: ${path}.`);
		}
		return parsed;
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return undefined;
		throw error;
	}
}

function isEvidence(
	value: unknown,
): value is RepositoryExportValidationEvidence {
	return (
		isRecord(value) &&
		value.schemaVersion === 1 &&
		value.kind === "repository-harness-export-validation" &&
		["authorized", "installed", "checked", "complete"].includes(
			String(value.phase),
		) &&
		Array.isArray(value.selectedAssetIds) &&
		Array.isArray(value.rows) &&
		value.rows.length === PROJECT_EXPORT_ROWS.length
	);
}

function validateEvidenceIdentity(
	evidence: RepositoryExportValidationEvidence,
	projectRoot: string,
	evidencePath: string,
): void {
	if (
		evidence.projectRoot !== projectRoot ||
		evidence.ownerRoot !== join(projectRoot, ".claude") ||
		JSON.stringify(evidence.selectedAssetIds) !==
			JSON.stringify(PROJECT_EXPORT_ROWS.map((row) => row.assetId)) ||
		evidence.rows.some(
			(row, index) => row.assetId !== PROJECT_EXPORT_ROWS[index]?.assetId,
		) ||
		(resolve(evidencePath) !== resolve(projectRoot, EVIDENCE_RELATIVE_PATH) &&
			!evidencePath.startsWith(projectRoot))
	) {
		throw new Error(
			"Repository export evidence identity does not match this run.",
		);
	}
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
		const directoryHandle = await open(directory, "r");
		try {
			await directoryHandle.sync();
		} finally {
			await directoryHandle.close();
		}
	} catch (error) {
		await unlink(temporary).catch(() => undefined);
		throw error;
	}
}

function snapshotDigest(snapshot: HarnessNodeSnapshot): string {
	return snapshot.kind === "absent" ? sha256("absent") : snapshot.digest;
}

function sameSnapshot(
	left: HarnessNodeSnapshot,
	right: HarnessNodeSnapshot,
): boolean {
	return (
		left.kind === right.kind &&
		(left.kind === "absent" ||
			(right.kind !== "absent" && left.digest === right.digest))
	);
}

function describeRecovery(recovery: OwnerRootRecoveryResult): string {
	return recovery.state === "none"
		? "none"
		: `${recovery.state}:${"phase" in recovery ? recovery.phase : "unknown"}`;
}

function portableRelative(from: string, to: string): string {
	return relative(from, to).split(sep).join("/");
}

function assertContained(root: string, path: string, label: string): void {
	const rel = relative(resolve(root), resolve(path));
	if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) {
		throw new Error(`${label} must be a child of ${root}: ${path}.`);
	}
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
	const evidence = await runRepositoryExportValidation({
		projectRoot: process.cwd(),
	});
	process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		process.stderr.write(`${errorMessage(error)}\n`);
		process.exitCode = 1;
	});
}
