---
title: Driver Primitives — Layer 1 fleet/loop substrate
status: active
createdAt: '2026-04-30T16:39:55.948Z'
updatedAt: '2026-05-04T16:28:45.913Z'
---

## Summary

Add the framework-level primitives (`lib/driver/`) that let any agent in any domain dispatch a sequential fleet of tasks against a pluggable backend, with structured per-task prompts, structured reports, structured events, plan-level locking, repo-level commit serialization, and clean integration with the existing task system and activity bus. Ship one backend (`cosmonauts-subagent`) and inline mode only. Register two Pi tools (`run_driver`, `watch_events`) on the existing shared orchestration extension. No persona changes; no CLI changes; existing chain workflows untouched.

## Distillation reference

This plan implements Part 1 of `docs/designs/executive-assistant.md`. Plan 2 (`main-domain-and-cosmo-rename`) builds the assistant persona and ships the coding-domain envelope; Plan 3 (`external-backends-and-cli`) adds external backends, the `cosmonauts drive` CLI verb, and detached mode (built on a Bun-compiled binary that calls Plan 1's `runRunLoop` directly).

## Revision history

This plan was revised twice after adversarial reviews. The first review (10 findings) drove the initial revision; the second review (`missions/plans/driver-primitives/review.md`, 6 findings) drove this third revision. Key new contracts: serializable `DriverRunSpec` (includes `runId`, `parentSessionId`, `projectRoot`); exported `runRunLoop` (loop body, callable by inline OR detached binary); separate plan-level + repo-level locks; widened `DriverEvent` union; driver bus events use `type: "driver_activity"` to avoid collision with the existing `spawn_activity` subscriber.

## Scope

Included:
- `lib/driver/` core: types, prompt-template, report-parser, event-stream, plan-level lock, **repo-level commit lock**, `runOneTask`, **`runRunLoop`** (the sequential loop), `runInline` (thin wrapper that acquires lock + creates EventSink + delegates to runRunLoop).
- **Exported `runRunLoop(spec, ctx)`** — the sequential loop body. Plan 3's detached binary calls this directly after acquiring the lock itself.
- `lib/driver/backends/cosmonauts-subagent.ts` — wraps the existing `AgentSpawner` with the FULL `SpawnConfig` shape (planSlug, parentSessionId, domainContext, projectSkills, skillPaths, runtimeContext, onEvent, cwd) so `spawn_activity` events flow naturally and lineage is recorded.
- Extension to `domains/shared/extensions/orchestration/` registering `run_driver` and `watch_events` Pi tools (using `parameters` + `execute` shape) and bridging driver events into the activityBus under a **distinct `driver_activity` bus event type** (separate from existing `spawn_activity`).
- Audit JSONL event log per run at `missions/sessions/<planSlug>/runs/<runId>/events.jsonl`.
- Per-run workdir at `missions/sessions/<planSlug>/runs/<runId>/` containing `spec.json`, `prompts/<taskId>.md`, `task-queue.txt`, `events.jsonl`, `lock` (per-run metadata only).
- **Plan-level lock** at `missions/sessions/<planSlug>/driver.lock` (atomic exclusive create), separate from per-run metadata.
- **Repo-level commit lock** at `<repoRoot>/.cosmonauts/driver-commit.lock` held briefly during `git add` + `git commit` to serialize commits across concurrent runs on different plans in the same repo.
- Direct integration with `TaskManager` via `init()` (the actual method name) for status transitions (Title Case literals: `"In Progress"`, `"Done"`, `"Blocked"`) and `implementationNotes` field (the actual `TaskUpdateInput` field).
- Driver-side commits via subprocess (`git add`, `git commit`) when `commitPolicy: "driver-commits"`.
- Tests covering: happy path, pre-flight failure, post-verify failure, branch-mismatch abort, blocked task (no files changed), partial outcome, status transitions, plan-level lock concurrency, repo-level commit lock concurrency, task timeout (signal abort), log-write failure aborts run, TaskManager failure after commit, wrong-session event filtering, report parsing happy/fallback/unknown paths, deriveOutcome combinations.

Excluded:
- Detached mode (`startDetached`, bash launcher, Bun binary compilation) — Plan 3.
- External backends (`codex`, `claude-cli`) — Plan 3.
- The `cosmonauts drive` CLI verb — Plan 3.
- Coding-domain default envelope — Plan 2 ships it.
- The new `domains/main/` and cosmo/cody renames — Plan 2.
- Parallel task execution and dependency-graph awareness.

Assumptions:
- `bun run test`, `bun run lint`, `bun run typecheck` are green at HEAD before Plan 1 begins.
- The existing `orchestrationExtension` (`domains/shared/extensions/orchestration/index.ts`) is the right home for `run_driver` and `watch_events`.
- `cosmonauts-subagent` defaults the spawned role to `worker`. Caller can override.
- Reports are parsed from the spawned agent's *last assistant message* via the same `extractAssistantText` logic at `domains/shared/extensions/orchestration/spawn-tool.ts:127`.
- `TaskManager.init()` is the existing initialization method (verified at `lib/tasks/task-manager.ts:54-60`).

## Decision Log (plan-internal)

- **D-P1-1 — Direct `TaskManager` calls with Title Case statuses**
  - Decision: Status values use the typed literals `"To Do"`, `"In Progress"`, `"Done"`, `"Blocked"` (`lib/tasks/task-types.ts:13`). Implementation notes use the existing `implementationNotes` field on `TaskUpdateInput` (`lib/tasks/task-types.ts:105-127`), NOT a `note` field.
  - Why: Match the actual typed contract.
  - Decided by: planner-proposed; corrects review F-001 + PR-004.

- **D-P1-2 — Audit log and per-run workdir layout**
  - Decision: Each run lives under `missions/sessions/<planSlug>/runs/<runId>/`. Files: `events.jsonl`, `prompts/<taskId>.md`, `overrides/<taskId>.md` (optional), `task-queue.txt`, `spec.json`, `lock` (per-run metadata only). The `spec.json` content is the **serializable** subset of `DriverRunSpec` (no Backend instance — backend name only).
  - Why: Co-locates with existing session lineage; durable across reboots; serializable so the Plan 3 binary can read it.
  - Decided by: planner-proposed.

- **D-P1-3 — Plan-level lock (atomic O_EXCL)**
  - Decision: Plan-level lock at `missions/sessions/<planSlug>/driver.lock`, atomic exclusive create. Lock content: `{ runId, pid, startedAt }`. Stale-lock policy: read PID; if process is gone (`kill -0` returns ESRCH), break the lock (emitting a `lock_warning` event) and acquire; otherwise refuse with structured error. **Lock is acquired by whichever process runs the loop**: `runInline` for inline mode (parent process); the Plan 3 binary for detached mode (binary owns its own lifecycle).
  - Alternatives: parent always holds lock (broken: parent exits before detached run finishes); flock-style.
  - Why: Atomic exclusive-create is the standard race-free lock. Lock ownership follows the loop, so detached mode's lock-PID points at the live binary, not the long-dead parent.
  - Decided by: planner-proposed; corrects review F-006 + PR-005.

- **D-P1-4 — Repo-level commit lock**
  - Decision: Separate repo-level lock at `<repoRoot>/.cosmonauts/driver-commit.lock`, acquired briefly around `git add` + `git commit` operations and released immediately after. Held only during the commit step inside `runOneTask`, NOT for the entire run. Both inline and detached modes use the same primitive.
  - Alternatives: rely on git's own `.git/index.lock` (race-prone); skip (review PR-004 — cross-plan concurrency races); make plan-level lock repo-wide (over-serializes).
  - Why: Concurrent driver runs on *different* plans in the same repo are valid (per-plan locks don't conflict), but their commits race `.git/index.lock`. Briefly serializing the commit step is the minimal mutex needed.
  - Decided by: planner-proposed; corrects review PR-004 (Plan 3).

- **D-P1-5 — Partial outcomes**
  - Decision: When `report.outcome === "partial"` and post-verify passes, the driver commits, marks the task `"In Progress"` (not `"Done"`), and emits `task_blocked` with reason starting with `"partial"`. Aborts run unless `partialMode === "continue"`. Default is `"stop"`.
  - Why: Matches what cosmo did manually for TASK-246.
  - Decided by: planner-proposed.

- **D-P1-6 — Pre-flight failure and branch-mismatch semantics**
  - Decision: Pre-flight failure aborts the run. Branch invariant verified each iteration; mismatch aborts immediately.
  - Why: Matches the bash-script behavior.
  - Decided by: planner-proposed.

- **D-P1-7 — `run_driver` returns immediately**
  - Decision: Returns `{ runId, planSlug, workdir, eventLogPath }` immediately. Loop runs in-process via Promise; events flow via activityBus → `pi.sendMessage(deliverAs:"nextTurn")`.
  - Why: Long runs would freeze the assistant.
  - Decided by: planner-proposed.

- **D-P1-8 — Backend interface and construction**
  - Decision: `Backend = { name, capabilities, run(invocation) }`. No name-only registry in Plan 1's hot path. `driver-tool.ts` constructs concrete backends with explicit deps.
  - Why: Backends have varied dependencies; composition at the boundary keeps `lib/driver/` testable.
  - Decided by: planner-proposed.

- **D-P1-9 — DriverEvent carries `parentSessionId`; bus type renamed to `driver_activity`**
  - Decision: Every `DriverEvent` includes `parentSessionId`. The orchestration extension's bridge filters by it. **Driver activity events publish to the bus under `type: "driver_activity"` (NOT `"spawn_activity"`)** so the existing `SpawnActivityEvent` subscriber at `domains/shared/extensions/orchestration/index.ts:105-126` is unaffected. The orchestration extension subscribes to `"driver_activity"` separately and forwards to `pi.sendMessage(deliverAs:"nextTurn")`.
  - Alternatives: same `"spawn_activity"` type (existing subscriber expects `SpawnActivityEvent` shape with `spawnId`/`role`; collision); per-session bus instances.
  - Why: Distinct types prevent cross-talk between two subscribers expecting different shapes. Existing spawn-activity behavior unchanged.
  - Decided by: planner-proposed; corrects review PR-006.

- **D-P1-10 — EventSink: durable JSONL first, then bus**
  - Decision: `EventSink` is `(event: DriverEvent) => Promise<void>`. Awaited `appendFile` first; if successful, `activityBus.publish(...)` for whitelisted events. Append failure throws `EventLogWriteError`; caller (`runRunLoop`) catches at top-level, emits final `run_aborted` via best-effort `appendFileSync`, releases lock, returns aborted result.
  - Why: JSONL is the durable record; must precede bus to avoid "bus event arrived but JSONL missed it" window.
  - Decided by: planner-proposed.

- **D-P1-11 — `runOneTask` and `runRunLoop` are both exported helpers**
  - Decision: `lib/driver/run-one-task.ts` exports `runOneTask(spec, ctx, taskId): Promise<TaskOutcome>` (per-task envelope). `lib/driver/run-run-loop.ts` exports `runRunLoop(spec, ctx): Promise<DriverResult>` (sequential loop calling `runOneTask`, emitting `run_started`/`run_completed`/`run_aborted`, handling `partialMode`). `runInline(spec, deps): DriverHandle` is a thin wrapper: acquires plan lock → creates EventSink → calls `runRunLoop` → releases lock in finally. Plan 3's detached binary acquires the lock itself, then calls `runRunLoop` directly.
  - Alternatives: Only `runOneTask` exported, `runInline` opaque (review PR-003 — detached can't emit run-level events); merge into one function.
  - Why: Run-level events (run_started/completed/aborted) and partialMode handling MUST live in the loop wrapper, not the per-task helper. Plan 3's binary needs the same loop semantics, so the loop body must be exported and lock-agnostic.
  - Decided by: planner-proposed; corrects review PR-003 (Plan 3).

- **D-P1-12 — Pi tool registration uses `parameters` + `execute`**
  - Decision: `pi.registerTool({ name, label, description, parameters: Type.Object(...), execute: async (_toolCallId, params, signal, onUpdate, ctx) => ... })` matching `spawn-tool.ts:413` and `chain-tool.ts:40`.
  - Why: Match actual Pi convention.
  - Decided by: planner-proposed.

- **D-P1-13 — `watch_events({ planSlug, runId, since? })`**
  - Decision: Resolves `missions/sessions/<planSlug>/runs/<runId>/events.jsonl`. No global runId index. Cursor format: line number (monotonic). Behavior: malformed JSON line → log to stderr, advance cursor (skip), continue. Cursor beyond EOF → return empty events with same cursor.
  - Why: planSlug is always available to the caller.
  - Decided by: planner-proposed.

- **D-P1-14 — Report parser is signature-pure; `deriveOutcome` is in the loop**
  - Decision: `parseReport(stdout): Report | { outcome: "unknown"; raw: string }`. The driver loop's `deriveOutcome(parsedReport, postVerifyResults): ReportOutcome` decides next steps: `unknown` + all-postverify-pass → `success`; `unknown` + any-postverify-fail → `failure`; explicit values honored.
  - Why: Keeps `parseReport` testable in isolation.
  - Decided by: planner-proposed.

- **D-P1-15 — Serializable `DriverRunSpec` includes `runId`, `parentSessionId`, `projectRoot`**
  - Decision: `DriverRunSpec` adds three fields beyond what was in the prior revision: `runId`, `parentSessionId`, `projectRoot`. The full shape is serializable to `spec.json` (no Backend instance — `backendName` only). Plan 3's detached binary deserializes this exact shape.
  - Alternatives: Define a separate `SerializedDriverRunSpec` type (review PR-001 alternative); reconstruct fields from environment.
  - Why: One spec type minimizes drift between modes. The added fields are required by both the binary and `runOneTask`'s context.
  - Decided by: planner-proposed; corrects review PR-001 (cross-plan).

- **D-P1-16 — `BackendInvocation` includes `runId`**
  - Decision: `BackendInvocation` adds `runId: string`. Backends use it when constructing `DriverEvent.driver_activity` payloads to satisfy `DriverEventBase.runId`.
  - Alternatives: omit and have backends emit events without runId (broken — bridge filtering needs it).
  - Why: Closes review PR-002.
  - Decided by: planner-proposed.

- **D-P1-17 — cosmonauts-subagent backend forwards full SpawnConfig**
  - Decision: The backend's `spawner.spawn(...)` call passes `role`, `prompt`, `cwd`, `signal`, `planSlug`, `parentSessionId`, `runtimeContext: { mode: "sub-agent", taskId, parentRole: "driver" }`, `onEvent`, `domainContext`, `projectSkills`, `skillPaths`. All five "extra" fields beyond the basic four mirror what the existing spawn-tool path passes (`domains/shared/extensions/orchestration/spawn-tool.ts`).
  - Why: Without `parentSessionId`, lineage manifest writing skips (`agent-spawner.ts:303`). Without `domainContext`, `projectSkills`, `skillPaths`, child sessions miss runtime resolution and skill filtering.
  - Decided by: planner-proposed; corrects review PR-002.

## Design

### Module structure (Plan 1 only)

```
lib/driver/
  types.ts                  DriverEvent (with parentSessionId, type "driver_activity"
                            for bus), Report, DriverRunSpec (with runId, parentSessionId,
                            projectRoot), DriverHandle, EventSink, PromptLayers, DriverResult,
                            TaskOutcome, BackendCapabilities/Invocation/RunResult
  prompt-template.ts        renderPromptForTask(taskId, layers, taskManager) -> string
  report-parser.ts          parseReport(stdout) -> Report | { outcome: "unknown"; raw }
  event-stream.ts           createEventSink({ logPath, runId, parentSessionId, activityBus })
                            -> async EventSink; tailEvents(path, since); shouldBridge;
                            toBusEvent (maps DriverEvent → bus event with type "driver_activity"
                            or other whitelist types)
  lock.ts                   acquirePlanLock(planSlug, runId, cosmonautsRoot): Promise<LockHandle>
                            acquireRepoCommitLock(repoRoot): Promise<LockHandle>
                            isProcessAlive(pid): boolean; readLock(planSlug)
  run-one-task.ts           runOneTask(spec, ctx, taskId): Promise<TaskOutcome>
                            (per-task envelope: preflight, render, dispatch, parse,
                            postverify, stage, COMMIT-WITH-REPO-LOCK, status update)
  run-run-loop.ts           runRunLoop(spec, ctx): Promise<DriverResult>
                            (sequential loop: emit run_started; for each task call
                            runOneTask; handle partialMode; emit run_completed/run_aborted)
  driver.ts                 runInline(spec, deps): DriverHandle
                            (acquires plan lock; creates EventSink; calls runRunLoop;
                            releases lock in finally)
  backends/
    types.ts                Backend, BackendCapabilities, BackendInvocation (with runId)
    cosmonauts-subagent.ts  createCosmonautsSubagentBackend(deps) — full SpawnConfig

domains/shared/extensions/orchestration/
  index.ts                  EXTEND: register run_driver + watch_events tools;
                            subscribe to "driver_activity" on activityBus (separate from
                            existing "spawn_activity" subscription); forward via
                            pi.sendMessage(deliverAs:"nextTurn") filtered by parentSessionId
  driver-tool.ts            NEW: registerDriverTool(pi, getRuntime); constructs Backend
                            instances per `backend` parameter
  watch-events-tool.ts      NEW: registerWatchEventsTool(pi)
```

### Dependency direction

```
domains/shared/extensions/orchestration/driver-tool.ts
       │ uses
       ▼
lib/driver/{driver, run-one-task, run-run-loop, event-stream, lock}
       │
       ├──► lib/orchestration/{activityBus, AgentSpawner, MessageBus}
       ├──► lib/tasks/TaskManager (.init() — verified at task-manager.ts:54-60)
       └──► lib/sessions/manifest (appendSession)

lib/driver/backends/cosmonauts-subagent.ts
       │ wraps
       ▼
lib/orchestration/createPiSpawner (existing; full SpawnConfig)
```

`lib/driver/` does not import from any `domains/` module.

### Key contracts

```ts
// lib/driver/types.ts (Title Case status; serializable spec; "driver_activity" bus type)
import type { TaskStatus } from "../tasks/task-types.ts";

export interface DriverRunSpec {
  // Identity (NEW: runId, parentSessionId, projectRoot — per PR-001)
  runId: string;
  parentSessionId: string;          // Pi session that initiated the run
  projectRoot: string;              // for TaskManager construction in detached mode
  planSlug: string;
  taskIds: string[];                // resolved by caller; order preserved

  // Backend
  backendName: "cosmonauts-subagent" | "codex" | "claude-cli";

  // Prompt
  promptTemplate: PromptLayers;

  // Verification
  preflightCommands: string[];
  postflightCommands: string[];
  branch?: string;

  // Policies
  commitPolicy: "driver-commits" | "backend-commits" | "no-commit";
  partialMode?: "stop" | "continue"; // default: "stop"

  // Workdir
  workdir: string;
  eventLogPath: string;

  // Timeouts
  taskTimeoutMs?: number;            // default 10 min
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

// DriverEvent: every variant has runId, parentSessionId, timestamp
export type DriverEvent =
  | DriverEventBase & { type: "run_started";     planSlug: string; backend: string; mode: "inline" | "detached" }
  | DriverEventBase & { type: "task_started";    taskId: string }
  | DriverEventBase & { type: "preflight";       taskId: string; status: "started"|"passed"|"failed"; details?: { command?: string; stderr?: string; gitDiffStat?: string; branch?: string } }
  | DriverEventBase & { type: "spawn_started";   taskId: string; backend: string }
  | DriverEventBase & { type: "driver_activity"; taskId: string; activity: SpawnActivity }   // RENAMED from spawn_activity
  | DriverEventBase & { type: "spawn_completed"; taskId: string; report: ParsedReport }      // ParsedReport, NOT just Report
  | DriverEventBase & { type: "spawn_failed";    taskId: string; error: string; exitCode?: number }
  | DriverEventBase & { type: "verify";          taskId: string; phase: "post"; status: "started"|"passed"|"failed"; details?: { command?: string; stderr?: string } }
  | DriverEventBase & { type: "commit_made";     taskId: string; sha: string; subject: string }
  | DriverEventBase & { type: "task_done";       taskId: string }
  | DriverEventBase & { type: "task_blocked";    taskId: string; reason: string; progress?: { phase: number; of: number; remaining?: string } }
  | DriverEventBase & { type: "lock_warning";    reason: string; details?: { previousRunId?: string; previousPid?: number } }
  | DriverEventBase & { type: "run_completed";   summary: { total: number; done: number; blocked: number } }
  | DriverEventBase & { type: "run_aborted";     reason: string };

interface DriverEventBase {
  runId: string;
  parentSessionId: string;
  timestamp: string;
}

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
```

```ts
// lib/driver/backends/types.ts (BackendInvocation includes runId — PR-002)
export interface BackendCapabilities {
  canCommit: boolean;
  isolatedFromHostSource: boolean;
}

export interface BackendInvocation {
  runId: string;                    // NEW per PR-002
  promptPath: string;
  workdir: string;
  taskId: string;
  parentSessionId: string;
  planSlug: string;
  eventSink: EventSink;
  signal?: AbortSignal;
}

export interface BackendRunResult {
  exitCode: number;
  stdout: string;
  durationMs: number;
}

export interface Backend {
  readonly name: string;
  readonly capabilities: BackendCapabilities;
  run(invocation: BackendInvocation): Promise<BackendRunResult>;
}
```

```ts
// lib/driver/backends/cosmonauts-subagent.ts (FULL SpawnConfig — PR-002, PR-017)
export interface CosmonautsSubagentBackendDeps {
  spawner: AgentSpawner;
  defaultRole?: string;
  cwd: string;
  domainContext?: string;
  projectSkills?: readonly string[];
  skillPaths?: readonly string[];
}

export function createCosmonautsSubagentBackend(deps: CosmonautsSubagentBackendDeps): Backend {
  return {
    name: "cosmonauts-subagent",
    capabilities: { canCommit: true, isolatedFromHostSource: false },
    async run({ runId, promptPath, taskId, parentSessionId, planSlug, eventSink, signal }) {
      const prompt = await readFile(promptPath, "utf-8");
      const start = Date.now();
      const result = await deps.spawner.spawn({
        role: deps.defaultRole ?? "worker",
        prompt,
        cwd: deps.cwd,
        signal,
        planSlug,
        parentSessionId,                                    // for lineage
        runtimeContext: { mode: "sub-agent", taskId, parentRole: "driver" },
        domainContext: deps.domainContext,                  // for runtime resolution
        projectSkills: deps.projectSkills,                  // for skill filtering
        skillPaths: deps.skillPaths,
        onEvent: (spawnEvent) => {
          const driverEvt = mapSpawnEventToDriverActivity({
            spawnEvent, runId, taskId, parentSessionId,
          });
          if (driverEvt) eventSink(driverEvt);
        },
      });
      const stdout = extractAssistantText(result.messages);
      return { exitCode: result.success ? 0 : 1, stdout, durationMs: Date.now() - start };
    },
  };
}
```

```ts
// lib/driver/run-one-task.ts
export interface RunOneTaskCtx {
  taskManager: TaskManager;
  backend: Backend;
  eventSink: EventSink;
  parentSessionId: string;          // also in spec; passed in ctx for convenience
  runId: string;                    // also in spec
  abortSignal: AbortSignal;
  cosmonautsRoot: string;           // for repo lock
}

export async function runOneTask(
  spec: DriverRunSpec,
  ctx: RunOneTaskCtx,
  taskId: string,
): Promise<TaskOutcome>;
// Implementation includes: emit task_started → preflight (with branch check) →
// status="In Progress" → render → backend.run({ runId: spec.runId, ... }) →
// parseReport → emit spawn_completed (ParsedReport) or spawn_failed →
// postverify → derive outcome → if commit: acquireRepoCommitLock → git add →
// git commit → release repo lock → emit commit_made → status update
// (with implementationNotes field, NOT note) → emit terminal event
```

```ts
// lib/driver/run-run-loop.ts (NEW — exported per PR-003 fix)
export interface RunRunLoopCtx extends RunOneTaskCtx {
  // RunOneTaskCtx fields plus the run-level resources
}

export async function runRunLoop(
  spec: DriverRunSpec,
  ctx: RunRunLoopCtx,
): Promise<DriverResult>;
// Implementation:
// 1. Emit run_started
// 2. for taskId of spec.taskIds:
//    a. let outcome = await runOneTask(spec, ctx, taskId)
//    b. if outcome.status === "blocked": emit run_aborted; break
//    c. if outcome.status === "partial" and partialMode === "stop":
//       emit run_aborted("partial: stopping per partialMode"); break
//    d. continue
// 3. Emit run_completed with summary
// 4. Return DriverResult
//
// On EventLogWriteError caught at top level: emit run_aborted (best-effort
// sync write); return aborted result.
```

```ts
// lib/driver/driver.ts (runInline is a thin wrapper)
export interface DriverDeps {
  taskManager: TaskManager;
  backend: Backend;
  activityBus: MessageBus;
  parentSessionId: string;
  cosmonautsRoot: string;
}

export function runInline(spec: DriverRunSpec, deps: DriverDeps): DriverHandle {
  // 1. acquirePlanLock(spec.planSlug, spec.runId, deps.cosmonautsRoot)
  // 2. createEventSink({ logPath: spec.eventLogPath, runId: spec.runId,
  //                      parentSessionId: spec.parentSessionId, activityBus: deps.activityBus })
  // 3. const ctx = { ...deps, eventSink, runId: spec.runId, ... }
  // 4. Promise: runRunLoop(spec, ctx) (don't await; return handle)
  // 5. handle.result resolves with the runRunLoop result
  // 6. handle finally: lock.release()
}
```

```ts
// lib/driver/lock.ts (plan lock + repo commit lock)
export interface LockHandle {
  release(): Promise<void>;
}

export async function acquirePlanLock(
  planSlug: string, runId: string, cosmonautsRoot: string,
): Promise<LockHandle | { error: "active"; activeRunId: string; activeAt: string }>;
// Atomic: open(O_CREAT|O_EXCL|O_WRONLY) on missions/sessions/<plan>/driver.lock.
// On EEXIST: read; if PID dead, break stale lock (caller should emit lock_warning)
// and retry once; otherwise return structured "active" error.

export async function acquireRepoCommitLock(repoRoot: string): Promise<LockHandle>;
// Atomic on <repoRoot>/.cosmonauts/driver-commit.lock. Caller holds briefly:
// acquire -> git add -> git commit -> release. Stale-lock detection same as plan lock.
```

```
// Pi tools (Plan 1)
run_driver({
  planSlug: string;
  taskIds?: string[];
  backend: "cosmonauts-subagent";
  mode: "inline";
  branch?: string;
  commitPolicy?: "driver-commits"|"backend-commits"|"no-commit";
  promptOverridesDir?: string;
  preflightCommands?: string[];
  postflightCommands?: string[];
  envelopePath: string;
  preconditionPath?: string;
  partialMode?: "stop"|"continue";
  taskTimeoutMs?: number;
}) → { runId; planSlug; workdir; eventLogPath }
   | { error: "active"; activeRunId; activeAt }

watch_events({ planSlug; runId; since? }) → { events: DriverEvent[]; cursor }
```

### Bus event mapping

`shouldBridge` whitelist (events that publish to activityBus): `driver_activity`, `preflight: failed`, `task_done`, `task_blocked`, `commit_made`, `lock_warning`, `run_completed`, `run_aborted`.

`toBusEvent` constructs bus events with the following types:
- `DriverEvent.driver_activity` → bus event `{ type: "driver_activity", runId, parentSessionId, taskId, activity }`. Distinct from existing `SpawnActivityEvent` (`type: "spawn_activity"`), which uses `spawnId`/`role`. The two subscribers are independent.
- All other bridged DriverEvents publish under `{ type: "driver_event", runId, parentSessionId, event: <DriverEvent> }`. The orchestration extension subscribes to `"driver_event"` (separate from `"driver_activity"`) and forwards select events to `pi.sendMessage`.

JSONL receives every event regardless of bridge whitelist.

### Integration seams (verified in code)

- **Pi tool registration** — `pi.registerTool({ name, label, description, parameters: Type.Object(...), execute: ... })`. Verified at `domains/shared/extensions/orchestration/spawn-tool.ts:413` and `chain-tool.ts:40`.
- **`createPiSpawner`** — `lib/orchestration/agent-spawner.ts:115`. SpawnConfig at `lib/orchestration/types.ts:323-355` includes `parentSessionId` (line 351), `domainContext` (line 327), `projectSkills`, `skillPaths`. The cosmonauts-subagent backend forwards all of these.
- **Activity bus** — `lib/orchestration/activity-bus.ts:4`. Existing `"spawn_activity"` subscriber at `domains/shared/extensions/orchestration/index.ts:105-126` expects `SpawnActivityEvent` shape (with `spawnId`, `role`). Driver activity uses a distinct `"driver_activity"` event type to avoid shape collision.
- **`pi.sendMessage(..., { deliverAs: "nextTurn" })`** — `domains/shared/extensions/orchestration/index.ts:106`.
- **TaskManager** — `lib/tasks/task-manager.ts:54-60` (constructor takes `projectRoot`); `init()` (NOT `initialize()`); `updateTask(id, { status: TaskStatus, implementationNotes?: string })`. Status literals at `lib/tasks/task-types.ts:13`. Update input shape at `lib/tasks/task-types.ts:105-127`.
- **Session lineage** — `lib/sessions/manifest.ts:appendSession`. Driven by `AgentSpawner` when `planSlug` AND `parentSessionId` are passed in `SpawnConfig` (`agent-spawner.ts:303` checks both).

### Seams for change

- **Backend addition.** New backends drop into `lib/driver/backends/` with their own factory. `driver-tool.ts` adds a switch arm.
- **Detached mode (Plan 3).** Plan 3 introduces `lib/driver/run-step.ts` (Bun binary entry point). The binary acquires its own plan lock, calls `runRunLoop` directly (Plan 1 export), releases lock on exit. Bash becomes a 5-line `nohup` launcher.

## Approach

### `runRunLoop` body

```
1. Emit run_started.
2. for taskId of spec.taskIds:
   - outcome = await runOneTask(spec, ctx, taskId)
   - if outcome.status === "blocked": emit run_aborted; break
   - if outcome.status === "partial" && spec.partialMode !== "continue":
       emit run_aborted("partial: stopping"); break
3. Emit run_completed with summary.
4. Return DriverResult.

Top-level catch on EventLogWriteError: best-effort sync write of run_aborted("log write failed"); return aborted result.
```

### `runOneTask` body (per-task envelope)

```
1. Emit task_started.
2. Pre-flight (branch + preflightCommands); on fail emit preflight(failed) → return blocked.
3. TaskManager.updateTask(taskId, { status: "In Progress" }).
4. Render prompt to spec.workdir/prompts/<taskId>.md.
5. Emit spawn_started.
6. backend.run({ runId: spec.runId, promptPath, workdir, taskId, parentSessionId, planSlug, eventSink, signal }) — with task timeout via AbortController.
7. parsedReport = parseReport(stdout).
8. Emit spawn_completed (with parsedReport — type ParsedReport accepts unknown).
9. Postverify; emit verify(started/passed/failed).
10. effectiveOutcome = deriveOutcome(parsedReport, postVerifyResults).
11. Determine staged files (git status --porcelain; exclude missions/, memory/).
12. If commitPolicy === "driver-commits" && effectiveOutcome !== "failure" && filesStaged:
    a. acquireRepoCommitLock(cosmonautsRoot)
    b. git add — git commit — capture sha
    c. emit commit_made
    d. release repo lock
    e. on failure: emit task_blocked("commit failed") → return blocked
13. Status transition:
    - success → updateTask({ status: "Done" }) → emit task_done → return done
    - partial → updateTask({ status: "In Progress", implementationNotes: <progress> })
                → emit task_blocked("partial: ...") → return partial
    - failure → updateTask({ status: "Blocked", implementationNotes: <reason> })
                → emit task_blocked → return blocked
    - if updateTask throws after a successful commit: emit run_aborted; commit stands.
```

## Files to Change

New files:
- `lib/driver/types.ts` (DriverRunSpec with runId/parentSessionId/projectRoot; DriverEvent with driver_activity + lock_warning + verify started; ParsedReport)
- `lib/driver/prompt-template.ts`
- `lib/driver/report-parser.ts`
- `lib/driver/event-stream.ts` (createEventSink with awaited appendFile; tailEvents; toBusEvent emitting driver_activity/driver_event)
- `lib/driver/lock.ts` (acquirePlanLock + acquireRepoCommitLock)
- `lib/driver/run-one-task.ts`
- `lib/driver/run-run-loop.ts` (NEW — exported helper)
- `lib/driver/driver.ts` (runInline wrapper)
- `lib/driver/backends/types.ts` (BackendInvocation with runId)
- `lib/driver/backends/cosmonauts-subagent.ts` (full SpawnConfig forwarding)
- `domains/shared/extensions/orchestration/driver-tool.ts`
- `domains/shared/extensions/orchestration/watch-events-tool.ts`

Modified files:
- `domains/shared/extensions/orchestration/index.ts` — register `run_driver` and `watch_events`. Subscribe to `driver_activity` AND `driver_event` on activityBus (both distinct from existing `spawn_activity`); forward via `pi.sendMessage(deliverAs:"nextTurn")` filtered by `parentSessionId`.

Test files (new):
- `tests/driver/types.test.ts`
- `tests/driver/prompt-template.test.ts`
- `tests/driver/report-parser.test.ts` (fenced JSON; OUTCOME-text fallback; unknown for unparseable; partial with progress)
- `tests/driver/event-stream.test.ts` (JSONL durability; bus event types are distinct from spawn_activity; tailEvents cursor / malformed line / EOF)
- `tests/driver/lock.test.ts` (plan lock atomic; repo commit lock atomic; both stale-lock break + lock_warning event)
- `tests/driver/run-one-task.test.ts` (every branch; commit acquires repo lock; implementationNotes used not note)
- `tests/driver/run-run-loop.test.ts` (run_started/completed/aborted emitted; partialMode "stop" stops; partialMode "continue" continues; EventLogWriteError aborts)
- `tests/driver/driver.test.ts` (runInline acquires + releases plan lock; concurrent rejected)
- `tests/driver/backends/cosmonauts-subagent.test.ts` (mocks AgentSpawner; verifies SpawnConfig includes planSlug, parentSessionId, runtimeContext.taskId, domainContext, projectSkills, skillPaths, onEvent)
- `tests/extensions/orchestration-driver-tool.test.ts` (parameters/execute shape; happy path; concurrent rejected; watch_events; bridge filters by parentSessionId; driver_activity bus events do NOT trigger existing spawn_activity subscriber)
- `tests/extensions/orchestration-driver-bus-isolation.test.ts` (driver_activity and spawn_activity subscribers receive only their own event types)

## Risks

- **Mitigated — Inline/detached loop divergence.** Resolved by D-P1-11: `runRunLoop` is exported. Plan 3's binary calls the same function. Code-identity parity.
- **Mitigated — Report parser strictness.** Returns `unknown` for unparseable input; loop derives effective outcome via `deriveOutcome`.
- **Mitigated — Driver commits the wrong files.** Excludes `missions/`/`memory/`.
- **Mitigated — Activity bus floods the assistant.** `shouldBridge` whitelist; JSONL-only otherwise.
- **Mitigated — Backend hangs.** AbortController + `taskTimeoutMs`.
- **Mitigated — Concurrent same-plan runs.** Plan-level atomic O_EXCL lock.
- **Mitigated — Concurrent commits across different plans on the same repo.** Repo-level commit lock acquired briefly during `git add`/`commit`.
- **Mitigated — Event sources diverge mid-loop.** EventSink writes JSONL-then-bus with awaited append.
- **Mitigated — TaskManager error after a successful commit.** Driver emits `run_aborted("status update failed after commit")`; commit stands; JSONL records `commit_made` without `task_done`.
- **Mitigated — Wrong-session event leakage.** `parentSessionId` on every event; bridge filters; bus types distinct from spawn_activity.
- **Mitigated — Bus event collision with existing spawn_activity subscriber.** Driver bus events use distinct types `driver_activity` and `driver_event`.
- **Mitigated — Lock ownership in detached mode (cross-plan).** Lock is acquired by the loop-running process, not the parent. Plan 3's binary acquires its own lock.

## Quality Contract

- id: QC-001
  category: architecture
  criterion: "`lib/driver/` does not import from any `domains/` directory; backend modules do not import from `cli/`."
  verification: reviewer

- id: QC-002
  category: integration
  criterion: "`run_driver` invocation triggers the cosmonauts-subagent backend, runs the loop end-to-end on a 2-task fixture plan, marks both tasks `\"Done\"`, and produces a JSONL event log readable by `tailEvents`."
  verification: verifier
  command: "bun run test --grep 'driver e2e'"

- id: QC-003
  category: behavior
  criterion: "Pre-flight failure aborts run with `run_aborted` and does not modify any task status."
  verification: verifier
  command: "bun run test --grep 'driver preflight failure'"

- id: QC-004
  category: behavior
  criterion: "Branch-mismatch detected at pre-flight aborts with structured event before any task transitions."
  verification: verifier
  command: "bun run test --grep 'driver branch mismatch'"

- id: QC-005
  category: behavior
  criterion: "Post-verify failure marks task `\"Blocked\"` (with `implementationNotes`, NOT `note`), emits `task_blocked` + `run_aborted`, and does not commit."
  verification: verifier
  command: "bun run test --grep 'driver postverify failure'"

- id: QC-006
  category: behavior
  criterion: "When report is `\"partial\"` and post-verify passes, driver commits, marks task `\"In Progress\"` with progress note in `implementationNotes`, emits `task_blocked(reason ~ \"partial\")`, and stops by default."
  verification: verifier
  command: "bun run test --grep 'driver partial outcome'"

- id: QC-007
  category: correctness
  criterion: "Driver commits exclude any path under `missions/` or `memory/` even when the agent creates files there."
  verification: verifier
  command: "bun run test --grep 'driver commit exclusion'"

- id: QC-008
  category: behavior
  criterion: "Concurrent `run_driver` invocations for the same `planSlug` fail fast: second invocation returns `{ error: \"active\", activeRunId }`; no second loop, no second workdir."
  verification: verifier
  command: "bun run test --grep 'driver plan lock atomic'"

- id: QC-009
  category: behavior
  criterion: "Stale plan lock (PID dead) is broken after emitting `lock_warning` event; new run proceeds; no resource leak."
  verification: verifier
  command: "bun run test --grep 'driver lock stale'"

- id: QC-010
  category: behavior
  criterion: "Concurrent commits across different plans on the same repo serialize via repo-level commit lock; no `.git/index.lock` race; both commits land cleanly."
  verification: verifier
  command: "bun run test --grep 'driver repo commit lock'"

- id: QC-011
  category: behavior
  criterion: "TaskManager update failure after a successful commit emits `run_aborted(\"status update failed after commit\")`; commit remains; JSONL records `commit_made` followed by `run_aborted`."
  verification: verifier
  command: "bun run test --grep 'driver post-commit task update failure'"

- id: QC-012
  category: behavior
  criterion: "Driver `driver_activity` bus events do NOT trigger the existing `spawn_activity` subscriber. Existing spawn-tool's `spawn_activity` events do NOT trigger the driver's `driver_activity` subscriber. The two subscribers are isolated."
  verification: verifier
  command: "bun run test --grep 'driver bus isolation'"

- id: QC-013
  category: behavior
  criterion: "Driver events from one Pi session are not delivered to a second concurrent Pi session's `pi.sendMessage` queue."
  verification: verifier
  command: "bun run test --grep 'driver session scoping'"

- id: QC-014
  category: behavior
  criterion: "Log-write failure aborts the run and emits `run_aborted(\"log write failed\")` via synchronous fallback."
  verification: verifier
  command: "bun run test --grep 'driver log write failure'"

- id: QC-015
  category: behavior
  criterion: "Per-task timeout enforced via AbortController: `signal.aborted === true`; `spawn_failed` with `exitCode: 124`; task marked `\"Blocked\"`."
  verification: verifier
  command: "bun run test --grep 'driver task timeout'"

- id: QC-016
  category: correctness
  criterion: "Status literals written to TaskManager are exactly `\"To Do\"`, `\"In Progress\"`, `\"Done\"`, `\"Blocked\"`. Implementation notes written via `implementationNotes` field, not `note`."
  verification: verifier
  command: "bun run test --grep 'driver task fields literal'"

- id: QC-017
  category: behavior
  criterion: "deriveOutcome combinations: `unknown + all-postverify-pass → success` (commit happens); `unknown + any-postverify-fail → failure` (no commit, task blocked); explicit values honored."
  verification: verifier
  command: "bun run test --grep 'driver derive outcome'"

- id: QC-018
  category: correctness
  criterion: "cosmonauts-subagent backend's `spawner.spawn` call passes `planSlug`, `parentSessionId`, `runtimeContext.taskId`, `runtimeContext.parentRole === \"driver\"`, `domainContext`, `projectSkills`, `skillPaths`, AND `onEvent`. Lineage manifest is written for plan-linked spawns."
  verification: verifier
  command: "bun run test --grep 'cosmonauts-subagent full spawn config'"

- id: QC-019
  category: integration
  criterion: "`bun run test`, `bun run lint`, `bun run typecheck` all pass after Plan 1 lands."
  verification: verifier
  command: "bun run test && bun run lint && bun run typecheck"

## Implementation Order

1. **Types and contracts.** Land `lib/driver/types.ts` + `lib/driver/backends/types.ts` with serializable `DriverRunSpec` (runId, parentSessionId, projectRoot), `BackendInvocation` (runId), `DriverEvent` (driver_activity, lock_warning, verify started, ParsedReport).
2. **Report parser.** `lib/driver/report-parser.ts` returning `Report | { outcome: "unknown" }`.
3. **Prompt template.** `lib/driver/prompt-template.ts`.
4. **Event stream.** `lib/driver/event-stream.ts` with awaited `appendFile`; `toBusEvent` emitting `driver_activity` (NOT `spawn_activity`) and `driver_event`.
5. **Locks.** `lib/driver/lock.ts` with both `acquirePlanLock` and `acquireRepoCommitLock`. Tests for both atomicity + stale handling.
6. **`runOneTask`.** `lib/driver/run-one-task.ts`. Heavy test surface; commit acquires repo lock briefly; implementationNotes (not note).
7. **`runRunLoop`.** `lib/driver/run-run-loop.ts`. Run-level events; partialMode handling; EventLogWriteError catch.
8. **cosmonauts-subagent backend.** `lib/driver/backends/cosmonauts-subagent.ts` with full SpawnConfig forwarding (planSlug, parentSessionId, runtimeContext, domainContext, projectSkills, skillPaths, onEvent).
9. **Driver wrapper.** `lib/driver/driver.ts:runInline` — acquires plan lock, creates EventSink, calls runRunLoop, releases lock in finally.
10. **Pi tools.** `domains/shared/extensions/orchestration/driver-tool.ts` (parameters/execute shape, constructs Backend instances), `watch-events-tool.ts` (planSlug + runId). Wire into `index.ts` (registration + activityBus subscriptions for `driver_activity` AND `driver_event` types — separate from existing `spawn_activity`).
11. **End-to-end test.** Integration test with mock backend.
12. **Bus isolation test.** Drive activity events do not trigger spawn_activity subscriber; vice versa.
13. **Session-scoping test.** Two simulated Pi sessions; events from session A do not reach session B.
14. **Cleanup pass.** Lint/typecheck/tests; verify QC-001 by reading import lines.

Each step is independently committable; CI stays green throughout.
