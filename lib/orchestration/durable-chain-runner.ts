import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
	PreparedStep,
	RunGraph,
	RunGraphSchedulerBackend,
	RunRef,
	RunStore,
	RuntimeDiagnostic,
	SchedulerStepInput,
	StepRecord,
	StepResult,
} from "../durable-runtime/index.ts";
import {
	FileRunStore,
	type RunStartResult,
	type RunStartStopPolicy,
	runStart,
} from "../durable-runtime/index.ts";
import { createPiSpawner } from "./agent-spawner.ts";
import {
	extractAssistantText,
	summarizeAssistantText,
} from "./assistant-text.ts";
import {
	chainTimeoutError,
	DEFAULT_CHAIN_TIMEOUT_MS,
} from "./chain-deadline.ts";
import {
	createDurableChainEpisodeLifecycle,
	withChainEpisode,
} from "./chain-episodes.ts";
import {
	type ChainAgentEvidenceDetails,
	type ChainPlanReviewAddressedActivityDetails,
	type ChainPlanReviewBlockActivityDetails,
	type ChainPlanReviewTargetActivityDetails,
	type ChainStageStatsActivityDetails,
	parsePlanReviewAddressedActivityDetails,
	parsePlanReviewTargetActivityDetails,
	projectDurableChainRun,
} from "./chain-event-adapter.ts";
import { normalizeChain, refuseNormalization } from "./chain-normalization.ts";
import { buildChainStats, projectSpawnStats } from "./chain-stats.ts";
import {
	type ChainCompilerStepMetadata,
	compileChainToGraph,
	type DurableChainStageOptions,
	type DurableChainStageSpawnOptions,
	shouldRunChainInline,
} from "./durable-chain-compiler.ts";
import {
	assessTaskManagerReviewGate,
	formatReviewRoundBlockError,
	type PlanReviewTarget,
	type ReviewCheck,
	type ReviewRoundBlock,
	validatePlanReviewReport,
	validateReviewRevisionReport,
} from "./review-revision.ts";
import type { StagePromptPurpose } from "./stage-prompts.ts";
import {
	appendBoundReviewTarget,
	shouldAppendBoundReviewTarget,
} from "./stage-prompts.ts";
import { buildTerminalGateContext } from "./terminal-gate.ts";
import type {
	AgentSpawner,
	ChainConfig,
	ChainEvent,
	ChainResult,
	ChainStage,
	CompactionConfig,
	SpawnConfig,
	SpawnEvent,
	StageResult,
} from "./types.ts";

const CHAIN_RUN_SCOPE = "chain";
const DEFAULT_HOLDER_ID = "chain-runner";
const DEFAULT_MAX_SCHEDULER_PASSES = 1_000;
const CHAIN_TIMEOUT_REASON = "chain_timeout";

export async function runDurableChain(
	config: ChainConfig,
): Promise<ChainResult> {
	const normalized = normalizeChain(config);
	if (!normalized.ok) {
		return refuseNormalization(config, normalized.errors);
	}
	config = { ...config, steps: normalized.stages };
	if (
		shouldRunChainInline(config.steps, {
			completionLabel: config.completionLabel,
		})
	) {
		throw new Error(
			"Durable chain runner cannot execute inline-only chain steps.",
		);
	}

	const runId = `chain-${randomUUID()}`;
	const lifecycle = createDurableChainEpisodeLifecycle(config, runId);
	return withChainEpisode(config, lifecycle, () =>
		executeDurableChain(config, runId),
	);
}

