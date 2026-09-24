# Review Report

base: 9be076b1ca06b2e9a1131e8c2da5bc8ac3463356
range: 9be076b1ca06b2e9a1131e8c2da5bc8ac3463356..HEAD
overall: incorrect

## Overall Assessment

Stage 3 is incorrect because explicit and resumed Drive selections can execute a Cancelled task, and deleting the spawn compiler contradicts still-active, human-ratified architecture. The targeted 277-test regression set, reachability check, lint, typecheck, and the full 3,028-test suite with an isolated HOME pass, but two shared-code mutation controls are also missing; commit `05b021e` and execution-liveness artifacts were excluded as requested.

## Findings

- id: F-001
  priority: P1
  severity: high
  confidence: 1.0
  complexity: complex
  title: "[P1] Explicit and resumed Drive runs can execute Cancelled tasks"
  files: cli/drive/subcommand.ts, domains/shared/extensions/orchestration/driver-tool.ts, lib/driver/drive-scheduler-backend.ts, lib/tasks/task-types.ts
  lineRange: cli/drive/subcommand.ts:1017-1025
  summary: Reproduction: persist `TASK-001` with `status: Cancelled`, then invoke `cosmonauts run drive --plan p --task-ids TASK-001` (or `run_driver` with `taskIds: ["TASK-001"]`); this branch returns the explicit ID unchanged, as does `driver-tool.ts:321-322`, and the backend then changes it to `In Progress` at `drive-scheduler-backend.ts:209`. A direct production `runDriveOnGraph` reproduction called the backend, returned `completed`, and left the task `Done`; a graph resume likewise retains its original pending IDs. Impact: work explicitly closed as “will never be done” can run and overwrite its honest terminal state, contrary to B-012/D-026 and the documented “never selected” contract.
  suggestedFix: Validate persisted task status at the shared Drive launch/resume boundary and reject or skip Cancelled IDs before any backend/finalizer runs; cover CLI, `run_driver`, and graph resume while preserving explicit-Done behavior if that remains intentional.
  task:
    title: "Prevent Drive from reopening Cancelled tasks"
    labels: "driver, tasks, testing"
    acceptanceCriteria:
      1. Explicit CLI and `run_driver` task IDs cannot execute a task whose persisted status is Cancelled.
      2. A resumed graph whose pending task was Cancelled does not invoke the backend or change that task's status.
      3. Caller-facing regressions cover CLI, tool, and resume paths.

- id: F-002
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "[P2] Spawn compiler deletion contradicts ratified active architecture"
  files: lib/orchestration/spawn-compiler.ts, tests/orchestration/spawn-compiler.test.ts, missions/architecture/durable-orchestration-runtime.md, missions/architecture/orchestration-future.md
  lineRange: missions/architecture/durable-orchestration-runtime.md:160-208
  summary: Reproduction: `await import("./lib/orchestration/spawn-compiler.ts")` now fails with module-not-found, while active D-012 still says `compileSpawnToGraph` defines spawn's modeled one-node shape, D-014 says it produces that graph, and `orchestration-future.md:247` still describes the compiler as shipped scaffolding. Impact: the deletion makes the active architecture's current-state and implementation boundary false and forces the next orchestration worker either to recreate ratified behavior or silently deviate; B-010 allowed wiring or owner-backed staging, so deletion was not the only conforming orphan resolution.
  suggestedFix: Restore the compiler and its behavioral test, then wire it or declare it staged under a live owner. If removal is desired, halt for a human-approved architecture amendment rather than changing ratified D-012/D-014 implicitly.
  task:
    title: "Resolve the spawn compiler deletion against ratified architecture"
    labels: "architecture, orchestration"
    acceptanceCriteria:
      1. A human decision selects preservation or explicitly amends D-012/D-014 before their contract changes.
      2. If preserved, the compiler shape and regression test are restored and the reachability gate has a valid wired or staged path.
      3. Active architecture and shipped state no longer contradict each other.

- id: F-003
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "[P2] Cancelled episode outcomes lack regression evidence"
  files: lib/tasks/task-manager.ts, tests/tasks/task-manager.test.ts, tests/extensions/task-tools.test.ts
  lineRange: lib/tasks/task-manager.ts:50-55
  summary: Reproduction: with episodic logging enabled, change a task from `To Do` to `Cancelled`, then mutate the new mapping to `Cancelled: "blocked"`; the current suite remains green because episode assertions cover only `to-do`, `in-progress`, and `done` (`task-manager.test.ts:161-178`, `task-tools.test.ts:107-114`). Impact: a realistic regression in this expanded shared status union could persist false cancellation history for recall and audit consumers without any caller-facing test failing.
  suggestedFix: Extend an enabled TaskManager or task-tool lifecycle test to assert a `task.status-changed` episode with outcome `cancelled` and the correct previous/current statuses.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. An enabled caller changing a task to Cancelled persists an episode whose outcome is `cancelled`.
      2. Mapping Cancelled to another outcome makes the regression test fail.

- id: F-004
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "[P2] Runtime re-export reachability has no negative-control test"
  files: scripts/check-reachability.ts, tests/scripts/check-reachability.test.ts, lib/architecture-map/index.ts
  lineRange: scripts/check-reachability.ts:147-156
  summary: Reproduction: make a declared public root contain `export * from "./implementation.ts"`, then remove or break this new `ExportDeclaration` branch; all 22 reachability tests remain green because they exercise imports, dynamic imports, runner modules, and convention roots but no re-export, while the check falsely reports the runtime implementation orphaned. Existing public roots such as `lib/architecture-map/index.ts:18` use runtime re-exports. Impact: a realistic walker regression can block the gate or misclassify shipped code for deletion without the reachability suite detecting it.
  suggestedFix: Add synthetic `export * from`, named value re-export, and type-only re-export fixtures; value re-exports must reach the target and type-only re-exports must not.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Runtime re-exports from a declared root keep their target reachable.
      2. Type-only re-exports remain excluded, and mutating either distinction makes the tests fail.
