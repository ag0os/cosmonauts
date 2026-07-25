# Plan Review: episodic-log-detached-hardening

## Findings

- id: PR-001
  dimension: lifecycle-invariant
  severity: high
  title: "A successful thrown-terminal capture can still become a failed+aborted duplicate"
  plan_refs: D-002; B-006–B-007; B-022; Design §2 “Attempt-terminal ledger”; Risks “Ledger write-after-success race”
  code_refs: lib/driver/drive-graph-runner.ts:285-307, lib/memory/episode.ts:87-94, lib/memory/markdown-store.ts:128-180, lib/memory/markdown-store.ts:927-953
  description: |
    The plan writes the attempt marker only after `recordEpisode` succeeds and treats marker-write failure as fail-soft/retryable. Completion-backed terminals can survive that gap because their episode timestamp is persisted in `DriverResult.completedAt`, but `recordDriveThrownTerminalEpisode` supplies no timestamp. `recordEpisode` therefore assigns the current wall clock, and `writeEpisode` includes that timestamp in both rendered bytes and the filename hash.

    If the failed episode lands but `markDriveTerminalRecorded` fails (or the process dies between those writes), settle persists an `aborted` fallback and a later resume sees no marker. It can then write a distinct `aborted` terminal; PRF-001's identical-content dedupe cannot help because outcome and timestamp differ. This recreates the exact `failed`+`aborted` pair B-006/B-007 promise to eliminate. The planner must make the post-capture/pre-marker interruption reconstructible or otherwise revise the claim protocol before tasking.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "The advertised backstop cannot retry a failed plan-lock release"
  plan_refs: D-004; B-016–B-017; B-023; Design §1 and §6; Risks “Hook/release failure”
  code_refs: lib/driver/lock.ts:209-231, lib/driver/driver.ts:84-107, lib/driver/run-step.ts:48-84
  description: |
    The revised plan correctly contains `onTerminalPersisted` rejection and says the caller's `.finally` performs an idempotent backstop release. The actual `LockHandle.release()` sets `released = true` before reading or unlinking the lock. If either operation rejects, every later call returns immediately without retrying, so the `.finally` backstop is a no-op and the lock file remains owned by a still-live PID.

    This is especially damaging in the long-lived tool host: later same-plan runs are reported as active until that process exits, while the primary result has already been returned successfully. `lib/driver/lock.ts` is not in Files to Change and B-023 checks only that release failure does not replace the result, not that the lock has an exit. The plan must account for the real release contract and own/test cleanup after a first release rejection.

- id: PR-003
  dimension: interface-fidelity
  severity: medium
  title: "Case-insensitive task IDs can map one task to different transition locks"
  plan_refs: B-015; Design §7; Files to Change entry for lib/tasks/task-manager.ts
  code_refs: lib/tasks/task-manager.ts:145-201, lib/tasks/task-manager.ts:295-317, tests/tasks/task-manager.test.ts:580-613
  description: |
    `TaskManager` deliberately treats IDs case-insensitively: `findTaskFilenameById` uppercases the caller's ID, and the existing suite proves `task-001`, `TASK-001`, and `Task-001` identify the same task. The plan only says managers “derive safe colocated lock paths”; it does not require a canonical logical task ID before deriving that path.

    Two enabled manager instances updating `TASK-001` and `task-001` can therefore acquire different raw-ID-derived lock files while both mutate the same markdown record, defeating B-015's serialization and episode-count guarantee. Specify the canonical lock identity and include mixed-case concurrent updates in the named behavior test.

- id: PR-004
  dimension: duplication
  severity: medium
  title: "The plan adds a third implementation of the same filesystem lock protocol"
  plan_refs: Design §7; Files to Change entries for lib/memory/episode-transition-lock.ts and its tests; Quality Contract duplication gate
  code_refs: lib/tasks/lock.ts:1-68, lib/tasks/lock.ts:71-173, lib/driver/lock.ts:35-103, lib/driver/lock.ts:110-231
  description: |
    The proposed module owns exclusive link-based creation, waiting, PID stale-owner recovery, nonce/owner validation, and idempotent release. Those mechanics already exist in `lib/tasks/lock.ts` (including the desired waiting and PID+UUID ownership) and substantially overlap `acquireRepoCommitLock` in `lib/driver/lock.ts`. The task lock even documents that it was copied from the driver lock.

    Implementing the plan literally creates a third lock protocol with independent stale/release behavior—the same area in which PR-002 exposes a lifecycle defect. The “one entity-transition lock implementation” threshold does not detect this codebase-level duplication. The planner should investigate shared ownership rather than authorizing another private copy, while preserving dependency direction.

- id: PR-005
  dimension: behavior-spec
  severity: medium
  title: "Behavior Sources point to aliases that do not exist in the authoritative spec"
  plan_refs: Behaviors preamble; every B-001–B-025 Source field
  code_refs: missions/plans/episodic-log-detached-hardening/spec.md:112-140, domains/shared/skills/work-artifacts/references/behavior-spine.md:5-16
  description: |
    The plan explicitly says the nine acceptance criteria are unnumbered and that `AC-001` through `AC-009` are plan-local aliases that do not amend `spec.md`. The canonical behavior spine requires planned-work specs to use `AC-###` IDs and each behavior's Source to link to those spec criteria.

    As written, workers and artifact checks cannot follow a durable AC identifier from the authoritative spec to the 25 behaviors; list order is the only mapping and can drift on any spec edit. Add native IDs to the acceptance criteria rather than relying on plan-local positional aliases.

- id: PR-006
  dimension: quality-contract
  severity: low
  title: "The Quality Contract reverses the declared gate order"
  plan_refs: Quality Contract rows 4–5
  code_refs: domains/shared/skills/work-artifacts/references/gate-contracts.md:5-14
  description: |
    The canonical ladder orders `duplication` before `boundary-conformance` when both apply. This plan places bound `boundary-conformance` at order 4 and unbound `duplication` at order 5. Reorder the two rungs so task handoff and verification consume the standard ladder consistently.

## Missing Coverage

- Marker persistence failure or process interruption after a thrown `failed` episode has landed but before its attempt marker exists.
- A real first `LockHandle.release()` rejection followed by the caller backstop, asserting whether the plan lock is actually removable/reacquirable.
- Concurrent enabled updates using differently-cased spellings of the same task ID.
- A reuse/boundary decision covering the existing task-create and driver lock protocols before adding `episode-transition-lock.ts`.
- Native `AC-001`–`AC-009` labels in `spec.md` so behavior traceability does not depend on bullet position.

## Assessment

The plan remains viable but is not ready for task creation. Fix the terminal capture/marker interruption gap first: it currently permits the exact duplicate terminal pair this hardening exists to prevent.