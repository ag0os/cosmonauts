# Spike — Orchestration Surface Consolidation

**Status:** Read-only spike, pending human review of the recommended shape.
**Date:** 2026-06-05.
**Track:** Wave-2 follow-up to the durable orchestration runtime
(`missions/architecture/durable-orchestration-runtime.md`, decisions D-001..D-010).
**Author note:** No production code was written in this pass. This document
inventories the current surface, reports findings (including two corrections to
stated assumptions), lays out design options with trade-offs, and recommends a
consolidation shape for review. The ADR (proposed `D-011`) and the candidate
plan outline are deferred to the next pass, after the shape is ratified.

---

## 1. Purpose & scope

After Plan 4, the **runtime** is one system: loop-free chains/workflows AND Drive
both compile to a `RunGraph` and execute through `runDurableGraphScheduler`
(D-001). But the **public/agent-facing surface** still presents as several
segregated systems:

- CLI: `cosmonauts drive run|status|list` and `-w/--workflow` (no `--chain`).
- Agent tools: `chain_run`, `run_driver`, `spawn_agent`.
- Observation: `watch_events` (legacy) + `run_status`/`run_watch` (normalized).

The directive: **consolidate the agent-running abstractions under one umbrella,
while keeping the distinct concepts of chain/workflow, drive, and
spawn-agent/sub-agent.** Unify control + observation; preserve authoring as named
compilers feeding the one runtime; mode (inline vs durable) is the axis, not the
surface.

**In scope for this spike:** inventory every orchestration entry point, map each
to keep / merge / deprecate-with-compat-wrapper, lay out the design options and
trade-offs for the umbrella (including the CLI `cosmonauts run` vs `drive`/`-w`
question), and recommend a shape.

**Out of scope (non-goals, carried into the eventual plan):** migrating chain
loops / the coordinator off the legacy inline path (D-008 keeps them there);
building the full nested-run lifecycle; breaking any existing CLI flag or agent
tool that callers depend on.

---

## 2. Method & sources

Read-only inspection of: the architecture record; the four agent-facing tool
modules (`chain-tool`, `driver-tool`, `spawn-tool`, `watch-events-tool`,
`run-control-tools`); the durable runtime (`lib/durable-runtime/{types,
controller,scheduler,index}.ts`); the two graph runners
(`lib/orchestration/durable-chain-runner.ts`, `lib/driver/drive-graph-runner.ts`);
the legacy inline runner (`lib/orchestration/chain-runner.ts`) and the spawn
primitive (`lib/orchestration/agent-spawner.ts`); the CLI
(`cli/main.ts handleWorkflowMode`, `cli/drive/subcommand.ts`); and the prompt /
capability / skill / doc surface that references these tools.

---

## 3. Current surface inventory

### 3.1 The three authoring tools, side by side

The clearest way to see the fragmentation is to line up the three tools an agent
actually calls to run other agents. They differ on **every** control/observation
axis:

| Axis | `chain_run` | `run_driver` | `spawn_agent` |
|---|---|---|---|
| Input model | chain DSL (`a -> b`, `[a,b]`, `r[3]`) | plan slug + task IDs | one role + prompt |
| Compiles to | RunGraph (loop-free) **or** legacy loop | RunGraph (Drive tasks) | nothing — detached Pi session |
| Runtime path | `runDurableChain` → scheduler, **or** `runChain` (legacy) | `runInline`/`startDetached` → `runDriveOnGraph` → scheduler | `createAgentSessionFromDefinition`, in-memory `SpawnTracker` |
| Durable? | durable for DAGs; **inline (non-durable)** for loops/`completionLabel` | always durable graph (inline in-host **or** detached frozen) | never — no RunRecord |
| Control return | **blocking**; returns full `ChainResult` | **non-blocking**; returns `runId` immediately | **non-blocking**; returns `spawnId`; completion arrives as a follow-up message |
| Exposes a runId? | no | yes (`runId`, `eventLogPath`) | no (`spawnId`, in-memory only) |
| Observation | inline `onUpdate` progress lines only | `watch_events` (legacy) / `run_status`/`run_watch` (normalized) | TUI `spawn-activity` messages only |
| Scope written | `scope: "chain"` | `scope: planSlug` | none |

