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

export type StepStatus =
	| "pending"
	| "ready"
	| "running"
	| "completed"
	| "blocked"
	| "failed"
	| "cancelled"
	| "stale";

export interface WorktreeSpec {
	mode: "shared" | "isolated";
	path?: string;
}

export interface BackendPolicy {
	name: string;
	[key: string]: unknown;
}

export interface RunPolicy {
	reportInference: "strict" | "objective";
	defaultBackend: BackendPolicy;
	worktree: WorktreeSpec;
	maxCostUsd?: number;
	maxTokens?: number;
	timeoutMs?: number;
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

export interface ArtifactRef {
	id: string;
	path: string;
	kind?: string;
	metadata?: Record<string, unknown>;
}

export interface FileChangeSummary {
	path: string;
	status: "added" | "modified" | "deleted" | "renamed";
	previousPath?: string;
}

export interface VerificationResult {
	command: string;
	status: "pass" | "fail" | "skipped";
	output?: string;
}

export interface CommitRef {
	sha: string;
	subject?: string;
}

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
	kind: string;
	dependsOn: string[];
	status: StepStatus;
	inputArtifacts: ArtifactRef[];
	outputArtifacts: ArtifactRef[];
	result?: StepResult;
}

export type OrchestrationEvent =
	| { type: "run_started"; runId: string }
	| { type: "run_completed"; runId: string; result: RunResult }
	| { type: "run_blocked"; runId: string; reason: string }
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
	createRun(input: CreateRunInput): Promise<RunRecord>;
	loadRun(ref: RunRef): Promise<RunRecord | undefined>;
	updateRun(record: RunRecord): Promise<RunRecord>;
	appendEvent(
		ref: RunRef,
		event: OrchestrationEvent,
	): Promise<StoredOrchestrationEvent>;
	readEvents(ref: RunRef, options?: ReadEventsOptions): Promise<RunWatchResult>;
	writeStepRecord(ref: RunRef, step: StepRecord): Promise<StepRecord>;
	readStepRecord(
		ref: RunRef & { stepId: string },
	): Promise<StepRecord | undefined>;
	listRecentRuns(options?: ListRecentRunsOptions): Promise<RunRecord[]>;
	readStatus(ref: RunRef): Promise<RunStatusSummary | undefined>;
}
