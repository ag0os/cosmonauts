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

/** Run limits. `tokens` counts input + output tokens only, never cache reads or writes. */
export interface RunBudget {
	tokens: number;
	timeMs: number;
}

/** Reviewer lenses (brief 4.2); the reviewer reviews through these and no other. */
export const LEAN_LENSES = [
	"general",
	"security",
	"performance",
	"ux",
] as const;
export type LeanLens = (typeof LEAN_LENSES)[number];

/**
 * Direct: a request with no plan document. Plan: a plan.md (and maybe a
 * spec). Review: a reviewer-only run over an existing change (`runReview`).
 */
export type RunTier = "direct" | "plan" | "review";

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
	/** Signals already produced earlier in the same pass, in provider order. */
	priorSignals?: readonly Signal[];
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
	/**
	 * An envelope repair turn: the session must change nothing. External
	 * backends run it with the readonly tool set; on Pi the lean role guard
	 * blocks every tool call when the prompt starts with the repair heading.
	 */
	readonly?: boolean;
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
	request: "request.md",
	envelopes: "envelopes",
	facts: "facts.json",
	stats: "stats.json",
} as const;

/**
 * `builder-2` is the re-entry on failing verify or mutation signals (D-4),
 * `builder-3` the one re-entry with the reviewer's high and medium findings,
 * and `reviewer-2` the re-review after it.
 */
export const RUN_STAGES = [
	"builder-1",
	"builder-2",
	"reviewer",
	"builder-3",
	"reviewer-2",
] as const;
export type RunStage = (typeof RUN_STAGES)[number];

export const REVIEW_WORKSPACE_KINDS = ["private", "in-place"] as const;
export type ReviewWorkspaceKind = (typeof REVIEW_WORKSPACE_KINDS)[number];

export const RUN_STATUSES = ["running", "done", "blocked", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export type GraphRefreshOutcome = "current" | "regenerated" | "unavailable";

/** When the host checked graph.json: at run start, or before a provider pass. */
export type GraphRefreshPoint = "start" | `pass-${number}`;

/** One graph.json freshness check and what the host did about it. */
export interface GraphRefreshRecord {
	at: GraphRefreshPoint;
	outcome: GraphRefreshOutcome;
	/** `missing`, `stale` or `corrupt: …` when regenerated; why, when unavailable. */
	reason?: string;
}

/** Where the builder prompt came from: the caller, the host's context pack, or the plan alone. */
export type ContextPackSource = "supplied" | "built" | "plan-only";

/** One envelope repair turn: the stage's output had no valid envelope. */
export interface EnvelopeRepair {
	stage: RunStage;
	/** Why the first output was rejected. */
	reason: string;
	repaired: boolean;
}

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
	/** Absent for a direct request. */
	planPath?: string;
	/** Absent in records written before direct requests existed; those are all `plan`. */
	tier?: RunTier;
	/** The direct request as saved in the run directory, relative to the project root. */
	requestPath?: string;
	backend: LeanBackendKind;
	/** Re-entries on failing verify or mutation signals (0 or 1). */
	reentries: number;
	/** Re-entries with the reviewer's high and medium findings (0 or 1). */
	findingsReentries?: number;
	snapshotRefs: string[];
	status: RunStatus;
	reason?: string;
	createdAt: string;
	reviewWorkspace?: ReviewWorkspaceKind;
	/**
	 * Cumulative input + output tokens reported by backend stages. Records
	 * written before ruling H-1 counted cache reads and writes too.
	 */
	tokensUsed?: number;
	warnings?: string[];
	/** Every graph.json check, in order: at run start and before each provider pass. */
	graph?: GraphRefreshRecord[];
	contextPack?: ContextPackSource;
	lenses?: LeanLens[];
	/** The limits this run used, after tool parameters and config. */
	budget?: RunBudget;
	/** Where the post-edit health hook ran: in Pi sessions, or nowhere for an external harness. */
	healthHook?: "pi" | "none (external backend)";
	repairs?: EnvelopeRepair[];
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
	/** The stage's envelope repair turn, recorded after the stage's own entry. */
	repair?: boolean;
}

export interface RunRecord {
	dir: string;
	manifest: RunManifest;
	envelopes: Partial<Record<RunStage, Envelope>>;
	facts: RunFacts;
	stats: StageStats[];
}