Evidence: `chain-tool.ts:156-160` (the `shouldRunChainInline ? runChain : runDurableChain` fork);
`driver-tool.ts:237-248` (`startDetached`/`runInline`, returns `runId`);
`spawn-tool.ts:616-662` (detached `void` promise, returns `spawnId`).

**This table is the consolidation target.** Three tools, three control models,
three observation stories, two of them bypassing the normalized run surface
entirely.

### 3.2 Entry-point map (CLI + tools + internal seams)

| # | Entry point | Kind | Handler / symbol | Compiles / routes to | Durable? |
|---|---|---|---|---|---|
| 1 | `chain_run` | agent tool | `chain-tool.ts` | `runDurableChain` (DAG) or `runChain` (loops) | conditional |
| 2 | `run_driver` | agent tool | `driver-tool.ts` | `runInline`/`startDetached` → `runDriveOnGraph` | yes |
| 3 | `spawn_agent` | agent tool | `spawn-tool.ts` | detached Pi session + `SpawnTracker` | no |
| 4 | `watch_events` | agent tool (read) | `watch-events-tool.ts` | `tailEvents(events.jsonl)` (Drive legacy log) | legacy view |
| 5 | `run_status` | agent tool (read) | `run-control-tools.ts` → `runStatus` | normalized store (`controller.ts`) | yes |
| 6 | `run_watch` | agent tool (read) | `run-control-tools.ts` → `runWatch` | normalized store (`controller.ts`) | yes |
| 7 | `cosmonauts -w/--workflow <expr>` | CLI | `main.ts handleWorkflowMode` | `shouldRunChainInline ? runChain : runDurableChain` | conditional |
| 8 | `cosmonauts drive run` | CLI | `cli/drive/subcommand.ts` | `runInline`/`startDetached` → `runDriveOnGraph` | yes |
| 9 | `cosmonauts drive status <runId>` | CLI (read) | `cli/drive/subcommand.ts` | run-state files (`run.completion.json`, inline state) | Drive-native |
| 10 | `cosmonauts drive list` | CLI (read) | `cli/drive/subcommand.ts` | run-state directory scan | Drive-native |
| 11 | `--list-workflows / --list-agents / --list-domains` | CLI (introspection) | `main.ts` | registry | n/a |

Notes:
- There is **no `--chain` flag** and **no `cosmonauts run` command**. `-w/--workflow`
  takes both named workflows and raw chain DSL; `isChainDslExpression()` decides.
  Confirmed in `cli/main.ts buildCliParser()`.
- `-w` is **synchronous** (CLI awaits the chain to completion); `drive run` is
  **async** (`--mode detached` returns a `runId`; default mode is task-count
  driven: `>= DETACHED_DEFAULT_TASK_THRESHOLD` (4) → detached, else inline).
- `drive` commands emit JSON **natively** and reject `--json`/`--plain`; the other
  subcommands accept `--json`/`--plain`.

### 3.3 The shared runtime seam

Both graph runners bottom out at the same scheduler, but **assemble the run
themselves**. `lib/orchestration/durable-chain-runner.ts:57-143` and
`lib/driver/drive-graph-runner.ts:45-161` each independently:

1. `new FileRunStore({ rootDir: missions/sessions })`
2. build a `RunRef` (`scope: "chain"` vs `scope: planSlug`)
3. compile a graph (`compileChainToGraph` / `compileDriveRunToGraph`)
4. `store.createRun(...)` + `writeRunGraph` + init step records + append `run_started`
5. build a `Map<name, RunGraphSchedulerBackend>`
6. loop `runDurableGraphScheduler({ store, ref, backends, holderId, ... })` to terminal
7. reconstruct a frontend-specific result (`ChainResult` / `DriverResult`)

Steps 1, 2, 4, 5, 6 are nearly identical boilerplate. The **scheduler** is shared;
the **run-creation envelope is not.**

---

## 4. Findings

### F1 — The runtime is unified at the scheduler, not at run-creation. There is no `run_start`.