async function executeDurableChain(
	config: ChainConfig,
	runId: string,
): Promise<ChainResult> {
	const ref: RunRef = { scope: CHAIN_RUN_SCOPE, runId };
	const store = new FileRunStore({
		rootDir: join(config.projectRoot, "missions", "sessions"),
	});
	const compiled = compileChainToGraph({
		runId,
		chainAdapter: config.chainAdapter,
		defaultModel: config.defaultModel,
		steps: config.steps,
		projectRoot: config.projectRoot,
		registry: config.registry,
		domainContext: config.domainContext,
		models: config.models,
		thinking: config.thinking,
		projectSkills: config.projectSkills,
		skillPaths: config.skillPaths,
		completionLabel: config.completionLabel,
		planSlug: config.planSlug,
		compaction: config.compaction,
	});

	const spawner = createPiSpawner(config.registry, config.domainsDir, {
		resolver: config.resolver,
		spawnTimeoutMs: config.spawnTimeoutMs,
		runtime: config.runtime,
		sessionPolicies: config.sessionPolicies,
	});

	let timeoutError: string | undefined;
	try {
		const backend = createChainSchedulerBackend({
			store,
			ref,
			spawner,
			runtime: config.runtime,
			signal: config.signal,
			chainAdapter: config.chainAdapter,
			terminalGateContext: config.terminalGateContext,
		});
		const scheduler = await runStart({
			store,
			ref,
			stopPolicy: chainDeadlinePolicy({
				timeoutMs: config.timeoutMs,
				signal: config.signal,
				steps: compiled.steps,
				stepCount: config.steps.length,
			}),
			graph: compiled.graph,
			createRun: {
				status: "pending",
				policy: {
					defaultBackend: { name: "cosmonauts-subagent" },
					worktree: { mode: "shared" },
					maxParallelSteps: 1,
					timeoutMs: config.timeoutMs,
				},
				metadata: {
					source: "chain_run",
					stageCount: compiled.graph.steps.length,
				},
			},
			backends: new Map([[backend.name, backend]]),
			holderId: DEFAULT_HOLDER_ID,
			signal: config.signal,
			maxPasses: Math.max(
				compiled.graph.steps.length + 5,
				DEFAULT_MAX_SCHEDULER_PASSES,
			),
		});
		timeoutError = await settleSchedulerExit(scheduler, {
			store,
			ref,
			signal: config.signal,
		});
	} finally {
		spawner.dispose();
	}

	const reconstructed = await reconstructDurableChainResult(store, ref);
	for (const event of reconstructed.events) {
		emit(config, event);
	}
	return {
		...reconstructed.result,
		...(timeoutError !== undefined && {
			errors: [...reconstructed.result.errors, timeoutError],
		}),
		run: { runId, scope: CHAIN_RUN_SCOPE },
	};
}

/**
 * Terminal and caller-aborted runs are reconstructed from durable state. A
 * chain timeout fails the run durably and returns its error; any other exit
 * throws.
 */
async function settleSchedulerExit(
	scheduler: RunStartResult,
	options: { store: RunStore; ref: RunRef; signal: AbortSignal | undefined },
): Promise<string | undefined> {
	if (scheduler.type === "scheduler") {
		if (scheduler.exitReason === "terminal" || options.signal?.aborted)
			return undefined;
		throw new Error(
			`Durable chain scheduler did not reach a terminal state for ${options.ref.runId}.`,
		);
	}
	if (scheduler.interruption.reason !== CHAIN_TIMEOUT_REASON) {
		throw new Error(
			`Durable chain run interrupted: ${scheduler.interruption.reason}`,
		);
	}
	const reason = String(scheduler.interruption.details);
	await options.store.appendEvent(options.ref, {
		type: "run_failed",
		runId: options.ref.runId,
		reason,
	});
	return reason;
}

/**
 * Stops scheduling once the deadline passes, checked only on entry to a new
 * chain step: a step already running, or a parallel group already started,
 * finishes. An abort takes precedence and records no timeout.
 */
function chainDeadlinePolicy(options: {
	timeoutMs: number | undefined;
	signal: AbortSignal | undefined;
	steps: readonly ChainCompilerStepMetadata[];
	stepCount: number;
}): RunStartStopPolicy {
	const timeoutMs = options.timeoutMs ?? DEFAULT_CHAIN_TIMEOUT_MS;
	const deadline = Date.now() + timeoutMs;
	return {
		async beforePass(state) {
			if (options.signal?.aborted || Date.now() < deadline) return undefined;
			const status = new Map(state.steps.map((step) => [step.id, step.status]));
			const next = options.steps.find(
				(step) => status.get(step.stepId) !== "completed",
			);
			if (!next) return undefined;
			const groupStarted = options.steps.some(
				(step) =>
					step.topologyIndex === next.topologyIndex &&
					status.get(step.stepId) === "completed",
			);
			if (groupStarted) return undefined;
			return {
				reason: CHAIN_TIMEOUT_REASON,
				exitReason: "interrupted",
				details: chainTimeoutError({
					timeoutMs,
					stepIndex: next.topologyIndex,
					stepCount: options.stepCount,
				}),
			};
		},
	};
}

interface ChainSchedulerBackendOptions {
	store: RunStore;
	ref: RunRef;
	spawner: AgentSpawner;
	runtime: ChainConfig["runtime"];
	signal?: AbortSignal;
	chainAdapter?: ChainConfig["chainAdapter"];
	terminalGateContext?: unknown;
}

