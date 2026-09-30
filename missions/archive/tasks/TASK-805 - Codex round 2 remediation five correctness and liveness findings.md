---
id: TASK-805
title: 'Codex round 2 remediation: five correctness and liveness findings'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-804
createdAt: '2026-09-29T21:35:34.390Z'
updatedAt: '2026-09-29T22:02:09.155Z'
---

## Description

Remediation slice for plan driver-hardening after codex review round 2 (`missions/reviews/codex/driver-hardening-round-2.md`, coordinator dispositions at its end). Each criterion is one accepted finding; round-2 findings 3 and 4 were rejected by the coordinator (D-019 residual; B-009 recorded residual) and are out of scope. Governed by D-001, D-004, D-006, D-018, D-020, D-021, D-022, D-030, D-033, D-034 and INV-001..006. Files: `lib/driver/report-parser.ts`, `lib/driver/runtime-helpers.ts`, `lib/driver/drive-finalization.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/README.md`, `docs/orchestration.md`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (RED then GREEN per finding in the notes, D-030, with a mutation check); notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit; no suppression/threshold/baseline/ignore/config change; no `lib/durable-runtime/` change; no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC/D inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [x] #1 G1 (P1, B-013, INV-002/INV-004): when a response contains both a fenced JSON report and an `outcome:` line (or two forms that disagree), the parser never resolves the disagreement to `success`: if either form says `blocked` the report is blocked (reason from the JSON `notes` when present, else the raw text); any other disagreement yields `unknown` with raw retained; agreeing forms behave as today. Tests: fenced success + final `outcome: blocked` is blocked on both Drive paths with no postflight and no retry; fenced failure + final `outcome: success` is unknown.
- [x] #2 G2 (P1, B-011, INV-006, D-034): terminal cleanup deletes a Done task's snapshot refs only when every path in the snapshot tree is byte-identical in the task's final tree (Drive commit under driver-commits, HEAD under backend-commits, worktree under no-commit); otherwise the ref is kept and the run's terminal record (run.completion.json / run_completed summary, and the Drive README) names the retained ref. Tests on both paths: a Done task whose final tree lacks a snapshotted file keeps its ref; a Done task whose final tree contains every snapshotted byte loses its ref as before; blocked keeps its refs.
- [x] #3 G3 (P2, B-011, AC-015): `reportSummary` classifies the final normalized value (after stripping `implemented|status|summary:` prefixes and truncation) so `summary: outcome: success` and `summary: {"outcome":"success"}` yield undefined and the commit subject falls back to the task title on both paths.
- [x] #4 G4 (P2, B-011): `snapshotWorktree` and the ref cleanup run every git process through the attempt's abortable runner (`runCommand` with the attempt's AbortSignal and a bound), not `execFileSync`; an aborted attempt cancels an in-flight snapshot git process and fails the attempt with a reason naming the git command; the existing timeout test keeps passing.
- [x] #5 G5 (P2, B-002, INV-003): `task_retry` is emitted after the next attempt's preparation (prompt render and worktree snapshot) succeeds and immediately before that attempt's `spawn_started`, on both paths; a retry whose preparation fails emits no `task_retry` and the attempt's failure/abort is recorded as today. Tests: preparation failure yields no `task_retry`; the success path still shows `task_retry` before the second `spawn_started` and after attempt 1's block evidence.
- [x] #6 D-030: implementation notes record, per finding G1..G5, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main` all pass; no `.skip/.only/.todo`; no `lib/durable-runtime/` change; no config, suppression, threshold, baseline, or ignore change.
<!-- AC:END -->

## Implementation Notes

Start base SHA 4f271bb4d02b35473820e96e68b80e4324ee171b; Drive driver-commits, no staging/commit.

### Coordinator note before attempt 1 (2026-09-29, handoff)

Run `run-0b77042c` was launched at 21:35:52Z and stopped by the coordinator ~1 minute later on Shepherd's instruction (context budget); it is not a Drive verdict on this task. The worker's partial edit to `tests/driver/report-parser.test.ts` (a G1 red test in progress) was snapshotted to `refs/cosmonauts/coordinator/TASK-805-attempt-1` and the file restored to HEAD; the tree is clean. Start fresh: the criteria G1..G5 stand as written; read `missions/reviews/codex/driver-hardening-round-2.md` (dispositions at the end) and plan D-034 before G2.

G1 parser RED at b4271587bccb163764ddefe4c9ed997171de4768: `bun run test -- tests/driver/report-parser.test.ts`, `treats a blocked outcome line conflicting with fenced success as blocked`: expected blocked, received success. GREEN same command: 13 passed. Mutation check: pre-fix precedence (return first fenced report) produced the recorded RED; additional path-level checks pending.

G3 RED b4271587bccb163764ddefe4c9ed997171de4768: `bun run test -- tests/driver/worktree-snapshot.test.ts`, `rejects normalized report marker` received `outcome: success` and JSON instead of undefined. GREEN same command: 7 passed. Mutation check: original pre-normalization classification produced both recorded failures.

