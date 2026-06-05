import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	PreparedStep,
	RunGraph,
	RunGraphSchedulerBackend,
	RunRef,
	RunStore,
	SchedulerStepInput,
	StepRecord,
	StepResult,
} from "../durable-runtime/index.ts";
import { FileRunStore, runStart } from "../durable-runtime/index.ts";
import { createPiSpawner } from "./agent-spawner.ts";
import {
	extractAssistantText,
	summarizeAssistantText,
} from "./assistant-text.ts";
import {
	adaptDurableChainEvents,
	type ChainAgentEvidenceDetails,
} from "./chain-event-adapter.ts";
import {
	type ChainCompilerStepMetadata,
	compileChainToGraph,
	type DurableChainStageOptions,
	type DurableChainStageSpawnOptions,
	shouldRunChainInline,
} from "./durable-chain-compiler.ts";
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
const FALLBACK_DOMAINS_DIR = resolve(
	fileURLToPath(import.meta.url),
	"..",
	"..",
	"..",
	"domains",
);

export async function runDurableChain(
	config: ChainConfig,
): Promise<ChainResult> {
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
	const ref: RunRef = { scope: CHAIN_RUN_SCOPE, runId };
	const store = new FileRunStore({
		rootDir: join(config.projectRoot, "missions", "sessions"),
	});
	const compiled = compileChainToGraph({
		runId,
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

	const spawner = createPiSpawner(
		config.registry,
		config.domainsDir ?? FALLBACK_DOMAINS_DIR,
		{
			resolver: config.resolver,
			spawnTimeoutMs: config.spawnTimeoutMs,
		},
	);

	try {
		const backend = createChainSchedulerBackend({
			store,
			ref,
			spawner,
			signal: config.signal,
		});
		const scheduler = await runStart({
			store,
			ref,
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
		if (
			scheduler.type === "scheduler" &&
			(scheduler.exitReason === "terminal" || config.signal?.aborted)
		) {
			// Terminal and caller-aborted chain results are reconstructed from
			// durable state below.
		} else if (scheduler.type === "interrupted") {
			throw new Error(
				`Durable chain run interrupted: ${scheduler.interruption.reason}`,
			);
		} else {
			throw new Error(
				`Durable chain scheduler did not reach a terminal state for ${ref.runId}.`,
			);
		}
	} finally {
		spawner.dispose();
	}

	const reconstructed = await reconstructDurableChainResult(store, ref);
	for (const event of reconstructed.events) {
		emit(config, event);
	}
	return reconstructed.result;
}

interface ChainSchedulerBackendOptions {
	store: RunStore;
	ref: RunRef;
	spawner: AgentSpawner;
	signal?: AbortSignal;
}

function createChainSchedulerBackend({
	store,
	ref,
	spawner,
	signal,
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
					prepared,
					signal,
				}),
			};
		},
	};
}

async function executeChainStep({
	store,
	ref,
	spawner,
	prepared,
	signal,
}: {
	store: RunStore;
	ref: RunRef;
	spawner: AgentSpawner;
	prepared: PreparedStep<SchedulerStepInput>;
	signal?: AbortSignal;
}): Promise<StepResult> {
	const spawn = readSpawnOptions(prepared.input.backendOptions);
	const stage = readStageOptions(prepared.input.backendOptions);
	const role = spawn.role;
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
		...spawn,
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

	if (!spawnResult.success) {
		return {
			outcome: "failed",
			summary: spawnResult.error ?? `${role} failed`,
			artifacts: [],
			nextAction: "abort_run",
		};
	}

	return {
		outcome: "success",
		summary: summarizeAssistantText(
			extractAssistantText(spawnResult.messages, stage.name),
			stage.name,
		),
		artifacts: [],
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
	const adapted = adaptDurableChainEvents({
		runId: ref.runId,
		steps: metadata,
		events: eventPage.events,
	});
	const adaptedResult = adapted.events.findLast(
		(event): event is Extract<ChainEvent, { type: "chain_end" }> =>
			event.type === "chain_end",
	)?.result;

	return {
		events: adapted.events,
		result: {
			success:
				adaptedResult?.success === true &&
				stepRecords.every((step) => step.status === "completed"),
			stageResults: stageResultsFromStepRecords(metadata, stepRecords),
			totalDurationMs: adaptedResult?.totalDurationMs ?? 0,
			errors: stepRecords.flatMap((step) =>
				step.status !== "completed" && step.result?.summary
					? [step.result.summary]
					: [],
			),
		},
	};
}

function stageResultsFromStepRecords(
	metadata: readonly ChainCompilerStepMetadata[],
	stepRecords: readonly StepRecord[],
): StageResult[] {
	const recordById = new Map(stepRecords.map((step) => [step.id, step]));
	return metadata.flatMap((entry) => {
		const record = recordById.get(entry.stepId);
		if (!record?.result) return [];
		const success =
			record.status === "completed" && record.result.outcome === "success";
		return [
			{
				stage: chainStage(entry.stage),
				success,
				iterations: 1,
				durationMs: 0,
				...(success ? {} : { error: record.result.summary }),
				...(record.result.summary !== "" && {
					summary: record.result.summary,
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
		const stepIndex =
			numberOption(options.stepIndex) ?? inferStepIndex(step.id);
		return {
			stepId: step.id,
			stage,
			stepIndex,
			...withDefined("memberIndex", numberOption(options.memberIndex)),
			...withDefined("syntax", readSyntax(options.syntax)),
		};
	});
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
	return {
		name: stage.name,
		loop: stage.loop,
		...withDefined("prompt", stage.prompt),
	};
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