The architecture record and the project memory describe `run_start` as "the
internal unification entry; `chain_run`/`run_driver` are thin wrappers." **That
symbol does not exist in the code.** A repo-wide search for `run_start`/`runStart`
finds only event-type strings and timestamp locals — no run-creation function or
tool. Each frontend calls `runDurableGraphScheduler` directly and duplicates the
create-run-and-drive-to-terminal envelope (§3.3).

This is the single biggest concrete consolidation opportunity on the runtime
side, and it is the literal realization of the `run_start` concept the record
already names. **Correction to a stated assumption:** `run_start` is a design
intent, not shipped code.

### F2 — "Inline" is overloaded across two unrelated axes.

- **Chain "inline"** = `runChain`, the legacy, session-coupled, **non-durable**
  loop runner, selected by `shouldRunChainInline` (loops / `completionCheck` /
  `completionLabel`). This is the D-008 legacy path.
- **Drive "inline"** = `runInline` → `runDriveOnGraph` in the **host process**, as
  opposed to `startDetached` (frozen `cosmonauts-drive-step` subprocess). **Both
  Drive modes are durable graphs.** Drive has no non-durable path at all.

So `mode: "inline"` means "non-durable" for chains and "in-host (still durable)"
for Drive. The architecture record's `mode: "inline" | "durable"` is the chain
meaning; Drive's inline/detached is an orthogonal **execution-location** axis. Any
unified surface must disambiguate these or it will mislead.

### F3 — Three different control models for "run agents".

`chain_run` blocks and returns the full result (no runId). `run_driver` returns a
runId and runs in the background. `spawn_agent` returns a spawnId and delivers
completion as an injected follow-up message. An agent that wants to "start work
and watch it" has to learn three different idioms depending on which authoring
concept it picked — even though all three are "run one or more agents."

### F4 — Two observation tools, plus two concepts with no durable observation at all.

`watch_events` reads the **Drive legacy** `events.jsonl` by line cursor;
`run_watch`/`run_status` read the **normalized** stream by `seq` cursor
(`controller.ts`). Meanwhile **chains/workflows expose no watch tool** (sync only)
and **spawn exposes no durable observation** (in-memory tracker + TUI messages).
The normalized read surface (D-009) exists but only Drive feeds it richly, and
even Drive still tells agents to use the legacy tool (capability/skill prose).

### F5 — `spawn_agent` lives entirely outside the durable runtime.

It launches a detached `AgentSession` tracked only by an in-memory `SpawnTracker`;
no `RunRecord`, no graph, no normalized events (`spawn-tool.ts:616-662`). The
"spawn = a 1-node graph (the minimal compiler)" framing is a **target**, not the
current state. Making it real means a `compileSpawnToGraph` (one `agent` step,
`cosmonauts-subagent` backend) routed through the same run-creation entry — which
is exactly the unification thesis, but it is net-new wiring, not a rename.

### F6 — Nested-run escalation is design-only, not scaffolded in shipped types.

The directive states spawn's durable escalation is "already scaffolded in the
model (`RunRecord.parentRunId/parentStepId`, the `nested-run` backend future
name)." **Validated against the code — it is not scaffolded:**

- The shipped `RunRecord` (`types.ts:93-107`) has **no** `parentRunId`/`parentStepId`
  (and no `kind`/`title`/`policy.requireApprovalFor`); those fields live only in
  the architecture record's *target* `RunRecord`.
- `KNOWN_BACKEND_NAMES` = `codex`, `claude-cli`, `cosmonauts-subagent`,
  `shell-command`. **`nested-run` is absent** — it is a documented-future name only.
- The one piece that *is* present: the `child_run_started` event exists in the
  `OrchestrationEvent` union (`types.ts:269-274`) but is **never emitted and never
  consumed** (the chain adapter explicitly `break`s on it).

**Correction to a stated assumption.** Practical consequence: the nested-run path
genuinely belongs in post-production, and when built it will require a small
additive change to `RunRecord` (add `parentRunId?`/`parentStepId?`) plus a
`nested-run` backend — not just "turning on" existing scaffolding. Keeping it a
non-goal for this plan is the right call; the spike just records that the
groundwork is thinner than assumed.