G1 mutation: changed conflict blocked branch to false, `bun run test -- tests/driver/report-parser.test.ts` failed 2 blocked-conflict tests (unknown instead of blocked); restored branch. Both legacy `runOneTask` and graph scheduler integration tests cover no verify/no retry.

G2 RED baseline b4271587bccb163764ddefe4c9ed997171de4768: `bun run test -- tests/driver/worktree-snapshot.test.ts` `retains snapshot bytes missing from final worktree`: expected [ref], got undefined (old cleanup returned void/deleted ref). GREEN same command after fix: 11 passed. Mutation check: disabled per-path hash comparison, same command failed 3 tests (missing worktree and two commit-policy trees expected retained [ref], got []). Restored comparison. Graph completion/event integration confirmed retained refs.

G3 mutation check at b4271587bccb163764ddefe4c9ed997171de4768: disabled normalized outcome-marker rejection; `bun run test -- tests/driver/worktree-snapshot.test.ts` failed `rejects normalized report marker summary: outcome: success as a commit summary`: received 'outcome: success' instead of undefined; restored. Legacy/graph commit-subject table tests pass.

G4 RED baseline b4271587bccb163764ddefe4c9ed997171de4768: `bun run test -- tests/driver/worktree-snapshot.test.ts`, `cancels a snapshot git command on abort and identifies the command`: resolved snapshot ref instead of rejecting. GREEN `bun run test -- tests/driver/worktree-snapshot-timeout.test.ts`: 3 passed (in-flight abort; simulated stalled preflight/add/delete; bound runner). Mutation check: removed timeout bound from git runner, same command failed 3 tests (unbounded runner; abort/timeout no longer observed). Restored bound.

G5 RED baseline b4271587bccb163764ddefe4c9ed997171de4768: `bun run test -- tests/driver/contradicted-block-retry.test.ts`, `does not announce a retry when preparing its prompt fails`: task_retry present. GREEN same command: 6 passed; graph retry preparation failure also passes. Mutation check: emitted retry ahead of attempt preparation, same command failed no-retry-on-failed-preparation and once-only-retry tests; restored.

G1 final: conflicting fenced JSON/line and two fenced reports tested; `bun run test -- tests/driver/report-parser.test.ts` 16 passed; legacy and graph integration tested blocked with no postflight/retry. Mutation and red evidence recorded above.

G2 final: `bun run test -- tests/driver/worktree-snapshot.test.ts tests/driver/drive-on-graph-acceptance.test.ts tests/driver/run-one-task.test.ts tests/driver/drive-scheduler-backend.test.ts` passed in focused run. Byte comparison covers no-commit worktree and committed final trees; both paths retain discarded bytes and remove contained snapshots; graph terminal record/event carries retained ref; blocked retains refs. D-034 supersedes D-020 cleanup.

G3 final: normalized report markers rejected and both graph/legacy commit-subject tables fall back to task title; focused run 124 tests passed. Red/green/mutation recorded above.

G4 final: every snapshot/cleanup git process uses bounded runCommand with attempt signal. Simulated stalled preflight/add/delete and in-flight abort tests pass, plus prior snapshot timeout behavior preserved by runner-based replacement. Red/green/mutation recorded above.

G5 final: both retry paths emit after prompt/snapshot succeeds and before spawn_started; failed retry preparation emits no retry in legacy and graph tests; earlier block evidence and retry ordering tests remain green. Red/green/mutation recorded above.

G2 extra edge: Git snapshot trees may include gitlinks; initially a test fixture with a missing submodule worktree caused Git's temp-index add to drop the link (invalid RED). Corrected fixture to use a real nested Git worktree. `retains a snapshot when the final commit drops a captured gitlink` RED with blob-only tree parser: expected [ref], received []; GREEN with blob-or-commit parser: 12 passed. Mutation restoring blob-only parser failed that test again; restored. Prior G2 missing-file RED note reflects old cleanup behavior, but its first run also had an incomplete helper during implementation; this corrected RED/mutation gives valid per-path evidence.

D-030 final: task-start audit base b4271587bccb163764ddefe4c9ed997171de4768. `analysis_audit({base:"b4271587bccb163764ddefe4c9ed997171de4768"})` unbound (fallow execution-not-consented), unavailable evidence, not a clean result. Required gates all passed: `bun run test` (293 files/4144 tests), `bun run lint`, `bun run typecheck`, `bun run check:reachability` (214/214), `bun run check:suppressions -- --base main`. `git diff --check` clean, no .skip/.only/.todo in touched tests, no durable-runtime/config/suppression/threshold/baseline/ignore edits. No staging/commit per driver-commits. G1..G5 red/green/mutation evidence in preceding append notes; G2 gitlink edge RED/green/mutation additionally verified.