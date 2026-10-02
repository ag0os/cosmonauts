import type { Envelope } from "../envelope/index.ts";
import type { SpawnStats } from "../orchestration/types.ts";

export const SIGNAL_KINDS = [
	"verify",
	"health",
	"dupes",
	"blast-radius",
	"blast-tests",
	"plan-vs-actual",
	"mutation",
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

/**
 * Kinds a run must get an available signal for before it can be `done`,
 * unless `lean.requiredSignals` says otherwise. `mutation` and `health` are
 * left out because they need tools many projects lack.
 */
export const DEFAULT_REQUIRED_SIGNALS: readonly SignalKind[] = ["verify"];

export const SIGNAL_STATUSES = ["pass", "fail", "info"] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

/**
 * One verification fact produced by the host after the builder returns.
 * Only `verify` failures and failing blast-radius tests (`blast-tests`) set
 * `reenter` (ruling D-4); every other signal informs the reviewer. A
 * provider that cannot run (its tool, config or input is missing) returns
 * `info` whose `data` includes {@link UnavailableSignalData}.
 */
export interface Signal {
	kind: SignalKind;
	status: SignalStatus;
	summary: string;
	data: unknown;
	reenter: boolean;
}

/** In a signal's `data`, beside its other fields, when its provider could not run. */
export interface UnavailableSignalData {
	readonly unavailable: true;
	readonly reason: string;
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
	/** In a build, the builder clone's project directory; in a review, the caller's worktree. */
	worktree: string;
	/**
	 * The revision to diff against: the run's `diffBase`, which is the
	 * pre-builder snapshot when the tree was dirty and HEAD otherwise.
	 */
	baseSha: string;
	plan: ParsedPlan;
	/**
	 * `plan` when a plan document came with the change, else the run's tier
	 * (`direct`, or `review`): then `plan` stands in for one and has no
	 * contract to compare against. Absent: treat as `plan`.
	 */
	tier?: RunTier;
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
	/** A builder's is the run's builder clone; a reviewer's, its review checkout. */
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
	/**
	 * Where a backend that runs a child process spools its output, and how
	 * it reports the end of that process tree. A Pi session runs in-process
	 * and ignores it.
	 */
	processLog?: StageProcessLog;
}

/** The host's log files for one backend session, and its callback for the child's end. */
export interface StageProcessLog {
	/** Absolute paths of the spool files, under the run directory's `logs/`. */
	stdout: string;
	stderr: string;
	/** Called once the child process tree has ended, before the backend returns or throws. */
	report(exit: StageProcessExit): void;
}

/** How a backend's child process tree ended. */
export interface StageProcessExit {
	/**
	 * `gone`: every process found in the tree is gone. On POSIX the tree is
	 * the child's process group, its descendants by parent pid and the
	 * groups they lead; a process that had already left it (re-parented to
	 * init in a group of its own, such as a daemon) is not found.
	 * `survived`: something found outlived SIGTERM and SIGKILL (or
	 * `taskkill /T /F`), or could not be signalled. `unverified`: the tree
	 * could not be listed (on Windows, an exited child's descendants; on
	 * POSIX, a failed `ps`).
	 */
	tree: "gone" | "survived" | "unverified";
	/** What survived, or why the tree could not be checked. */
	detail?: string;
	/** Streams that passed the runner's byte cap; their middle was dropped. */
	truncated?: ("stdout" | "stderr")[];
}

/**
 * A backend session's token usage. `incomplete`: some of what the session
 * printed was never read for usage, so the counts are a lower bound, and
 * `incompleteReason` says why.
 */
export interface SessionStats extends SpawnStats {
	incomplete?: boolean;
	incompleteReason?: string;
}

export interface BackendRunResult {
	text: string;
	stats?: SessionStats;
}

/**
 * Runs one agent session and returns its full final text, which the runner
 * parses with lib/envelope. Pi backends must spawn with domain "lean" set
 * explicitly because the spawner re-resolves roles by name.
 */
export interface BuilderBackend {
	readonly kind: LeanBackendKind;
	/** How the harness gates the session's tool calls; the run manifest records it. */
	readonly permissions?: BackendPermissions;
	/** Tool patterns the harness is told to deny whatever `permissions` is; the run manifest records them. */
	readonly deniedTools?: readonly string[];
	/** The model and effort a role's sessions ask the harness for; the run manifest records it. */
	requestedModel?(role: LeanRole): Promise<RequestedModel>;
	run(input: BackendRunInput): Promise<BackendRunResult>;
}

/** What a backend asked its harness for, for one role. */
export interface RequestedModel {
	/** `harness default` when no model was asked for, so the harness's own configuration chose it. */
	model: string;
	/** The reasoning effort asked for; absent when none was. */
	effort?: string;
}

/**
 * How a builder harness gates tool calls. Whatever it is, the builder runs
 * in a private clone with no remote. `guarded`: Pi, with the lean role guard and the
 * destructive-git guard. `skipped`: Claude Code with
 * `--dangerously-skip-permissions`, which `-p` needs to edit unattended, or
 * `--permission-mode bypassPermissions`, or Codex with
 * `--dangerously-bypass-approvals-and-sandbox`: every call to a tool in its
 * tool set runs unprompted. `sandbox`:
 * Codex, confined by the sandbox mode its agent package sets. `harness`: the
 * harness's own permission settings, from custom arguments.
 */
export const BACKEND_PERMISSIONS = [
	"guarded",
	"skipped",
	"sandbox",
	"harness",
] as const;
export type BackendPermissions = (typeof BACKEND_PERMISSIONS)[number];

/** Gitignored run directory root (ruling R-3), relative to the project root. */
export const LEAN_RUN_ROOT = "missions/sessions/lean/runs" as const;

export const RUN_RECORD_FILES = {
	manifest: "run.json",
	request: "request.md",
	/** The user's messages section the builder and reviewer were given. */
	userMessages: "user-messages.md",
	envelopes: "envelopes",
	facts: "facts.json",
	stats: "stats.json",
	prBody: "pr-body.md",
	/** What the Pi post-edit health hook injected, one JSON line per finding with its stage. */
	healthHook: "health-hook.jsonl",
	/** `builder-N.patch`: the builder clone against the diff base after attempt N. */
	patches: "patches",
	/**
	 * `<stage>.stdout.log` and `<stage>.stderr.log` (`<stage>-repair.*` for a
	 * repair turn): what an external backend's child process wrote.
	 */
	logs: "logs",
} as const;

/**
 * `builder-2` and `builder-3` are the re-entries on failing verify or
 * blast-tests signals (D-4), at most one per signal kind; `builder-4` is the
 * one re-entry with the reviewer's high and medium findings, and
 * `reviewer-2` the re-review after it.
 */
export const RUN_STAGES = [
	"builder-1",
	"builder-2",
	"builder-3",
	"reviewer",
	"builder-4",
	"reviewer-2",
] as const;
export type RunStage = (typeof RUN_STAGES)[number];

/** One re-entry on failing verify or blast-tests signals, as `run.json` records it. */
export interface SignalReentry {
	stage: "builder-2" | "builder-3";
	/** The provider pass whose signals sent the builder back. */
	pass: number;
	/** Every re-entry signal kind failing in that pass; all are in the builder's prompt. */
	kinds: SignalKind[];
	reason: string;
}

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

/**
 * A caller branch or tag that changed during a run. `before` is absent for
 * an added ref, `after` for a deleted one. `blocked`: the ref names an
 * object that exists in the builder clone and that no caller ref, HEAD or
 * reflog reached when the clone opened, so the builder put it there.
 * `warned`: anything else, which is reported and does not stop the run.
 */
export interface CallerRefDrift {
	ref: string;
	before?: string;
	after?: string;
	action: "blocked" | "warned";
}

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
	/** The user's messages section as saved in the run directory, relative to the project root. */
	userMessagesPath?: string;
	backend: LeanBackendKind;
	/**
	 * Re-entries on failing verify or blast-tests signals: at most
	 * one per signal kind and two in all, so 0 to 2.
	 */
	reentries: number;
	/** Why each of those re-entries happened, in order. */
	reentryReasons?: SignalReentry[];
	/** Re-entries with the reviewer's high and medium findings (0 or 1). */
	findingsReentries?: number;
	/**
	 * The snapshot ref taken before each builder attempt. Attempt 1's lives
	 * in the caller's repository; later attempts' existed only in the
	 * builder clone and are gone once the run ends. The patches are the
	 * durable record.
	 */
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
	/** The pull-request body written at the end of the run, relative to the project root. */
	prBodyPath?: string;
	/**
	 * The project directory of the private clone every builder stage and
	 * provider pass ran in; the clone is removed when the run ends, unless
	 * `patchFailure` keeps it. Absent for a review.
	 */
	builderWorktree?: string;
	/** What the builder clone got from the caller's tree besides the snapshot. Absent for a review. */
	builderInputs?: BuilderInputs;
	/** Tool patterns the builder harness was told to deny (`claude-cli`: git history and ref writers). */
	deniedTools?: string[];
	/**
	 * `builder-N.patch` after each builder attempt, relative to the project
	 * root and cumulative against `diffBase`; the last is the run's change.
	 */
	patches?: string[];
	/** The last builder attempt's patch, when it could not be written. */
	patchFailure?: PatchFailure;
	/** Applying the last patch to the caller's working tree; only a `done` run tries. */
	patchApplied?: PatchApplication;
	/**
	 * Every branch or tag of the caller added, deleted or moved since the
	 * builder clone opened, as of the last check. `blocked` only when the
	 * ref now names an object the builder made.
	 */
	callerRefDrift?: CallerRefDrift[];
	/** The caller's working tree changed during a builder stage, which ended the run `blocked`. */
	callerTreeChange?: CallerTreeChange;
	/** How the builder harness gated its tool calls. */
	permissions?: BackendPermissions;
	/**
	 * Per role (`builder`, `code-reviewer`), the model and effort its first
	 * session asked the harness for. External backends only; absent for Pi.
	 */
	models?: Record<string, RequestedModel>;
	/**
	 * Signal kinds the last provider pass had to produce, available, for the
	 * run to be `done`: the host's override, else `lean.requiredSignals`, else
	 * `DEFAULT_REQUIRED_SIGNALS`.
	 */
	requiredSignals?: SignalKind[];
	/**
	 * How stages ended, for every backend session that ran a child process
	 * and every stage an abort or the time budget stopped, in order.
	 */
	stageExits?: StageExitRecord[];
	/**
	 * Processes the run owned (every child the shared child runner started,
	 * and what it found in their trees, until it confirmed them gone) that
	 * were still running when the run ended and the cleanup bound passed.
	 * The run lock stays, `unconfirmed`, until they are gone or a run is
	 * started with `clearStaleLock`.
	 */
	cleanupUnconfirmed?: number[];
	/**
	 * Best effort, never owned and never claimed gone: running processes the
	 * run could not own whose command line names the builder clone, such as
	 * a daemon re-parented before any listing found it.
	 */
	detachedCandidates?: DetachedProcess[];
}

