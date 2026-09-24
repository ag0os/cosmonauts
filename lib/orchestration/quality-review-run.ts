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
	assessReviewerDiversity,
	calibrateReviewerFindings,
	type ObservedModel,
	reviewerEvidenceFromLines,
} from "./quality-review-models.ts";
import {
	amendUnindexedQualityReviewReport,
	applyReviewerCalibration,
	assessQualityReviewReport,
	hasQualityReviewSectionContent,
	hasUnexpectedQualityReviewSectionContent,
	indexedQualityReviewReport,
	type QualityReviewVerdict,
	qualityReviewFindingLines,
	qualityReviewObservationLines,
	renderQualityReviewReport,
} from "./quality-review-report.ts";
import { reviewerEvidenceModels } from "./quality-review-seal.ts";
import {
	createPrivateReviewWorkspace,
	type PrivateReviewWorkspace,
	preparePrivateReviewWorkspace,
	removePrivateReviewWorkspace,
	WorkspacePreparationFailure,
} from "./quality-review-workspace.ts";

interface QualityReviewAssessment {
	markdown: string;
	implementerModel?: ObservedModel;
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
	prepareRuntime?: (context: {
		sourceRoot: string;
		reservedRoot: string;
		base: string;
		signal: AbortSignal;
	}) => Promise<void>;
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

const DEFAULT_WORKSPACE_REMOVAL_TIMEOUT_MS = 60_000;
const OPERATOR_AUTHORITY_DISCLOSURE =
	"Host-run preparation and checks execute the reviewed change's code with the operator's authority, unsandboxed.";

function discloseOperatorAuthority(
	markdown: string,
	verdict: QualityReviewVerdict,
	reason: string,
): string {
	const indexed = indexedQualityReviewReport(markdown);
	return indexed
		? renderQualityReviewReport({
				...indexed,
				reason,
				reviewed: [
					...new Set([
						...(indexed.reviewed ?? []),
						OPERATOR_AUTHORITY_DISCLOSURE,
					]),
				],
			})
		: amendUnindexedQualityReviewReport(markdown, {
				verdict,
				reason,
				checks: [],
				humanItems: [],
				reviewed: [OPERATOR_AUTHORITY_DISCLOSURE],
				reviewerModels: [],
			});
}

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
		reviewed: [OPERATOR_AUTHORITY_DISCLOSURE],
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
		let privateWorkspace: PrivateReviewWorkspace | undefined;
		let sourceRoot: string | undefined;
		let materialsRoot: string | undefined;
		let reservedRoot: string | undefined;
		let ownsReservedRoot = false;
		let analysisConsent: SnapshotAnalysisAuthorization | undefined;
		let checkResults: QualityReviewCheckResult[] = [];
		let preparationReport = "# Preparation\n\n- No preparation configured.\n";
		const analysisPreparationLines: string[] = [];
		let analysisPreparationFailed = false;
		let preparationFailed = false;
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
		let runtimeSetupLive = false;
		const activeChildIds = new Set<string>();
		let observedReviewerModels: string[] = [];
		let diversityIssue: string | undefined;
		let diversityHumanItem: string | undefined;
		const omittedSkillPaths: string[] = [];
		let panelTimeoutMs = options.panelTimeoutMs ?? 300_000;
		let assessmentTimeoutMs = options.assessmentTimeoutMs ?? 900_000;
		let assessmentStartedAt = 0;
		let qmSettleGraceMs = options.qmSettleGraceMs ?? 3_000;

		async function prepareSnapshot(): Promise<void> {
			reservedRoot = join(tmpdir(), `cosmonauts-qm-${ref.runId}`);
			await phase("workspace-reserved", {
				workspace: reservedRoot,
				disposition: "reserved",
			});
			try {
				await captureSnapshot();
			} catch (error) {
				if (options.signal?.aborted) throw error;
				throw new QualityReviewRefusal(
					`Private workspace preparation refused: ${errorReason(error)}`,
				);
			}
			await phase("snapshot-ready", {
				workspace: reservedRoot,
				disposition: "active",
			});
			configureAssessmentTimers();
		}