function createChainSchedulerBackend({
	store,
	ref,
	spawner,
	runtime,
	signal,
	chainAdapter,
	terminalGateContext,
}: ChainSchedulerBackendOptions): RunGraphSchedulerBackend {
	return {
		name: "cosmonauts-subagent",
		capabilities: {
			canResume: false,
			canCancel: false,
			canCommit: true,
			isolatedFromHostSource: false,
			emitsMachineReport: true,
		},
		async prepare(step, context) {
			return {
				step,
				attemptId: context.attemptId,
				backend: step.backend,
				input: context.input,
				preparedAt: context.now?.() ?? new Date().toISOString(),
			};
		},
		async start(prepared) {
			return {
				backend: prepared.backend,
				stepId: prepared.step.id,
				attemptId: prepared.attemptId,
				startedAt: prepared.preparedAt,
				result: executeChainStep({
					store,
					ref,
					spawner,
					runtime,
					prepared,
					signal,
					chainAdapter,
					terminalGateContext,
				}),
			};
		},
	};
}

async function executeChainStep({
	store,
	ref,
	spawner,
	runtime,
	prepared,
	signal,
	chainAdapter,
	terminalGateContext,
}: {
	store: RunStore;
	ref: RunRef;
	spawner: AgentSpawner;
	runtime: ChainConfig["runtime"];
	prepared: PreparedStep<SchedulerStepInput>;
	signal?: AbortSignal;
	chainAdapter?: ChainConfig["chainAdapter"];
	terminalGateContext?: unknown;
}): Promise<StepResult> {
	const spawn = readSpawnOptions(prepared.input.backendOptions);
	const promptMetadata = readPromptMetadata(prepared.input.backendOptions);
	const persistedReview = shouldReadPersistedReview(promptMetadata)
		? await readPersistedPlanReview(store, ref)
		: undefined;
	if (promptMetadata.requiresPlanReviewTarget) {
		const block = await assessDurableTaskManagerEntry({
			store,
			ref,
			persistedReview,
			taskManagerTopologyIndex: promptMetadata.topologyIndex,
			producerStepIds: promptMetadata.reviewProducerStepIds,
			projectRoot: spawn.cwd,
		});
		if (block) {
			return persistDurableReviewBlock({
				store,
				ref,
				role: spawn.role,
				block,
			});
		}
	}
	const target = shouldAppendBoundReviewTarget(
		promptMetadata.purpose,
		promptMetadata.requiresPlanReviewTarget,
	)
		? persistedReview?.target
		: undefined;
	const materializedSpawn = {
		...spawn,
		prompt: appendBoundReviewTarget(spawn.prompt, target),
	};
	const stage = readStageOptions(prepared.input.backendOptions);
	if (stage.terminalGate)
		return executeTerminalStep({
			store,
			ref,
			stepId: prepared.step.id,
			stage,
			spawn,
			chainAdapter,
			terminalGateContext,
			signal,
		});
	const role = materializedSpawn.role;
	let eventWrite = Promise.resolve();
	const enqueueAgentEvent = (
		chainEvent: ChainAgentEvidenceDetails["chainEvent"],
		sessionId: string,
		event: SpawnEvent,
	): void => {
		eventWrite = eventWrite
			.then(() =>
				store.appendEvent(ref, {
					type: "step_tool_activity",
					runId: ref.runId,
					stepId: prepared.step.id,
					details: {
						source: "chain",
						kind: "chain_agent_event",
						chainEvent,
						role,
						sessionId,
						event,
					} satisfies ChainAgentEvidenceDetails,
				}),
			)
			.then(() => undefined);
	};

	const spawnResult = await spawner.spawn({
		...materializedSpawn,
		runtime,
		signal,
		onEvent: (event) => {
			const chainEvent = chainAgentEventType(event);
			if (chainEvent) {
				enqueueAgentEvent(chainEvent, event.sessionId, event);
			}
		},
	} satisfies SpawnConfig);

	if (spawnResult.sessionId) {
		enqueueAgentEvent("agent_spawned", spawnResult.sessionId, {
			type: "turn_start",
			sessionId: spawnResult.sessionId,
		});
		enqueueAgentEvent("agent_completed", spawnResult.sessionId, {
			type: "turn_end",
			sessionId: spawnResult.sessionId,
		});
	}
	await eventWrite;
	await persistStageStats({
		store,
		ref,
		stepId: prepared.step.id,
		role,
		stats: spawnResult.stats,
	});

	if (!spawnResult.success) {
		return {
			outcome: "failed",
			summary: spawnResult.error ?? `${role} failed`,
			artifacts: [],
			nextAction: "abort_run",
		};
	}

	const assistantText = extractAssistantText(spawnResult.messages, stage.name);
	const blockedReview = await validateDurableReview({
		assistantText,
		promptMetadata,
		spawn,
		persistedReview,
		store,
		ref,
		role,
		prepared,
		stage,
	});
	if (blockedReview) return blockedReview;

	return {
		outcome: "success",
		summary: summarizeAssistantText(assistantText, stage.name),
		artifacts: [],
	};
}

