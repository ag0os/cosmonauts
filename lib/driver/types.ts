/** Core driver type contracts. */

import type { KnownBackendName } from "../durable-runtime/index.ts";

export type BackendName = Extract<
	KnownBackendName,
	"cosmonauts-subagent" | "codex" | "claude-cli"
>;

export const DETACHED_DEFAULT_TASK_THRESHOLD = 4;
export const RESERVED_DRIVER_PLAN_SLUGS = new Set(["chain"]);

export function validateDriverPlanSlug(planSlug: string): void {
	if (RESERVED_DRIVER_PLAN_SLUGS.has(planSlug)) {
		throw new Error(
			`Plan slug "${planSlug}" is reserved for graph-backed chain runs and cannot be used for Drive.`,
		);
	}
}

type FinalizationPhase = "commit" | "task_status" | "state_commit";
export type StateCommitPolicy = "none" | "final-state-commit";

export function resolveStateCommitPolicy(
	spec: Pick<DriverRunSpec, "commitPolicy" | "stateCommitPolicy">,
): StateCommitPolicy {
	return (
		spec.stateCommitPolicy ??
		(spec.commitPolicy === "driver-commits" ? "final-state-commit" : "none")
	);
}

export interface DriverRunSpec {
	runId: string;
	parentSessionId: string;
	projectRoot: string;
	planSlug: string;
	taskIds: string[];
	/**
	 * Compatibility queue view used by resume surfaces that historically exposed
	 * only the not-yet-started task slice. Graph-backed Drive must keep
	 * `taskIds` as the original selected task set.
	 */
	remainingTaskIds?: string[];
	backendName: BackendName;
	promptTemplate: PromptLayers;
	preflightCommands: string[];
	postflightCommands: string[];
	branch?: string;
	commitPolicy: "driver-commits" | "backend-commits" | "no-commit";
	stateCommitPolicy?: StateCommitPolicy;
	partialMode?: "stop" | "continue";
	workdir: string;
	eventLogPath: string;
	taskTimeoutMs?: number;
	/**
	 * When a backend blocks/fails citing a path that the driver can see on disk
	 * under `projectRoot`, retry the task once with a clarifying note. Defaults
	 * to `true` (an `undefined` value is treated as enabled).
	 */
	retryOnContradictedBlock?: boolean;
}

/**
 * Annotation added to a block/fail event when the cited reason names a path the
 * driver can independently confirm exists on disk under `projectRoot`.
 */
export interface ContradictedBlockAnnotation {
	path: string;
	existsOnDisk: true;
}

export interface PromptLayers {
	envelopePath: string;
	envelopeContent?: string;
	preconditionPath?: string;
	perTaskOverrideDir?: string;
}

export type ReportOutcome = "success" | "failure" | "partial";

export interface Report {
	outcome: ReportOutcome;
	files: { path: string; change: "created" | "modified" | "deleted" }[];
	verification: { command: string; status: "pass" | "fail" | "not_run" }[];
	notes?: string;
	progress?: { phase: number; of: number; remaining?: string };
}

export type ParsedReport = Report | { outcome: "unknown"; raw: string };

interface DriverEventBase {
	runId: string;
	parentSessionId: string;
	timestamp: string;
}

export interface DriverRunAbortDetails {
	pendingTasks: {
		count: number;
		taskIds: string[];
	};
	cause:
		| {
				type: "unmet-dependencies";
				blockingTaskIds: string[];
		  }
		| {
				type: "backend-setup-failure";
				message: string;
				phase?: string;
				taskId?: string;
		  }
		| {
				type: "exception";
				message: string;
				phase: string;
				taskId?: string;
		  };
}

