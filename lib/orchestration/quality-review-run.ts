import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	chmod,
	lstat,
	mkdir,
	open,
	readFile,
	realpath,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
	createSnapshotAnalysisAuthorization,
	type SnapshotAnalysisAuthorization,
} from "../../domains/shared/extensions/project-tools/analysis-consent.ts";
import { parseQualityReviewConfig } from "../config/loader.ts";
import type { ProjectConfig } from "../config/types.ts";
import {
	FileRunStore,
	type RunGraphSchedulerBackend,
	type RunRef,
	type RunStore,
	runStart,
	type StepResult,
} from "../durable-runtime/index.ts";
import { summarizeAssistantText } from "./assistant-text.ts";
import {
	createQualityReviewArtifactSink,
	type QualityReviewArtifactSink,
} from "./quality-review-artifacts.ts";
import {
	type QualityReviewCheckResult,
	renderQualityReviewChecks,
	runQualityReviewChecks,
} from "./quality-review-checks.ts";
import {
	amendUnindexedQualityReviewReport,
	assessQualityReviewReport,
	hasQualityReviewSectionContent,
	indexedQualityReviewReport,
	type QualityReviewVerdict,
	renderQualityReviewReport,
} from "./quality-review-report.ts";
import {
	createPrivateReviewWorkspace,
	preparePrivateReviewWorkspace,
	removePrivateReviewWorkspace,
	WorkspacePreparationFailure,
} from "./quality-review-workspace.ts";

export interface QualityReviewAssessment {
	markdown: string;
	gateState?: string;
	auditFindings?: readonly string[];
	omittedSkillPaths?: readonly string[];
	requiredLenses?: readonly string[];
	liveChildIds?: readonly string[];
}

export interface QualityReviewRunOptions {
	projectRoot: string;
	/** Stage 6 host configured checks; legacy injected assessment tests omit this. */
	hostChecks?: boolean;
	/** Only an explicit completion label or an unambiguous plan session may set this. */
	planSlug?: string;
	signal?: AbortSignal;
	assessmentTimeoutMs?: number;
	panelTimeoutMs?: number;
	qmSettleGraceMs?: number;
	reviewerSealGraceMs?: number;
	workspaceRemovalTimeoutMs?: number;
	operatorNote?: string;
	/** Stage 5 supplies isolation and Stage 6 supplies assessment through this host port. */
	execute?: (context: {
		runId: string;
		signal?: AbortSignal;
		workspaceRoot?: string;
		sourceRoot?: string;
		materialsRoot?: string;
		analysisConsent?: SnapshotAnalysisAuthorization;
		artifactSink: QualityReviewArtifactSink;
		hostRunStoreRoot: string;
		checkResults?: readonly QualityReviewCheckResult[];
		panelTimeoutMs: number;
		operatorNote?: string;
		omittedSkillPaths: string[];
		changedFiles?: readonly string[];
		base?: string;
		activeChildIds: Set<string>;
	}) => Promise<QualityReviewAssessment>;
	refusalReason?: string;
	store?: RunStore;
	removeWorkspace?: typeof removePrivateReviewWorkspace;
}

export interface QualityReviewRunResult {
	ref: RunRef & { scope: "chain" };
	stepResult: StepResult;
}

type Phase =
	| "allocated"
	| "workspace-reserved"
	| "snapshot-ready"
	| "assessing"
	| "finalizing"
	| "finalized"
	| "retained";

export const DEFAULT_WORKSPACE_REMOVAL_TIMEOUT_MS = 60_000;