### F7 — The deferred "prompt/capability evolution" item is now in scope.

The architecture record's post-production list includes "prompt/capability
evolution so agents prefer `run_start`/`run_watch`/`run_status` over legacy
`chain_run`/`spawn_agent`/Drive paths." Today the prompts/capabilities/skills
still teach the legacy tools, and the durable surface is nearly invisible in docs:
`docs/orchestration.md` and `domains/shared/skills/drive/SKILL.md` have **0**
durable mentions; `domains/shared/capabilities/drive.md` and
`lib/driver/README.md` have partial coverage. This consolidation is the natural
home for that evolution, and the deferred doc-refresh folds in here (see §8).

---

## 5. Design options & trade-offs

The umbrella decomposes into six decisions. Each lists options and a recommendation.

### 5.1 Runtime: introduce the `run_start` seam

- **R1 (recommended).** Extract a single internal `runStart({ store, ref, graph,
  policy, backends, mode, metadata })` that owns the create-run-and-drive-to-terminal
  envelope (§3.3 steps 1–6). Both `durable-chain-runner` and `drive-graph-runner`
  call it; each keeps only its compiler and its result-reconstruction. This is a
  pure refactor behind the existing tools — no caller-visible change.
  - *Pro:* removes the duplication; gives the umbrella a real internal spine; makes
    "every frontend is a compiler + run_start" true in code, not just in prose;
    the place to later attach `mode`, policy defaults, parent linkage.
  - *Con:* must thread Drive's quirks (drain loop, finalizer-failure polling,
    `withSafeSchedulerEventWrites`, detached frozen-runner) without regressing
    Architecture X. The seam has to be expressive enough or Drive keeps a bespoke
    wrapper around it.
- **R2.** Leave the duplication; only unify at the tool/CLI layer.
  - *Pro:* zero runtime risk. *Con:* the "one runtime entry" stays fictional; the
    next frontend (spawn-as-graph) copies the boilerplate a third time.

### 5.2 Control + observation: one run lifecycle

- **Recommended.** Make **runId the universal currency** and `run_status`/`run_watch`
  the **one read surface** for every frontend:
  - `chain_run`/workflow runs already create a durable `RunRecord` with
    `scope: "chain"` — surface that `runId` (and `scope`) in the tool result so a
    chain run is observable the same way a Drive run is.
  - Keep `chain_run`'s blocking convenience (it still returns the final result),
    but additionally expose `{ runId, scope }` so mid-run observation and
    post-hoc inspection use the same `run_status`/`run_watch` as Drive.
  - **`watch_events` becomes a compatibility view over `run_watch`** (D-005 already
    says legacy types remain available): same data, normalized stream underneath,
    legacy line-cursor shape preserved for existing callers. Mark it deprecated in
    its description; do not remove it.
  - *Trade-off:* normalized events for Drive currently live alongside the legacy
    `events.jsonl` (the Plan-1 dual-write compatibility exception). Collapsing
    `watch_events` onto `run_watch` means the normalized stream must be at least as
    complete as the legacy one for the fields agents rely on. Needs a parity check
    (a behavior in the plan), not just a wrapper swap.

### 5.3 Authoring: keep the frontends as named compilers

- **Recommended (matches the directive).** Keep `chain`/`workflow`, `drive`, and
  `spawn` as **distinct authoring concepts**, each a named compiler that produces a
  `RunGraph`:
  - chain/workflow → topology graph (`compileChainToGraph`, already real)
  - drive → plan-task graph (`compileDriveRunToGraph`, already real)
  - spawn → 1-node graph (`compileSpawnToGraph`, **net-new**, see 5.4)
  All three feed `runStart` (5.1). The input models genuinely differ, so the
  authoring tools stay differentiated; only control/observation unifies.
  - *Why not collapse authoring too:* a single "run(graph)" tool would force agents
    to hand-write graphs — losing the DSL, the plan-task derivation, and the
    one-line spawn ergonomics. The concepts are the value; the segregated
    control/observation is the accident.

### 5.4 `spawn_agent`: how far to go this wave

