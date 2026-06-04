import type {
	OrchestrationEvent,
	RuntimeDiagnostic,
	StepResult,
	StoredOrchestrationEvent,
} from "../durable-runtime/index.ts";
import type { ChainCompilerStepMetadata } from "./durable-chain-compiler.ts";
import type {
	ChainEvent,
	ChainResult,
	ChainStage,
	ChainStep,
	ParallelGroupStep,
	SpawnEvent,
	StageResult,
} from "./types.ts";

type ChainAgentEventType =
	| "agent_spawned"
	| "agent_completed"
	| "agent_turn"
	| "agent_tool_use";

export interface ChainAgentEvidenceDetails {
	source: "chain";
	kind: "chain_agent_event";
	chainEvent: ChainAgentEventType;
	role: string;
	sessionId: string;
	event: SpawnEvent;
}

export interface DurableChainEventAdapterOptions {
	runId: string;
	steps: readonly ChainCompilerStepMetadata[];
	events: readonly StoredOrchestrationEvent[];
}

export interface DurableChainEventAdapterResult {
	events: ChainEvent[];
	diagnostics: RuntimeDiagnostic[];
}

interface StepGroup {
	stepIndex: number;
	metadatas: ChainCompilerStepMetadata[];
	chainStep: ChainStep;
}

interface AdapterState {
	runId: string;
	topology: ChainTopology;
	events: ChainEvent[];
	diagnostics: RuntimeDiagnostic[];
	stepStartedAt: Map<string, string>;
	stageResults: StageResult[];
	parallelResults: Map<number, Map<string, StageResult>>;
	startedParallelGroups: Set<number>;
	endedParallelGroups: Set<number>;
	errors: string[];
	runStartedAt?: string;
}

interface ChainTopology {
	chainSteps: ChainStep[];
	stepById: Map<string, ChainCompilerStepMetadata>;
	groupByStepId: Map<string, StepGroup>;
	groupsByIndex: Map<number, StepGroup>;
}

export function adaptDurableChainEvents(
	options: DurableChainEventAdapterOptions,
): DurableChainEventAdapterResult {
	const state: AdapterState = {
		runId: options.runId,
		topology: chainTopology(options.steps),
		events: [],
		diagnostics: [],
		stepStartedAt: new Map(),
		stageResults: [],
		parallelResults: new Map(),
		startedParallelGroups: new Set(),
		endedParallelGroups: new Set(),
		errors: [],
	};

	for (const envelope of [...options.events].sort((left, right) => {
		return left.seq - right.seq;
	})) {
		if (envelope.runId !== options.runId) continue;
		adaptStoredEvent(state, envelope);
	}

	return { events: state.events, diagnostics: state.diagnostics };
}

function adaptStoredEvent(
	state: AdapterState,
	envelope: StoredOrchestrationEvent,
): void {
	const event = envelope.event;
	switch (event.type) {
		case "run_started":
			state.runStartedAt = envelope.timestamp;
			state.events.push({
				type: "chain_start",
				steps: state.topology.chainSteps,
			});
			break;
		case "step_started":
			adaptStepStarted(state, envelope.timestamp, event);
			break;
		case "step_tool_activity":
			adaptStepToolActivity(state, event);
			break;
		case "step_completed":
			adaptStepTerminal(
				state,
				envelope.timestamp,
				event.stepId,
				stageResultFromStepResult(
					state,
					envelope.timestamp,
					event.stepId,
					event.result,
				),
			);
			break;
		case "step_failed":
			adaptStepFailure(state, envelope.timestamp, event.stepId, event.reason);
			break;
		case "step_blocked":
			adaptStepFailure(state, envelope.timestamp, event.stepId, event.reason);
			break;
		case "step_cancelled":
			adaptStepFailure(
				state,
				envelope.timestamp,
				event.stepId,
				"Step cancelled",
			);
			break;
		case "step_stale":
			adaptStepFailure(state, envelope.timestamp, event.stepId, "Step stale");
			break;
		case "run_completed":
			state.events.push({
				type: "chain_end",
				result: chainResult(state, envelope.timestamp, event.result.outcome),
			});
			break;
		case "run_failed":
			addError(state, event.reason);
			state.events.push({ type: "error", message: event.reason });
			state.events.push({
				type: "chain_end",
				result: chainResult(state, envelope.timestamp, "failed"),
			});
			break;
		case "run_blocked":
			addError(state, event.reason);
			state.events.push({ type: "error", message: event.reason });
			state.events.push({
				type: "chain_end",
				result: chainResult(state, envelope.timestamp, "blocked"),
			});
			break;
		case "run_cancelled":
			addError(state, "Run cancelled");
			state.events.push({ type: "error", message: "Run cancelled" });
			state.events.push({
				type: "chain_end",
				result: chainResult(state, envelope.timestamp, "cancelled"),
			});
			break;
		case "run_stale":
			addError(state, "Run stale");
			state.events.push({ type: "error", message: "Run stale" });
			state.events.push({
				type: "chain_end",
				result: chainResult(state, envelope.timestamp, "stale"),
			});
			break;
		case "step_ready":
		case "step_heartbeat":
		case "step_output":
		case "artifact_written":
		case "child_run_started":
			break;
	}
}