		function configureAssessmentTimers(): void {
			panelTimeoutMs = configuredDuration(
				options.panelTimeoutMs,
				baseQualityReview?.panelTimeoutMs,
				panelTimeoutMs,
			);
			assessmentTimeoutMs = configuredDuration(
				options.assessmentTimeoutMs,
				baseQualityReview?.assessmentTimeoutMs,
				assessmentTimeoutMs,
			);
			qmSettleGraceMs = configuredDuration(
				options.qmSettleGraceMs,
				baseQualityReview?.qmSettleGraceMs,
				qmSettleGraceMs,
			);
			assessmentStartedAt = Date.now();
		}

		function configuredDuration(
			caller: number | undefined,
			base: number | undefined,
			fallback: number,
		): number {
			return caller ?? base ?? fallback;
		}

		function observedGateState(
			assessment: QualityReviewAssessment,
		): string | undefined {
			if (
				analysisPreparationFailed &&
				assessment.gateState !== "completed-bound" &&
				assessment.gateState !== "Analysis audit gate state: fail"
			)
				return "failed-to-run (analysis preparation failed)";
			return assessment.gateState;
		}

		function hostGateLinesFor(gateState: string | undefined): string[] {
			if (analysisPreparationFailed)
				return [
					gateState?.startsWith("Analysis audit gate state: ")
						? gateState
						: `Analysis audit gate state: ${gateState}`,
				];
			return gateState?.startsWith("Analysis audit gate state: fail")
				? [gateState]
				: [];
		}

		function hostAuditFindings(
			assessment: QualityReviewAssessment,
			gateLines: readonly string[],
		): string[] {
			return gateLines.some(
				(line) => line === "Analysis audit gate state: fail",
			)
				? [...(assessment.auditFindings ?? [])]
				: [];
		}

		async function captureSnapshot(): Promise<void> {
			await mkdir(reservedRoot as string, { mode: 0o700 });
			ownsReservedRoot = true;
			const snapshot = await createPrivateReviewWorkspace(
				options.projectRoot,
				reservedRoot as string,
				{
					deferMaterials: Boolean(options.prepareRuntime),
					excludePath: options.planSlug
						? `missions/plans/${options.planSlug}/qm-runs/${ref.runId}.md`
						: undefined,
				},
			);
			privateWorkspace = snapshot;
			workspaceRoot = snapshot.workspaceRoot;
			sourceRoot = snapshot.sourceRealPath;
			materialsRoot = snapshot.materialsRoot;
			capturedBase = snapshot.base;
			changedFiles = snapshot.changedFiles;
			baseQualityReview = await loadBaseQualityReviewConfig(
				sourceRoot,
				capturedBase,
			);
			analysisConsent = await createSnapshotAnalysisAuthorization({
				sourceRoot: snapshot.sourceRealPath,
				snapshotRoot: snapshot.workspaceRoot,
				runId: ref.runId,
				providerId: "fallow",
			});
		}

		async function prepareRuntime(): Promise<void> {
			const inputs = runtimeSetupInputs();
			if (inputs) {
				const setup = new AbortController();
				const abort = () => setup.abort();
				options.signal?.addEventListener("abort", abort, { once: true });
				if (options.signal?.aborted) abort();
				if (setup.signal.aborted) {
					options.signal?.removeEventListener("abort", abort);
					throw new Error("Caller cancellation");
				}
				let timer: ReturnType<typeof setTimeout> | undefined;
				let setupSettled = false;
				const setupPromise = inputs.prepareRuntime({
					sourceRoot: inputs.sourceRoot,
					reservedRoot: inputs.reservedRoot,
					base: inputs.base,
					signal: setup.signal,
				});
				void setupPromise.then(
					() => {
						setupSettled = true;
					},
					() => {
						setupSettled = true;
					},
				);
				try {
					await Promise.race([
						setupPromise,
						new Promise<never>((_resolve, reject) => {
							timer = setTimeout(
								() => {
									setup.abort();
									reject(
										new Error(
											`QM assessment deadline exceeded after ${assessmentTimeoutMs}ms`,
										),
									);
								},
								Math.max(
									1,
									assessmentTimeoutMs - (Date.now() - assessmentStartedAt),
								),
							);
							setup.signal.addEventListener(
								"abort",
								() => {
									if (options.signal?.aborted)
										reject(new Error("Caller cancellation"));
								},
								{ once: true },
							);
						}),
					]);
				} finally {
					if (!setupSettled) {
						let settleTimer: ReturnType<typeof setTimeout> | undefined;
						try {
							await Promise.race([
								setupPromise.then(
									() => undefined,
									() => undefined,
								),
								new Promise<void>((resolve) => {
									settleTimer = setTimeout(resolve, qmSettleGraceMs);
								}),
							]);
						} finally {
							if (settleTimer) clearTimeout(settleTimer);
						}
						runtimeSetupLive = !setupSettled;
					}
					if (timer) clearTimeout(timer);
					options.signal?.removeEventListener("abort", abort);
				}
			}
		}