interface TerminalStepOptions {
	store: RunStore;
	ref: RunRef;
	stepId: string;
	stage: DurableChainStageOptions;
	spawn: DurableChainStageSpawnOptions;
	chainAdapter?: ChainConfig["chainAdapter"];
	terminalGateContext?: unknown;
	signal?: AbortSignal;
}
async function executeTerminalStep(
	options: TerminalStepOptions,
): Promise<StepResult> {
	const { stage, spawn, chainAdapter } = options;
	const gate =
		stage.terminalGate && chainAdapter?.terminalGates?.[stage.terminalGate];
	if (!gate) throw new Error("Terminal executor is unavailable.");
	const result = await gate(
		buildTerminalGateContext({
			stage,
			terminalGateContext: options.terminalGateContext,
			projectRoot: spawn.cwd,
			planSlug: spawn.planSlug,
			completionLabel: spawn.completionLabel,
			signal: options.signal,
		}),
	);
	await persistStageStats({
		...options,
		role: stage.name,
		stats: result.stats,
	});
	return terminalStepResult(result);
}
function terminalStepResult(result: Omit<StageResult, "stage">): StepResult {
	return {
		outcome: result.outcome ?? (result.success ? "success" : "failed"),
		...(result.nextAction !== undefined
			? { nextAction: result.nextAction }
			: {}),
		summary: result.summary ?? result.error ?? "",
		artifacts: result.artifacts ?? [],
	};
}

async function persistStageStats(options: {
	store: RunStore;
	ref: RunRef;
	stepId: string;
	role: string;
	stats?: import("./types.ts").SpawnStats;
}): Promise<void> {
	if (!options.stats) return;
	await options.store.appendEvent(options.ref, {
		type: "step_tool_activity",
		runId: options.ref.runId,
		stepId: options.stepId,
		details: {
			source: "chain",
			kind: "chain_stage_stats",
			role: options.role,
			stats: projectSpawnStats(options.stats),
		} satisfies ChainStageStatsActivityDetails,
	});
}

async function validateDurableReview({
	assistantText,
	promptMetadata,
	spawn,
	persistedReview,
	store,
	ref,
	role,
	prepared,
	stage,
}: {
	assistantText: string;
	promptMetadata: DurablePromptMetadata;
	spawn: ReturnType<typeof readSpawnOptions>;
	persistedReview: PersistedPlanReview | undefined;
	store: RunStore;
	ref: RunRef;
	role: string;
	prepared: PreparedStep<SchedulerStepInput>;
	stage: ReturnType<typeof readStageOptions>;
}): Promise<StepResult | undefined> {
	if (promptMetadata.purpose.kind === "plan-review") {
		const check = await validatePlanReviewReport({
			assistantText,
			projectRoot: spawn.cwd,
			expectedPlanSlug: promptMetadata.expectedPlanSlug,
		});
		const blocked = await recordReviewCheck({
			check,
			store,
			ref,
			role,
			details: (target) => ({
				source: "chain",
				kind: "plan_review_target",
				target,
			}),
		});
		if (blocked) return blocked;
	}
	if (promptMetadata.purpose.kind === "plan-revision") {
		const check = await validateReviewRevisionReport({
			assistantText,
			projectRoot: spawn.cwd,
			expectedTarget: persistedReview?.target,
		});
		const blocked = await recordReviewCheck({
			check,
			store,
			ref,
			role,
			details: (target) => ({
				source: "chain",
				kind: "plan_review_addressed",
				target,
				topologyIndex: promptMetadata.topologyIndex,
				producerStepId: prepared.step.id,
				producerRole: resolvedProducerRole(stage, spawn),
			}),
		});
		if (blocked) return blocked;
	}
}

function shouldReadPersistedReview(metadata: DurablePromptMetadata): boolean {
	return (
		metadata.requiresPlanReviewTarget ||
		metadata.purpose.kind === "plan-revision"
	);
}

interface PersistedPlanReview {
	target?: PlanReviewTarget;
	addressed?: ChainPlanReviewAddressedActivityDetails;
	addressedState: "missing" | "valid" | "invalid";
}

