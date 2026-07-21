# Spec (scoping) — episodic-log detached-terminal & resume hardening

**Status:** scoped, not yet designed. Follow-up to the shipped `episodic-log`
plan (agent-memory W3). Off-by-default gate means none of the below affects a
default install; this is correctness hardening for the *enabled* Drive path.

## Origin

During `episodic-log` implementation, the Quality Manager and an independent
codex review surfaced a cluster of narrow, enabled-only defects in Drive's
detached-terminal identity and resume paths. Each was verified against ground
truth (see the shipped `episodic-log` `qm-review.md`, archived with the plan).
They were **deliberately deferred** because their correct fixes touch the D-009
completion/outcome contract across `lib/driver/driver.ts`,
`cli/drive/subcommand.ts`, and `domains/shared/extensions/orchestration/driver-tool.ts`
and should be designed together, not patched piecemeal. One attempted drive-by
fix (F-003 reorder) was reverted because it traded a detached failure-of-a-
failure edge for a happy-path event-ordering regression — see "Hard constraint"
below.

## Hard design constraint (learned the expensive way)

For a Drive terminal there are three ordering wants that are **mutually
unsatisfiable with a single completion write**:
1. **D-009**: `writeRunCompletion` before episode capture (identity is derived
   from completion content).
2. **B-026 (detached)**: a capture-failure `driver_diagnostic` must precede the
   terminal legacy event in the child JSONL, because the parent bridge stops
   bridging on the terminal event.
3. **Relied-upon invariant**: the terminal legacy event must be emitted before
   the completion file is observable, because inline consumers
   (`waitForCompletion` + `watch_events`, and real Drive callers) treat
   "completion file present" as "run_completed already emitted."

Any design here must resolve this explicitly (e.g. a separate diagnostic channel
to the parent bus that does not depend on child-JSONL ordering, or a two-phase
completion marker), not just reorder the three steps.

## In scope (deferred findings to fix)

- **F-003 / UR-002** — In detached runs, a terminal-**capture-failure**
  `driver_diagnostic` never reaches the parent session bus (bridge stops on the
  terminal event). Warning still persists to legacy JSONL + durable store.
- **PRF-003** — Thrown Drive exits record a `failed` terminal at wall-clock and
  write no completion; settle paths then persist an unstamped `aborted`
  completion that a later resume stamps and re-records → two terminals
  (`failed`+`aborted`) for one attempt. Violates D-009 exactly-one-terminal.
- **PRF-002** — Detached `abort()` snapshots `child`/`workdirCreated` by value; a
  narrow pre-spawn window can leak a child + duplicate terminals, and a stamped
  completion can be overwritten by an unstamped one (resume duplicate). Fix the
  by-value snapshot (read live launch state); the resume-duplicate leg is
  entangled with PRF-003.
- **PRF-004** — Drive holds the plan lock during non-load-bearing episode/
  diagnostic I/O. Perf; lock-release-reordering interacts with cross-plan commit
  serialization — needs care.
- **PRF-007** — Concurrent same-entity plan/task status updates from multiple
  sessions can over/mis-count transition episodes (managers don't serialize the
  read/merge/write/decide). Underlying non-serialized update is largely
  pre-existing.
- **F-005** — Terminal-only `--resume` of a run that completed while logging was
  *off* (then enabled) records no terminal (no frozen `episodeAttemptId`). The
  `episodic-log` plan is internally inconsistent here; a fix must mint a
  **deterministic** (run-id-derived, not random) attempt id and persist it so
  repeated resumes dedupe idempotently — reconcile the plan text too.
- **SR-001 (hardening)** — On resume, the frozen `episodeSource` re-resolves the
  execution worker (D-007-intended). Consider requiring `agentId === "worker"`
  before trusting a frozen source for execution, keeping `episodeSource` for
  provenance only. Low threat (local, gitignored, project-owned artifact). Note:
  the CDX-001 role-vs-agentReference fix already severed arbitrary-agent
  *selection*; this is residual honesty hardening.

## Test debt to close

- **CDX-002 regression test (execution-path resume, unavailable frozen worker).**
  The shipped fix (`cli/drive/subcommand.ts` `frozenWorkerLostForExecution`) is
  verified by data-flow + the green reconcile/normal resume suites, but has no
  dedicated test. Neither existing fixture supports it: `tests/cli/drive/graph-resume.test.ts`
  is reconcile-only (backend not called, `remainingTaskIds: []`), and
  `tests/extensions/orchestration-driver-tool.test.ts` is the `run_driver` tool
  path (no CLI `--resume` frozen-source semantics). New scaffolding needed: a
  persisted run with a frozen `episodeSource` whose worker no longer resolves,
  `remainingTaskIds` non-empty (execution), inline `cosmonauts-subagent`; assert
  the resumed spec omits `episodeSource`/`episodeAttemptId` while the fallback
  worker executes and no episode names the stale source.

## Out of scope

- Anything the `episodic-log` plan already shipped and verified.
- Turning the gate on by default (that is the later adoption decision).

## Recommended next step

Run `/skill:plan` on this scope (bundling the above), then `/spec-to-backlog`,
then `/implement-plan`. The findings' concrete file:line evidence lives in the
archived `episodic-log` `qm-review.md`.
