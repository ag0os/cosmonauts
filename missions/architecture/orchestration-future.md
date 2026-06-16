# Orchestration — Forward Architecture & Roadmap

**Status:** Forward source of truth for where the orchestration system is going.
Companion to the `agent-swarms` roadmap entry. **Supersedes**
`docs/designs/child-process-spawning.md`, `docs/designs/script-orchestration.md`,
and the forward "Out of Scope / Post-Production" items in
`missions/architecture/durable-orchestration-runtime.md` (which remains the
historical Wave-1/2 record). Last updated 2026-06-09.

This is the one place the orchestration future lives. The roadmap carries exactly
one *active* orchestration entry at a time (the next plannable slice); everything
beyond it lives here until promoted.

## Where we are (shipped — Wave 1/2)

- **One runtime.** `runId` is the universal currency; a file-backed run store
  (`missions/sessions/<scope>/runs/<runId>/`); normalized
  `cosmonauts run chain|drive|status|watch|list`; normalized events; and three
  compilers (chain, drive, spawn-as-1-node) that all feed one scheduler.
- **Spawning shapes today.** Sequential chains (`a -> b -> c`); same-stage
  concurrency (`[a, b]` and fan-out `r[N]` — fan-out sends the *same prompt*, no
  sharding); dynamic `spawn_agent` (5 concurrent per parent, nesting depth 2,
  awaited completion, 5-minute timeout).
- **Drive.** Deterministic plan→tasks execution, file-backed, resumable —
  but **sequential** (`maxParallelSteps` is hardcoded to 1 and not even enforced).

## The ceiling (today's hard limits)

- **One Bun process, one event loop** → async I/O concurrency, **no OS
  parallelism**. Two CPU-bound agents block each other.
- **Containment is partial** — a child that *throws* is caught (parent survives);
  a child that **OOMs or hits a fatal** takes the whole process and every sibling
  down.
- **No concurrent mutable work** — shared cwd and git index; staging/commits
  contend on `.git/index` even when edit sets are disjoint.
- **Inert vocabulary** (typed stubs for the future): `WorktreeSpec:"isolated"`,
  `maxParallelSteps`, `StepKind:"approval"`, `parentRunId`/`parentStepId`. These
  mark exactly what was deferred.

## Capability vision: swarms

N agents working as a team toward one objective, communicating through a
coordinator. There are **two fundamentally different classes**, and conflating
them is the main trap:

