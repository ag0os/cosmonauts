---
title: 'External Backends and CLI — codex, claude, detached mode, drive verb'
status: active
createdAt: '2026-04-30T19:06:26.563Z'
updatedAt: '2026-05-04T16:36:18.351Z'
---

## Summary

Complete the executive-assistant Layer 3 substrate by shipping the external execution backends (`codex`, `claude-cli`), detached-mode driver execution via a **Bun-compiled binary that owns the whole run loop** (calls Plan 1's exported `runRunLoop` directly, acquires its own plan lock, emits run-level events, releases on exit), the `cosmonauts drive` CLI verb, durable run records (`run.completion.json` separate from `run.pid`), and orphan-run management (`status`, `list`).

## Distillation reference

This plan implements the second half of `docs/designs/executive-assistant.md` Part 1. It depends on Plan 1 (`driver-primitives`) for `lib/driver/`, the `Backend` interface, the exported `runRunLoop` function, both lock primitives (`acquirePlanLock`, `acquireRepoCommitLock`), and the event schema (with `parentSessionId`, distinct `driver_activity` bus type).

## Revision history

This plan was revised twice after adversarial reviews. The second review (`missions/plans/external-backends-and-cli/review.md`, 6 findings, 4 high-severity) drove this third revision. The biggest change: **the binary now contains the whole run loop, not per-task invocation.** One binary invocation per detached run. Bash becomes a 5-line `nohup` launcher (or eliminated entirely). This single architectural change resolves PR-001 (spec mismatch was per-task), PR-002 (lock ownership — binary owns it for the run's duration), and PR-003 (run-level events emitted by `runRunLoop` naturally). Other changes:

- **Cross-plan git races**: now resolved via Plan 1's `acquireRepoCommitLock` (held briefly per commit).
- **`run.completion.json` durable record**: separate from `run.pid` so `status`/`list` work after clean exit.
- **`package.json` in scope** for compile scripts.
- **Binary size estimate corrected** to ~70MB (reviewer measured).

## Q1 architectural pivot — V2 (binary owns the run loop)

The original Plan 3 had backends expose `shellCommandTemplate(): string`. Review F-002 caught quoting hell. Round-2 revision moved to a Bun binary called per-task. Round-2 re-review (PR-001/002/003) caught that the per-task binary couldn't safely own the lock or emit run-level events.

Round-3 design: **the binary is the run process**. It calls Plan 1's `runRunLoop(spec, ctx)` once per detached run, not once per task. It:
- Reads `<workdir>/spec.json` (Plan 1's serializable `DriverRunSpec` with `runId`, `parentSessionId`, `projectRoot`).
- Acquires the plan-level lock itself (NOT the parent process).
- Constructs the backend by name with deps from spec.
- Initializes `TaskManager(spec.projectRoot)` + calls `init()` (the actual method).
- Creates an `EventSink` writing to JSONL (no in-process bus needed; the parent's tailer bridges to its bus).
- Calls `runRunLoop(spec, ctx)` — this emits `run_started`, runs each task via `runOneTask` (which uses `acquireRepoCommitLock` for its commit step), and emits `run_completed` or `run_aborted`.
- Writes `run.completion.json` with the final `DriverResult` before exiting.
- Releases the plan lock in finally.
- Exits 0 on `outcome === "completed"`, 1 otherwise.

Bash launcher (~5 lines) just `nohup`-detaches the binary. We can also use `Bun.spawn({ detached: true })` from cosmonauts directly — bash is optional.

This resolves:
- PR-001 (Plan 3): spec-shape mismatch — Plan 1 now ships the right serializable shape (D-P1-15).
- PR-002 (Plan 3) + PR-005 (Plan 1): lock ownership — binary acquires its own lock, parent never holds it for detached runs.
- PR-003 (Plan 3): run-level finalization — `runRunLoop` emits `run_started`/`run_completed`/`run_aborted` naturally.
- PR-004 (Plan 3): cross-plan git races — Plan 1 now ships `acquireRepoCommitLock` used inside `runOneTask`.
- PR-005 (Plan 3): `run.completion.json` is written by the binary before exit; trap removes only `run.pid`.
- PR-006 (Plan 3): `package.json` is in Files-to-Change with compile scripts; binary size corrected.

## Scope

Included:
- `lib/driver/backends/codex.ts` — `createCodexBackend(deps)`. Spawns `codex exec --full-auto -o <summary> -` via `Bun.spawn`. Capability: `canCommit: false`, `isolatedFromHostSource: true`. `livenessCheck: () => ["codex", "--version"]`.
- `lib/driver/backends/claude-cli.ts` — `createClaudeCliBackend(deps)`. Spawns `claude -p` via `Bun.spawn`. Capability: `canCommit: true`, `isolatedFromHostSource: true`. `livenessCheck: () => ["claude", "--version"]`.
- `lib/driver/backends/registry.ts` — small switch for backend construction by name (used by the binary). Each backend factory takes serializable deps.
- `lib/driver/backends/types.ts` — extend with optional `livenessCheck(): { argv: string[]; expectExitZero: boolean }`. Non-breaking.
- **`lib/driver/run-step.ts`** — Bun binary entry point. Reads `<workdir>/spec.json`; constructs backend via registry; constructs `TaskManager` + `EventSink`; **acquires plan lock**; calls `runRunLoop`; **releases lock**; **writes `run.completion.json`**; exits 0/1.
- `lib/driver/driver.ts:startDetached(spec, deps)` — non-blocking. Validates backend supports detached (rejects `cosmonauts-subagent`); creates workdir; renders prompts; writes `spec.json`; runs `bun build --compile lib/driver/run-step.ts --outfile <workdir>/bin/cosmonauts-drive-step`; spawns `nohup bash run.sh > master.log 2>&1 &` (or `Bun.spawn({ detached: true })`); writes `run.pid`; starts JSONL bridge; returns `DriverHandle`.
- `lib/driver/driver-script.ts:generateBashRunner(workdir): string` — emits a ~5-line bash that `nohup`-launches the binary and `trap`s removal of `run.pid` on exit (NOT on completion JSON).
- `lib/driver/event-stream.ts:bridgeJsonlToActivityBus(path, runId, parentSessionId, bus): { stop }` — handles missing initial file (watches parent dir until file appears), partial-line reads (trailing buffer), parse-error retry (does not advance cursor), automatic stop on `run_completed`/`run_aborted`.
- `cli/drive/subcommand.ts:createDriveProgram(): Command` — zero-arg factory matching the existing dispatch pattern at `cli/main.ts:658-688` (the actual location). Subcommands: `run` (default), `status <runId>`, `list`. Local runtime bootstrap inside the action handlers for envelope resolution. Resume guard checks `git status --porcelain`; refuses on dirty unless `--resume-dirty`.
- `cli/main.ts` — add `drive` to the hard-coded subcommand dispatch table at lines 658-688.
- `package.json` — add `compile:drive-step` script: `bun build --compile lib/driver/run-step.ts --outfile bin/cosmonauts-drive-step` (dev-time pre-compile, optional). Runtime compile happens inside `startDetached`.
- Tests covering: codex/claude `Bun.spawn` argv construction; livenessCheck failure paths; run-step binary roundtrip with mock backend (compile + invoke + verify completion record); JSONL bridge missing-file/partial-line/parse-retry; CLI verb wiring against actual dispatch model; resume + dirty-tree guard; status/list (durable record + PID liveness with start-time match); plan + repo lock interaction in detached mode; behavioral parity with inline mode.

Excluded:
- Additional backends beyond codex and claude-cli (gemini-cli, qwen, generic shell). Documented in `lib/driver/README.md`.
- Daemon mode, peer dialogue, durable inboxes — design doc Part 2.
- Coding-domain envelope (ships in Plan 2 per Q5).
- Re-rendering or migrating prompts already in a workdir (resumption uses existing prompts).

Assumptions:
- Plan 1 has landed. `lib/driver/` exposes `Backend` interface, `runRunLoop` (exported), `acquirePlanLock`, `acquireRepoCommitLock`, `parseReport`, `createEventSink`, `prompt-template`, `tailEvents`. `DriverRunSpec` is serializable and includes `runId`, `parentSessionId`, `projectRoot`.
- `bun build --compile` is available (Bun is a hard dependency: `AGENTS.md: "Runtime: Bun"`).
- `codex` (`codex exec --full-auto`) and `claude` (`claude -p`) are on PATH when the corresponding backend is selected.
- Bash 4+ on macOS / Linux for the launcher. Windows uses inline mode or WSL.
- `bun build --compile` produces a self-contained binary that runs without the cosmonauts source tree (verified by the reviewer's smoke test against `cli/main.ts`, ~68MB output).
- No static-asset generation step needed for cosmonauts (claude-forge runs `gen-assets.ts` because of agent-prompt templates; cosmonauts loads prompts from disk paths bundled by Bun's import resolver).

## Decision Log (plan-internal)

- **D-P3-1 — Binary owns the run loop, not just per-task**
  - Decision: `lib/driver/run-step.ts` is invoked **once per detached run**. It reads `spec.json`, acquires the plan lock, calls Plan 1's `runRunLoop(spec, ctx)`, writes `run.completion.json`, releases lock, exits.
  - Alternatives: per-task binary invocation (round-2 design — review PR-002/PR-003 caught lock ownership and run-level event problems); standalone TS process via `node` (loads mutating cosmonauts source).
  - Why: Long-lived process owns the lock for the run's duration. Run-level events (`run_started`/`run_completed`/`run_aborted`) are emitted by `runRunLoop` naturally. `partialMode: "stop"` is honored. The binary is still source-mutation-isolated because it's compiled at run-creation time.
  - Decided by: planner-proposed; corrects review PR-001/002/003.

- **D-P3-2 — Backend interface unchanged from Plan 1; add optional `livenessCheck`**
  - Decision: Backends expose `{ name, capabilities, run(invocation) }`. Plan 3 adds optional `livenessCheck(): { argv: string[]; expectExitZero: boolean }`. No `shellCommandTemplate`. Codex and claude-cli adapters spawn child processes via `Bun.spawn` and capture stdout/stderr.
  - Alternatives: structured detached command contract (review F-002 alternative); shellCommandTemplate (round-1 design — quoting hell).
  - Why: Binary calls `backend.run()` directly in TS. No bash invocation of backends. `livenessCheck` is the structured pre-flight check.
  - Decided by: planner-proposed.

- **D-P3-3 — `cosmonauts-subagent` rejected for detached mode**
  - Decision: `startDetached` rejects `backendName === "cosmonauts-subagent"` with a structured error. Inline mode is fully supported.
  - Why: cosmonauts-subagent's spawn machinery references the running cosmonauts session and registry — compiling it into a frozen binary would orphan the spawned children from the parent's activity bus.
  - Decided by: planner-proposed.

- **D-P3-4 — JSONL bridge missing-file + partial-line handling**
  - Decision: `bridgeJsonlToActivityBus(path, runId, parentSessionId, bus)`: if file missing, watches parent dir until it appears (max 30s timeout); maintains trailing-buffer of bytes after the last newline, never advances cursor past partial lines; on parse failure, logs to stderr and does NOT advance cursor (retry on next tick); stops automatically on `run_completed`/`run_aborted`; returns `{ stop(): void }`.
  - Alternatives: pure polling; fs.watch only (review PR-003); refuse to start until file exists.
  - Why: Robust to bash startup latency, mid-write reads, and malformed events.
  - Decided by: planner-proposed; corrects review F-003.

- **D-P3-5 — `cosmonauts drive` CLI shape matches the existing dispatch model**
  - Decision: `createDriveProgram(): Command` is a **zero-argument factory** matching the convention at `cli/main.ts:658-688`. Runtime is bootstrapped inside the action handler (for envelope resolution). Pi flag preprocessing handled at the dispatch level for subcommands. Subcommands: `run` (default), `status <runId>`, `list`. **Note: review noted the actual line range is 658-688, not 106 — corrected here.**
  - Why: Match the actual CLI architecture.
  - Decided by: planner-proposed; corrects review F-005 + PR-005.

- **D-P3-6 — Resume guard: clean working tree by default**
  - Decision: `cosmonauts drive --resume <runId>` reads existing JSONL, identifies last-completed task, slices `spec.taskIds` from there. Before binary invocation, runs `git status --porcelain`; if non-empty, refuses with structured error citing dirty paths unless `--resume-dirty` is passed.
  - Why: A run interrupted after `task_started` but before terminal event leaves the working tree in unknown state.
  - Decided by: planner-proposed.

- **D-P3-7 — Cosmonauts source path resolved at run-creation, baked into compile**
  - Decision: `startDetached` resolves cosmonauts source root at run creation (project root containing `lib/driver/run-step.ts`). The `bun build --compile` invocation uses that absolute path; the resolved path is recorded in `run_started` event and `run.completion.json`. Binary is self-contained — no `cosmonauts` PATH lookup at task time. The binary calls `TaskManager` via bundled imports.
  - Why: Reproducibility. Binary is frozen at compile.
  - Decided by: planner-proposed.

- **D-P3-8 — Durable run record (`run.completion.json`) separate from `run.pid`**
  - Decision: `run.pid` content: `{ pid, startedAt, runArgv, cosmonautsPath }`. Bash trap removes `run.pid` on exit (success or failure). The binary writes `run.completion.json` BEFORE the trap fires, containing the final `DriverResult`. Files coexist briefly during binary exit. After clean exit: only `run.completion.json` remains. After kill -9 / reboot: only `run.pid` remains (with dead PID).
  - Status logic: read `run.completion.json` first → if present, terminal state. Else read `run.pid` → if PID alive AND start-time matches → "running"; else "orphaned/dead".
  - List logic: scan for both files; classify each.
  - Alternatives: rely on `run.pid` alone (review PR-005 — trap removes it; status has no record after clean exit); never remove `run.pid` (lingering pidfiles).
  - Why: Two files separate "process is alive" (volatile) from "this run is done" (durable). Both serve `status` and `list`.
  - Decided by: planner-proposed; corrects review PR-005.

- **D-P3-9 — Backend liveness check: explicit per-backend command**
  - Decision: Each backend declares `livenessCheck(): { argv: string[]; expectExitZero: boolean }`. Codex: `["codex", "--version"]`. Claude-cli: `["claude", "--version"]`. Driver runs the check before workdir creation; failure → structured error with backend name + argv + actual exit + stderr.
  - Why: Generic `<binary> --version` doesn't always work for subcommand-style CLIs.
  - Decided by: planner-proposed.

- **D-P3-10 — Mode default heuristic for `cosmonauts drive`**
  - Decision: Default mode is `detached` if `taskIds.length >= 5`, else `inline`. Explicit `--mode <inline|detached>` overrides.
  - Why: Short runs friendlier in foreground.
  - Decided by: planner-proposed.

- **D-P3-11 — Parity QC redefined to behavioral equivalence**
  - Decision: QC asserts inline and detached produce: (a) the same normalized event sequence excluding timestamps and lifecycle ordering quirks; (b) the same task status transitions; (c) commits with identical subject lines and identical tree contents — but NOT identical SHAs (commit timestamps differ).
  - Why: Identical SHAs unachievable per review F-001.
  - Decided by: planner-proposed.

- **D-P3-12 — Bash launcher OR `Bun.spawn` detached — implementer's choice**
  - Decision: Two equivalent paths to launch the binary in the background: (a) generate a 5-line `run.sh` invoking `nohup ./bin/cosmonauts-drive-step ... &`, or (b) use `Bun.spawn(binary, args, { stdio: ["ignore", outFd, errFd], detached: true })` directly from `startDetached`. Implementer picks based on testing convenience. Both produce equivalent runtime behavior.
  - Why: Bash adds nothing functional now that the binary owns the loop. `Bun.spawn` may be cleaner, but the bash version is easier to inspect in `master.log` for debugging.
  - Decided by: planner-proposed.

## Design

### Module structure

```
lib/driver/
  driver.ts                 EXTEND: add startDetached(spec, deps): DriverHandle
  driver-script.ts          NEW: generateBashRunner(workdir): string (~5 lines)
  event-stream.ts           EXTEND: add bridgeJsonlToActivityBus(...): { stop }
  run-step.ts               NEW: Bun binary entry point; calls runRunLoop
  backends/
    codex.ts                NEW: createCodexBackend(deps); livenessCheck
    claude-cli.ts           NEW: createClaudeCliBackend(deps); livenessCheck
    registry.ts             NEW: resolveBackend(name, deps) — used by run-step.ts
    types.ts                EXTEND: add optional livenessCheck()
  README.md                 NEW: Backend interface reference + 30-line adapter guide

cli/drive/
  subcommand.ts             NEW: createDriveProgram() (zero-arg factory)

cli/main.ts                 EDIT: add 'drive' to hard-coded subcommand dispatch (lines 658-688)
package.json                EDIT: add compile:drive-step script

domains/shared/extensions/orchestration/
  driver-tool.ts            EDIT (Plan 1): accept mode: "detached"; route to startDetached;
                            reject backendName === "cosmonauts-subagent" + detached
```

### Dependency direction

```
cli/drive/subcommand.ts
       │ uses
       ▼
lib/driver/driver.ts (startDetached)
       │
       ├──► lib/driver/driver-script.ts (generateBashRunner)
       ├──► lib/driver/event-stream.ts (bridgeJsonlToActivityBus)
       ├──► lib/driver/backends/{codex, claude-cli, registry}
       └──► bun build --compile lib/driver/run-step.ts (subprocess at run creation)

(at run time, in detached mode)
bash run.sh → cosmonauts-drive-step (Bun binary)
                   │
                   ├──► acquirePlanLock (Plan 1)
                   ├──► resolveBackend(name, deps) (Plan 3)
                   ├──► TaskManager(projectRoot).init() (Plan 1 dep)
                   ├──► createEventSink (Plan 1)
                   ├──► runRunLoop(spec, ctx) (Plan 1 export)
                   │           │
                   │           └──► runOneTask per task (uses acquireRepoCommitLock)
                   ├──► writes run.completion.json
                   └──► releases plan lock; exits

(in cosmonauts parent process)
bridgeJsonlToActivityBus → activityBus → orchestration extension
                                              │
                                              └──► pi.sendMessage(deliverAs:"nextTurn")
```

### Key contracts

```ts
// lib/driver/backends/types.ts (extends Plan 1)
export interface Backend {
  readonly name: string;
  readonly capabilities: BackendCapabilities;
  run(invocation: BackendInvocation): Promise<BackendRunResult>;

  /** Optional. Returns the structured liveness check. */
  livenessCheck?(): { argv: string[]; expectExitZero: boolean };
}
```

```ts
// lib/driver/backends/codex.ts (sketch)
import { spawn } from "bun";

export interface CodexBackendDeps { binary?: string }

export function createCodexBackend(deps: CodexBackendDeps = {}): Backend {
  const binary = deps.binary ?? "codex";
  return {
    name: "codex",
    capabilities: { canCommit: false, isolatedFromHostSource: true },
    livenessCheck: () => ({ argv: [binary, "--version"], expectExitZero: true }),
    async run({ runId, promptPath, workdir, taskId, eventSink, signal, parentSessionId, planSlug }) {
      const summaryPath = `${workdir}/${taskId}-summary.txt`;
      const start = Date.now();
      const child = spawn([binary, "exec", "--full-auto", "-o", summaryPath, "-"], {
        signal, stdin: Bun.file(promptPath),
        stdout: "pipe", stderr: "pipe",
      });
      const stdout = await new Response(child.stdout).text();
      const exitCode = await child.exited;
      return { exitCode, stdout, durationMs: Date.now() - start };
    },
  };
}
```

```ts
// lib/driver/backends/claude-cli.ts (same shape)
export function createClaudeCliBackend(deps: { binary?: string } = {}): Backend {
  const binary = deps.binary ?? "claude";
  return {
    name: "claude-cli",
    capabilities: { canCommit: true, isolatedFromHostSource: true },
    livenessCheck: () => ({ argv: [binary, "--version"], expectExitZero: true }),
    async run(invocation) {
      // spawn(binary, ["-p"], { stdin: <promptPath contents> }) ...
    },
  };
}
```

```ts
// lib/driver/backends/registry.ts (used by run-step.ts in the binary)
export interface BackendRegistryDeps {
  // For cosmonauts-subagent — but it's rejected in detached mode anyway
  cwd?: string;
  // Backend-specific binary overrides
  codexBinary?: string;
  claudeBinary?: string;
}

export function resolveBackend(name: string, deps: BackendRegistryDeps): Backend {
  switch (name) {
    case "codex": return createCodexBackend({ binary: deps.codexBinary });
    case "claude-cli": return createClaudeCliBackend({ binary: deps.claudeBinary });
    case "cosmonauts-subagent":
      throw new Error("cosmonauts-subagent backend cannot run in detached mode");
    default: throw new Error(`Unknown backend: ${name}`);
  }
}
```

```ts
// lib/driver/run-step.ts (Bun binary entry point — D-P3-1)
// Compiled with: bun build --compile lib/driver/run-step.ts --outfile <workdir>/bin/cosmonauts-drive-step
import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { runRunLoop } from "./run-run-loop.ts";          // Plan 1 export
import { createEventSink } from "./event-stream.ts";     // Plan 1
import { acquirePlanLock } from "./lock.ts";             // Plan 1
import { resolveBackend } from "./backends/registry.ts"; // Plan 3
import { TaskManager } from "../tasks/task-manager.ts";
import { MessageBus } from "../orchestration/message-bus.ts";
import type { DriverRunSpec, DriverResult } from "./types.ts";

const { values } = parseArgs({
  options: { workdir: { type: "string" } },
  strict: true,
});

const workdir = values.workdir!;
const spec: DriverRunSpec = JSON.parse(await readFile(`${workdir}/spec.json`, "utf-8"));

let result: DriverResult;
let lockHandle;

try {
  // 1. Acquire plan lock (binary owns it for the run's duration)
  const lockResult = await acquirePlanLock(spec.planSlug, spec.runId, spec.projectRoot);
  if ("error" in lockResult) {
    console.error(`Plan lock active: runId=${lockResult.activeRunId} since ${lockResult.activeAt}`);
    process.exit(2);
  }
  lockHandle = lockResult;

  // 2. Construct backend (registry rejects cosmonauts-subagent at this point)
  const backend = resolveBackend(spec.backendName, { /* deps from env or spec */ });

  // 3. Initialize TaskManager via .init() (the actual method)
  const taskManager = new TaskManager(spec.projectRoot);
  await taskManager.init();

  // 4. Create EventSink (no in-process bus needed; parent's tailer bridges)
  const localBus = new MessageBus();
  const eventSink = await createEventSink({
    logPath: spec.eventLogPath,
    runId: spec.runId,
    parentSessionId: spec.parentSessionId,
    activityBus: localBus,
  });

  // 5. Run the loop (Plan 1 export — emits run_started/completed/aborted, handles partialMode)
  result = await runRunLoop(spec, {
    taskManager, backend, eventSink,
    parentSessionId: spec.parentSessionId,
    runId: spec.runId,
    cosmonautsRoot: spec.projectRoot,
    abortSignal: AbortSignal.timeout(/* total run timeout if needed */),
  });

  // 6. Write durable completion record
  await writeFile(
    `${workdir}/run.completion.json`,
    JSON.stringify(result, null, 2),
  );
} finally {
  // 7. Release plan lock
  if (lockHandle && "release" in lockHandle) {
    await lockHandle.release();
  }
}

process.exit(result.outcome === "completed" ? 0 : 1);
```

```ts
// lib/driver/driver.ts (extends Plan 1)
export function startDetached(
  spec: DriverRunSpec,
  deps: DriverDeps,
): DriverHandle {
  if (spec.backendName === "cosmonauts-subagent") {
    throw new DetachedNotSupportedError(
      `Backend "${spec.backendName}" does not support detached mode. Use mode: "inline".`,
    );
  }
  // 1. Construct backend in parent (just to call livenessCheck — same name will resolve in binary)
  const backend = constructBackendForLivenessCheck(spec.backendName);
  // 2. Run livenessCheck; structured error if fails. NO workdir created yet.
  // 3. Create workdir at missions/sessions/<plan>/runs/<runId>/.
  // 4. Render all per-task prompts to workdir/prompts/<taskId>.md.
  // 5. Write task-queue.txt (one taskId per line — kept for debugging; binary uses spec.taskIds).
  // 6. Write spec.json (Plan 1's serializable DriverRunSpec — runId/parentSessionId/projectRoot included).
  // 7. Resolve cosmonauts source root.
  // 8. Compile binary: `bun build --compile <root>/lib/driver/run-step.ts --outfile <workdir>/bin/cosmonauts-drive-step`.
  // 9. Generate run.sh via generateBashRunner; write; chmod +x. (OR skip bash; use Bun.spawn detached — D-P3-12)
  // 10. Spawn detached: `nohup bash run.sh > master.log 2>&1 &` (or Bun.spawn).
  // 11. Write run.pid: { pid, startedAt: ISO, runArgv, cosmonautsPath }.
  // 12. Start bridgeJsonlToActivityBus(eventLogPath, runId, deps.parentSessionId, deps.activityBus).
  // 13. Return DriverHandle{ runId, planSlug, workdir, eventLogPath, abort, result }.
  //     - abort(): kill child PID; stop bridge; remove run.pid + write run.completion.json with outcome:"aborted"
  //     - result: Promise that resolves when run.completion.json appears (file watch) OR run_aborted event observed.
}
```

```ts
// lib/driver/driver-script.ts (~5 lines bash)
export function generateBashRunner(workdir: string): string {
  return `#!/usr/bin/env bash
set -uo pipefail
WORKDIR="$(cd "$(dirname "$0")" && pwd)"
trap 'rm -f "$WORKDIR/run.pid"' EXIT
exec "$WORKDIR/bin/cosmonauts-drive-step" --workdir "$WORKDIR"
`;
}
```

```ts
// lib/driver/event-stream.ts (bridge — D-P3-4)
export function bridgeJsonlToActivityBus(
  path: string,
  runId: string,
  parentSessionId: string,
  activityBus: MessageBus,
): { stop(): void } {
  // - if !exists(path): fs.watch(dirname(path)) for "rename" events; resolve when path appears
  //   (max 30s — error if file never created)
  // - then: maintain (cursor, trailingBuffer)
  // - on read tick (200ms or fs.watch event): read appended bytes; concat with buffer;
  //   split by \n; last fragment goes back into buffer (if no trailing \n)
  //   for each complete line: try parse → on success publish bus event (filter parentSessionId);
  //                            on parse fail: log to stderr, leave cursor at line start (retry next tick)
  // - stop self when run_completed or run_aborted observed
}
```

```
# `cosmonauts drive` CLI (Plan 3)
cosmonauts drive [run]
  --plan <slug>                       (required)
  [--task-ids <id1,id2,...>]
  [--backend codex|claude-cli|cosmonauts-subagent]  (default: codex)
  [--mode inline|detached]            (default: detached if tasks >= 5, else inline)
  [--branch <name>]
  [--commit-policy driver-commits|backend-commits|no-commit]
  [--envelope <path>]
  [--precondition <path>]
  [--overrides <dir>]
  [--max-cost <usd>] [--max-tasks <n>] [--task-timeout <ms>]
  [--resume <runId>] [--resume-dirty]

cosmonauts drive status <runId> [--plan <slug>]
  Reads run.completion.json first (terminal state); falls back to run.pid +
  start-time match. Prints { runId, planSlug, status, startedAt, lastEvent? }.

cosmonauts drive list
  Scans missions/sessions/*/runs/*/{run.pid,run.completion.json}; classifies each.
```

### `Bun.spawn` argv construction note

Backends use `Bun.spawn` with argv arrays (not shell strings). All paths and arguments are passed as separate array elements; Bun handles quoting at the OS level. No `printf %q` or shell-template substitution. This eliminates the round-1 review's quoting concerns entirely.

### Integration seams (verified in code)

- **Plan 1's `runRunLoop`** — exported from `lib/driver/run-run-loop.ts`. The binary calls it directly with the same `spec` it deserialized.
- **Plan 1's `Backend` interface** — codex / claude-cli adapters fit unchanged. `livenessCheck` is non-breaking optional addition.
- **Plan 1's `acquirePlanLock`** — binary calls it; releases on exit. Parent never holds the lock for detached runs.
- **Plan 1's `acquireRepoCommitLock`** — used inside `runOneTask` (Plan 1) for commit serialization. Works for both inline and detached.
- **Plan 1's event schema** — same `DriverEvent` discriminated union with `parentSessionId`. Binary uses the same TS types via bundled imports.
- **CLI subcommand pattern** — verified at `cli/main.ts:658-688` (the actual location, NOT line 106 as claimed in earlier revision). Existing entries: `task`, `plan`, `eject`, `create`, `update`, `init`, `scaffold`. Each is a zero-arg factory `() => Command`.
- **Domain envelope resolution** — `runtime.domainResolver.allDomainDirs()` provides per-domain root paths.
- **`activityBus`** — same instance Plan 1 uses. Bridge re-publishes parsed JSONL events; subscribers (Plan 1's orchestration extension forwarder) handle delivery to `pi.sendMessage`.
- **`bun build --compile`** — verified working in claude-forge. Cosmonauts already requires Bun.
- **`TaskManager.init()`** — verified at `lib/tasks/task-manager.ts:54-60`. Method name is `init`, NOT `initialize`.

### Seams for change

- **New backends.** Drop a new file in `lib/driver/backends/`, add a switch arm in `registry.ts`, declare a `livenessCheck`. Both inline and detached modes work automatically.
- **Other transports.** Detached mode today uses bash + nohup or `Bun.spawn`. Future transports (systemd unit, container, Lambda) replace `generateBashRunner` and the spawn step; the binary stays unchanged.

## Approach

### Detached run lifecycle

```
1. CLI / Pi tool calls startDetached(spec, deps).
2. startDetached:
   a. Validates backend.livenessCheck() exits 0.
   b. Validates spec.backendName !== "cosmonauts-subagent".
   c. Creates workdir at missions/sessions/<plan>/runs/<runId>/.
   d. Renders prompts; writes spec.json (Plan 1's full serializable shape).
   e. Compiles binary via `bun build --compile`.
   f. Generates run.sh; writes; chmod +x.
   g. Spawns `nohup bash run.sh > master.log 2>&1 &`; captures PID.
   h. Writes run.pid: { pid, startedAt, runArgv, cosmonautsPath }.
   i. Starts bridgeJsonlToActivityBus.
   j. Returns DriverHandle.

3. Bash runner (~5 lines):
   - traps run.pid removal on exit
   - exec "$BIN" --workdir "$WORKDIR"

4. Bun binary (the run process):
   a. Parses --workdir; reads spec.json.
   b. Acquires plan lock (Plan 1's acquirePlanLock).
   c. Constructs backend via registry.
   d. Initializes TaskManager (.init()).
   e. Creates EventSink (writes JSONL).
   f. Calls runRunLoop(spec, ctx) — emits run_started, runs all tasks via runOneTask
      (which uses acquireRepoCommitLock for commits), emits run_completed or run_aborted.
   g. Writes run.completion.json with the final DriverResult.
   h. Releases plan lock in finally.
   i. Exits 0 (completed) or 1 (aborted/blocked).

5. Cosmonauts parent process:
   a. Bridge tails events.jsonl (handles missing file, partial lines, parse retries).
   b. Parses each complete line; filters by parentSessionId; publishes to activityBus.
   c. Plan 1's orchestration extension forwarder publishes select events as
      pi.sendMessage(deliverAs:"nextTurn").
   d. On run_completed/run_aborted, bridge stops itself.
   e. DriverHandle.result resolves by reading run.completion.json once it appears.
```

### `cosmonauts drive` CLI flow

```
1. createDriveProgram() returns Command tree: run (default), status, list.
2. For `run`:
   a. Bootstrap CosmonautsRuntime locally (for envelope/domain resolution).
   b. Resolve plan, backend, envelope.
   c. Run backend.livenessCheck(); structured error on failure.
   d. Build DriverRunSpec (with runId, parentSessionId, projectRoot per Plan 1's shape).
   e. Mode selection: explicit --mode wins; else heuristic.
   f. Inline mode: subscribe to activityBus; print events to stderr; await runInline; exit.
   g. Detached mode: call startDetached; print { runId, workdir, eventLogPath } to stdout; exit.
   h. --resume: read existing JSONL; check git status; refuse on dirty unless --resume-dirty.
3. For `status <runId>`:
   - Read run.completion.json first; if present → terminal state.
   - Else read run.pid; check kill -0 + start-time match → running / orphaned / dead.
4. For `list`:
   - Scan missions/sessions/*/runs/*/{run.pid,run.completion.json}; classify each.
```

## Files to Change

New files:
- `lib/driver/backends/codex.ts`
- `lib/driver/backends/claude-cli.ts`
- `lib/driver/backends/registry.ts`
- `lib/driver/run-step.ts`
- `lib/driver/driver-script.ts`
- `lib/driver/README.md`
- `cli/drive/subcommand.ts`

Modified files:
- `lib/driver/backends/types.ts` — add optional `livenessCheck()`.
- `lib/driver/driver.ts` — add `startDetached(spec, deps)`.
- `lib/driver/event-stream.ts` — add `bridgeJsonlToActivityBus`.
- `cli/main.ts` — add `drive` to subcommand dispatch table at lines 658-688.
- `package.json` — add `compile:drive-step` script (dev convenience; runtime compile is in `startDetached`).
- `domains/shared/extensions/orchestration/driver-tool.ts` (Plan 1) — accept `mode: "detached"`; route to `startDetached`; reject `cosmonauts-subagent + detached`.

Test files (new):
- `tests/driver/backends/codex.test.ts` — `Bun.spawn` argv, signal abort, livenessCheck failure.
- `tests/driver/backends/claude-cli.test.ts` — same.
- `tests/driver/backends/registry.test.ts` — resolves codex/claude; rejects cosmonauts-subagent.
- `tests/driver/run-step.test.ts` — compile binary; invoke against fixture spec; verify lock acquisition, runRunLoop call, completion record write.
- `tests/driver/driver-script.test.ts` — generated bash is syntactically valid (`bash -n`).
- `tests/driver/driver-detached.test.ts` — end-to-end detached run with mock backend; verifies workdir layout, JSONL contents, status transitions, run.pid + run.completion.json lifecycle, plan lock acquired by binary.
- `tests/driver/event-stream-bridge.test.ts` — missing-file, partial-line, parse-retry, auto-stop on run_completed/run_aborted.
- `tests/cli/drive/run.test.ts` — argument parsing; backend/envelope resolution; mode heuristic; resume + resume-dirty guard.
- `tests/cli/drive/status.test.ts` — reads run.completion.json first; falls back to run.pid; PID reuse via start-time mismatch detected.
- `tests/cli/drive/list.test.ts` — enumerates and classifies multiple runs.
- `tests/extensions/orchestration-driver-detached.test.ts` — Pi tool with `mode: "detached"` returns runId; rejects `cosmonauts-subagent + detached`.
- `tests/driver/parity.test.ts` — same fixture spec in inline vs detached: equivalent normalized event sequence and identical commit subjects/trees (NOT identical SHAs).
- `tests/driver/cross-plan-commit-lock.test.ts` — two simulated detached runs on different plans in the same repo serialize via `acquireRepoCommitLock` (uses Plan 1's primitive).

## Risks

- **Mitigated — Inline/detached behavioral divergence.** Same `runRunLoop` runs in both modes. Tests assert behavioral equivalence.
- **Mitigated — Bash quoting bugs.** Bash is now ~5 lines and only handles workdir paths (validated upstream). All argv handling for backend invocations happens in TS via `Bun.spawn`.
- **Mitigated — Backend binaries missing.** `livenessCheck` runs before workdir creation.
- **Mitigated — JSONL bridge races.** D-P3-4 specifies parent-dir watch, trailing-buffer, parse-retry.
- **Mitigated — Resume over dirty tree.** D-P3-6 dirty-check + `--resume-dirty` opt-in.
- **Mitigated — `cosmonauts` PATH version skew.** Binary self-contained; `TaskManager` etc. via bundled imports.
- **Mitigated — Detached lock ownership.** Binary acquires its own plan lock. Lock PID points at the live binary.
- **Mitigated — Cross-plan git races.** Plan 1's `acquireRepoCommitLock` serializes commits across runs.
- **Mitigated — Status/list after clean exit.** `run.completion.json` is the durable record (D-P3-8).
- **Mitigated — Orphan detection after reboot.** PID + start-time match (D-P3-8).
- **Mitigated — Detached process killed externally.** Backend children inherit signal? Actually no — child of binary is not killed by `kill <bin-pid>`. Documented as accepted: if the binary is killed, in-flight backend child processes may continue briefly until they hit signal or complete; `run.pid` becomes stale; `status` reports "dead". Future improvement: process-group kill via `setpgid`.
- **Mitigated — Backend rate limiting / cost overrun.** Backend `run()` returns the actual exit code; non-zero → `spawn_failed` event. No automatic retry (assistant decides).
- **Accepted — bash 4 / Linux/macOS only for detached mode.** Inline mode platform-agnostic.
- **Accepted — Compiled binary size (~70MB per workdir).** Reviewer measured. Users can delete completed workdirs.
- **Accepted — `bun build --compile` time (~2-5 sec) at run creation.** One-time per detached run.

## Quality Contract

- id: QC-001
  category: integration
  criterion: "`run_driver({ backend: \"codex\", mode: \"detached\" })` against a 2-task fixture produces a workdir containing `run.sh`, `prompts/`, `spec.json`, `bin/cosmonauts-drive-step`, `events.jsonl`, `run.pid`, and (after completion) `run.completion.json`. Commits match fixture-expected subject/tree (NOT identical SHA)."
  verification: verifier
  command: "bun run test --grep 'driver detached codex e2e'"

- id: QC-002
  category: behavior
  criterion: "`cosmonauts drive --backend cosmonauts-subagent --mode detached` returns a structured error citing the isolation property; no workdir is created; no compile is attempted."
  verification: verifier
  command: "bun run test --grep 'detached cosmonauts-subagent rejected'"

- id: QC-003
  category: correctness
  criterion: "Generated `run.sh` is bash-syntax valid (`bash -n`) for fixture workdirs with spaces and special characters in the path."
  verification: verifier
  command: "bun run test --grep 'driver script syntax'"

- id: QC-004
  category: behavior
  criterion: "JSONL bridge handles: (a) missing initial file (waits for parent-dir creation), (b) partial-line read (buffers), (c) parse error (does not advance cursor), (d) automatic stop on `run_completed`/`run_aborted`."
  verification: verifier
  command: "bun run test --grep 'jsonl bridge races'"

- id: QC-005
  category: integration
  criterion: "`cosmonauts drive --plan X --backend codex` (inline mode, 2 tasks) prints DriverEvent JSON to stderr per event and DriverResult JSON to stdout; exit code is 0 on full success and 1 on any task blocked."
  verification: verifier
  command: "bun run test --grep 'cosmonauts drive cli inline'"

- id: QC-006
  category: behavior
  criterion: "Backend `livenessCheck` runs before workdir creation; missing binary yields a structured error and non-zero exit code; no partial workdir is left behind."
  verification: verifier
  command: "bun run test --grep 'driver backend missing'"

- id: QC-007
  category: correctness
  criterion: "Same-fixture-spec inline and detached runs produce: (a) the same normalized event sequence (excluding timestamps and lifecycle ordering quirks), (b) identical task status transitions, (c) commits with identical subject lines and identical tree contents (NOT identical SHAs)."
  verification: verifier
  command: "bun run test --grep 'inline vs detached parity'"

- id: QC-008
  category: behavior
  criterion: "`cosmonauts drive --resume <runId>` against a JSONL log with task A `task_done` and task B `task_blocked` resumes from task C; tasks A and B are not re-rendered or re-invoked. With dirty working tree, refuses unless `--resume-dirty` is passed."
  verification: verifier
  command: "bun run test --grep 'driver resume guards'"

- id: QC-009
  category: behavior
  criterion: "`cosmonauts drive status <runId>` reads `run.completion.json` first → reports terminal state. If absent, reads `run.pid` + `kill -0` + start-time match → reports `running` / `orphaned` / `dead`. Survives PID reuse after reboot."
  verification: verifier
  command: "bun run test --grep 'driver status durable'"

- id: QC-010
  category: behavior
  criterion: "`cosmonauts drive list` enumerates all runs across all plans (combining `run.pid` and `run.completion.json` records); classifies each as running / completed / orphaned / dead."
  verification: verifier
  command: "bun run test --grep 'driver list'"

- id: QC-011
  category: correctness
  criterion: "The Bun-compiled `cosmonauts-drive-step` binary runs end-to-end without the cosmonauts source tree present (move source out, invoke binary against fixture workdir, verify completion record written)."
  verification: verifier
  command: "bun run test --grep 'binary self contained'"

- id: QC-012
  category: behavior
  criterion: "Two simulated detached runs on different plans in the same repo serialize their commits via `acquireRepoCommitLock`; both runs commit cleanly; no `.git/index.lock` race; commits have the expected ordering relative to lock acquisition."
  verification: verifier
  command: "bun run test --grep 'cross-plan commit lock'"

- id: QC-013
  category: behavior
  criterion: "Detached run's plan lock is owned by the binary (not the parent CLI/tool process). After the parent exits but while the binary still runs, `cosmonauts drive --plan X` (a second invocation against the same plan) returns the active-lock error citing the binary's PID."
  verification: verifier
  command: "bun run test --grep 'detached plan lock ownership'"

- id: QC-014
  category: integration
  criterion: "`bun run test`, `bun run lint`, `bun run typecheck` all pass after Plan 3 lands."
  verification: verifier
  command: "bun run test && bun run lint && bun run typecheck"

## Implementation Order

1. **Backend interface extension (non-breaking).** Add optional `livenessCheck()` to `Backend` in `lib/driver/backends/types.ts` (Plan 1 file). All Plan 1 tests still pass.
2. **codex backend.** `lib/driver/backends/codex.ts`. Tests for `Bun.spawn` argv, signal handling, livenessCheck failure.
3. **claude-cli backend.** `lib/driver/backends/claude-cli.ts`.
4. **Backend registry.** `lib/driver/backends/registry.ts`. Tests for resolution + cosmonauts-subagent rejection.
5. **Run-step binary.** `lib/driver/run-step.ts`. Test: compile via `bun build --compile`; invoke against fixture; verify it acquires lock, calls `runRunLoop`, writes `run.completion.json`.
6. **JSONL → activityBus bridge.** Extend `lib/driver/event-stream.ts` with `bridgeJsonlToActivityBus`. Tests for races.
7. **Bash generator.** `lib/driver/driver-script.ts`. Snapshot test + `bash -n`.
8. **Detached mode.** Add `startDetached(spec, deps)` to `lib/driver/driver.ts`. Compose: livenessCheck → workdir → render prompts → write spec.json → `bun build --compile` → write run.sh → `nohup bash run.sh &` → write run.pid → start bridge → return handle.
9. **`package.json` update.** Add `compile:drive-step` script for dev-time pre-compile.
10. **Pi tool integration.** Update `domains/shared/extensions/orchestration/driver-tool.ts` (Plan 1) to accept `mode: "detached"`.
11. **`cosmonauts drive` CLI verb.** `cli/drive/subcommand.ts:createDriveProgram(): Command`. Wire into `cli/main.ts:658-688` dispatch.
12. **`cosmonauts drive status` and `list`.** Subcommands. Read `run.completion.json` first; fall back to PID liveness with start-time match.
13. **Inline-vs-detached parity test.** Same fixture spec in both modes; assert behavioral equivalence.
14. **Cross-plan commit lock test.** Two simulated detached runs on different plans serialize commits.
15. **Documentation.** `lib/driver/README.md` with Backend interface and adapter guide. Update `AGENTS.md` to mention `cosmonauts drive`.
16. **Verification gate.** Full lint, test, typecheck. Verify QC-001 through QC-014.

Each step is independently committable; CI stays green throughout.
