/** Core driver type contracts. */

export type BackendName = "cosmonauts-subagent" | "codex" | "claude-cli";

export interface DriverRunSpec {
	runId: string;
	parentSessionId: string;
	projectRoot: string;
	planSlug: string;
	taskIds: string[];
	backendName: BackendName;
	promptTemplate: PromptLayers;
	preflightCommands: string[];
	postflightCommands: string[];
	branch?: string;
	commitPolicy: "driver-commits" | "backend-commits" | "no-commit";
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
			type: "run_completed";
			summary: { total: number; done: number; blocked: number };
	  })
	| (DriverEventBase & { type: "run_aborted"; reason: string });

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

export interface DriverResult {
	runId: string;
	outcome: "completed" | "aborted" | "blocked";
	tasksDone: number;
	tasksBlocked: number;
	blockedTaskId?: string;
	blockedReason?: string;
}

export interface TaskOutcome {
	status: "done" | "blocked" | "partial";
	reason?: string;
	commitSha?: string;
}

export interface LockHandle {
	release(): Promise<void>;
}
