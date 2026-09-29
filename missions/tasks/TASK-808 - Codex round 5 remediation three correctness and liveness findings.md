---
id: TASK-808
title: 'Codex round 5 remediation: three correctness and liveness findings'
status: To Do
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-807
createdAt: '2026-09-29T22:58:38.102Z'
updatedAt: '2026-09-29T22:58:38.102Z'
---

## Description

Remediation slice for plan driver-hardening after codex review round 5 (`missions/reviews/codex/driver-hardening-round-5.md`, coordinator dispositions at its end). Governed by D-001, D-004, D-006, D-018, D-019, D-020, D-021, D-022, D-030, D-033, D-034, D-035, D-036 and INV-001..006; AC-012 as amended by H-001. Files: `bundled/coding/extensions/execution-probe/index.ts`, `lib/driver/runtime-helpers.ts`, `lib/driver/drive-finalization.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/README.md`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (RED then GREEN per finding in the notes, D-030, with a mutation check); notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit; no suppression/threshold/baseline/ignore/config change; no `lib/durable-runtime/` change; no `domains/shared/extensions/` change (D-025); no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC/D inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [ ] #1 L1 (P1, B-008, AC-012/H-001): after the command, an instrumented file whose digest differs from its instrumented digest counts as modified by the command even when it equals the original digest; such a run reports the path in sideEffects, restores the file, and reports usableZero false. Test: a test command that restores the instrumented file to its original bytes and exits 0 without running the marker yields usableZero false with the path in sideEffects; the existing restore and termination-error tests keep passing.
- [ ] #2 L2 (P1, B-011): runCommand tracks its own timeout timer: when it fires, the result is termination 'timeout' regardless of the child's exit code or signal (a child that handles SIGTERM and exits 0 is still a timeout), SIGKILL is sent after a bounded grace if the child has not exited, and the promise settles by the bound plus the grace even if the child never exits or closes. Tests: a fake git that ignores SIGTERM makes the snapshot reject within the bound naming the command on both Drive paths; a fake git that handles SIGTERM and exits 0 after the timer is reported as timed out, not as success; the K1/H2/G4 tests keep passing.
- [ ] #3 L3 (P2, B-011, D-036): the task's path at snapshot time is recorded with the attempt (from the task manager before the snapshot) and terminal cleanup exempts both that path and the final path, so a task whose title was edited during the attempt loses its task-only snapshot ref on Done. Test on both Drive paths: worker edits the title through task_edit and reports success; the ref is deleted; a renamed task whose worker also discarded a snapshotted source file keeps its ref.
- [ ] #4 D-030: implementation notes record, per finding L1..L3, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; bun run test, bun run lint, bun run typecheck, bun run check:reachability, bun run check:suppressions -- --base main all pass; no .skip/.only/.todo; no lib/durable-runtime/ or domains/shared/extensions/ change; no config, suppression, threshold, baseline, or ignore change.
<!-- AC:END -->