		function runtimeSetupInputs() {
			const prepareRuntime = options.prepareRuntime;
			if (!prepareRuntime || !sourceRoot || !reservedRoot || !capturedBase)
				return;
			return { prepareRuntime, sourceRoot, reservedRoot, base: capturedBase };
		}

		async function prepareEvidenceAndGates(): Promise<void> {
			if (options.prepareRuntime && privateWorkspace)
				await privateWorkspace.materializeMaterials();
			if (materialsRoot)
				materialDigests = await digestReviewMaterials(materialsRoot);
			await prepareAnalysisWorkspace();
			if (options.hostChecks) {
				checkConfigMissing = !baseQualityReview?.checks?.length;
				modelConfigMissing = !baseQualityReview?.diverseReviewerModel;
				await collectGateOwnedFiles();
			}
		}

		async function prepareAnalysisWorkspace(): Promise<void> {
			if (privateWorkspace && baseQualityReview?.analysisPrepare?.length) {
				try {
					const prepared = await preparePrivateReviewWorkspace(
						privateWorkspace,
						options.signal,
						{
							prepare: baseQualityReview.analysisPrepare,
						},
					);
					analysisPreparationLines.push(
						...prepared.map(
							(step) =>
								`Analysis preparation ${step.id}: passed in ${step.durationMs} ms (lifecycle scripts disabled).`,
						),
					);
				} catch (error) {
					if (!(error instanceof WorkspacePreparationFailure)) throw error;
					analysisPreparationLines.push(
						...error.completedSteps.map(
							(step) =>
								`Analysis preparation ${step.id}: passed in ${step.durationMs} ms (lifecycle scripts disabled).`,
						),
					);
					analysisPreparationLines.push(
						`Analysis preparation ${baseQualityReview.analysisPrepare[error.completedSteps.length]?.id ?? "unknown"}: failed (${error.message}).`,
					);
					analysisPreparationFailed = true;
				}
			}
		}

		async function collectGateOwnedFiles(): Promise<void> {
			gateOwnedFiles = changedFiles.filter((path) =>
				isGateOwnedFile(path, baseQualityReview),
			);
			if (await packageScriptsChanged()) gateOwnedFiles.push("package.json");
			if (await reviewConfigChanged())
				gateOwnedFiles.push(".cosmonauts/config.json");
			gateOwnedFiles = [...new Set(gateOwnedFiles)];
		}

		async function packageScriptsChanged(): Promise<boolean> {
			return Boolean(
				changedFiles.includes("package.json") &&
					capturedBase &&
					(await configuredPackageScriptsChanged(
						sourceRoot ?? "",
						workspaceRoot ?? "",
						capturedBase,
						baseQualityReview,
					)),
			);
		}

		async function reviewConfigChanged(): Promise<boolean> {
			return Boolean(
				changedFiles.includes(".cosmonauts/config.json") &&
					workspaceRoot &&
					capturedBase &&
					(await qualityReviewConfigChanged(
						sourceRoot ?? "",
						workspaceRoot,
						capturedBase,
					)),
			);
		}

