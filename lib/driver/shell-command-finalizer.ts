import type {
	BackendCapabilities,
	BackendHandle,
	BackendSpec,
	RunGraphSchedulerBackend,
	StepRecord,
	StepResult,
} from "../durable-runtime/index.ts";

export const DRIVE_SHELL_COMMAND_CAPABILITIES: BackendCapabilities = {
	canResume: false,
	canCancel: false,
	canCommit: true,
	isolatedFromHostSource: false,
	emitsMachineReport: true,
};

const SHELL_COMMAND_BACKEND_SPEC: BackendSpec = { name: "shell-command" };

export function createDriveShellCommandBackend(): RunGraphSchedulerBackend {
	return {
		name: "shell-command",
		capabilities: { ...DRIVE_SHELL_COMMAND_CAPABILITIES },
		async prepare(step, context) {
			return {
				step,
				attemptId: context.attemptId,
				backend: SHELL_COMMAND_BACKEND_SPEC,
				input: context.input,
				preparedAt: context.now?.() ?? new Date().toISOString(),
			};
		},
		async start(prepared) {
			return {
				backend: prepared.backend,
				stepId: prepared.step.id,
				attemptId: prepared.attemptId,
				startedAt: new Date().toISOString(),
				result: Promise.resolve(todoTask370Result(prepared.step)),
			} satisfies BackendHandle<StepResult>;
		},
	};
}

function todoTask370Result(step: StepRecord): StepResult {
	return {
		outcome: "blocked",
		summary: `TODO(TASK-370): shell-command finalizer execution is not implemented for ${step.id}.`,
		artifacts: [],
		nextAction: "wait_for_human",
	};
}
