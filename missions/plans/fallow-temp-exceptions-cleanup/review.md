# Plan Review: fallow-temp-exceptions-cleanup

## Findings

- id: F-001
  severity: blocker
  task_id: W5-01
  title: Capstone dependencies and scope do not match the duplication baseline
  evidence:
    - missions/plans/fallow-temp-exceptions-cleanup/plan.md:732-743
    - missions/plans/fallow-temp-exceptions-cleanup/plan.md:848-856
    - .fallow/baselines/dupes.json:33-41
    - .fallow/baselines/dupes.json:42-80
    - .fallow/baselines/dupes.json:81-222
  description: |
    W5-01 is declared to depend only on T0a, T0b, and all Wave 1 CLI command tasks, but the baseline contains many clone groups outside Wave 1: update/installer source clones, orchestration extension/spawner/chain-runner clones, domain extension clones, package/task manager source clones, and extensive runtime/domain/orchestration/package/session test clones. Those groups are not removed by the Wave 1 command refactors.

    The implementation order says Wave 5 runs after Wave 4, but the task dependency line does not encode that. A task manager following the task spec could schedule W5 before Waves 2-4, and even after Waves 2-4 the baseline still includes unrelated clone clusters not covered by any per-function task. The single capstone is likely to become a large, unplanned refactor across many files.
  suggested_fix: Make W5-01 depend on all Wave 2, Wave 3, and Wave 4 tasks, then either add explicit tasks for the remaining baseline clone families or narrow W5-01 to a verified residual list after those waves land.

- id: F-002
  severity: major
  task_id: W4-05
  title: `matchesFilter` existing coverage does not cover multiple priority or missing-priority behavior
  evidence:
    - missions/plans/fallow-temp-exceptions-cleanup/plan.md:709-720
    - lib/tasks/task-manager.ts:363-370
    - tests/tasks/task-manager.test.ts:373-381
  description: |
    The plan marks W4-05 as `existing-coverage-sufficient` and lists priority single/multiple plus “missing priority fails” as current responsibilities. The implementation has explicit array handling and a `!task.priority` rejection path. The cited tests only cover a single priority filter returning two high-priority tasks; they do not pass `priority: ["high", "low"]` and do not assert that an unprioritized task is excluded when priority is filtered.
  suggested_fix: Change W4-05 to `add-characterization-tests` or add pre-refactor tests for multiple priority values and missing-priority exclusion.

- id: F-003
  severity: major
  task_id: W4-02
  title: `validateManifest` non-object/null/array error accumulation is not actually characterized
  evidence:
    - missions/plans/fallow-temp-exceptions-cleanup/plan.md:653-662
    - lib/packages/manifest.ts:64-70
    - tests/packages/manifest.test.ts:214-233
  description: |
    The plan claims existing tests cover “missing fields/non-object,” and the responsibility text includes rejecting non-object/array/null inputs with required missing fields. The implementation returns exactly four `{ field, reason: "missing" }` errors for non-object, null, and array inputs. The cited test only passes a string and asserts `errors.length > 0`; it does not verify the four required fields, null, or array handling.
  suggested_fix: Change W4-02 to require characterization tests for string, null, and array inputs, asserting the exact missing-field error set/order if order is intended to be preserved.

- id: F-004
  severity: major
  task_id: W3-05
  title: `buildSummary` stage/tool edge behavior is not covered despite `existing-coverage-sufficient`
  evidence:
    - missions/plans/fallow-temp-exceptions-cleanup/plan.md:592-602
    - lib/orchestration/chain-profiler.ts:361-376
    - lib/orchestration/chain-profiler.ts:442-456
    - lib/orchestration/chain-profiler.ts:459-489
    - tests/orchestration/chain-profiler.test.ts:623-629
    - tests/orchestration/chain-profiler.test.ts:649-678
  description: |
    W3-05 says existing coverage is sufficient for the full summary report, including stage breakdown and tool sections. The tests assert section headers and selected top-20/orphan/per-agent behavior, but there are no assertions for actual stage breakdown rows, incomplete stage rendering, the “(no stages recorded)” placeholder, slowest-tool `[error]` tags, empty slowest/per-agent placeholders, or the full pending-tool line fields.

    Those branches are in the suppressed function and could change during section extraction without the cited tests failing.
  suggested_fix: Mark W3-05 as `add-characterization-tests` for the unasserted summary branches before extracting section renderers.

- id: F-005
  severity: major
  task_id: QC-001
  title: Suppression-removal verifier always exits successfully
  evidence:
    - missions/plans/fallow-temp-exceptions-cleanup/plan.md:815-820
    - cli/main.ts:104
    - lib/tasks/task-manager.ts:351
  description: |
    QC-001’s verifier command is `grep -R "fallow-ignore-next-line complexity" cli lib domains/shared/extensions/orchestration || true`. Because of `|| true`, the command succeeds even when suppressions are still present, so it cannot verify the criterion. The current codebase has matching suppressions at the cited lines and many others.
  suggested_fix: Replace the command with a failing negative grep, e.g. `! grep -R "fallow-ignore-next-line complexity" cli lib domains/shared/extensions/orchestration`, or an equivalent script that exits non-zero on matches.

## Missing Coverage

- W5-01 does not enumerate or budget clone families outside CLI command/test duplication, despite the baseline spanning runtime, workflow, domain, package scanner/installer/eject, orchestration, extension, and session tests.
- W4-05 lacks characterization for array priority filtering and tasks with no priority under a priority filter.
- W4-02 lacks exact non-object/null/array manifest validation assertions.
- W3-05 lacks summary-rendering assertions for several non-happy-path output branches.
- QC-001 lacks an executable failing check for residual inline complexity suppressions.

## Assessment

Verdict: revise. The plan is directionally viable for removing inline suppressions, but the duplication-baseline capstone is under-scoped and incorrectly gated; fix W5-01 before task creation, then tighten the `existing-coverage-sufficient` claims above.