/** Allocate and finalize a one-step QM run in a private snapshot. */
export async function runQualityReview(
	options: QualityReviewRunOptions,
): Promise<QualityReviewRunResult> {
	const store =
		options.store ??
		new FileRunStore({
			rootDir: join(options.projectRoot, "missions", "sessions"),
		});
	const ref: RunRef & { scope: "chain" } = {
		scope: "chain",
		runId: `qm-${randomUUID()}`,
	};
	const run = await store.createRun({
		...ref,
		status: "pending",
		metadata: { source: "quality-review", planSlug: options.planSlug },
	});
	const sink = createQualityReviewArtifactSink({
		store,
		run,
		stepId: "quality-review",
	});
	const lifecyclePath = join(run.artifactsDir, "qm", "lifecycle.jsonl");
	await mkdir(join(run.artifactsDir, "qm"));
	let previousPhase: Phase | undefined;
	const appendLifecycle = async (
		event: Record<string, unknown>,
	): Promise<void> => {
		const handle = await open(
			lifecyclePath,
			constants.O_WRONLY |
				constants.O_APPEND |
				constants.O_CREAT |
				constants.O_NOFOLLOW,
			0o600,
		);
		try {
			await handle.writeFile(`${JSON.stringify(event)}\n`, "utf8");
			await handle.sync();
		} finally {
			await handle.close();
		}
		await store.appendEvent(ref, {
			type: "run_activity",
			runId: ref.runId,
			details: { source: "quality-review", ...event },
		});
	};
	const phase = async (
		next: Phase,
		details: Record<string, unknown> = {},
	): Promise<void> => {
		const event = {
			at: new Date().toISOString(),
			previousPhase: previousPhase ?? null,
			phase: next,
			activeChildIds: [],
			settledChildIds: [],
			artifactDigests: [],
			disposition: "none",
			...details,
		};
		await appendLifecycle(event);
		previousPhase = next;
	};
	await phase("allocated", { disposition: "none" });
	const provisional = renderQualityReviewReport({
		verdict: "failed",
		reason: "Assessment did not complete.",
	});
	const provisionalRef = await sink.write("final.md", provisional);
	let summaryPath: string | undefined;
	let summaryInitializationError: unknown;
	if (options.planSlug) {
		try {
			summaryPath = await createPlanSummary(
				options.projectRoot,
				options.planSlug,
				ref.runId,
				"failed",
				provisionalRef.path,
				"Assessment did not complete.",
				provisional,
			);
		} catch (error) {
			summaryInitializationError = error;
		}
	}
	let result: StepResult | undefined;
	const execute = async (): Promise<StepResult> => {
		let markdown = "";
		let assessmentText = "";
		let verdict: QualityReviewVerdict = "failed";
		let reason = "Assessment did not complete.";
		let cancelled = options.signal?.aborted === true;
		let workspaceRoot: string | undefined;
		let sourceRoot: string | undefined;
		let materialsRoot: string | undefined;
		let reservedRoot: string | undefined;
		let ownsReservedRoot = false;
		let analysisConsent: SnapshotAnalysisAuthorization | undefined;
		let checkResults: QualityReviewCheckResult[] = [];
		let preparationReport = "# Preparation\n\n- No preparation configured.\n";
		let checkConfigMissing = false;
		let modelConfigMissing = false;
		let changedFiles: readonly string[] = [];
		let capturedBase: string | undefined;
		let baseQualityReview: ProjectConfig["qualityReview"];
		let materialDigests: ReadonlyMap<string, string> | undefined;
		const safeOperatorNote = await redactOperatorNote(options.operatorNote, [
			options.projectRoot,
			store instanceof FileRunStore
				? store.rootDir
				: resolve(run.runDir, "..", "..", ".."),
			run.runDir,
		]);
		let gateOwnedFiles: string[] = [];
		let liveChildIds: readonly string[] = [];
		let qmSessionLive = false;
		const activeChildIds = new Set<string>();
		let observedReviewerModels: string[] = [];
		const omittedSkillPaths: string[] = [];
		let panelTimeoutMs = options.panelTimeoutMs ?? 300_000;
		let assessmentTimeoutMs = options.assessmentTimeoutMs ?? 900_000;
		let qmSettleGraceMs = options.qmSettleGraceMs ?? 3_000;
		try {
			if (cancelled) throw new Error("Caller cancellation");
			if (summaryInitializationError)
				throw new Error(
					`Plan summary initialization failed: ${errorReason(summaryInitializationError)}`,
				);
			if (!options.refusalReason) {
				reservedRoot = join(tmpdir(), `cosmonauts-qm-${ref.runId}`);
				await phase("workspace-reserved", {
					workspace: reservedRoot,
					disposition: "reserved",
				});
				try {
					await mkdir(reservedRoot, { mode: 0o700 });
					ownsReservedRoot = true;
					const snapshot = await createPrivateReviewWorkspace(
						options.projectRoot,
						reservedRoot,
						{
							excludePath: options.planSlug
								? `missions/plans/${options.planSlug}/qm-runs/${ref.runId}.md`
								: undefined,
						},
					);
					workspaceRoot = snapshot.workspaceRoot;
					sourceRoot = snapshot.sourceRealPath;
					materialsRoot = snapshot.materialsRoot;
					capturedBase = snapshot.base;
					changedFiles = snapshot.changedFiles;
					materialDigests = await digestReviewMaterials(materialsRoot);
					baseQualityReview = await loadBaseQualityReviewConfig(
						workspaceRoot,
						capturedBase,
					);
					analysisConsent = await createSnapshotAnalysisAuthorization({
						sourceRoot: snapshot.sourceRealPath,
						snapshotRoot: snapshot.workspaceRoot,
						runId: ref.runId,
						providerId: "fallow",
					});
					try {
						const preparation = await preparePrivateReviewWorkspace(
							snapshot,
							options.signal,
							baseQualityReview,
						);
						preparationReport = `# Preparation\n\n${preparation.map((step) => `- ${step.id}: passed in ${step.durationMs} ms`).join("\n") || "- No preparation configured."}\n`;
						await sink.write("checks.md", preparationReport);
					} catch (error) {
						if (error instanceof WorkspacePreparationFailure)
							await sink.write(
								"checks.md",
								`# Preparation\n\n- ${error.message}\n`,
							);
						throw error;
					}
				} catch (error) {
					if (options.signal?.aborted) throw error;
					if (error instanceof WorkspacePreparationFailure) throw error;
					throw new QualityReviewRefusal(
						`Private workspace preparation refused: ${errorReason(error)}`,
					);
				}
				await phase("snapshot-ready", {
					workspace: reservedRoot,
					disposition: "active",
				});
				panelTimeoutMs =
					options.panelTimeoutMs ??
					baseQualityReview?.panelTimeoutMs ??
					panelTimeoutMs;
				assessmentTimeoutMs =
					options.assessmentTimeoutMs ??
					baseQualityReview?.assessmentTimeoutMs ??
					assessmentTimeoutMs;
				qmSettleGraceMs =
					options.qmSettleGraceMs ??
					baseQualityReview?.qmSettleGraceMs ??
					qmSettleGraceMs;
				if (options.hostChecks) {
					checkConfigMissing = !baseQualityReview?.checks?.length;
					modelConfigMissing = !baseQualityReview?.diverseReviewerModel;
					checkResults = checkConfigMissing
						? []
						: await runQualityReviewChecks({
								cwd: workspaceRoot,
								base: capturedBase ?? "",
								checks: baseQualityReview?.checks ?? [],
								signal: options.signal,
							});
					await sink.write(
						"checks.md",
						`${preparationReport}\n${renderQualityReviewChecks(checkResults)}`,
						{ replace: true },
					);
					if (materialsRoot) {
						const checksCopy = join(materialsRoot, "checks.md");
						await writeFile(
							checksCopy,
							`${preparationReport}\n${renderQualityReviewChecks(checkResults)}`,
						);
						await chmod(checksCopy, 0o400);
						materialDigests = new Map(materialDigests).set(
							"checks.md",
							createHash("sha256")
								.update(await readFile(checksCopy))
								.digest("hex"),
						);
					}
					gateOwnedFiles = changedFiles.filter((path) =>
						isGateOwnedFile(path, baseQualityReview),
					);
					if (
						changedFiles.includes("package.json") &&
						capturedBase &&
						(await configuredPackageScriptsChanged(
							workspaceRoot,
							capturedBase,
							baseQualityReview,
						))
					)
						gateOwnedFiles.push("package.json");
					if (
						changedFiles.includes(".cosmonauts/config.json") &&
						workspaceRoot &&
						capturedBase &&
						(await qualityReviewConfigChanged(workspaceRoot, capturedBase))
					)
						gateOwnedFiles.push(".cosmonauts/config.json");
				}
			}
			if (materialsRoot) await chmod(materialsRoot, 0o500);
			if (options.signal?.aborted) throw new Error("Caller cancellation");
			if (options.refusalReason) {
				verdict = "refused";
				reason = options.refusalReason;
				markdown = renderQualityReviewReport({ verdict, reason });
			} else {
				if (!options.execute)
					throw new Error("Quality review assessment is not attached.");
				if (materialsRoot && materialDigests)
					await verifyReviewMaterials(materialsRoot, materialDigests);
				await phase("assessing", {
					disposition: workspaceRoot ? "active" : "none",
					...(workspaceRoot ? { workspace: workspaceRoot } : {}),
				});
				const assessmentSignal = new AbortController();
				const abortAssessment = () => assessmentSignal.abort();
				options.signal?.addEventListener("abort", abortAssessment, {
					once: true,
				});
				if (options.signal?.aborted) abortAssessment();
				let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
				const deadline = new Promise<never>((_resolve, reject) => {
					deadlineTimer = setTimeout(() => {
						assessmentSignal.abort();
						reject(
							new Error(
								`QM assessment deadline exceeded after ${assessmentTimeoutMs}ms`,
							),
						);
					}, assessmentTimeoutMs);
				});
				const cancelledAssessment = new Promise<never>((_resolve, reject) => {
					assessmentSignal.signal.addEventListener(
						"abort",
						() => {
							if (options.signal?.aborted)
								reject(new Error("Caller cancellation"));
						},
						{ once: true },
					);
				});
				const assessmentPromise = options.execute({
					runId: ref.runId,
					signal: assessmentSignal.signal,
					panelTimeoutMs,
					operatorNote: safeOperatorNote,
					omittedSkillPaths,
					workspaceRoot,
					sourceRoot,
					materialsRoot,
					analysisConsent,
					artifactSink: sink,
					hostRunStoreRoot: run.runDir,
					checkResults,
					changedFiles,
					base: capturedBase,
					activeChildIds,
				});
				let assessmentSettled = false;
				void assessmentPromise.then(
					() => {
						assessmentSettled = true;
					},
					() => {
						assessmentSettled = true;
					},
				);
				let assessment: QualityReviewAssessment;
				try {
					assessment = await Promise.race([
						assessmentPromise,
						deadline,
						cancelledAssessment,
					]);
				} finally {
					if (deadlineTimer) clearTimeout(deadlineTimer);
					options.signal?.removeEventListener("abort", abortAssessment);
					if (!assessmentSettled) {
						await Promise.race([
							assessmentPromise.then(
								() => undefined,
								() => undefined,
							),
							new Promise<void>((resolve) =>
								setTimeout(resolve, qmSettleGraceMs),
							),
						]);
						qmSessionLive = !assessmentSettled;
					}
				}
				markdown = assessment.markdown;
				omittedSkillPaths.push(...(assessment.omittedSkillPaths ?? []));
				const gateState = assessment.gateState;
				liveChildIds = [
					...new Set([...activeChildIds, ...(assessment.liveChildIds ?? [])]),
				];
				if (liveChildIds.length > 0)
					throw new Error(
						`Reviewers still live at assessment end: ${liveChildIds.join(", ")}`,
					);
				const persistedLensIds = new Set(
					sink.references().map((artifact) => artifact.id),
				);
				const missingLenses = (assessment.requiredLenses ?? []).filter(
					(lens) => !persistedLensIds.has(`qm/reviewers/${lens}.md`),
				);
				if (missingLenses.length > 0)
					throw new Error(
						`Missing reviewer evidence: ${missingLenses.join(", ")}`,
					);
				const seenSpawns = new Set<string>();
				const seenSessions = new Set<string>();
				observedReviewerModels = (assessment.requiredLenses ?? []).map(
					(lens) => {
						const artifact = sink
							.references()
							.find((item) => item.id === `qm/reviewers/${lens}.md`);
						const metadata = artifact?.metadata;
						const model = metadata?.resolvedModel;
						const spawnId = metadata?.spawnId;
						const sessionId = metadata?.sessionId;
						if (
							metadata?.resolvedRole !== `coding/${lens}` ||
							typeof spawnId !== "string" ||
							typeof sessionId !== "string" ||
							typeof metadata.finalTextDigest !== "string" ||
							typeof model !== "object" ||
							model === null ||
							!("provider" in model) ||
							!("id" in model) ||
							typeof model.provider !== "string" ||
							typeof model.id !== "string" ||
							seenSpawns.has(spawnId) ||
							seenSessions.has(sessionId)
						)
							throw new Error(`Reviewer evidence correlation failed: ${lens}`);
						seenSpawns.add(spawnId);
						seenSessions.add(sessionId);
						return `${lens}: ${model.provider}/${model.id}`;
					},
				);
				assessmentText = markdown;
				cancelled = options.signal?.aborted === true;
				if (cancelled) throw new Error("Caller cancellation");
				const assessed = assessQualityReviewReport(markdown);
				verdict = assessed.verdict;
				if (verdict === "refused") {
					await sink.write("raw-final.md", markdown);
					throw new Error(
						"Report integrity: only the host may produce refused",
					);
				}
				reason =
					assessed.reason ??
					(assessed.indexAvailable
						? "Assessment completed."
						: "Index unavailable; verdict derived from report sections.");
				if (!assessed.indexAvailable && !assessed.reason)
					markdown += "\n\nIndex unavailable.\n";
				if (assessed.verdict === "failed" && assessed.reason) {
					await sink.write("raw-final.md", markdown);
					markdown = renderQualityReviewReport({
						verdict: "failed",
						reason: `Report integrity: ${assessed.reason}`,
					});
				}
				if (options.hostChecks) {
					if (!(assessed.verdict === "failed" && assessed.reason))
						await sink.write("raw-final.md", markdown, { replace: true });
					const reported = indexedQualityReviewReport(markdown);
					const gateEvidenceMissing = !hasQualityReviewSectionContent(
						markdown,
						"Gates",
					);
					const hostBlocksReady =
						gateState !== "completed-bound" ||
						checkConfigMissing ||
						modelConfigMissing ||
						gateEvidenceMissing ||
						hasQualityReviewSectionContent(markdown, "Findings") ||
						hasQualityReviewSectionContent(markdown, "Human decisions") ||
						gateOwnedFiles.length > 0 ||
						checkResults.some(
							(check) => check.exitCode !== 0 || check.timedOut,
						);
					if (hostBlocksReady && verdict !== "failed") {
						verdict = "not-ready";
						reason = "Checks, findings, or human decisions require attention.";
					}
					const hostCheckLines = checkResults.map(
						(check) =>
							`${check.id}: argv ${JSON.stringify(check.argv)}, exit ${check.exitCode ?? "unavailable"}, duration ${check.durationMs} ms, output ${JSON.stringify(check.output.slice(0, 2000))}`,
					);
					const hostHumanItems = [
						...(gateState === undefined ||
						(gateState !== "completed-bound" &&
							!gateState.startsWith("Analysis audit gate state: fail"))
							? [
									`${gateState ? (gateState.startsWith("Analysis audit ") ? gateState : `Analysis audit gate state: ${gateState}`) : "Analysis audit gate state: not observed"}; human decision required.`,
								]
							: []),
						...(gateEvidenceMissing
							? ["Gate evidence missing; human decision required."]
							: []),
						...(checkConfigMissing
							? [
									"Not configured: qualityReview.checks; human decision required.",
								]
							: []),
						...(modelConfigMissing
							? [
									"Not configured: qualityReview.diverseReviewerModel; human decision required.",
								]
							: []),
						...gateOwnedFiles.map(
							(file) =>
								`Gate-owned file changed: ${file}; human decision required.`,
						),
					];
					const hostReviewed = [
						"Host configured checks and captured changed-file list in the private snapshot.",
					];
					const hostGateLines = gateState?.startsWith(
						"Analysis audit gate state: fail",
					)
						? [gateState]
						: [];
					const hostFindingLines =
						hostGateLines.length > 0
							? [...(assessment.auditFindings ?? [])]
							: [];
					if (!reported) {
						markdown = amendUnindexedQualityReviewReport(markdown, {
							verdict,
							reason,
							checks: hostCheckLines,
							gates: hostGateLines,
							findings: hostFindingLines,
							humanItems: hostHumanItems,
							reviewed: hostReviewed,
							reviewerModels: observedReviewerModels,
						});
					} else
						markdown = renderQualityReviewReport({
							...reported,
							verdict,
							reason,
							checks: [...(reported.checks ?? []), ...hostCheckLines],
							gates: [...(reported.gates ?? []), ...hostGateLines],
							findings: [...(reported.findings ?? []), ...hostFindingLines],
							humanItems: [
								...new Set([...(reported.humanItems ?? []), ...hostHumanItems]),
							],
							reviewed: [...(reported.reviewed ?? []), ...hostReviewed],
							reviewerModels:
								observedReviewerModels.length > 0
									? observedReviewerModels
									: (reported.reviewerModels ?? []),
						});
				}
			}
		} catch (error) {
			liveChildIds = [...activeChildIds];
			cancelled = cancelled || options.signal?.aborted === true;
			verdict =
				error instanceof QualityReviewRefusal && !cancelled
					? "refused"
					: "failed";
			reason = cancelled
				? `Caller cancellation: ${errorReason(error)}`
				: errorReason(error);
			if (
				markdown &&
				!sink.references().some((artifact) => artifact.id === "qm/raw-final.md")
			)
				await sink.write("raw-final.md", markdown, { replace: true });
			const failureReport = renderQualityReviewReport({
				verdict,
				reason,
				checks: checkResults.map(
					(check) =>
						`${check.id}: argv ${JSON.stringify(check.argv)}, exit ${check.exitCode ?? "unavailable"}, duration ${check.durationMs} ms, output ${JSON.stringify(check.output.slice(0, 2000))}`,
				),
				humanItems: [
					...(checkConfigMissing
						? ["Not configured: qualityReview.checks; human decision required."]
						: []),
					...(modelConfigMissing
						? [
								"Not configured: qualityReview.diverseReviewerModel; human decision required.",
							]
						: []),
					...gateOwnedFiles.map(
						(file) =>
							`Gate-owned file changed: ${file}; human decision required.`,
					),
				],
				reviewed:
					checkResults.length > 0
						? ["Host configured checks in the private snapshot."]
						: [],
				reviewerModels: observedReviewerModels,
			});
			const assessmentStructure = markdown
				? assessQualityReviewReport(markdown)
				: undefined;
			markdown =
				assessmentStructure &&
				!assessmentStructure.reason &&
				!reason.startsWith("Report integrity:")
					? amendUnindexedQualityReviewReport(markdown, {
							verdict,
							reason,
							checks: checkResults.map(
								(check) =>
									`${check.id}: argv ${JSON.stringify(check.argv)}, exit ${check.exitCode ?? "unavailable"}, duration ${check.durationMs} ms, output ${JSON.stringify(check.output.slice(0, 2000))}`,
							),
							humanItems: [
								...(checkConfigMissing
									? [
											"Not configured: qualityReview.checks; human decision required.",
										]
									: []),
								...(modelConfigMissing
									? [
											"Not configured: qualityReview.diverseReviewerModel; human decision required.",
										]
									: []),
								...gateOwnedFiles.map(
									(file) =>
										`Gate-owned file changed: ${file}; human decision required.`,
								),
							],
							reviewed:
								checkResults.length > 0
									? ["Host configured checks in the private snapshot."]
									: [],
							reviewerModels: observedReviewerModels,
						})
					: failureReport;
		}
		const abandonedLenses = await sink.sealReviewers(
			options.reviewerSealGraceMs ?? 1000,
		);
		if (abandonedLenses.length > 0) {
			verdict = "failed";
			reason = `${reason}; Report integrity: reviewer writes abandoned after sealing grace: ${abandonedLenses.join(", ")}`;
			const completed = indexedQualityReviewReport(markdown);
			markdown = completed
				? renderQualityReviewReport({ ...completed, verdict, reason })
				: !assessQualityReviewReport(markdown).reason
					? amendUnindexedQualityReviewReport(markdown, {
							verdict,
							reason,
							checks: [],
							humanItems: [],
							reviewed: [],
							reviewerModels: [],
						})
					: renderQualityReviewReport({ verdict, reason });
		}
		if (qmSessionLive)
			markdown = `${markdown.trimEnd()}\n\nLive work: QM session did not settle after cancellation or deadline.\n`;
		if (ownsReservedRoot && (qmSessionLive || liveChildIds.length > 0))
			markdown = `${markdown.trimEnd()}\n\nWorkspace retained: ${reservedRoot}. Live work may still use it.\n`;
		markdown = `${markdown.trimEnd()}\n\nPanel completion timeout: ${panelTimeoutMs} ms.\n\nCaller-owned remediation: address findings through tasks, Drive and independent review.\n`;
		if (omittedSkillPaths.length > 0)
			markdown = `${markdown.trimEnd()}\n\nOmitted skill locations: ${[...new Set(omittedSkillPaths)].join(", ")}\n`;
		if (safeOperatorNote)
			markdown = `${markdown.trimEnd()}\n\nOperator note (non-authoritative): ${JSON.stringify(safeOperatorNote)}\n`;
		await phase("finalizing", {
			disposition: ownsReservedRoot ? "active" : "none",
			...(reservedRoot ? { workspace: reservedRoot } : {}),
		});
		let summaryReplaced = false;
		let terminalPersisted = false;
		try {
			analysisConsent?.dispose();
			if (summaryPath) {
				await replacePlanSummary(
					summaryPath,
					renderPlanSummary(
						ref.runId,
						verdict,
						provisionalRef.path,
						reason,
						markdown,
					),
				);
				summaryReplaced = true;
			}
			const finalRef = await sink.write("final.md", markdown, {
				replace: true,
			});
			const canRemove = Boolean(
				reservedRoot &&
					ownsReservedRoot &&
					!qmSessionLive &&
					liveChildIds.length === 0,
			);
			const terminalStatus = cancelled
				? "cancelled"
				: verdict === "refused"
					? "blocked"
					: verdict === "failed"
						? "failed"
						: "completed";
			await phase(canRemove || !ownsReservedRoot ? "finalized" : "retained", {
				status: terminalStatus,
				disposition: canRemove
					? "pending-removal"
					: ownsReservedRoot
						? "retained"
						: "none",
				activeChildIds: liveChildIds,
				...(qmSessionLive ? { liveSession: "quality-manager" } : {}),
				...(reservedRoot ? { workspace: reservedRoot } : {}),
				artifactDigests: [finalRef.metadata?.sha256],
			});
			terminalPersisted = true;
			if (canRemove && reservedRoot) {
				let timer: ReturnType<typeof setTimeout> | undefined;
				let disposition = "removed";
				let removalReason: string | undefined;
				try {
					await Promise.race([
						(options.removeWorkspace ?? removePrivateReviewWorkspace)(
							reservedRoot,
						),
						new Promise<never>((_resolve, reject) => {
							timer = setTimeout(
								() => reject(new Error("removal-timed-out")),
								options.workspaceRemovalTimeoutMs ??
									baseQualityReview?.workspaceRemovalTimeoutMs ??
									DEFAULT_WORKSPACE_REMOVAL_TIMEOUT_MS,
							);
						}),
					]);
				} catch (error) {
					disposition =
						errorReason(error) === "removal-timed-out"
							? "removal-timed-out"
							: "removal-failed";
					removalReason = errorReason(error);
				} finally {
					if (timer) clearTimeout(timer);
				}
				await appendLifecycle({
					at: new Date().toISOString(),
					kind: "artifact-disposition",
					previousPhase,
					disposition,
					workspace: reservedRoot,
					...(removalReason ? { reason: removalReason } : {}),
				});
			}
			result = {
				outcome: cancelled
					? "cancelled"
					: verdict === "refused"
						? "blocked"
						: verdict === "failed"
							? "failed"
							: "success",
				summary: summarizeAssistantText(
					verdict === "ready" || verdict === "not-ready"
						? assessmentText
						: reason,
					"quality-manager",
				),
				artifacts: sink.references(),
				...(verdict === "refused"
					? { nextAction: "wait_for_human" as const }
					: {}),
			};
			return result;
		} catch (error) {
			if (terminalPersisted) {
				result = {
					outcome: cancelled
						? "cancelled"
						: verdict === "refused"
							? "blocked"
							: verdict === "failed"
								? "failed"
								: "success",
					summary: reason.slice(0, 200),
					artifacts: sink.references(),
				};
				return result;
			}
			const failure = `Report persistence failed: ${errorReason(error)}`;
			if (summaryPath && summaryReplaced) {
				try {
					await replacePlanSummary(
						summaryPath,
						renderPlanSummary(
							ref.runId,
							"failed",
							provisionalRef.path,
							failure,
							provisional,
						),
					);
				} catch {
					// The persisted lifecycle still records the failed compensation.
				}
			}
			await phase(ownsReservedRoot ? "retained" : "finalizing", {
				disposition: ownsReservedRoot ? "retained" : "none",
				...(reservedRoot ? { workspace: reservedRoot } : {}),
				reason: failure,
			});
			result = {
				outcome: "failed",
				summary: failure.slice(0, 200),
				artifacts: [provisionalRef],
			};
			return result;
		}
	};

	const backend: RunGraphSchedulerBackend = {
		name: "cosmonauts-subagent",
		capabilities: {
			canResume: false,
			canCancel: false,
			canCommit: false,
			isolatedFromHostSource: true,
			emitsMachineReport: true,
		},
		async prepare(step, context) {
			return {
				step,
				attemptId: context.attemptId,
				backend: step.backend,
				input: context.input,
				preparedAt: new Date().toISOString(),
			};
		},
		async start(prepared) {
			return {
				backend: prepared.backend,
				stepId: prepared.step.id,
				attemptId: prepared.attemptId,
				startedAt: prepared.preparedAt,
				result: execute(),
			};
		},
	};
	const graph = {
		steps: [
			{
				id: "quality-review",
				runId: ref.runId,
				title: "Quality review",
				kind: "agent" as const,
				backend: { name: "cosmonauts-subagent" as const },
				dependsOn: [],
				inputArtifacts: [],
			},
		],
		edges: [],
	};
	await runStart({
		store,
		ref,
		graph,
		backends: new Map([[backend.name, backend]]),
		holderId: `quality-review-${process.pid}`,
		maxPasses: 5,
	});
	if (!result)
		throw new Error(`Quality review ${ref.runId} ended without a step result`);
	return { ref, stepResult: result };
}