This is the main scope fork. Three options:

- **S1 — Document only.** Leave `spawn_agent` exactly as-is (detached session,
  in-memory tracker); just clarify in prose that it is the inline, non-durable
  sub-agent primitive and that durable multi-agent work belongs to chain/drive.
  - *Pro:* zero risk to the hot interactive path. *Con:* spawn stays outside the
    umbrella; "spawn = 1-node graph" stays aspirational; the unified observation
    story has a hole.
- **S2 — Full 1-node graph now.** Route every `spawn_agent` through
  `compileSpawnToGraph` → `runStart({ mode: "inline" })`.
  - *Pro:* maximal unification; spawn becomes observable like everything else.
    *Con:* puts the durable run machinery on the hottest, most latency-sensitive,
    most frequently-called path; risks regressions in the coordinator's
    fan-out/await loop; larger blast radius.
- **S3 (recommended) — Model it, default it inline, defer the escalation.**
  Introduce `compileSpawnToGraph` (one `agent` step, `cosmonauts-subagent`
  backend) and make it the *defined shape*, with `spawn_agent` defaulting to
  **inline** execution. Decide during the plan whether inline spawn actually
  threads through `runStart` or keeps its current lightweight session path with a
  documented "this is the degenerate 1-node case" mapping. The **durable
  escalation (nested run)** — a top-level spawn becoming a child `RunRecord` with
  parent linkage — stays a **non-goal** (F6: the type scaffolding doesn't exist
  yet anyway). Run-explosion discipline is stated as policy: spawns *inside* a run
  are steps (cheap); ad-hoc top-level spawns are lightweight inline 1-node runs;
  durability is opt-in.
  - *Pro:* realizes the conceptual unification (spawn is the minimal compiler)
    without betting the interactive path on it; keeps a clean, honest boundary for
    what's deferred. *Con:* "modeled but not fully routed" is a halfway state that
    needs crisp documentation so it isn't mistaken for done.

### 5.5 The CLI question: `cosmonauts run` vs `drive`/`-w`

- **C1 — One `cosmonauts run` umbrella that subsumes `drive` and `-w`.**
  - *Pro:* the cleanest external story — one verb, subcommands per compiler
    (`run chain`, `run drive`, `run spawn`) + `run status`/`run watch`. *Con:*
    biggest churn; breaks muscle memory and the `cosmonauts` skill / external
    docs; high risk of regressing callers; over-reaches for a surface that is
    mostly agent-tool driven, not CLI driven.
