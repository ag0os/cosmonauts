import type {
	BackendSpec,
	KnownBackendName,
	RunRecord,
	SchedulerStepInput,
	StepRecord,
	StepResult,
} from "./types.ts";

export interface BackendCapabilities {
	canResume: boolean;
	canCancel: boolean;
	canCommit: boolean;
	isolatedFromHostSource: boolean;
	emitsMachineReport: boolean;
}

export interface BackendContext<Input = unknown> {
	run: RunRecord;
	step: StepRecord;
	attemptId: string;
	input: Input;
	signal?: AbortSignal;
	now?: () => string;
}

export interface PreparedStep<Input = unknown> {
	step: StepRecord;
	attemptId: string;
	backend: BackendSpec;
	input: Input;
	preparedAt: string;
}

export interface BackendHandle<Result = unknown> {
	backend: BackendSpec;
	stepId: string;
	attemptId: string;
	startedAt: string;
	result: Promise<Result>;
}

export interface OrchestrationBackend<Input = unknown, Result = unknown> {
	name: KnownBackendName;
	capabilities: BackendCapabilities;
	prepare(
		step: StepRecord,
		context: BackendContext<Input>,
	): Promise<PreparedStep<Input>>;
	start(prepared: PreparedStep<Input>): Promise<BackendHandle<Result>>;
	resume?(
		step: StepRecord,
		context: BackendContext<Input>,
	): Promise<BackendHandle<Result>>;
	cancel?(handle: BackendHandle<Result>): Promise<void>;
}

export type RunGraphSchedulerBackend = OrchestrationBackend<
	SchedulerStepInput,
	StepResult
>;