/** A process found by its command line, not by the run's process tree. */
export interface DetachedProcess {
	pid: number;
	/** At most 200 characters, keeping the clone path it matched. */
	command: string;
}

/**
 * How one stage's work ended. The host waits for a stage it stopped to
 * settle, up to a ceiling, before the run ends; the lock is released once
 * the processes the run owned are confirmed gone (`cleanupUnconfirmed`).
 */
export interface StageExitRecord {
	/** `builder-1`, `reviewer repair`, `verify provider (pass 1)`, `graph refresh (start)`. */
	stage: string;
	/** Present when an abort or the time budget stopped the stage while it ran. */
	stoppedBy?: "abort" | "time budget";
	/**
	 * Whether the host saw the stage's work settle. False only when it gave
	 * up after the ceiling; that stage's work may still be running.
	 */
	settled: boolean;
	/** For a session that ran a child process: how its process tree ended. */
	process?: StageProcessExit;
	/** The spool files, relative to the run directory, when the session had a child process. */
	logs?: { stdout: string; stderr: string };
}

/** A builder attempt whose work no patch holds; a later attempt's patch clears it. */
export interface PatchFailure {
	stage: string;
	error: string;
	/** The builder clone's top level, kept because the work is only there. */
	keptWorktree?: string;
}

/**
 * Why a gitignored path of the caller's tree was not copied into the
 * builder clone. `node_modules` is linked instead; `.git` and `.stryker-tmp`
 * are never copied; `over the cap` would pass `capBytes`.
 */
