export interface RunRef {
	scope: string;
	runId: string;
}

export type RunStatus =
	| "pending"
	| "running"
	| "completed"
	| "blocked"
	| "failed"
	| "cancelled"
	| "stale";

export const KNOWN_BACKEND_NAMES = [
	"codex",
	"claude-cli",
	"cosmonauts-subagent",
	"shell-command",
] as const;

export type KnownBackendName = (typeof KNOWN_BACKEND_NAMES)[number];

export type BackendName = KnownBackendName | "unknown";

export interface BackendSpec {
	name: BackendName;
	options?: Record<string, unknown>;
}

// fallow-ignore-next-line unused-types: durable runtime public contract type for Plan 1.
export type StepStatus =
	| "pending"
	| "ready"
	| "running"
	| "completed"
	| "blocked"
	| "failed"
	| "cancelled"
	| "stale";

export type StepKind =
	| "agent"
	| "drive"
	| "chain"
	| "command"
	| "approval"
	| "finalizer";

// fallow-ignore-next-line unused-types: durable runtime public contract type for Plan 1.
export interface WorktreeSpec {
	mode: "shared" | "isolated";
	path?: string;
}

export interface StepLease {
	holderId: string;
	acquiredAt: string;
	expiresAt?: string;
	renewable: boolean;
}

export interface StepHeartbeat {
	at: string;
	note?: string;
}

export interface RetryPolicy {
	maxAttempts: number;
	backoffMs?: number;
}

// fallow-ignore-next-line unused-types: durable runtime public contract type for Plan 1.
export interface BackendPolicy extends BackendSpec {
	[key: string]: unknown;
}

export interface RunPolicy {
	reportInference: "strict" | "objective";
	defaultBackend: BackendPolicy;
	worktree: WorktreeSpec;
	maxCostUsd?: number;
	maxTokens?: number;
	timeoutMs?: number;
	maxParallelSteps?: number;
	staleHeartbeatMs?: number;
	retryLimit?: number;
	idleTimeoutMs?: number;
	hardTimeoutMs?: number;
	retryPotentiallyCommittedSteps?: boolean;
}

export interface RunRecord {
	scope: string;
	runId: string;
	status: RunStatus;
	createdAt: string;
	updatedAt: string;
	runDir: string;
	graphPath: string;
	eventsPath: string;
	artifactsDir: string;
	schedulerStatePath: string;
	stepsDir: string;
	policy: RunPolicy;
	metadata?: Record<string, unknown>;
}

// fallow-ignore-next-line unused-types: durable runtime public contract type for Plan 1.
export interface ArtifactRef {
	id: string;
	path: string;
	kind?: string;
	metadata?: Record<string, unknown>;
}

export interface SchedulerState {
	readyStepIds: string[];
	leasesByStepId: Record<string, StepLease>;
	heartbeatsByStepId: Record<string, StepHeartbeat>;
	cursor?: number;
	updatedAt: string;
}

export interface RunGraphStep {
	id: string;
	runId: string;
	title: string;
	kind: StepKind;
	backend: BackendSpec;
	dependsOn: string[];
	inputArtifacts: ArtifactRef[];
}

export interface RunGraphEdge {
	from: string;
	to: string;
}

export interface RunGraph {
	steps: RunGraphStep[];
	edges: RunGraphEdge[];
}

export interface ReadRunGraphResult {
	graph: RunGraph;
	diagnostics: RuntimeDiagnostic[];
}

export interface SchedulerStepInput {
	runId: string;
	stepId: string;
	inputArtifacts: ArtifactRef[];
	backendOptions?: Record<string, unknown>;
}

// fallow-ignore-next-line unused-types: durable runtime public contract type for Plan 1.
export interface FileChangeSummary {
	path: string;
	status: "added" | "modified" | "deleted" | "renamed";
	previousPath?: string;
}

// fallow-ignore-next-line unused-types: durable runtime public contract type for Plan 1.
export interface VerificationResult {
	command: string;
	status: "pass" | "fail" | "skipped";
	output?: string;
}

// fallow-ignore-next-line unused-types: durable runtime public contract type for Plan 1.
export interface CommitRef {
	sha: string;
	subject?: string;
}

// fallow-ignore-next-line unused-types: durable runtime public contract type for Plan 1.
export interface StepResult {
	outcome:
		| "success"
		| "blocked"
		| "partial"
		| "failed"
		| "unknown"
		| "cancelled";
	summary: string;
	artifacts: ArtifactRef[];
	files?: FileChangeSummary[];
	verification?: VerificationResult[];
	commits?: CommitRef[];
	nextAction?: "continue" | "retry" | "wait_for_human" | "abort_run";
}

// fallow-ignore-next-line unused-types: durable runtime public contract type for Plan 1.
export interface RunResult {
	outcome: "completed" | "blocked" | "failed" | "cancelled" | "stale";
	summary?: string;
	tasksDone?: number;
	tasksBlocked?: number;
	artifacts?: ArtifactRef[];
}

export interface StepRecord {
	id: string;
	runId: string;
	title: string;
	kind: StepKind;
	backend: BackendSpec;
	dependsOn: string[];
	status: StepStatus;
	inputArtifacts: ArtifactRef[];
	outputArtifacts: ArtifactRef[];
	lease?: StepLease;
	heartbeat?: StepHeartbeat;
	retryPolicy?: RetryPolicy;
	result?: StepResult;
	latestAttemptId?: string;
}

export type RunGraphSchedulerExitReason =
	| "terminal"
	| "drained"
	| "blocked"
	| "cancelled"
	| "waiting_for_fresh_external_work";

