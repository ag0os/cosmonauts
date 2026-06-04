import type {
	BackendCapabilities,
	BackendContext,
	BackendHandle,
	BackendSpec,
	KnownBackendName,
	OrchestrationBackend,
	PreparedStep,
	StepRecord,
} from "../../durable-runtime/index.ts";
import type { Backend, BackendInvocation, BackendRunResult } from "./types.ts";

export type DriveOrchestrationBackendName = Extract<
	KnownBackendName,
	"codex" | "claude-cli" | "cosmonauts-subagent"
>;

export const DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES = {
	codex: {
		canResume: false,
		canCancel: false,
		canCommit: false,
		isolatedFromHostSource: true,
		emitsMachineReport: true,
	},
	"claude-cli": {
		canResume: false,
		canCancel: false,
		canCommit: true,
		isolatedFromHostSource: true,
		emitsMachineReport: true,
	},
	"cosmonauts-subagent": {
		canResume: false,
		canCancel: false,
		canCommit: true,
		isolatedFromHostSource: false,
		emitsMachineReport: true,
	},
} satisfies Record<DriveOrchestrationBackendName, BackendCapabilities>;

type UnsupportedDriveBackendOperation = "resume" | "cancel";

export class UnsupportedDriveBackendOperationError extends Error {
	readonly backendName: DriveOrchestrationBackendName;
	readonly operation: UnsupportedDriveBackendOperation;

	constructor(
		backendName: DriveOrchestrationBackendName,
		operation: UnsupportedDriveBackendOperation,
	) {
		super(`Drive backend ${backendName} does not support ${operation}.`);
		this.name = "UnsupportedDriveBackendOperationError";
		this.backendName = backendName;
		this.operation = operation;
	}
}

interface DriveBackendOrchestrationAdapterOptions {
	name: DriveOrchestrationBackendName;
	backend: Backend;
}

interface DriveBackendOrchestrationAdapter
	extends OrchestrationBackend<BackendInvocation, BackendRunResult> {
	name: DriveOrchestrationBackendName;
	capabilities: BackendCapabilities;
	prepare(
		step: StepRecord,
		context: BackendContext<BackendInvocation>,
	): Promise<PreparedStep<BackendInvocation>>;
	start(
		prepared: PreparedStep<BackendInvocation>,
	): Promise<BackendHandle<BackendRunResult>>;
	resume(
		step: StepRecord,
		context: BackendContext<BackendInvocation>,
	): Promise<BackendHandle<BackendRunResult>>;
	cancel(handle: BackendHandle<BackendRunResult>): Promise<void>;
}

export function createDriveBackendOrchestrationAdapter({
	name,
	backend,
}: DriveBackendOrchestrationAdapterOptions): DriveBackendOrchestrationAdapter {
	const backendSpec: BackendSpec = { name };

	return {
		name,
		capabilities: { ...DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES[name] },
		async prepare(step, context) {
			return {
				step,
				attemptId: context.attemptId,
				backend: backendSpec,
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
				result: backend.run(prepared.input),
			};
		},
		async resume() {
			throw new UnsupportedDriveBackendOperationError(name, "resume");
		},
		async cancel() {
			throw new UnsupportedDriveBackendOperationError(name, "cancel");
		},
	};
}