function errorReason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function redactOperatorNote(
	note: string | undefined,
	paths: readonly string[],
): Promise<string | undefined> {
	if (!note) return undefined;
	const roots = new Set<string>();
	for (const path of paths) {
		roots.add(resolve(path));
		roots.add(await realpath(path).catch(() => resolve(path)));
	}
	let redacted = note;
	for (const root of [...roots].sort((a, b) => b.length - a.length)) {
		redacted = redacted.replaceAll(root, "[private path]");
		const home = homedir();
		if (root.startsWith(`${home}/`))
			redacted = redacted.replaceAll(
				`~/${root.slice(home.length + 1)}`,
				"[private path]",
			);
	}
	return redacted;
}

function loadBaseQualityReviewConfig(
	workspaceRoot: string,
	base: string,
): ProjectConfig["qualityReview"] {
	const object = `${base}:.cosmonauts/config.json`;
	try {
		execFileSync("git", ["cat-file", "-e", object], {
			cwd: workspaceRoot,
			stdio: "ignore",
		});
	} catch {
		return undefined;
	}
	const raw = execFileSync("git", ["show", object], {
		cwd: workspaceRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
	const parsed: unknown = JSON.parse(raw);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
		throw new Error("Invalid base config: expected object");
	const block = (parsed as Record<string, unknown>).qualityReview;
	return block === undefined ? undefined : parseQualityReviewConfig(block);
}

function isGateOwnedFile(
	path: string,
	config: ProjectConfig["qualityReview"],
): boolean {
	return (
		(config?.gateOwnedPaths ?? []).includes(path) ||
		path === ".cosmonauts/suppression-exceptions.json" ||
		path === "scripts/check-new-suppressions.ts" ||
		path === "lib/quality/suppression-policy.ts" ||
		path === "domains/shared/extensions/project-tools/fallow-provider.ts" ||
		path.startsWith(".fallow-baselines/")
	);
}

async function configuredPackageScriptsChanged(
	workspaceRoot: string,
	base: string,
	config: ProjectConfig["qualityReview"],
): Promise<boolean> {
	const names = new Set<string>();
	for (const step of [...(config?.prepare ?? []), ...(config?.checks ?? [])]) {
		if (!/(?:^|\/)bun$/.test(step.command)) continue;
		const index = step.args.indexOf("run");
		const name = step.args[index + 1];
		if (index >= 0 && name) names.add(name);
	}
	if (names.size === 0) return false;
	try {
		const before = JSON.parse(
			execFileSync("git", ["show", `${base}:package.json`], {
				cwd: workspaceRoot,
				encoding: "utf8",
			}),
		) as { scripts?: Record<string, unknown> };
		const after = JSON.parse(
			await readFile(join(workspaceRoot, "package.json"), "utf8"),
		) as { scripts?: Record<string, unknown> };
		return [...names].some(
			(name) => before.scripts?.[name] !== after.scripts?.[name],
		);
	} catch {
		return true;
	}
}

async function digestReviewMaterials(
	root: string,
): Promise<ReadonlyMap<string, string>> {
	const digests = new Map<string, string>();
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await (await import("node:fs/promises")).readdir(
			directory,
			{ withFileTypes: true },
		)) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) await visit(path);
			else if (entry.isFile())
				digests.set(
					relative(root, path),
					createHash("sha256")
						.update(await readFile(path))
						.digest("hex"),
				);
			else
				throw new Error(
					`Report integrity: invalid materials file ${relative(root, path)}`,
				);
		}
	};
	await visit(root);
	return digests;
}

