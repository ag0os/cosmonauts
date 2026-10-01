import type { Envelope } from "../envelope/index.ts";
import type { SpawnStats } from "../orchestration/types.ts";

export const SIGNAL_KINDS = [
	"verify",
	"health",
	"dupes",
	"blast-radius",
	"plan-vs-actual",
	"mutation",
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export const SIGNAL_STATUSES = ["pass", "fail", "info"] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

/**
 * One verification fact produced by the host after the builder returns.
 * Only `verify` failures and surviving mutants inside changed functions
 * set `reenter` (ruling D-4); every other signal informs the reviewer.
 */
export interface Signal {
	kind: SignalKind;
	status: SignalStatus;
	summary: string;
	data: unknown;
	reenter: boolean;
}

export interface PlanBehavior {
	id: string;
	observer: string;
	entryPoint: string;
	outcome: string;
}

/** The plan.md contract document (brief section 4.4) reduced to its headings. */
export interface ParsedPlan {
	title: string;
	approach: string;
	touches: string[];
	reuses: string[];
	behaviors: PlanBehavior[];
	risks: string[];
	diagram?: string;
	raw: string;
}

export interface RunBudget {
	tokens: number;
	timeMs: number;
}

export interface SignalContext {
	worktree: string;
	/**
	 * The revision to diff against: the run's `diffBase`, which is the
	 * pre-builder snapshot when the tree was dirty and HEAD otherwise.
	 */
	baseSha: string;
	plan: ParsedPlan;
	envelope: Envelope;
	changedFiles: readonly string[];
	budget: RunBudget;
	runDir: string;
	signal?: AbortSignal;
}

export interface SignalProvider {
	readonly kind: SignalKind;
	run(ctx: SignalContext): Promise<Signal>;
}

export const LEAN_BACKEND_KINDS = ["pi", "claude-cli", "codex-cli"] as const;
export type LeanBackendKind = (typeof LEAN_BACKEND_KINDS)[number];

export const LEAN_ROLES = [
	"lean/lead",
	"lean/builder",
	"lean/code-reviewer",
	"lean/checker",
] as const;
export type LeanRole = (typeof LEAN_ROLES)[number];

export interface BackendRunInput {
	prompt: string;
	worktree: string;
	role: LeanRole;
	/** Names the run's snapshot refs for the destructive-git guard. */
	taskId?: string;
	signal?: AbortSignal;
}

export interface BackendRunResult {
	text: string;
	stats?: SpawnStats;
}

/**
 * Runs one agent session and returns its full final text, which the runner
 * parses with lib/envelope. Pi backends must spawn with domain "lean" set
 * explicitly because the spawner re-resolves roles by name.
 */
export interface BuilderBackend {
	readonly kind: LeanBackendKind;
	run(input: BackendRunInput): Promise<BackendRunResult>;
}

/** Gitignored run directory root (ruling R-3), relative to the project root. */
export const LEAN_RUN_ROOT = "missions/sessions/lean/runs" as const;

export const RUN_RECORD_FILES = {
	manifest: "run.json",
	envelopes: "envelopes",
	facts: "facts.json",
	stats: "stats.json",
} as const;

export const RUN_STAGES = ["builder-1", "builder-2", "reviewer"] as const;
export type RunStage = (typeof RUN_STAGES)[number];

export const REVIEW_WORKSPACE_KINDS = ["private", "in-place"] as const;
export type ReviewWorkspaceKind = (typeof REVIEW_WORKSPACE_KINDS)[number];

export const RUN_STATUSES = ["running", "done", "blocked", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export interface RunManifest {
	id: string;
	/** HEAD when the run started. */
	baseSha: string;
	/**
	 * What providers, changed files and the reviewer diff compare against: the
	 * attempt-1 snapshot when uncommitted work predates the run, else `baseSha`.
	 */
	diffBase?: string;
	specPath?: string;
	planPath: string;
	backend: LeanBackendKind;
	reentries: number;
	snapshotRefs: string[];
	status: RunStatus;
	reason?: string;
	createdAt: string;
	reviewWorkspace?: ReviewWorkspaceKind;
	/** Cumulative tokens reported by backend stages. */
	tokensUsed?: number;
	warnings?: string[];
}

export interface SignalPass {
	pass: number;
	signals: Signal[];
}

export interface RunFacts {
	passes: SignalPass[];
}

export interface StageStats {
	stage: RunStage;
	durationMs: number;
	spawn?: SpawnStats;
}

export interface RunRecord {
	dir: string;
	manifest: RunManifest;
	envelopes: Partial<Record<RunStage, Envelope>>;
	facts: RunFacts;
	stats: StageStats[];
}