export type IgnoredInputSkipReason =
	| "node_modules"
	| ".git"
	| ".stryker-tmp"
	| "over the cap"
	| "symlink outside the checkout"
	| "not a file"
	| "already in the checkout"
	| "session transcripts"
	| "copy failed";

export interface SkippedInput {
	/** Relative to the top level; a directory ends in `/`. */
	path: string;
	reason: IgnoredInputSkipReason;
}

/**
 * The builder clone holds the run's snapshot; the checks also read
 * gitignored inputs (`.env`, generated code, build outputs), which are
 * copied in, and installed dependencies, which are linked.
 */
export interface BuilderInputs {
	/** The caller's `node_modules` directories linked into the clone, as caller paths. */
	linked: string[];
	/** Ignored paths copied into the clone, relative to the top level; a directory ends in `/`. */
	carried: string[];
	carriedBytes: number;
	/** The most bytes of ignored files copied: `lean.ignoredInputsCapBytes`, else 50 MB. */
	capBytes: number;
	skipped: SkippedInput[];
	/** Known ways the builder can still change the caller's repository, its remotes or its tree. */
	residuals: string[];
	/** The snapshot's symlinks, checked when the clone opened, before any builder stage. */
	links: SnapshotLinks;
}

/** A symlink of the run's snapshot that leads out of the builder clone. */
export interface SnapshotLink {
	/** Relative to the top level. */
	path: string;
	/** The link's own text. */
	target: string;
	/** Where it leads from the clone, through directory links and chains. */
	resolved: string;
}

export interface SnapshotLinks {
	/** Every symlink of the snapshot commit. */
	checked: number;
	/** Links into the caller's checkout or its git directory: the run ends `blocked` before the builder starts. */
	blocked: SnapshotLink[];
	/** Other links out of the clone (system paths, the run's scratch directory): warned, not blocked. */
	escaping: SnapshotLink[];
}

export interface CallerTreeChange {
	stage: string;
	/** The changed paths, relative to the top level; the first 20 at most. */
	paths: string[];
	/** Every changed path, listed or not. */
	count: number;
}

/** `git apply` of the final builder patch to the working tree only, never the index. */
export interface PatchApplication {
	/** Relative to the project root. */
	path: string;
	ok: boolean;
	error?: string;
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
	spawn?: SessionStats;
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