- **C2 — Keep `drive` and `-w` exactly; change nothing at the CLI.**
  - *Pro:* zero CLI risk. *Con:* the CLI keeps presenting two systems; no unified
    observation verb for chains/workflows on the CLI (they're sync-only today).
- **C3 (recommended) — Additive umbrella, keep the old surfaces as compat.**
  Add a thin `cosmonauts run status <runId>` / `cosmonauts run watch <runId>` pair
  backed by `run_status`/`run_watch` (the one read surface on the CLI, scope-aware
  so it covers chain, drive, and adhoc runs uniformly). Keep `drive run|status|list`
  and `-w/--workflow` working unchanged; internally point `drive status` at the
  normalized controller where it already overlaps. Optionally reserve
  `cosmonauts run <compiler>` as a future front door without removing anything.
  - *Pro:* gives the CLI a unified observation verb (filling the chain/workflow
    gap from F4) without breaking a single existing invocation; matches "unify
    control/observation, keep authoring concepts." *Con:* two ways to read a Drive
    run's status during the transition (acceptable, clearly the compat one).

### 5.6 Mode-axis vocabulary

Adopt explicit names so F2 stops biting:

- **Execution mode** = `inline` (non-durable, session-coupled — chain loops only)
  **|** `durable` (graph-backed, the default for everything else).
- **Durable location** (a sub-property of durable runs) = `in-host` **|**
  `detached` (frozen `cosmonauts-drive-step`). This is *not* the inline/durable
  axis; it is where the durable scheduler runs.

The umbrella's `mode` is the **execution mode**. Drive's `--mode inline|detached`
is really a *location* choice and should be documented as such (no flag rename
required this wave — just stop conflating it in prose and in the unified surface).

---

## 6. Recommended consolidation shape

A single sentence: **one runtime entry (`runStart`) fed by named compilers
(chain/workflow, drive, spawn), with runId as universal currency and
`run_status`/`run_watch` as the one observation surface; `watch_events` becomes a
compat view; authoring stays differentiated; mode is the axis; nested-run stays
deferred.**

Concretely, the recommended bundle is **R1 + 5.2 + 5.3 + S3 + C3 + 5.6**:

1. **`runStart` seam (R1):** extract the shared create-run-and-drive-to-terminal
   helper; both existing runners call it. Pure internal refactor.
2. **runId everywhere + one read surface (5.2):** `chain_run`/workflow surface
   `{ runId, scope }`; `run_status`/`run_watch` cover all scopes; `watch_events`
   re-implemented as a compat view over the normalized stream (deprecated, kept).
3. **Compilers stay named (5.3):** chain/workflow, drive, spawn remain distinct
   authoring tools; only the runtime/control/observation behind them unifies.
4. **Spawn modeled as the 1-node compiler, inline default (S3):** `compileSpawnToGraph`
   defined; durable nested-run escalation explicitly deferred (F6).
5. **Additive CLI umbrella (C3):** `cosmonauts run status|watch`; `drive`/`-w`
   untouched.
6. **Mode vocabulary fixed (5.6):** execution-mode vs durable-location, documented.
7. **Doc/prompt/capability refresh (F7, §8):** folded into the same plan, last.

This keeps every wave-1 compatibility promise (no tool or flag removed; legacy
views preserved), realizes the deferred `run_start`/observation-preference item,
and stops short of the genuinely hard deferred work (durable loops, nested-run
lifecycle, worktrees) — consistent with D-008/D-009/D-010 and the post-production
list.

---

## 7. Keep / merge / deprecate map

| Entry point | Disposition | Action |
|---|---|---|
| `chain_run` | **Keep** (authoring) | Additionally return `{ runId, scope }`; route via `runStart`. Behavior preserved. |
| `run_driver` | **Keep** (authoring) | Route via `runStart`; keep `runId`/`eventLogPath`. Behavior preserved. |
| `spawn_agent` | **Keep** (authoring) | Model as 1-node compiler, inline default (S3). No behavior change required this wave. |
| `watch_events` | **Deprecate → compat view** | Re-implement over `run_watch` normalized stream; keep shape + line cursor; mark deprecated. |
| `run_status` | **Keep / promote** | Becomes the canonical status surface for all scopes (chain/drive/adhoc). |
| `run_watch` | **Keep / promote** | Becomes the canonical event surface for all scopes. |
| `cosmonauts -w/--workflow` | **Keep** | Unchanged; internally already on `runStart` after R1. |
| `cosmonauts drive run` | **Keep** | Unchanged; internally on `runStart`. |
| `cosmonauts drive status` | **Keep** | Point at the normalized controller where it overlaps; keep JSON output. |
| `cosmonauts drive list` | **Keep** | Unchanged (or back with `listRecentRuns`). |
| `--list-workflows/agents/domains` | **Keep** | Untouched. |
| `cosmonauts run status\|watch` | **New (additive)** | Thin CLI over `run_status`/`run_watch`. |
| internal `runStart` | **New (internal)** | The unification spine (R1). Not an agent tool. |
| `nested-run` backend / `parentRunId` | **Defer** | Non-goal; record as post-production (F6). |

---

## 8. Doc-refresh scope (folded in, last)

Deliberately deferred until the surface settled; now part of the plan's final
behavior, after the code lands:

- `docs/orchestration.md` — currently **0 durable mentions**; rewrite around the
  one-runtime / compilers / runId / run_status/run_watch model.
- `domains/shared/skills/drive/SKILL.md` — **0 durable mentions**; teach the
  normalized observation tools and the durable default.
- `domains/shared/capabilities/drive.md` — reconcile `watch_events` vs
  `run_watch` guidance toward the normalized surface.
- `domains/shared/capabilities/spawning.md` + `skills/spawning/SKILL.md` —
  position spawn as the inline 1-node primitive; clarify chain-vs-drive-vs-spawn
  choice.
- `lib/driver/README.md` — already has a "Durable Runtime Compatibility" section;
  elevate/link it as canonical.
- Coordinator/planner/quality-manager prompts — nudge toward runId-aware
  observation where they reference `watch_events`.

---

## 9. Open decisions for human review

1. **Spawn scope (5.4):** S1 (document only), S2 (full 1-node now), or **S3
   (model + inline default, defer nested-run)** — recommended S3. How much spawn
   work belongs in this wave?
2. **CLI shape (5.5):** C1 (one `cosmonauts run`), C2 (no CLI change), or **C3
   (additive `run status|watch`, keep `drive`/`-w`)** — recommended C3. Is an
   additive CLI observation verb wanted now, or strictly agent-tools-only?
3. **`runStart` extraction risk (5.1):** accept R1's requirement to thread Drive's
   drain/finalizer/detached quirks through the shared seam, or keep Drive on a
   thin bespoke wrapper above `runStart`?
4. **`watch_events` collapse (5.2):** confirm appetite to re-implement it as a
   compat view now (requires a normalized-vs-legacy parity check), vs leaving it
   untouched and only promoting `run_watch`.

Pending answers, the next pass drafts ADR **D-011** and the
`orchestration-surface-consolidation` plan outline in the architecture record.

---

## 10. Resolved decisions (human review, 2026-06-05)

The open decisions in §9 were resolved as:

1. **Spawn scope → S3.** Model `spawn_agent` as the inline-default 1-node compiler;
   defer the durable nested-run escalation. (Recommendation accepted.)
2. **CLI shape → C1, done additively.** `cosmonauts run` becomes the unified CLI
   front door (subcommands per compiler + `status`/`watch`/`list`). To honor the
   "do not break existing CLI/tool callers" non-goal, `cosmonauts drive ...` and
   `-w/--workflow` are **kept as compatibility aliases** that delegate to
   `cosmonauts run` (deprecation note, identical behavior) — C1 means "promote a
   unified front door," not "remove the old ones."
3. **`watch_events` → collapse to a compat view now**, over the normalized
   `run_watch` stream, with a normalized-vs-legacy parity check as a plan behavior.
   (Recommendation accepted.)
4. **`runStart` extraction → R1** (shared seam; Drive's drain/finalizer/detached
   specifics layer above the shared core). Carried as the runtime spine.

These feed ADR **D-011..D-014** and the Wave-2 plan outline in
`missions/architecture/durable-orchestration-runtime.md`.

### Refinements (human review, 2026-06-05, after the planner handoff)

Four follow-on decisions tightened the shape; see `D-015`, `D-016`, and the
revised `D-012`/`D-013` in the architecture record:

- **`workflow` collapses into `chain` (`D-015`).** A cosmonauts "workflow" is
  literally a named chain (`WorkflowDefinition = { id, description?, chain }`).
  Drop the second name; there is one concept (chain), some chains are named/saved.
  Rename the registry/flag/`RunRecord.kind` and update prompts/skills in lockstep.
- **CLI is `cosmonauts run chain | drive` only (`D-013` revised).** No `run spawn`
  — `spawn_agent` is an agent-only tool; the single-agent CLI path is `-p`. Every
  `run` subcommand is JSON-native on stdout, progress on stderr.
- **Back-compat is no longer a constraint.** Single-user dogfood: migrate `-w`/
  `drive` onto `cosmonauts run` and update all callers in lockstep, rather than
  preserving permanent aliases. Agent tools may be renamed toward the canonical
  surface as long as internal callers move together. (Revises the original
  "do not break existing CLI/tool callers" non-goal.)
- **Parallelism is a sequenced capability, not wave-2 scope (`D-016`).** Read-only
  fan-out (spawn N analyzers) is safe and nearly free today (cap 5, tunable —
  optional Group-D item); parallel mutable execution needs worktree isolation +
  a parallel-wave compiler + merge finalizer and is wave 3. The durable substrate
  for parallelism already exists; the safety/isolation layer does not.