- **Read / opinion swarms** — understand the codebase, investigate spikes,
  multi-lens review of the same change with each agent reporting an opinion. They
  **mutate nothing, so they need zero isolation.** The missing piece is not
  worktrees — it is a coordinator plus *real sharding* (a different slice per
  agent, not today's same-prompt fan-out) and a *synthesis* step. Largely
  reachable on existing primitives; `quality-manager` already runs a version
  (parallel security/perf/UX specialists + a generalist, then synthesizes).
- **Mutable swarms** — N agents implementing concurrently. This is where
  isolation actually matters.

**The coordinator.** A swarm always needs one. Today's chain `coordinator` only
dispatches-and-waits (no live model of the run); Drive has no agent-coordinator
(deterministic, sequential); the richest coordinator we have actually run was the
**interactive main agent** in the ad-hoc `fallow-temp-exceptions-cleanup` run —
it held context, owned commits, fixed pre-existing breakage, and arbitrated in
real time. The capability we lack is not spawning — it is a **coordinator that
maintains a live model of the swarm**: who owns which files, who is mid-edit, when
it is safe to commit, when it is safe to verify. Two delivery modes:

- **In-process coordinator** — a spawned coordinator agent owns the live model.
- **Interactive-main coordinator** — the current session drives the swarm (the
  pattern that already worked, unformalized).

**The fork — isolation vs. coordination.** Concurrent mutation corrupting shared
state has two answers: *isolate* (worktrees, so the coordinator need not track) or
*coordinate* (a live-model coordinator serializes commits and gates verification,
so you need not isolate). **Worktrees are not always required** — for disjoint
edit sets with centralized commit authority and coordinator-gated verification, a
shared tree works (exactly what fallow-cleanup did). Isolation is needed when edit
sets may overlap, workers must commit independently, or each must verify against a
clean tree. This fork — not "worktrees yes/no" — is the real design decision.

## Forward waves

Sequenced; dependencies noted. "Active slice" is what the roadmap carries now.

- **A — Read/opinion swarms** *(active slice → `agent-swarms`)*. Shard work across
  N read-only agents; coordinator synthesizes their opinions into one result. No
  isolation. Builds on fan-out + `spawn_agent` + the `quality-manager`
  specialist pattern. Lowest risk, highest near-term leverage; the natural entry
  into the swarm vision.
- **B — Live-model coordinator.** The coordinator tracks file ownership,
  serializes commits, and gates verification → enables *shared-tree* mutable
  swarms when edit sets are disjoint. Formalizes the fallow-cleanup judgment role.
  Decide: in-process vs. interactive-main coordinator (or both).
- **C — Durable nesting.** `nested-runs` (persist `parentRunId`/`parentStepId`;
  spawn becomes an observable, cancellable child run) → `durable-coordinator-loops`
  (replace inline waiting sessions with scheduler-owned loops) →
  `cost-accounting-run-trees` (cost/token caps across the run tree). The substrate
  any future "sophisticated workflow" compiles to.
- **D — Real parallelism & isolation.** Child-process spawning (OS parallelism +
  crash containment + per-worktree env; see superseded
  `child-process-spawning.md` for the detailed IPC/migration design) → worktree
  isolation → `parallel-mutable-execution` (merge finalizers, conflict evidence)
  → approval gates (`StepKind:"approval"`) → scheduler-form (in-proc vs. child vs.
  daemon) → store-backend (SQLite/remote once file-backed stabilizes) +
  backend-report-hardening. Heavy; gated behind a concrete driver from A/B.
- **E — Script-coordinated mode.** Formalize "the script owns the mechanical loop,
  the main agent owns judgment" (the codex-exec + bash + cosmo run). Pluggable
  execution backends (codex exec, `claude -p`, cosmonauts worker). A third
  orchestration *shape* alongside chains and Drive — must also work with
  non-cosmonauts coordinators (Claude Code, Cursor).

**Reactive ergonomics** (pull in when symptomatic, not spine): activity-based
`chain-timeouts` (today's are rigid wall-clock); `model-failover` (today a failed
stage aborts the whole chain — no retry); `streaming-events` (NDJSON
`run watch --follow`; also serves external orchestrators — overlaps the adoption
track); `context-budget` (coordinator-loop compaction). **Retired:**
`chain-checkpointing` — subsumed by the durable file store (Drive already
resumes).

**Referenced, owned elsewhere:** `agent-messaging` (push-vs-poll completion — the
substrate for B/C *and* the autonomy track; stays its own roadmap item) and
`hook-system` (chain/stage/spawn lifecycle hooks — extensibility-flavored; stays
its own item). Cross-link, do not absorb.

**Shared host with autonomy.** The deferred `scheduler-form` (in-proc/child/daemon)
and `durable-coordinator-loops` are co-delivered with the **autonomy / always-on**
track — one long-lived host + durable store, not two. Orchestration owns the
"execute a run-graph to terminal" half; autonomy owns the "when / stay-alive"
half. Source of truth for that host: `missions/architecture/autonomy.md`.

## Open decisions

- Coordinator mode for swarms: in-process, interactive-main, or both (and how the
  interactive session hands off / reattaches).
- Default safety posture for mutable swarms: isolation-first (worktrees) vs.
  coordination-first (live-model coordinator).
- Is the durable-chain path the default for *ad-hoc* chains yet, or only named/
  explicit ones? (Wave 2 is fresh — verify before building on it.)
- Sharding contract for read swarms: how the coordinator slices the codebase/work
  so agents do not all see the same prompt.

## Consolidation ledger

- **Absorbs ROADMAP ideas:** `chain-timeouts`, `chain-checkpointing` (retired),
  `model-failover`, `streaming-events`, `context-budget`.
- **Supersedes design docs:** `child-process-spawning.md` (→ Wave D),
  `script-orchestration.md` (→ Wave E).
- **Supersedes forward items** in `durable-orchestration-runtime.md` — the Wave-3
  cluster: `nested-runs`, `durable-coordinator-loops`, `parallel-mutable-execution`,
  `cost-accounting-run-trees`, scheduler-form, store-backend, backend-report-hardening.