export type DriverEvent =
	| (DriverEventBase & {
			type: "run_started";
			planSlug: string;
			backend: string;
			mode: "inline" | "detached";
	  })
	| (DriverEventBase & { type: "task_started"; taskId: string })
	| (DriverEventBase & {
			type: "preflight";
			taskId: string;
			status: "started" | "passed" | "failed";
			details?: {
				command?: string;
				stderr?: string;
				gitDiffStat?: string;
				branch?: string;
			};
	  })
	| (DriverEventBase & {
			type: "spawn_started";
			taskId: string;
			backend: string;
	  })
	| (DriverEventBase & {
			type: "driver_activity";
			taskId: string;
			activity: SpawnActivity;
	  })
	| (DriverEventBase & {
			type: "spawn_completed";
			taskId: string;
			report: ParsedReport;
	  })
	| (DriverEventBase & {
			type: "spawn_failed";
			taskId: string;
			error: string;
			exitCode?: number;
			contradicted?: ContradictedBlockAnnotation;
	  })
	| (DriverEventBase & {
			type: "verify";
			taskId: string;
			phase: "post";
			status: "started" | "passed" | "failed";
			details?: { command?: string; stderr?: string };
	  })
	| (DriverEventBase & {
			type: "commit_made";
			taskId: string;
			sha: string;
			subject: string;
	  })
	| (DriverEventBase & {
			type: "finalize";
			taskId?: string;
			phase: FinalizationPhase;
			status: "started" | "passed" | "failed" | "skipped";
			details?: {
				sha?: string;
				subject?: string;
				error?: string;
				reason?: "no_changes" | "policy_none" | "not_all_tasks_done";
			};
	  })
	| (DriverEventBase & {
			type: "task_finalization_failed";
			taskId: string;
			phase: "commit" | "task_status";
			reason: string;
			commitSha?: string;
			retryable: true;
	  })
	| (DriverEventBase & { type: "task_done"; taskId: string })
	| (DriverEventBase & {
			type: "task_blocked";
			taskId: string;
			reason: string;
			progress?: { phase: number; of: number; remaining?: string };
			contradicted?: ContradictedBlockAnnotation;
	  })
	| (DriverEventBase & {
			type: "lock_warning";
			reason: string;
			details?: { previousRunId?: string; previousPid?: number };
	  })
	| (DriverEventBase & {
			type: "driver_diagnostic";
			level: "error" | "warning" | "info";
			code: string;
			message: string;
			phase?: string;
			taskId?: string;
			details?: Record<string, unknown>;
	  })
	| (DriverEventBase & {
			type: "run_completed";
			summary: { total: number; done: number; blocked: number };
	  })
	| (DriverEventBase & {
			type: "run_aborted";
			reason: string;
			details?: DriverRunAbortDetails;
	  })
	| (DriverEventBase & {
			type: "run_finalization_failed";
			phase: FinalizationPhase;
			reason: string;
			taskId?: string;
			commitSha?: string;
	  })
	| (DriverEventBase & {
			type: "plan_completion_candidate";
			planSlug: string;
			taskCount: number;
			reason: "all_plan_tasks_done";
	  });

export type SpawnActivity =
	| { kind: "tool_start"; toolName: string; summary: string }
	| { kind: "tool_end"; toolName: string; isError: boolean }
	| { kind: "turn_start" }
	| { kind: "turn_end" }
	| { kind: "compaction" };

export type EventSink = (event: DriverEvent) => Promise<void>;

export interface DriverHandle {
	runId: string;
	planSlug: string;
	workdir: string;
	eventLogPath: string;
	abort(): Promise<void>;
	result: Promise<DriverResult>;
}

interface DriverResultBase {
	runId: string;
	tasksDone: number;
	tasksBlocked: number;
}

export type DriverResult =
	| (DriverResultBase & {
			outcome: "completed";
			blockedTaskId?: string;
			blockedReason?: string;
			stateCommitSha?: string;
			planCompletionCandidate?: { planSlug: string; taskCount: number };
	  })
	| (DriverResultBase & {
			outcome: "aborted" | "blocked";
			blockedTaskId?: string;
			blockedReason?: string;
			abortDetails?: DriverRunAbortDetails;
	  })
	| (DriverResultBase & {
			outcome: "finalization_failed";
			finalizationPhase: FinalizationPhase;
			finalizationReason: string;
			finalizationTaskId?: string;
			finalizationCommitSha?: string;
			pendingFinalizationPath: string;
	  });

export type TaskOutcome =
	| {
			status: "done" | "blocked" | "partial";
			reason?: string;
			commitSha?: string;
	  }
	| {
			status: "finalization_failed";
			reason?: undefined;
			commitSha?: undefined;
			finalizationPhase: FinalizationPhase;
			finalizationReason: string;
			finalizationTaskId?: string;
			finalizationCommitSha?: string;
			pendingFinalizationPath: string;
	  };

export interface LockHandle {
	release(): Promise<void>;
}
