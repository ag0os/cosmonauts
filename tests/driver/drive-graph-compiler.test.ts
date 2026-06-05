import { describe, expect, test } from "vitest";
import { compileDriveRunToGraph } from "../../lib/driver/drive-graph-compiler.ts";
import type { DriverRunSpec } from "../../lib/driver/types.ts";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("drive-graph-compiler-");
const PLAN_SLUG = "durable-frontend-migration";
const PARENT_SESSION_ID = "drive-graph-parent-session";

describe("Drive graph compiler", () => {
	// @cosmo-behavior plan:durable-frontend-migration#B-009
	test("compiles selected task ids into sequential drive task steps", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const spec = createSpec({
			runId: "run-selected-order",
			taskIds: ["TASK-30", "TASK-10", "TASK-20"],
			commitPolicy: "no-commit",
			stateCommitPolicy: "none",
		});

		const compiled = await compileDriveRunToGraph({ spec, store });
		const persistedGraph = await store.readRunGraph({
			scope: PLAN_SLUG,
			runId: spec.runId,
		});
		const driveSteps = compiled.graph.steps.filter(
			(step) => step.kind === "drive",
		);

		expect(persistedGraph.graph).toEqual(compiled.graph);
		expect(driveSteps.map((step) => step.id)).toEqual([
			"TASK-30",
			"TASK-10",
			"TASK-20",
		]);
		expect(driveSteps.map((step) => step.dependsOn)).toEqual([
			[],
			["finalizer-task-status-TASK-30"],
			["finalizer-task-status-TASK-10"],
		]);
		expect(
			driveSteps.map((step) => ({
				id: step.id,
				backend: step.backend,
				inputArtifacts: step.inputArtifacts,
			})),
		).toEqual([
			{
				id: "TASK-30",
				backend: { name: "codex" },
				inputArtifacts: taskInputArtifacts("TASK-30"),
			},
			{
				id: "TASK-10",
				backend: { name: "codex" },
				inputArtifacts: taskInputArtifacts("TASK-10"),
			},
			{
				id: "TASK-20",
				backend: { name: "codex" },
				inputArtifacts: taskInputArtifacts("TASK-20"),
			},
		]);
		expect(compiled.graph.edges).toEqual([
			{ from: "finalizer-task-status-TASK-30", to: "TASK-10" },
			{ from: "finalizer-task-status-TASK-10", to: "TASK-20" },
			{ from: "TASK-30", to: "finalizer-task-status-TASK-30" },
			{ from: "TASK-10", to: "finalizer-task-status-TASK-10" },
			{ from: "TASK-20", to: "finalizer-task-status-TASK-20" },
		]);

		for (const step of driveSteps) {
			const record = await store.readStepRecord({
				scope: PLAN_SLUG,
				runId: spec.runId,
				stepId: step.id,
			});
			expect(record).toMatchObject({
				id: step.id,
				runId: spec.runId,
				kind: "drive",
				status: "pending",
				dependsOn: step.dependsOn,
				outputArtifacts: [],
			});
		}
	});

	// @cosmo-behavior plan:durable-frontend-migration#B-010
	test("adds only policy-enabled drive finalizer steps in executable order", async () => {
		const store = new FileRunStore({ rootDir: temp.path });
		const driverCommitsSpec = createSpec({
			runId: "run-driver-commits",
			taskIds: ["TASK-1", "TASK-2"],
			commitPolicy: "driver-commits",
		});

		const driverCommits = await compileDriveRunToGraph({
			spec: driverCommitsSpec,
			store,
		});
		const finalizers = driverCommits.finalizerSteps;

		expect(finalizers.map((step) => step.id)).toEqual([
			"finalizer-source-commit-TASK-1",
			"finalizer-task-status-TASK-1",
			"finalizer-source-commit-TASK-2",
			"finalizer-task-status-TASK-2",
			"finalizer-state-commit",
		]);
		expect(finalizers.map((step) => step.backend)).toEqual([
			{ name: "shell-command", options: { drivePhase: "commit" } },
			{ name: "shell-command", options: { drivePhase: "task_status" } },
			{ name: "shell-command", options: { drivePhase: "commit" } },
			{ name: "shell-command", options: { drivePhase: "task_status" } },
			{ name: "shell-command", options: { drivePhase: "state_commit" } },
		]);
		expect(finalizers.map((step) => step.dependsOn)).toEqual([
			["TASK-1"],
			["finalizer-source-commit-TASK-1"],
			["TASK-2"],
			["finalizer-source-commit-TASK-2"],
			["finalizer-task-status-TASK-1", "finalizer-task-status-TASK-2"],
		]);

		for (const step of finalizers) {
			const record = await store.readStepRecord({
				scope: PLAN_SLUG,
				runId: driverCommitsSpec.runId,
				stepId: step.id,
			});
			expect(record).toMatchObject({
				id: step.id,
				kind: "finalizer",
				status: "pending",
				backend: step.backend,
				dependsOn: step.dependsOn,
				retryPolicy: { maxAttempts: Number.MAX_SAFE_INTEGER },
			});
		}

		const noCommitSpec = createSpec({
			runId: "run-no-commit",
			taskIds: ["TASK-9"],
			commitPolicy: "no-commit",
			stateCommitPolicy: "none",
		});
		const noCommit = await compileDriveRunToGraph({
			spec: noCommitSpec,
			store,
		});

		expect(noCommit.finalizerSteps.map((step) => step.id)).toEqual([
			"finalizer-task-status-TASK-9",
		]);
		expect(noCommit.finalizerSteps[0]).toMatchObject({
			backend: {
				name: "shell-command",
				options: { drivePhase: "task_status" },
			},
			dependsOn: ["TASK-9"],
		});

		const driverCommitsNoStateSpec = createSpec({
			runId: "run-driver-commits-no-state",
			taskIds: ["TASK-8"],
			commitPolicy: "driver-commits",
			stateCommitPolicy: "none",
		});
		const driverCommitsNoState = await compileDriveRunToGraph({
			spec: driverCommitsNoStateSpec,
			store,
		});

		expect(driverCommitsNoState.finalizerSteps.map((step) => step.id)).toEqual([
			"finalizer-source-commit-TASK-8",
			"finalizer-task-status-TASK-8",
		]);
	});
});

function createSpec(
	input: Pick<DriverRunSpec, "runId" | "taskIds" | "commitPolicy"> &
		Partial<DriverRunSpec>,
): DriverRunSpec {
	return {
		...input,
		runId: input.runId,
		parentSessionId: PARENT_SESSION_ID,
		projectRoot: temp.path,
		planSlug: PLAN_SLUG,
		taskIds: input.taskIds,
		backendName: "codex",
		promptTemplate: { envelopePath: "prompts/envelope.md" },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: input.commitPolicy,
		workdir: temp.path,
		eventLogPath: `${temp.path}/events.jsonl`,
	};
}

function taskInputArtifacts(taskId: string) {
	return [
		{ id: "task", path: `missions/tasks/${taskId}.md`, kind: "task" },
		{ id: "prompt", path: `prompts/${taskId}.md`, kind: "prompt" },
	];
}