async function readPersistedPlanReview(
	store: RunStore,
	ref: RunRef,
): Promise<PersistedPlanReview> {
	const { events } = await store.readEvents(ref);
	const state: PersistedPlanReview = { addressedState: "missing" };
	// A loop-free durable step executes once, so it may authorize once. Tracking
	// spent producers stops a later epoch from re-presenting an earlier step's
	// identity against a target that step never addressed.
	const spentProducers = new Set<string>();

	for (const { event } of events) {
		if (event.type !== "run_activity" || !isRecord(event.details)) continue;
		if (
			event.details.source === "chain" &&
			event.details.kind === "plan_review_target"
		) {
			const details = parsePlanReviewTargetActivityDetails(event.details);
			state.target = details?.target;
			state.addressed = undefined;
			state.addressedState = "missing";
			continue;
		}
		if (
			event.details.source !== "chain" ||
			event.details.kind !== "plan_review_addressed"
		) {
			continue;
		}
		const details = parsePlanReviewAddressedActivityDetails(event.details);
		if (!details) {
			state.addressed = undefined;
			state.addressedState = "invalid";
			continue;
		}
		if (spentProducers.has(details.producerStepId)) {
			state.addressed = undefined;
			state.addressedState = "invalid";
			continue;
		}
		spentProducers.add(details.producerStepId);
		state.addressed = details;
		state.addressedState = "valid";
	}
	return state;
}

async function assessDurableTaskManagerEntry(options: {
	store: RunStore;
	ref: RunRef;
	persistedReview?: PersistedPlanReview;
	taskManagerTopologyIndex: number;
	producerStepIds?: readonly string[];
	projectRoot: string;
}): Promise<ReviewRoundBlock | undefined> {
	const { persistedReview, taskManagerTopologyIndex } = options;
	if (!persistedReview?.target) {
		return assessTaskManagerReviewGate({
			taskManagerTopologyIndex,
			projectRoot: options.projectRoot,
		});
	}
	if (
		persistedReview.addressedState !== "valid" ||
		!persistedReview.addressed
	) {
		return {
			reason:
				persistedReview.addressedState === "invalid"
					? "mismatched-addressed-evidence"
					: "missing-addressed-evidence",
			...persistedReview.target,
			taskManagerTopologyIndex,
		};
	}

	const addressed = persistedReview.addressed;
	if (!sameReviewTarget(addressed.target, persistedReview.target)) {
		return {
			reason: "mismatched-addressed-evidence",
			...persistedReview.target,
			addressedReviewRound: addressed.target.reviewRound,
			addressedAtTopologyIndex: addressed.topologyIndex,
			taskManagerTopologyIndex,
		};
	}
	if (
		!(await isCorrelatedAddressedProducer(
			options.store,
			options.ref,
			addressed,
		))
	) {
		return {
			reason: "mismatched-addressed-evidence",
			...persistedReview.target,
			addressedReviewRound: addressed.target.reviewRound,
			addressedAtTopologyIndex: addressed.topologyIndex,
			taskManagerTopologyIndex,
		};
	}

	const block = await assessTaskManagerReviewGate({
		activePlanReview: {
			target: persistedReview.target,
			addressedAtTopologyIndex: addressed.topologyIndex,
			addressedReviewRound: addressed.target.reviewRound,
		},
		taskManagerTopologyIndex,
		projectRoot: options.projectRoot,
	});
	return assessProducerSelection({
		block,
		eligible: options.producerStepIds,
		producerStepId: addressed.producerStepId,
		target: persistedReview.target,
		taskManagerTopologyIndex,
	});
}

function assessProducerSelection({
	block,
	eligible,
	producerStepId,
	target,
	taskManagerTopologyIndex,
}: {
	block?: ReviewRoundBlock;
	eligible?: readonly string[];
	producerStepId: string;
	target: PlanReviewTarget;
	taskManagerTopologyIndex: number;
}): ReviewRoundBlock | undefined {
	if (block) return block;
	return eligible && !eligible.includes(producerStepId)
		? {
				reason: "mismatched-addressed-evidence",
				...target,
				taskManagerTopologyIndex,
			}
		: undefined;
}

async function isCorrelatedAddressedProducer(
	store: RunStore,
	ref: RunRef,
	addressed: ChainPlanReviewAddressedActivityDetails,
): Promise<boolean> {
	const [{ graph }, record] = await Promise.all([
		store.readRunGraph(ref),
		store.readStepRecord({ ...ref, stepId: addressed.producerStepId }),
	]);
	const producer = graph.steps.find(
		(step) => step.id === addressed.producerStepId,
	);
	if (!producer || !record) return false;
	const metadata = readPromptMetadata(producer.backend.options);
	const spawn = readSpawnOptions(producer.backend.options);
	const stage = readStageOptions(producer.backend.options);
	return (
		metadata.topologyIndex === addressed.topologyIndex &&
		metadata.purpose.kind === "plan-revision" &&
		resolvedProducerRole(stage, spawn) === addressed.producerRole &&
		record.status === "completed" &&
		record.result?.outcome === "success"
	);
}