function adaptStepStarted(
	state: AdapterState,
	timestamp: string,
	event: Extract<OrchestrationEvent, { type: "step_started" }>,
): void {
	const metadata = state.topology.stepById.get(event.stepId);
	if (!metadata) return;

	const group = state.topology.groupByStepId.get(event.stepId);
	if (group && !state.startedParallelGroups.has(group.stepIndex)) {
		state.startedParallelGroups.add(group.stepIndex);
		state.events.push({
			type: "parallel_start",
			step: group.chainStep as ParallelGroupStep,
			stepIndex: group.stepIndex,
		});
	}

	state.stepStartedAt.set(event.stepId, timestamp);
	state.events.push({
		type: "stage_start",
		stage: chainStage(metadata.stage),
		stageIndex: metadata.stepIndex,
	});
}

function adaptStepToolActivity(
	state: AdapterState,
	event: Extract<OrchestrationEvent, { type: "step_tool_activity" }>,
): void {
	const projected = chainAgentEventFromEvidence(state, event);
	if (projected) {
		state.events.push(projected);
	}
}

function adaptStepFailure(
	state: AdapterState,
	timestamp: string,
	stepId: string,
	reason: string,
): void {
	const result = stageResultFromFailure(state, timestamp, stepId, reason);
	if (!result) return;

	adaptStepTerminal(state, timestamp, stepId, result);
	addError(state, reason);
	state.events.push({ type: "error", message: reason, stage: result.stage });
}

function adaptStepTerminal(
	state: AdapterState,
	_timestamp: string,
	stepId: string,
	result: StageResult | undefined,
): void {
	if (!result) return;

	state.events.push({
		type: "stage_end",
		stage: result.stage,
		result,
	});
	if (!result.success && result.error) {
		addError(state, result.error);
	}

	const group = state.topology.groupByStepId.get(stepId);
	if (!group) {
		state.stageResults.push(result);
		return;
	}

	const groupResults =
		state.parallelResults.get(group.stepIndex) ??
		new Map<string, StageResult>();
	groupResults.set(stepId, result);
	state.parallelResults.set(group.stepIndex, groupResults);
	emitParallelEndIfComplete(state, group, groupResults);
}

function emitParallelEndIfComplete(
	state: AdapterState,
	group: StepGroup,
	groupResults: Map<string, StageResult>,
): void {
	if (state.endedParallelGroups.has(group.stepIndex)) return;
	if (groupResults.size !== group.metadatas.length) return;

	const results = group.metadatas.flatMap((metadata) => {
		const result = groupResults.get(metadata.stepId);
		return result ? [result] : [];
	});
	const errors = results.flatMap((result) =>
		result.error ? [result.error] : [],
	);
	const success = results.every((result) => result.success);
	const error = errors.length > 0 ? errors.join("; ") : undefined;

	state.events.push({
		type: "parallel_end",
		step: group.chainStep as ParallelGroupStep,
		stepIndex: group.stepIndex,
		results,
		success,
		...(error !== undefined && { error }),
	});
	state.stageResults.push(...results);
	state.endedParallelGroups.add(group.stepIndex);
}

function stageResultFromStepResult(
	state: AdapterState,
	timestamp: string,
	stepId: string,
	result: StepResult,
): StageResult | undefined {
	const metadata = state.topology.stepById.get(stepId);
	if (!metadata) return undefined;

	const success = result.outcome === "success";
	const error = success ? undefined : result.summary;
	return {
		stage: chainStage(metadata.stage),
		success,
		iterations: 1,
		durationMs: durationMs(state.stepStartedAt.get(stepId), timestamp),
		...(error !== undefined && { error }),
		...(result.summary !== "" && { summary: result.summary }),
	};
}

