import type {
	ArtifactRef,
	BackendSpec,
	RunGraph,
	RunGraphStep,
	RunRecord,
	RunStore,
	StepRecord,
} from "../durable-runtime/index.ts";
import { type DriverRunSpec, resolveStateCommitPolicy } from "./types.ts";

export const DRIVE_FINALIZER_RETRY_POLICY = {
	maxAttempts: Number.MAX_SAFE_INTEGER,
} as const;

export interface CompileDriveRunToGraphOptions {
	spec: DriverRunSpec;
	store: RunStore;
}

export interface CompiledDriveGraph {
	run: RunRecord;
	graph: RunGraph;
	steps: StepRecord[];
	taskSteps: RunGraphStep[];
	finalizerSteps: RunGraphStep[];
}

export async function compileDriveRunToGraph(
	options: CompileDriveRunToGraphOptions,
): Promise<CompiledDriveGraph> {
	const { spec, store } = options;
	const ref = { scope: spec.planSlug, runId: spec.runId };
	const run =
		(await store.loadRun(ref)) ??
		(await store.createRun({
			...ref,
			eventsPath: "orchestration-events.jsonl",
			policy: {
				defaultBackend: { name: spec.backendName },
				worktree: { mode: "shared", path: spec.workdir },
				timeoutMs: spec.taskTimeoutMs,
			},
			metadata: {
				driveTaskIds: [...spec.taskIds],
				configuredBackendName: spec.backendName,
			},
		}));
	const { taskSteps, finalizerSteps } = compileSteps(spec);
	const graph = toRunGraph([...taskSteps, ...finalizerSteps]);
	await store.writeRunGraph(ref, graph);

	const records: StepRecord[] = [];
	for (const step of graph.steps) {
		const record = toPendingStepRecord(step);
		records.push(await store.writeStepRecord(ref, record));
	}

	return {
		run,
		graph,
		steps: records,
		taskSteps,
		finalizerSteps,
	};
}

function compileSteps(spec: DriverRunSpec): {
	taskSteps: RunGraphStep[];
	finalizerSteps: RunGraphStep[];
} {
	const taskSteps: RunGraphStep[] = [];
	const finalizerSteps: RunGraphStep[] = [];
	const taskStatusFinalizerIds: string[] = [];

	for (const [index, taskId] of spec.taskIds.entries()) {
		const taskStep = taskGraphStep(spec, taskId, index);
		taskSteps.push(taskStep);

		const taskStatusDependency = sourceCommitEnabled(spec)
			? sourceCommitFinalizerId(taskId)
			: taskId;

		if (sourceCommitEnabled(spec)) {
			finalizerSteps.push(sourceCommitFinalizerStep(spec, taskId));
		}

		const taskStatus = taskStatusFinalizerStep(
			spec,
			taskId,
			taskStatusDependency,
		);
		finalizerSteps.push(taskStatus);
		taskStatusFinalizerIds.push(taskStatus.id);
	}

	if (resolveStateCommitPolicy(spec) === "final-state-commit") {
		finalizerSteps.push(stateCommitFinalizerStep(spec, taskStatusFinalizerIds));
	}

	return { taskSteps, finalizerSteps };
}

function taskGraphStep(
	spec: DriverRunSpec,
	taskId: string,
	index: number,
): RunGraphStep {
	return {
		id: taskId,
		runId: spec.runId,
		title: `Drive task ${taskId}`,
		kind: "drive",
		backend: { name: spec.backendName },
		dependsOn: index > 0 ? [spec.taskIds[index - 1] as string] : [],
		inputArtifacts: taskInputArtifacts(taskId),
	};
}

function sourceCommitFinalizerStep(
	spec: DriverRunSpec,
	taskId: string,
): RunGraphStep {
	return finalizerGraphStep({
		spec,
		id: sourceCommitFinalizerId(taskId),
		title: finalizerTitle("source commit", taskId),
		phase: "commit",
		dependsOn: [taskId],
		inputArtifacts: stepInputArtifacts([taskId]),
	});
}

function taskStatusFinalizerStep(
	spec: DriverRunSpec,
	taskId: string,
	dependency: string,
): RunGraphStep {
	return finalizerGraphStep({
		spec,
		id: taskStatusFinalizerId(taskId),
		title: finalizerTitle("task status", taskId),
		phase: "task_status",
		dependsOn: [dependency],
		inputArtifacts: stepInputArtifacts([taskId]),
	});
}

function stateCommitFinalizerStep(
	spec: DriverRunSpec,
	taskStatusFinalizerIds: readonly string[],
): RunGraphStep {
	return finalizerGraphStep({
		spec,
		id: "finalizer-state-commit",
		title: "Drive state commit finalizer",
		phase: "state_commit",
		dependsOn: [...taskStatusFinalizerIds],
		inputArtifacts: stepInputArtifacts(spec.taskIds),
	});
}

function finalizerGraphStep(options: {
	spec: DriverRunSpec;
	id: string;
	title: string;
	phase: "commit" | "task_status" | "state_commit";
	dependsOn: string[];
	inputArtifacts: ArtifactRef[];
}): RunGraphStep {
	return {
		id: options.id,
		runId: options.spec.runId,
		title: options.title,
		kind: "finalizer",
		backend: finalizerBackend(options.phase),
		dependsOn: options.dependsOn,
		inputArtifacts: options.inputArtifacts,
	};
}

function toRunGraph(steps: RunGraphStep[]): RunGraph {
	return {
		steps,
		edges: steps.flatMap((step) =>
			step.dependsOn.map((dependency) => ({ from: dependency, to: step.id })),
		),
	};
}

function toPendingStepRecord(step: RunGraphStep): StepRecord {
	const base: StepRecord = {
		...step,
		status: "pending",
		outputArtifacts: [],
	};
	if (step.kind !== "finalizer") {
		return base;
	}
	return {
		...base,
		retryPolicy: { ...DRIVE_FINALIZER_RETRY_POLICY },
	};
}

function taskInputArtifacts(taskId: string): ArtifactRef[] {
	return [
		{ id: "task", path: `missions/tasks/${taskId}.md`, kind: "task" },
		{ id: "prompt", path: `prompts/${taskId}.md`, kind: "prompt" },
	];
}

function stepInputArtifacts(taskIds: readonly string[]): ArtifactRef[] {
	return taskIds.map((taskId) => ({
		id: `step:${taskId}`,
		path: `steps/${taskId}/step.json`,
		kind: "step",
	}));
}

function finalizerBackend(
	phase: "commit" | "task_status" | "state_commit",
): BackendSpec {
	return { name: "shell-command", options: { drivePhase: phase } };
}

function sourceCommitEnabled(spec: DriverRunSpec): boolean {
	return spec.commitPolicy === "driver-commits";
}

function sourceCommitFinalizerId(taskId: string): string {
	return `finalizer-source-commit-${taskId}`;
}

function taskStatusFinalizerId(taskId: string): string {
	return `finalizer-task-status-${taskId}`;
}

function finalizerTitle(
	label: "source commit" | "task status",
	taskId: string,
) {
	return `Drive ${label} finalizer for ${taskId}`;
}