async function verifyReviewMaterials(
	root: string,
	expected: ReadonlyMap<string, string>,
): Promise<void> {
	const actual = await digestReviewMaterials(root);
	for (const [file, digest] of expected)
		if (actual.get(file) !== digest)
			throw new Error(
				`Report integrity: materials/${file} changed before assessment`,
			);
	for (const file of actual.keys())
		if (!expected.has(file))
			throw new Error(
				`Report integrity: materials/${file} appeared before assessment`,
			);
}

async function qualityReviewConfigChanged(
	workspaceRoot: string,
	base: string,
): Promise<boolean> {
	const parseBlock = (contents: string) => {
		const parsed: unknown = JSON.parse(contents);
		return typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>).qualityReview
			: undefined;
	};
	try {
		const before = execFileSync(
			"git",
			["show", `${base}:.cosmonauts/config.json`],
			{
				cwd: workspaceRoot,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			},
		);
		const after = await readFile(
			join(workspaceRoot, ".cosmonauts", "config.json"),
			"utf8",
		);
		return !isDeepStrictEqual(parseBlock(before), parseBlock(after));
	} catch {
		return true;
	}
}

class QualityReviewRefusal extends Error {}

function renderPlanSummary(
	runId: string,
	verdict: QualityReviewVerdict,
	reportPath: string,
	reason: string,
	markdown: string,
): string {
	const normalized = markdown.replace(/\r\n/g, "\n");
	const headings = [
		"Checks",
		"Gates",
		"Findings",
		"Human decisions",
		"Out-of-range observations",
		"Reviewed",
		"Reviewer models",
	];
	const sections = headings.map((heading) => {
		const marker = `## ${heading}\n`;
		const start = normalized.indexOf(marker);
		const tail = start < 0 ? "" : normalized.slice(start + marker.length);
		const end = tail.search(/^## |^<!-- COSMO_QM_REPORT/m);
		return `## ${heading}\n\n${(end < 0 ? tail : tail.slice(0, end)).trim() || "- None recorded."}`;
	});
	return `# Quality review ${runId}\n\nVerdict: ${verdict}\n\nFull report: ${reportPath}\n\nReason: ${reason}\n\n${sections.join("\n\n")}\n`;
}

async function createPlanSummary(
	projectRoot: string,
	planSlug: string,
	runId: string,
	verdict: QualityReviewVerdict,
	reportPath: string,
	reason: string,
	markdown: string,
): Promise<string> {
	if (!/^[a-z0-9][a-z0-9-]*$/.test(planSlug))
		throw new Error("Invalid plan identity");
	const directory = join(projectRoot, "missions", "plans", planSlug, "qm-runs");
	await ensurePlanDirectory(projectRoot, directory);
	const path = join(directory, `${runId}.md`);
	await writeFile(
		path,
		renderPlanSummary(runId, verdict, reportPath, reason, markdown),
		{ flag: "wx" },
	);
	return path;
}

async function replacePlanSummary(
	path: string,
	contents: string,
): Promise<void> {
	const temporary = `${path}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, contents, { flag: "wx" });
		await rename(temporary, path);
	} finally {
		await rm(temporary, { force: true });
	}
}

async function ensurePlanDirectory(
	projectRoot: string,
	directory: string,
): Promise<void> {
	const root = resolve(projectRoot);
	let cursor = root;
	for (const part of relative(root, directory).split(sep)) {
		if (!part || part === "..") throw new Error("Unsafe plan summary path");
		cursor = join(cursor, part);
		try {
			await mkdir(cursor);
		} catch (error) {
			if (
				!(
					typeof error === "object" &&
					error !== null &&
					"code" in error &&
					error.code === "EEXIST"
				)
			)
				throw error;
		}
		const stat = await lstat(cursor);
		if (!stat.isDirectory() || stat.isSymbolicLink())
			throw new Error("Plan summary directory is not a regular directory");
	}
}