function stageResultFromFailure(
	state: AdapterState,
	timestamp: string,
	stepId: string,
	reason: string,
): StageResult | undefined {
	const metadata = state.topology.stepById.get(stepId);
	if (!metadata) return undefined;

	return {
		stage: chainStage(metadata.stage),
		success: false,
		iterations: 1,
		durationMs: durationMs(state.stepStartedAt.get(stepId), timestamp),
		error: reason,
	};
}

function chainResult(
	state: AdapterState,
	timestamp: string,
	outcome: string,
): ChainResult {
	return {
		success: outcome === "completed" && state.errors.length === 0,
		stageResults: [...state.stageResults],
		totalDurationMs: durationMs(state.runStartedAt, timestamp),
		errors: [...state.errors],
	};
}

function chainAgentEventFromEvidence(
	state: AdapterState,
	event: Extract<OrchestrationEvent, { type: "step_tool_activity" }>,
): ChainEvent | undefined {
	const details = event.details;
	if (!isRecord(details)) return undefined;
	if (details.source !== "chain" && details.kind !== "chain_agent_event") {
		return undefined;
	}

	const evidence = validateChainAgentEvidence(state, event.stepId, details);
	if (!evidence) return undefined;

	switch (evidence.chainEvent) {
		case "agent_spawned":
			return {
				type: "agent_spawned",
				role: evidence.role,
				sessionId: evidence.sessionId,
			};
		case "agent_completed":
			return {
				type: "agent_completed",
				role: evidence.role,
				sessionId: evidence.sessionId,
			};
		case "agent_turn":
			return {
				type: "agent_turn",
				role: evidence.role,
				sessionId: evidence.sessionId,
				event: evidence.event,
			};
		case "agent_tool_use":
			return {
				type: "agent_tool_use",
				role: evidence.role,
				sessionId: evidence.sessionId,
				event: evidence.event,
			};
	}
}

function validateChainAgentEvidence(
	state: AdapterState,
	stepId: string,
	details: Record<string, unknown>,
): ChainAgentEvidenceDetails | undefined {
	const errors: string[] = [];
	const chainEvent = details.chainEvent;
	const role = details.role;
	const sessionId = details.sessionId;
	const event = details.event;
	const metadata = state.topology.stepById.get(stepId);

	if (details.source !== "chain") errors.push("source must be chain");
	if (details.kind !== "chain_agent_event") {
		errors.push("kind must be chain_agent_event");
	}
	if (!isChainAgentEventType(chainEvent)) {
		errors.push("chainEvent must be a supported agent event type");
	}
	if (typeof role !== "string" || role.length === 0) {
		errors.push("role must be a non-empty string");
	}
	if (typeof sessionId !== "string" || sessionId.length === 0) {
		errors.push("sessionId must be a non-empty string");
	}
	if (!isSpawnEvent(event)) {
		errors.push("event must be a valid SpawnEvent payload");
	} else if (typeof sessionId === "string" && event.sessionId !== sessionId) {
		errors.push("event.sessionId must match sessionId");
	}
	if (metadata && typeof role === "string" && metadata.stage.name !== role) {
		errors.push("role must match scheduler stage metadata");
	}
	if (
		chainEvent === "agent_turn" &&
		isSpawnEvent(event) &&
		!isTurnLikeSpawnEvent(event)
	) {
		errors.push("agent_turn requires a turn or compaction SpawnEvent");
	}
	if (
		chainEvent === "agent_tool_use" &&
		isSpawnEvent(event) &&
		!isToolSpawnEvent(event)
	) {
		errors.push("agent_tool_use requires a tool execution SpawnEvent");
	}

	if (errors.length > 0) {
		state.diagnostics.push({
			code: "invalid_chain_agent_evidence",
			message: `Durable chain agent evidence is invalid: ${errors.join("; ")}.`,
			details: {
				stepId,
				chainEvent,
				role,
				hasSessionId: typeof sessionId === "string" && sessionId.length > 0,
			},
		});
		return undefined;
	}

	return {
		source: "chain",
		kind: "chain_agent_event",
		chainEvent: chainEvent as ChainAgentEventType,
		role: role as string,
		sessionId: sessionId as string,
		event: event as SpawnEvent,
	};
}