		async function runAssessment(): Promise<QualityReviewAssessment> {
			if (!options.execute)
				throw new Error("Quality review assessment is not attached.");
			await prepareAssessmentStart();
			const assessmentSignal = new AbortController();
			const abortAssessment = () => assessmentSignal.abort();
			options.signal?.addEventListener("abort", abortAssessment, {
				once: true,
			});
			if (options.signal?.aborted) abortAssessment();
			let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
			const deadline = new Promise<never>((_resolve, reject) => {
				deadlineTimer = setTimeout(
					() => {
						assessmentSignal.abort();
						reject(
							new Error(
								`QM assessment deadline exceeded after ${assessmentTimeoutMs}ms`,
							),
						);
					},
					Math.max(1, assessmentTimeoutMs - (Date.now() - assessmentStartedAt)),
				);
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
			return assessment;
		}

		async function prepareAssessmentStart(): Promise<void> {
			if (
				assessmentStartedAt &&
				Date.now() - assessmentStartedAt >= assessmentTimeoutMs
			)
				throw new Error(
					`QM assessment deadline exceeded after ${assessmentTimeoutMs}ms`,
				);
			if (materialsRoot && materialDigests)
				await verifyReviewMaterials(materialsRoot, materialDigests);
			await phase("assessing", {
				disposition: workspaceRoot ? "active" : "none",
				...(workspaceRoot ? { workspace: workspaceRoot } : {}),
			});
		}

		async function sealEvidenceAndRunChecks(
			assessment: QualityReviewAssessment,
		): Promise<void> {
			markdown = assessment.markdown;
			assessmentText = markdown;
			omittedSkillPaths.push(...(assessment.omittedSkillPaths ?? []));
			liveChildIds = [
				...new Set([...activeChildIds, ...(assessment.liveChildIds ?? [])]),
			];
			await sealReviewerEvidence(assessment);
			await verifySealedArtifacts();
			await prepareAndRunChecks();
		}

		async function sealReviewerEvidence(
			assessment: QualityReviewAssessment,
		): Promise<void> {
			if (liveChildIds.length > 0)
				throw new Error(
					`Reviewers still live at assessment end: ${liveChildIds.join(", ")}`,
				);
			observedReviewerModels = reviewerEvidenceModels(
				sink,
				assessment.requiredLenses ?? [],
			);
			attestReviewerDiversity(assessment);
			const abandonedBeforeChecks = await sink.sealReviewers(
				options.reviewerSealGraceMs ?? 1000,
			);
			if (abandonedBeforeChecks.length > 0)
				throw new Error(
					`Report integrity: reviewer writes abandoned: ${abandonedBeforeChecks.join(", ")}`,
				);
			if (materialsRoot && materialDigests)
				await verifyReviewMaterials(materialsRoot, materialDigests);
		}

		function attestReviewerDiversity(
			assessment: QualityReviewAssessment,
		): void {
			if (!assessment.implementerModel) {
				if (
					!assessment.requiredLenses?.includes("reviewer") &&
					observedReviewerModels.length === 0
				)
					return;
				diversityIssue = "Default implementer model identity missing (INV-002)";
				observedReviewerModels = [
					...observedReviewerModels,
					`Diversity: ${diversityIssue}.`,
				];
				return;
			}
			const diversity = assessReviewerDiversity({
				implementer: assessment.implementerModel,
				configured: baseQualityReview?.diverseReviewerModel,
				modelFamilies: baseQualityReview?.modelFamilies,
				reviewers: reviewerEvidenceFromLines(observedReviewerModels),
			});
			observedReviewerModels = diversity.lines;
			diversityIssue = diversity.issue;
			diversityHumanItem = diversity.humanItem;
		}

		async function verifySealedArtifacts(): Promise<void> {
			for (const artifact of sink.references()) {
				const expected = artifact.metadata?.sha256;
				if (
					typeof expected !== "string" ||
					createHash("sha256")
						.update(await readFile(artifact.path))
						.digest("hex") !== expected
				)
					throw new Error(
						`Report integrity: ${artifact.id} changed before checks`,
					);
			}
		}

		async function prepareAndRunChecks(): Promise<void> {
			if (privateWorkspace) {
				await prepareForChecks(privateWorkspace);
				checkResults =
					!options.hostChecks || checkConfigMissing || preparationFailed
						? []
						: await runQualityReviewChecks({
								cwd: privateWorkspace.workspaceRoot,
								base: capturedBase ?? "",
								checks: baseQualityReview?.checks ?? [],
								signal: options.signal,
							});
				await sink.write(
					"checks.md",
					`${analysisPreparationLines.join("\n")}\n${preparationReport}\n${renderQualityReviewChecks(checkResults)}`,
				);
			}
		}

		async function prepareForChecks(
			workspace: PrivateReviewWorkspace,
		): Promise<void> {
			try {
				const preparation = await preparePrivateReviewWorkspace(
					workspace,
					options.signal,
					baseQualityReview,
				);
				preparationReport = `# Preparation\n\n${preparation.map((step) => `- ${step.id}: passed in ${step.durationMs} ms`).join("\n") || "- No preparation configured."}\n`;
			} catch (error) {
				if (!(error instanceof WorkspacePreparationFailure)) throw error;
				preparationFailed = true;
				preparationReport = `# Preparation\n\n- ${error.message}\n`;
				if (!options.hostChecks) {
					await sink.write("checks.md", preparationReport);
					throw error;
				}
			}
		}

		async function assessReport(): Promise<void> {
			assessmentText = markdown;
			cancelled = options.signal?.aborted === true;
			if (cancelled) throw new Error("Caller cancellation");
			const assessed = assessQualityReviewReport(markdown);
			verdict = assessed.verdict;
			if (verdict === "refused") await rejectReviewerRefusal();
			reason = assessmentReason(assessed);
			if (!assessed.indexAvailable && !assessed.reason)
				markdown += "\n\nIndex unavailable.\n";
			if (assessed.verdict === "failed" && assessed.reason)
				await recordMalformedReport(assessed.reason);
		}

		async function rejectReviewerRefusal(): Promise<never> {
			await sink.write("raw-final.md", markdown);
			throw new Error("Report integrity: only the host may produce refused");
		}

		function assessmentReason(
			assessed: ReturnType<typeof assessQualityReviewReport>,
		): string {
			return (
				assessed.reason ??
				(assessed.indexAvailable
					? "Assessment completed."
					: "Index unavailable; verdict derived from report sections.")
			);
		}

		async function recordMalformedReport(
			integrityReason: string,
		): Promise<void> {
			await sink.write("raw-final.md", markdown);
			markdown = renderQualityReviewReport({
				verdict: "failed",
				reason: `Report integrity: ${integrityReason}`,
			});
		}

		async function renderHostReport(
			assessment: QualityReviewAssessment,
		): Promise<void> {
			if (!options.hostChecks) return;
			const assessed = assessQualityReviewReport(assessmentText);
			if (!(assessed.verdict === "failed" && assessed.reason))
				await sink.write("raw-final.md", markdown, { replace: true });
			const calibration = await calibrateHostReport();
			const gateState = observedGateState(assessment);
			const gateEvidenceMissing = !hasQualityReviewSectionContent(
				markdown,
				"Gates",
			);
			const hostHumanDecisionItems = [
				...new Set([
					...hostHumanItems(gateState, gateEvidenceMissing),
					...(diversityHumanItem ? [diversityHumanItem] : []),
					...calibration.humanItems,
					...preparationHumanItems(),
				]),
			];
			if (diversityIssue && verdict !== "failed") {
				verdict = "failed";
				reason = diversityIssue;
			}
			if (
				hostBlocksReady(gateState, hostHumanDecisionItems) &&
				verdict !== "failed"
			) {
				verdict = "not-ready";
				reason = "Checks, findings, or human decisions require attention.";
			}
			const hostGateLines = hostGateLinesFor(gateState);
			const hostFindingLines = hostAuditFindings(assessment, hostGateLines);
			mergeHostReport({
				checks: hostCheckLines(),
				gates: hostGateLines,
				findings: [...hostFindingLines, ...calibration.findings],
				humanItems: hostHumanDecisionItems,
			});
		}

		async function calibrateHostReport(): Promise<{
			humanItems: string[];
			findings: string[];
		}> {
			const reviewerTexts = await Promise.all(
				sink
					.references()
					.filter((artifact) => artifact.id.startsWith("qm/reviewers/"))
					.map(async (artifact) => ({
						lens: artifact.id.slice("qm/reviewers/".length, -3),
						text: await readFile(artifact.path, "utf8"),
					})),
			);
			const reportedFindings = qualityReviewFindingLines(markdown);
			const calibration = calibrateReviewerFindings({
				materials: materialsRoot
					? await readFile(join(materialsRoot, "full.diff"), "utf8")
					: "",
				reviewers: reviewerTexts,
				findings: reportedFindings,
				observations: qualityReviewObservationLines(markdown),
			});
			const calibrationHumanItems = calibration.issues.filter((issue) =>
				issue.startsWith("Finding "),
			);
			const calibrationFindings = calibration.issues.filter((issue) =>
				issue.startsWith("Performance "),
			);
			const carriedFindings = calibration.findings.slice(
				reportedFindings.length,
			);
			const unreplaced: string[] = [];
			markdown = applyReviewerCalibration(
				markdown,
				calibration.findings.slice(0, reportedFindings.length),
				calibrationFindings,
				calibration.observations,
				unreplaced,
			);
			for (const entry of unreplaced)
				calibrationHumanItems.push(
					`Finding ${entry} could not be capped in place; human decision required.`,
				);
			return {
				humanItems: calibrationHumanItems,
				findings: [...calibrationFindings, ...carriedFindings],
			};
		}

		function hostBlocksReady(
			gateState: string | undefined,
			hostHumanDecisionItems: readonly string[],
		): boolean {
			return (
				gateState !== "completed-bound" ||
				checkResults.length !== (baseQualityReview?.checks?.length ?? 0) ||
				hostHumanDecisionItems.length > 0 ||
				hostResultsBlockReady()
			);
		}

		function hostResultsBlockReady(): boolean {
			return (
				hasQualityReviewSectionContent(markdown, "Findings") ||
				hasUnexpectedQualityReviewSectionContent(markdown) ||
				hasQualityReviewSectionContent(markdown, "Human decisions") ||
				gateOwnedFiles.length > 0 ||
				checkResults.some((check) => check.exitCode !== 0 || check.timedOut)
			);
		}

		function hostCheckLines(): string[] {
			const lines = [
				...analysisPreparationLines,
				...checkResults.map(
					(check) =>
						`${check.id}: argv ${JSON.stringify(check.argv)}, exit ${check.exitCode ?? "unavailable"}, duration ${check.durationMs} ms, output ${JSON.stringify(check.output.slice(0, 2000))}`,
				),
			];
			for (const check of baseQualityReview?.checks ?? [])
				if (!checkResults.some((result) => result.id === check.id))
					lines.push(
						`${check.id}: not run${preparationFailed ? " (preparation failed)" : ""}`,
					);
			return lines;
		}

		function hostHumanItems(
			gateState: string | undefined,
			gateEvidenceMissing: boolean,
		): string[] {
			return [
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
			];
		}

		function preparationHumanItems(): string[] {
			return [
				...(preparationFailed
					? ["Check preparation failed; human decision required."]
					: []),
				...(analysisPreparationFailed
					? ["Analysis preparation failed; human decision required."]
					: []),
			];
		}

		function mergeHostReport(host: {
			checks: string[];
			gates: string[];
			findings: string[];
			humanItems: string[];
		}): void {
			const reported = indexedQualityReviewReport(markdown);
			const hostReviewed = [
				"Host configured checks and captured changed-file list in the private snapshot.",
			];
			if (!reported) {
				markdown = amendUnindexedQualityReviewReport(markdown, {
					verdict,
					reason,
					checks: host.checks,
					gates: host.gates,
					replaceGates: analysisPreparationFailed,
					findings: host.findings,
					humanItems: host.humanItems,
					reviewed: hostReviewed,
					reviewerModels: observedReviewerModels,
				});
			} else {
				markdown = renderQualityReviewReport({
					...reported,
					verdict,
					reason,
					checks: host.checks,
					gates: analysisPreparationFailed
						? host.gates
						: [...(reported.gates ?? []), ...host.gates],
					findings: [...(reported.findings ?? []), ...host.findings],
					humanItems: [
						...new Set([...(reported.humanItems ?? []), ...host.humanItems]),
					],
					reviewed: [...(reported.reviewed ?? []), ...hostReviewed],
					reviewerModels:
						observedReviewerModels.length > 0
							? observedReviewerModels
							: (reported.reviewerModels ?? []),
				});
			}
		}

		async function recordAssessmentFailure(error: unknown): Promise<void> {
			if (!sink.references().some((artifact) => artifact.id === "qm/checks.md"))
				await sink
					.write(
						"checks.md",
						`${analysisPreparationLines.join("\n")}\n# Checks\n\n- Not run: review evidence did not seal or assessment failed.\n`,
					)
					.catch(() => undefined);
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
				await sink
					.write("raw-final.md", markdown, { replace: true })
					.catch(() => undefined);
			renderAssessmentFailure();
		}

		function renderAssessmentFailure(): void {
			const failureDetails = {
				verdict,
				reason,
				checks: hostCheckLines(),
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
			};
			const failureReport = renderQualityReviewReport(failureDetails);
			const assessmentStructure = markdown
				? assessQualityReviewReport(markdown)
				: undefined;
			markdown =
				assessmentStructure && !assessmentStructure.reason
					? amendUnindexedQualityReviewReport(markdown, failureDetails)
					: failureReport;
		}

		async function sealAndAnnotateReport(): Promise<void> {
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
			appendFinalAnnotations();
		}

		function appendFinalAnnotations(): void {
			markdown = discloseOperatorAuthority(markdown, verdict, reason);
			if (qmSessionLive)
				markdown = `${markdown.trimEnd()}\n\nLive work: QM session did not settle after cancellation or deadline.\n`;
			if (runtimeSetupLive)
				markdown = `${markdown.trimEnd()}\n\nLive work: base runtime setup did not settle after cancellation or deadline.\n`;
			if (
				ownsReservedRoot &&
				(qmSessionLive || runtimeSetupLive || liveChildIds.length > 0)
			)
				markdown = `${markdown.trimEnd()}\n\nWorkspace retained: ${reservedRoot}. Live work may still use it.\n`;
			markdown = `${markdown.trimEnd()}\n\nPanel completion timeout: ${panelTimeoutMs} ms.\n\nCaller-owned remediation: address findings through tasks, Drive and independent review.\n`;
			if (omittedSkillPaths.length > 0)
				markdown = `${markdown.trimEnd()}\n\nOmitted skill locations: ${[...new Set(omittedSkillPaths)].join(", ")}\n`;
			if (safeOperatorNote)
				markdown = `${markdown.trimEnd()}\n\nOperator note (non-authoritative): ${JSON.stringify(safeOperatorNote)}\n`;
		}

		async function finalizeReport(): Promise<StepResult> {
			try {
				analysisConsent?.dispose();
				await replaceSummary();
				const canRemove = await persistTerminalReport();
				terminalPersisted = true;
				if (canRemove && reservedRoot)
					await removeWorkspaceAndRecordDisposition(reservedRoot);
				result = completedStepResult();
				return result;
			} catch (error) {
				if (terminalPersisted) {
					result = {
						outcome: terminalOutcome(),
						summary: reason.slice(0, 200),
						artifacts: sink.references(),
					};
					return result;
				}
				result = await reportPersistenceFailure(error);
				return result;
			}
		}

		async function replaceSummary(): Promise<void> {
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
		}

		async function persistTerminalReport(): Promise<boolean> {
			const finalRef = await sink.write("final.md", markdown, {
				replace: true,
			});
			const canRemove = canRemoveWorkspace();
			await phase(canRemove || !ownsReservedRoot ? "finalized" : "retained", {
				status: terminalStatus(),
				disposition: terminalDisposition(canRemove),
				activeChildIds: liveChildIds,
				...(qmSessionLive ? { liveSession: "quality-manager" } : {}),
				...(reservedRoot ? { workspace: reservedRoot } : {}),
				artifactDigests: [finalRef.metadata?.sha256],
			});
			return canRemove;
		}

		function canRemoveWorkspace(): boolean {
			return Boolean(
				reservedRoot &&
					ownsReservedRoot &&
					!qmSessionLive &&
					!runtimeSetupLive &&
					liveChildIds.length === 0,
			);
		}

		function terminalStatus():
			| "cancelled"
			| "blocked"
			| "failed"
			| "completed" {
			return cancelled
				? "cancelled"
				: verdict === "refused"
					? "blocked"
					: verdict === "failed"
						? "failed"
						: "completed";
		}

		function terminalDisposition(canRemove: boolean): string {
			return canRemove
				? "pending-removal"
				: ownsReservedRoot
					? "retained"
					: "none";
		}

		async function removeWorkspaceAndRecordDisposition(
			root: string,
		): Promise<void> {
			let timer: ReturnType<typeof setTimeout> | undefined;
			let disposition = "removed";
			let removalReason: string | undefined;
			try {
				await Promise.race([
					(options.removeWorkspace ?? removePrivateReviewWorkspace)(root),
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
				workspace: root,
				...(removalReason ? { reason: removalReason } : {}),
			});
		}

		function terminalOutcome(): StepResult["outcome"] {
			return cancelled
				? "cancelled"
				: verdict === "refused"
					? "blocked"
					: verdict === "failed"
						? "failed"
						: "success";
		}

		function completedStepResult(): StepResult {
			return {
				outcome: terminalOutcome(),
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
		}

		async function reportPersistenceFailure(
			error: unknown,
		): Promise<StepResult> {
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
			return {
				outcome: "failed",
				summary: failure.slice(0, 200),
				artifacts: [provisionalRef],
			};
		}

		async function performReview(): Promise<void> {
			if (cancelled) throw new Error("Caller cancellation");
			if (summaryInitializationError)
				throw new Error(
					`Plan summary initialization failed: ${errorReason(summaryInitializationError)}`,
				);
			if (!options.refusalReason) {
				await prepareSnapshot();
				await prepareRuntime();
				await prepareEvidenceAndGates();
			}
			if (materialsRoot) await chmod(materialsRoot, 0o500);
			if (options.signal?.aborted) throw new Error("Caller cancellation");
			if (options.refusalReason) {
				verdict = "refused";
				reason = options.refusalReason;
				markdown = renderQualityReviewReport({ verdict, reason });
			} else {
				const assessment = await runAssessment();
				await sealEvidenceAndRunChecks(assessment);
				await assessReport();
				await renderHostReport(assessment);
			}
		}

		try {
			await performReview();
		} catch (error) {
			await recordAssessmentFailure(error);
		}
		await sealAndAnnotateReport();
		await phase("finalizing", {
			disposition: ownsReservedRoot ? "active" : "none",
			...(reservedRoot ? { workspace: reservedRoot } : {}),
		});
		let summaryReplaced = false;
		let terminalPersisted = false;
		return await finalizeReport();
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
	sourceRoot: string,
	base: string,
): ProjectConfig["qualityReview"] {
	const object = `${base}:.cosmonauts/config.json`;
	try {
		execFileSync("git", ["cat-file", "-e", object], {
			cwd: sourceRoot,
			env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
			stdio: "ignore",
		});
	} catch {
		return undefined;
	}
	const raw = execFileSync("git", ["show", object], {
		cwd: sourceRoot,
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
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
	sourceRoot: string,
	workspaceRoot: string,
	base: string,
	config: ProjectConfig["qualityReview"],
): Promise<boolean> {
	const usesPackageManager = [
		...(config?.prepare ?? []),
		...(config?.checks ?? []),
	].some((step) =>
		/(?:^|\/)(?:bun|bunx|npm|npx|pnpm|pnpx|yarn|corepack)$/.test(step.command),
	);
	if (!usesPackageManager) return false;
	try {
		const before = JSON.parse(
			execFileSync("git", ["show", `${base}:package.json`], {
				cwd: sourceRoot,
				env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
				encoding: "utf8",
			}),
		) as { scripts?: Record<string, unknown> };
		const after = JSON.parse(
			await readFile(join(workspaceRoot, "package.json"), "utf8"),
		) as { scripts?: Record<string, unknown> };
		return !isDeepStrictEqual(before.scripts ?? {}, after.scripts ?? {});
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
	sourceRoot: string,
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
				cwd: sourceRoot,
				env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
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
		await mkdirIfMissing(cursor);
		const stat = await lstat(cursor);
		if (!stat.isDirectory() || stat.isSymbolicLink())
			throw new Error("Plan summary directory is not a regular directory");
	}
}

async function mkdirIfMissing(path: string): Promise<void> {
	try {
		await mkdir(path);
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
}