function resolvedProducerRole(
	stage: DurableChainStageOptions,
	spawn: DurableChainStageSpawnOptions,
): string {
	return (
		spawn.agentReference?.resolved.qualifiedId ??
		stage.agentReference?.resolved.qualifiedId ??
		stage.name
	);
}

function sameReviewTarget(
	left: PlanReviewTarget,
	right: PlanReviewTarget,
): boolean {
	return (
		left.planSlug === right.planSlug && left.reviewRound === right.reviewRound
	);
}

/**
 * Persist a durable block when a review check came back unaddressed, otherwise
 * record its accepted target as chain-local run activity.
 */
async function recordReviewCheck(options: {
	check: ReviewCheck;
	store: RunStore;
	ref: RunRef;
	role: string;
	details: (
		target: PlanReviewTarget,
	) =>
		| ChainPlanReviewTargetActivityDetails
		| ChainPlanReviewAddressedActivityDetails;
}): Promise<StepResult | undefined> {
	const { check, store, ref, role } = options;
	if (check.status === "unaddressed") {
		return persistDurableReviewBlock({ store, ref, role, block: check.block });
	}
	await store.appendEvent(ref, {
		type: "run_activity",
		runId: ref.runId,
		details: options.details(check.target),
	});
	return undefined;
}

async function persistDurableReviewBlock(options: {
	store: RunStore;
	ref: RunRef;
	role: string;
	block: ReviewRoundBlock;
}): Promise<StepResult> {
	await options.store.appendEvent(options.ref, {
		type: "run_activity",
		runId: options.ref.runId,
		details: {
			source: "chain",
			kind: "unaddressed_review_round",
			role: options.role,
			block: options.block,
		} satisfies ChainPlanReviewBlockActivityDetails,
	});
	return {
		outcome: "blocked",
		summary: formatReviewRoundBlockError(options.block),
		artifacts: [],
		nextAction: "wait_for_human",
	};
}

function chainAgentEventType(
	event: SpawnEvent,
):
	| Extract<
			ChainAgentEvidenceDetails["chainEvent"],
			"agent_turn" | "agent_tool_use"
	  >
	| undefined {
	switch (event.type) {
		case "turn_start":
		case "turn_end":
		case "compaction_start":
		case "compaction_end":
			return "agent_turn";
		case "tool_execution_start":
		case "tool_execution_end":
			return "agent_tool_use";
	}
}

interface ReconstructedDurableChain {
	events: ChainEvent[];
	result: ChainResult;
}

async function reconstructDurableChainResult(
	store: RunStore,
	ref: RunRef,
): Promise<ReconstructedDurableChain> {
	const [{ graph }, stepRecords, eventPage] = await Promise.all([
		store.readRunGraph(ref),
		store.listStepRecords(ref),
		store.readEvents(ref),
	]);
	const metadata = metadataFromPersistedGraph(graph);
	const adapted = projectDurableChainRun({
		runId: ref.runId,
		steps: metadata,
		events: eventPage.events,
	});
	reportStageStatsDiagnostics(adapted.diagnostics);
	const adaptedResult = adapted.events.findLast(
		(event): event is Extract<ChainEvent, { type: "chain_end" }> =>
			event.type === "chain_end",
	)?.result;
	const stageResults = stageResultsFromStepRecords(
		metadata,
		stepRecords,
		adapted.stageResultsByStepId,
	);

	return {
		events: adapted.events,
		result: {
			success:
				adaptedResult?.success === true &&
				stepRecords.every((step) => step.status === "completed"),
			stageResults,
			totalDurationMs: adaptedResult?.totalDurationMs ?? 0,
			errors: stepRecords.flatMap((step) =>
				step.status !== "completed" && step.result?.summary
					? [step.result.summary]
					: [],
			),
			...(stageResults.some((result) => result.stats) && {
				stats: buildChainStats(stageResults),
			}),
		},
	};
}

/** A dropped stats record would otherwise vanish from the CLI and ChainStats. */
function reportStageStatsDiagnostics(
	diagnostics: readonly RuntimeDiagnostic[],
): void {
	for (const diagnostic of diagnostics) {
		if (diagnostic.code !== "invalid_chain_stage_stats_evidence") continue;
		process.stderr.write(
			`[warning] ${diagnostic.message} ${JSON.stringify(diagnostic.details)}\n`,
		);
	}
}

