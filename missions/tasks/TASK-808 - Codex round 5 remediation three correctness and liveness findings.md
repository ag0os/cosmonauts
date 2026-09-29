---
id: TASK-808
title: 'Codex round 5 remediation: three correctness and liveness findings'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-807
createdAt: '2026-09-29T22:58:38.102Z'
updatedAt: '2026-09-29T23:20:51.401Z'
---

## Description

Remediation slice for plan driver-hardening after codex review round 5 (`missions/reviews/codex/driver-hardening-round-5.md`, coordinator dispositions at its end). Governed by D-001, D-004, D-006, D-018, D-019, D-020, D-021, D-022, D-030, D-033, D-034, D-035, D-036 and INV-001..006; AC-012 as amended by H-001. Files: `bundled/coding/extensions/execution-probe/index.ts`, `lib/driver/runtime-helpers.ts`, `lib/driver/drive-finalization.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/README.md`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (RED then GREEN per finding in the notes, D-030, with a mutation check); notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit; no suppression/threshold/baseline/ignore/config change; no `lib/durable-runtime/` change; no `domains/shared/extensions/` change (D-025); no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC/D inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [x] #1 L1 (P1, B-008, AC-012/H-001): after the command, an instrumented file whose digest differs from its instrumented digest counts as modified by the command even when it equals the original digest; such a run reports the path in sideEffects, restores the file, and reports usableZero false. Test: a test command that restores the instrumented file to its original bytes and exits 0 without running the marker yields usableZero false with the path in sideEffects; the existing restore and termination-error tests keep passing.
- [x] #2 L2 (P1, B-011): runCommand tracks its own timeout timer: when it fires, the result is termination 'timeout' regardless of the child's exit code or signal (a child that handles SIGTERM and exits 0 is still a timeout), SIGKILL is sent after a bounded grace if the child has not exited, and the promise settles by the bound plus the grace even if the child never exits or closes. Tests: a fake git that ignores SIGTERM makes the snapshot reject within the bound naming the command on both Drive paths; a fake git that handles SIGTERM and exits 0 after the timer is reported as timed out, not as success; the K1/H2/G4 tests keep passing.
- [x] #3 L3 (P2, B-011, D-036): the task's path at snapshot time is recorded with the attempt (from the task manager before the snapshot) and terminal cleanup exempts both that path and the final path, so a task whose title was edited during the attempt loses its task-only snapshot ref on Done. Test on both Drive paths: worker edits the title through task_edit and reports success; the ref is deleted; a renamed task whose worker also discarded a snapshotted source file keeps its ref.
- [x] #4 D-030: implementation notes record, per finding L1..L3, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; bun run test, bun run lint, bun run typecheck, bun run check:reachability, bun run check:suppressions -- --base main all pass; no .skip/.only/.todo; no lib/durable-runtime/ or domains/shared/extensions/ change; no config, suppression, threshold, baseline, or ignore change.
<!-- AC:END -->

## Implementation Notes

L1 RED at 299546116cba52db075e02dc1935de69743c66c7: `bun run test -- tests/extensions/execution-probe.test.ts -t 'invalidates zero when the command removes instrumentation'` failed: received sideEffects [] and usableZero true instead of [entry.js] and false.

L1 GREEN `bun run test -- tests/extensions/execution-probe.test.ts`: 18 passed (including restore/termination). Mutation: compared current digest to original instead of instrumented; targeted test failed with sideEffects [] / usableZero true; restored comparison.

L2 RED at 299546116cba52db075e02dc1935de69743c66c7: `bun run test -- tests/driver/worktree-snapshot-timeout.test.ts -t 'labels a child that exits zero'` failed: received termination exit / exitCode 0 rather than timeout / 124.

L3 RED at 299546116cba52db075e02dc1935de69743c66c7: `bun run test -- tests/driver/run-one-task.test.ts tests/driver/drive-on-graph-acceptance.test.ts -t 'renamed task'` failed on legacy and graph: task-only renamed snapshot retained (`[refs/cosmonauts/drive/.../attempt-1]` vs undefined); discard cases passed.

L3 GREEN `bun run test -- tests/driver/run-one-task.test.ts tests/driver/drive-on-graph-acceptance.test.ts -t 'renamed task'`: 4 passed on both paths (rename clean and discarded source). Mutation: remove old-path exemption; both clean-rename tests fail retaining the snapshot; restored.

L2 GREEN `bun run test -- tests/driver/worktree-snapshot-timeout.test.ts`: 16 passed, including legacy/graph SIGTERM-ignoring git, exit-0-on-SIGTERM, never-exit/close, K1/H2/G4. Mutation: remove SIGKILL at grace; both path tests fail with observed signals [SIGTERM] instead of [SIGTERM,SIGKILL]; restored.

Changed-scope analysis_audit(base 299546116cba52db075e02dc1935de69743c66c7) unbound: execution-not-consented (Fallow); unavailable evidence, not a clean audit. First full `bun run test` 4207/4208 passed; failure in existing warning test under suite contention (50ms deadline preceded Node fixture startup, stderr 'timed out (SIGTERM)' instead of 'warning\n'); increased deadline to 500ms without changing its expectation, rerunning required gate. `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main` pass.

Second full `bun run test` 4207/4208 passed; unrelated detached-driver fixture raced abort before launch under suite load (`tests/driver/driver-detached.test.ts` 'escalates an ignored SIGTERM': `promise rejected "Error: Detached driver start aborted" instead of resolving`, at `lib/driver/driver.ts:712`). Isolated `bun run test -- tests/driver/driver-detached.test.ts -t 'escalates an ignored SIGTERM'` passed; no changes to that seam. Rerunning full gate.

Final verification: `bun run test` 293 files / 4208 tests passed (after explicit ref-presence assertions on both Drive paths); `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main` passed. No .skip/.only/.todo in changed tests; no lib/durable-runtime/, domains/shared/extensions/, config/suppression/threshold/baseline/ignore edits. A concurrent/unrelated untracked `missions/reviews/qm/driver-hardening-run-1/` appeared after tests; left untouched and is not part of task changes. Audit unbound (execution-not-consented).

L3 final tests now invoke the shipped `task_edit` tool in each fake worker (not just TaskManager.updateTask) and assert the snapshot ref's actual Git existence/absence. Final `bun run test` 293/293 files, 4208/4208 tests pass; lint/typecheck/reachability/suppression gates pass. No task-owned missions or memory source edits beyond task_edit notes/checks; unrelated untracked QM review remains untouched. Changed-scope audit with literal task-start SHA remains unbound (execution-not-consented).