function chainTopology(
	metadatas: readonly ChainCompilerStepMetadata[],
): ChainTopology {
	const groups = new Map<number, ChainCompilerStepMetadata[]>();
	for (const metadata of metadatas) {
		const current = groups.get(metadata.stepIndex) ?? [];
		current.push(metadata);
		groups.set(metadata.stepIndex, current);
	}

	const stepById = new Map<string, ChainCompilerStepMetadata>();
	const groupByStepId = new Map<string, StepGroup>();
	const groupsByIndex = new Map<number, StepGroup>();
	const chainSteps: ChainStep[] = [];

	for (const [stepIndex, groupMetadatas] of [...groups.entries()].sort(
		([left], [right]) => left - right,
	)) {
		const sorted = [...groupMetadatas].sort(compareMetadata);
		for (const metadata of sorted) {
			stepById.set(metadata.stepId, metadata);
		}

		if (isParallelMetadataGroup(sorted)) {
			const stepGroup: StepGroup = {
				stepIndex,
				metadatas: sorted,
				chainStep: {
					kind: "parallel",
					stages: sorted.map((metadata) => chainStage(metadata.stage)) as [
						ChainStage,
						...ChainStage[],
					],
					syntax: sorted[0]?.syntax ?? { kind: "group" },
				},
			};
			chainSteps.push(stepGroup.chainStep);
			groupsByIndex.set(stepIndex, stepGroup);
			for (const metadata of sorted) {
				groupByStepId.set(metadata.stepId, stepGroup);
			}
			continue;
		}

		const metadata = sorted[0];
		if (metadata) {
			chainSteps.push(chainStage(metadata.stage));
		}
	}

	return { chainSteps, stepById, groupByStepId, groupsByIndex };
}

function isParallelMetadataGroup(
	metadatas: readonly ChainCompilerStepMetadata[],
): boolean {
	return (
		metadatas.length > 1 ||
		metadatas.some(
			(metadata) =>
				metadata.memberIndex !== undefined || metadata.syntax !== undefined,
		)
	);
}

function compareMetadata(
	left: ChainCompilerStepMetadata,
	right: ChainCompilerStepMetadata,
): number {
	return (
		(left.memberIndex ?? 0) - (right.memberIndex ?? 0) ||
		left.stepId.localeCompare(right.stepId)
	);
}

function chainStage(stage: ChainCompilerStepMetadata["stage"]): ChainStage {
	return {
		name: stage.name,
		loop: stage.loop,
		...(stage.prompt !== undefined && { prompt: stage.prompt }),
	};
}

function isChainAgentEventType(value: unknown): value is ChainAgentEventType {
	return (
		value === "agent_spawned" ||
		value === "agent_completed" ||
		value === "agent_turn" ||
		value === "agent_tool_use"
	);
}

function isSpawnEvent(value: unknown): value is SpawnEvent {
	if (!isRecord(value) || typeof value.sessionId !== "string") {
		return false;
	}

	switch (value.type) {
		case "turn_start":
		case "turn_end":
			return true;
		case "tool_execution_start":
			return (
				typeof value.toolName === "string" &&
				typeof value.toolCallId === "string"
			);
		case "tool_execution_end":
			return (
				typeof value.toolName === "string" &&
				typeof value.toolCallId === "string" &&
				typeof value.isError === "boolean"
			);
		case "compaction_start":
			return isCompactionReason(value.reason);
		case "compaction_end":
			return (
				isCompactionReason(value.reason) &&
				typeof value.aborted === "boolean" &&
				typeof value.willRetry === "boolean" &&
				(value.errorMessage === undefined ||
					typeof value.errorMessage === "string")
			);
		default:
			return false;
	}
}

function isTurnLikeSpawnEvent(event: SpawnEvent): boolean {
	return (
		event.type === "turn_start" ||
		event.type === "turn_end" ||
		event.type === "compaction_start" ||
		event.type === "compaction_end"
	);
}

function isToolSpawnEvent(event: SpawnEvent): boolean {
	return (
		event.type === "tool_execution_start" || event.type === "tool_execution_end"
	);
}

function isCompactionReason(value: unknown): boolean {
	return value === "manual" || value === "threshold" || value === "overflow";
}

function durationMs(start: string | undefined, end: string): number {
	if (!start) return 0;
	const duration = Date.parse(end) - Date.parse(start);
	return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function addError(state: AdapterState, message: string): void {
	if (!state.errors.includes(message)) {
		state.errors.push(message);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