function stageResultsFromStepRecords(
	metadata: readonly ChainCompilerStepMetadata[],
	stepRecords: readonly StepRecord[],
	adaptedByStepId: ReadonlyMap<string, StageResult>,
): StageResult[] {
	const recordById = new Map(stepRecords.map((step) => [step.id, step]));
	return metadata.flatMap((entry) => {
		const record = recordById.get(entry.stepId);
		if (!record?.result) return [];
		const success =
			record.status === "completed" && record.result.outcome === "success";
		const adapted = adaptedByStepId.get(entry.stepId);
		return [
			{
				stage: chainStage(entry.stage),
				success,
				iterations: 1,
				durationMs: adapted?.durationMs ?? 0,
				...(adapted?.stats && { stats: adapted.stats }),
				...(success ? {} : { error: record.result.summary }),
				...(record.result.summary !== "" && {
					summary: record.result.summary,
				}),
				...(record.result.artifacts.length > 0 && {
					artifacts: record.result.artifacts,
				}),
			},
		];
	});
}

function metadataFromPersistedGraph(
	graph: RunGraph,
): ChainCompilerStepMetadata[] {
	return graph.steps.flatMap((step) => {
		const options = isRecord(step.backend.options) ? step.backend.options : {};
		const stage = readStageOptions(options);
		const promptMetadata = readPromptMetadata(options);
		const stepIndex =
			numberOption(options.stepIndex) ?? inferStepIndex(step.id);
		return {
			stepId: step.id,
			stage,
			...promptMetadata,
			stepIndex,
			...withDefined("memberIndex", numberOption(options.memberIndex)),
			...withDefined("syntax", readSyntax(options.syntax)),
		};
	});
}

interface DurablePromptMetadata {
	reviewProducerStepIds?: readonly string[];
	topologyIndex: number;
	purpose: StagePromptPurpose;
	requiresPlanReviewTarget: boolean;
	expectedPlanSlug?: string;
}

function readPromptMetadata(options: unknown): DurablePromptMetadata {
	if (!isRecord(options)) {
		throw new Error("Durable chain step is missing prompt metadata.");
	}
	const topologyIndex = numberOption(options.topologyIndex) ?? 0;
	const purpose = stagePromptPurposeOption(options.purpose);
	if (
		topologyIndex === undefined ||
		!Number.isInteger(topologyIndex) ||
		topologyIndex < 0
	) {
		throw new Error("Durable chain step has invalid prompt metadata.");
	}
	return {
		topologyIndex,
		reviewProducerStepIds: Array.isArray(options.reviewProducerStepIds)
			? options.reviewProducerStepIds.filter(
					(id): id is string => typeof id === "string",
				)
			: undefined,
		purpose,
		requiresPlanReviewTarget: options.requiresPlanReviewTarget === true,
		...withDefined("expectedPlanSlug", stringOption(options.expectedPlanSlug)),
	};
}

function stagePromptPurposeOption(value: unknown): StagePromptPurpose {
	if (!isRecord(value)) return { kind: "default" };
	const targetStageIds = Array.isArray(value.targetStageIds)
		? value.targetStageIds.filter((id): id is string => typeof id === "string")
		: [];
	if (value.kind === "plan-review")
		return { kind: "plan-review", targetStageIds };
	if (
		value.kind === "plan-revision" ||
		(value.kind === "revision" && value.reviewKind === "plan")
	)
		return { kind: "plan-revision", targetStageIds };
	return { kind: "default" };
}

function readSpawnOptions(options: unknown): DurableChainStageSpawnOptions {
	if (!isRecord(options) || !isRecord(options.spawn)) {
		throw new Error("Durable chain step is missing spawn options.");
	}
	const spawn = options.spawn;
	if (
		typeof spawn.role !== "string" ||
		typeof spawn.cwd !== "string" ||
		typeof spawn.model !== "string" ||
		typeof spawn.prompt !== "string"
	) {
		throw new Error("Durable chain step has invalid spawn options.");
	}
	return {
		role: spawn.role,
		...withDefined(
			"agentReference",
			agentReferenceOption(spawn.agentReference),
		),
		cwd: spawn.cwd,
		model: spawn.model,
		prompt: spawn.prompt,
		...withDefined("domainContext", stringOption(spawn.domainContext)),
		...withDefined("projectSkills", stringArrayOption(spawn.projectSkills)),
		...withDefined("skillPaths", stringArrayOption(spawn.skillPaths)),
		...withDefined(
			"thinkingLevel",
			spawn.thinkingLevel as
				| DurableChainStageSpawnOptions["thinkingLevel"]
				| undefined,
		),
		...withDefined("compaction", compactionConfigOption(spawn.compaction)),
		...withDefined("planSlug", stringOption(spawn.planSlug)),
		...withDefined("completionLabel", stringOption(spawn.completionLabel)),
	};
}