export interface RunGraphSchedulerResult {
	run: RunRecord;
	steps: StepRecord[];
	diagnostics: RuntimeDiagnostic[];
	exitReason: RunGraphSchedulerExitReason;
}

export interface StepAttemptRecord {
	attemptId: string;
	startedAt: string;
	endedAt?: string;
	result?: StepResult;
}

export type OrchestrationEvent =
	| { type: "run_started"; runId: string }
	| { type: "run_completed"; runId: string; result: RunResult }
	| { type: "run_blocked"; runId: string; reason: string }
	| { type: "run_activity"; runId: string; details: unknown }
	| { type: "step_ready"; runId: string; stepId: string }
	| { type: "step_started"; runId: string; stepId: string; backend: string }
	| { type: "step_heartbeat"; runId: string; stepId: string }
	| { type: "step_output"; runId: string; stepId: string; chunk: string }
	| {
			type: "step_tool_activity";
			runId: string;
			stepId: string;
			details: unknown;
	  }
	| {
			type: "artifact_written";
			runId: string;
			stepId?: string;
			artifact: ArtifactRef;
	  }
	| {
			type: "step_completed";
			runId: string;
			stepId: string;
			result: StepResult;
	  }
	| { type: "step_failed"; runId: string; stepId: string; reason: string }
	| { type: "step_blocked"; runId: string; stepId: string; reason: string }
	| {
			type: "child_run_started";
			runId: string;
			stepId: string;
			childRunId: string;
	  }
	| { type: "run_failed"; runId: string; reason: string }
	| { type: "run_cancelled"; runId: string }
	| { type: "run_stale"; runId: string }
	| { type: "step_cancelled"; runId: string; stepId: string }
	| { type: "step_stale"; runId: string; stepId: string };

export interface StoredOrchestrationEvent {
	seq: number;
	timestamp: string;
	runId: string;
	event: OrchestrationEvent;
}

export interface RuntimeDiagnostic {
	code: string;
	message: string;
	path?: string;
	line?: number;
	details?: unknown;
}

export interface RunWatchResult {
	runId: string;
	cursor: number;
	events: StoredOrchestrationEvent[];
	diagnostics: RuntimeDiagnostic[];
}

export interface RunWatchEventSummary {
	seq: number;
	text: string;
	envelope: StoredOrchestrationEvent;
}

export interface RunWatchSummary {
	scope: string;
	runId: string;
	found: boolean;
	cursor: number;
	events: RunWatchEventSummary[];
	diagnostics: RuntimeDiagnostic[];
}

export interface RunStatusSummary {
	scope: string;
	runId: string;
	status: RunStatus;
	statusSource: "record" | "event";
	recordStatus?: RunStatus;
	eventStatus?: RunStatus;
	updatedAt?: string;
	diagnostics: RuntimeDiagnostic[];
}

export interface CreateRunInput extends RunRef {
	status?: RunStatus;
	policy?: Partial<RunPolicy>;
	graphPath?: string;
	eventsPath?: string;
	artifactsDir?: string;
	schedulerStatePath?: string;
	metadata?: Record<string, unknown>;
}

export interface ReadEventsOptions {
	sinceSeq?: number;
	limit?: number;
}

export interface ListRecentRunsOptions {
	scope?: string;
	limit?: number;
}

export interface RunStore {
	withRunInitializationLock<T>(
		ref: RunRef,
		action: () => Promise<T>,
	): Promise<T>;
	createRun(input: CreateRunInput): Promise<RunRecord>;
	loadRun(ref: RunRef): Promise<RunRecord | undefined>;
	updateRun(record: RunRecord): Promise<RunRecord>;
	readRunGraph(ref: RunRef): Promise<ReadRunGraphResult>;
	writeRunGraph(ref: RunRef, graph: RunGraph): Promise<RunGraph>;
	readSchedulerState(ref: RunRef): Promise<SchedulerState>;
	writeSchedulerState(
		ref: RunRef,
		state: SchedulerState,
	): Promise<SchedulerState>;
	appendEvent(
		ref: RunRef,
		event: OrchestrationEvent,
	): Promise<StoredOrchestrationEvent>;
	readEvents(ref: RunRef, options?: ReadEventsOptions): Promise<RunWatchResult>;
	appendDiagnostic(ref: RunRef, diagnostic: RuntimeDiagnostic): Promise<void>;
	writeStepRecord(ref: RunRef, step: StepRecord): Promise<StepRecord>;
	readStepRecord(
		ref: RunRef & { stepId: string },
	): Promise<StepRecord | undefined>;
	listStepRecords(ref: RunRef): Promise<StepRecord[]>;
	writeStepHeartbeat(
		ref: RunRef & { stepId: string },
		heartbeat: StepHeartbeat,
	): Promise<StepHeartbeat>;
	readStepHeartbeat(
		ref: RunRef & { stepId: string },
	): Promise<StepHeartbeat | undefined>;
	writeStepAttemptRecord(
		ref: RunRef & { stepId: string },
		attempt: StepAttemptRecord,
		options?: { outputText?: string },
	): Promise<StepAttemptRecord>;
	readStepAttemptRecord(
		ref: RunRef & { stepId: string; attemptId: string },
	): Promise<StepAttemptRecord | undefined>;
	listStepAttemptRecords(
		ref: RunRef & { stepId: string },
	): Promise<StepAttemptRecord[]>;
	listRecentRuns(options?: ListRecentRunsOptions): Promise<RunRecord[]>;
	readStatus(ref: RunRef): Promise<RunStatusSummary | undefined>;
}
