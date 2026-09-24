import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
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
	assessQualityReviewReport,
	type QualityReviewVerdict,
	renderQualityReviewReport,
} from "./quality-review-report.ts";

export interface QualityReviewAssessment {
	markdown: string;
}

export interface QualityReviewRunOptions {
	projectRoot: string;
	/** Only an explicit completion label or an unambiguous plan session may set this. */
	planSlug?: string;
	signal?: AbortSignal;
	/** Stage 5 supplies isolation and Stage 6 supplies assessment through this host port. */
	execute?: (context: {
		runId: string;
		signal?: AbortSignal;
		workspaceRoot?: string;
		artifactSink: QualityReviewArtifactSink;
	}) => Promise<QualityReviewAssessment>;
	/** Stage 5 prepares the private clone through this host-only port. */
	prepareWorkspace?: (context: {
		runId: string;
		workspaceRoot: string;
	}) => Promise<void>;
	refusalReason?: string;
	store?: RunStore;
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

/** Allocate and finalize a one-step QM run. The default fails closed until isolation is attached. */
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
		try {
			if (cancelled) throw new Error("Caller cancellation");
			if (summaryInitializationError)
				throw new Error(
					`Plan summary initialization failed: ${errorReason(summaryInitializationError)}`,
				);
			if (options.prepareWorkspace && !options.refusalReason) {
				workspaceRoot = join(tmpdir(), `cosmonauts-qm-${ref.runId}`);
				await phase("workspace-reserved", {
					workspace: workspaceRoot,
					disposition: "reserved",
				});
				try {
					await options.prepareWorkspace({ runId: ref.runId, workspaceRoot });
				} catch (error) {
					throw new QualityReviewRefusal(
						`Private workspace preparation refused: ${errorReason(error)}`,
					);
				}
				await phase("snapshot-ready", {
					workspace: workspaceRoot,
					disposition: "active",
				});
			}
			if (
				options.refusalReason ||
				!options.prepareWorkspace ||
				!options.execute
			) {
				verdict = "refused";
				reason =
					options.refusalReason ?? "Private review workspace is not available.";
				markdown = renderQualityReviewReport({ verdict, reason });
			} else {
				await phase("assessing", {
					disposition: workspaceRoot ? "active" : "none",
					...(workspaceRoot ? { workspace: workspaceRoot } : {}),
				});
				markdown = (
					await options.execute({
						runId: ref.runId,
						signal: options.signal,
						workspaceRoot,
						artifactSink: sink,
					})
				).markdown;
				assessmentText = markdown;
				cancelled = options.signal?.aborted === true;
				if (cancelled) throw new Error("Caller cancellation");
				const assessed = assessQualityReviewReport(markdown);
				verdict = assessed.verdict;
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
			}
		} catch (error) {
			cancelled = cancelled || options.signal?.aborted === true;
			verdict =
				error instanceof QualityReviewRefusal && !cancelled
					? "refused"
					: "failed";
			reason = cancelled
				? `Caller cancellation: ${errorReason(error)}`
				: errorReason(error);
			if (markdown) await sink.write("raw-final.md", markdown);
			markdown = renderQualityReviewReport({ verdict, reason });
		}
		await phase("finalizing", {
			disposition: workspaceRoot ? "active" : "none",
			...(workspaceRoot ? { workspace: workspaceRoot } : {}),
		});
		let workspaceRemoved = false;
		let summaryReplaced = false;
		try {
			if (workspaceRoot) {
				await rm(workspaceRoot, { recursive: true, force: true });
				workspaceRemoved = true;
			}
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
			await phase("finalized", {
				disposition: workspaceRoot ? "removed" : "none",
				...(workspaceRoot ? { workspace: workspaceRoot } : {}),
				artifactDigests: [finalRef.metadata?.sha256],
			});
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
			await phase(
				workspaceRoot && !workspaceRemoved ? "retained" : "finalizing",
				{
					disposition: workspaceRoot
						? workspaceRemoved
							? "removed"
							: "retained"
						: "none",
					...(workspaceRoot ? { workspace: workspaceRoot } : {}),
					reason: failure,
				},
			);
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