function readStageOptions(options: unknown): DurableChainStageOptions {
	if (!isRecord(options) || !isRecord(options.stage)) {
		throw new Error("Durable chain step is missing stage metadata.");
	}
	const stage = options.stage;
	if (typeof stage.name !== "string" || typeof stage.loop !== "boolean") {
		throw new Error("Durable chain step has invalid stage metadata.");
	}
	return {
		name: stage.name,
		...withDefined("stageId", stringOption(stage.stageId)),
		...withDefined("declarationId", stringOption(stage.declarationId)),
		purpose: stagePromptPurposeOption(stage.purpose),
		expectedPlanSlug: stringOption(stage.expectedPlanSlug),
		requiresPlanReviewTarget: stage.requiresPlanReviewTarget === true,
		completionPolicy: { kind: "once" },
		model: stringOption(stage.model),
		thinkingLevel:
			stage.thinkingLevel as DurableChainStageOptions["thinkingLevel"],
		...(isRecord(stage.reviewTarget) &&
		Array.isArray(stage.reviewTarget.producerStageIds)
			? {
					reviewTarget: {
						source: "active-plan-review" as const,
						producerStageIds: stage.reviewTarget.producerStageIds.filter(
							(id): id is string => typeof id === "string",
						),
					},
				}
			: {}),
		...withDefined("instruction", stringOption(stage.instruction)),
		...withDefined("terminalGate", stringOption(stage.terminalGate)),
		...withDefined(
			"agentReference",
			agentReferenceOption(stage.agentReference),
		),
		loop: stage.loop,
		...withDefined("prompt", stringOption(stage.prompt)),
	};
}

function readSyntax(value: unknown): ChainCompilerStepMetadata["syntax"] {
	if (!isRecord(value) || typeof value.kind !== "string") {
		return undefined;
	}
	if (value.kind === "group") {
		return { kind: "group" };
	}
	if (
		value.kind === "fanout" &&
		typeof value.role === "string" &&
		typeof value.count === "number"
	) {
		return { kind: "fanout", role: value.role, count: value.count };
	}
	return undefined;
}

function chainStage(stage: DurableChainStageOptions): ChainStage {
	return { ...stage };
}

function agentReferenceOption(
	value: unknown,
): DurableChainStageOptions["agentReference"] | undefined {
	if (!isRecord(value)) return undefined;
	const requested = qualifiedAgentReferenceOption(value.requested);
	const resolved = qualifiedAgentReferenceOption(value.resolved);
	const binding = domainBindingResolutionOption(value.binding);
	if (!requested || !resolved || !binding) return undefined;
	return { requested, resolved, binding };
}

function qualifiedAgentReferenceOption(value: unknown) {
	if (!isRecord(value)) return undefined;
	const role = stringOption(value.role);
	const agentId = stringOption(value.agentId);
	const qualifiedId = stringOption(value.qualifiedId);
	if (!role || !agentId || !qualifiedId) return undefined;
	return { role, agentId, qualifiedId };
}

function domainBindingResolutionOption(value: unknown) {
	if (!isRecord(value)) return undefined;
	const role = stringOption(value.role);
	const domainId = stringOption(value.domainId);
	if (!role || !domainId || !isDomainBindingSource(value.source)) {
		return undefined;
	}
	return { role, domainId, source: value.source };
}

function isDomainBindingSource(
	value: unknown,
): value is "default" | "project" | "live" {
	return value === "default" || value === "project" || value === "live";
}

function inferStepIndex(stepId: string): number {
	const [, index] = stepId.match(/^chain-(\d+)/) ?? [];
	const parsed = index ? Number(index) : 1;
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function numberOption(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function stringOption(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function stringArrayOption(value: unknown): string[] | undefined {
	return Array.isArray(value) && value.every((item) => typeof item === "string")
		? [...value]
		: undefined;
}

function compactionConfigOption(value: unknown): CompactionConfig | undefined {
	if (!isRecord(value) || typeof value.enabled !== "boolean") {
		return undefined;
	}
	return {
		enabled: value.enabled,
		...withDefined("keepRecentTokens", numberOption(value.keepRecentTokens)),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function withDefined<Key extends string, Value>(
	key: Key,
	value: Value | undefined,
): { [K in Key]: Value } | Record<string, never> {
	return value === undefined ? {} : ({ [key]: value } as { [K in Key]: Value });
}

function emit(config: ChainConfig, event: ChainEvent): void {
	try {
		config.onEvent?.(event);
	} catch {
		// Chain event listeners must not break durable reconstruction.
	}
}
