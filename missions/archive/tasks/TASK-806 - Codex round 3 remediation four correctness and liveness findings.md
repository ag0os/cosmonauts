---
id: TASK-806
title: 'Codex round 3 remediation: four correctness and liveness findings'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-805
createdAt: '2026-09-29T22:12:35.129Z'
updatedAt: '2026-09-29T22:26:39.833Z'
---

## Description

Remediation slice for plan driver-hardening after codex review round 3 (`missions/reviews/codex/driver-hardening-round-3.md`, coordinator dispositions at its end). Each criterion is one accepted finding; round-3 finding 1 (Git text normalization inside the snapshot) was rejected by the coordinator as a D-020 recorded residual and is out of scope. Governed by D-001, D-004, D-006, D-018, D-020, D-021, D-022, D-030, D-033, D-034, D-035 and INV-001..006. Files: `lib/driver/report-parser.ts`, `lib/driver/runtime-helpers.ts`, `lib/driver/drive-finalization.ts`, `lib/driver/drive-graph-runner.ts`, `lib/driver/README.md`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (RED then GREEN per finding in the notes, D-030, with a mutation check); notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit; no suppression/threshold/baseline/ignore/config change; no `lib/durable-runtime/` change; no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC/D inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [x] #1 H1 (P1, B-013, INV-002): when the parser resolves a disagreement to blocked, the reason comes from a fenced report whose outcome is blocked (the last such report when several) when that report has notes, else from the raw text; notes from a non-blocked fenced report are never used as the reason. Test: fenced success with notes 'Finished' followed by fenced blocked with notes 'Need approval' yields blocked with notes 'Need approval'; both Drive paths record that verbatim reason in the task's Drive record.
- [x] #2 H2 (P2, B-011): runCommand settles on the child's exit even when a descendant keeps the stdout/stderr pipes open: after exit (or after the timeout/abort fires) it waits a bounded time for close, then destroys the pipes and resolves with what was captured, so a timed-out or aborted snapshot git whose descendant holds the pipe still fails the attempt within the bound. Test: a fake git child whose grandchild inherits the pipes and sleeps past the bound; the snapshot rejects with the git command named, within the bound, on both the timeout and the abort route; the existing G4 tests keep passing.
- [x] #3 H3 (P2, B-011, INV-006, D-035): removeDoneTaskSnapshots compares each snapshot path against the Drive commit (driver-commits) or HEAD (backend-commits) for paths those commits may contain, and against the working tree (git hash-object) for paths the commit policy leaves uncommitted (missions/**, memory/**, .cosmonauts/*.lock) and for every path under no-commit; the task's own file is exempt. Tests on both paths, all three commit policies, in a fixture that tracks its task file and ignores nothing relevant: a Done task whose worker discarded nothing loses its ref; a Done task whose worker discarded a snapshotted source file keeps its ref; a Done task whose worker discarded a snapshotted missions/ file other than its own task file keeps its ref; the README states the D-035 rule.
- [x] #4 H4 (P2, B-011, D-034): the graph runner's aborted and finalization_failed terminal results carry the retained snapshot refs collected from every completed task-status step, and run.completion.json names them, so a retained ref from an earlier Done task is never dropped by a later abort or finalization failure. Test: task A Done with a retained ref, then task B fails finalization; the completion record names A's ref; same for an abort after A.
- [x] #5 D-030: implementation notes record, per finding H1..H4, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; bun run test, bun run lint, bun run typecheck, bun run check:reachability, bun run check:suppressions -- --base main all pass; no .skip/.only/.todo; no lib/durable-runtime/ change; no config, suppression, threshold, baseline, or ignore change.
<!-- AC:END -->

## Implementation Notes

H1 RED at cd1b58eb0e41b464f871409a15403520d84cd2a5: `bun run test -- tests/driver/report-parser.test.ts`, `uses the last blocked fenced notes, never success notes, for a disagreement`: expected Need approval, received Finished; pinned prior conflicting success-only expectation now also fails (H1/INV-002).

H1 GREEN: `bun run test -- tests/driver/report-parser.test.ts tests/driver/run-one-task.test.ts tests/driver/drive-scheduler-backend.test.ts` (95 passed); mutation blocked→success in parser selection made parser test `uses the last blocked fenced notes...` red (Finished instead of Need approval), then restored.

H2 RED at cd1b58eb0e41b464f871409a15403520d84cd2a5: `bun run test -- tests/driver/worktree-snapshot-timeout.test.ts`, `settles a timeout snapshot git despite inherited pipes`: 2321ms exceeded 1800ms (grandchild held pipe after child's 180ms timeout). Abort case currently resolves early on AbortError; tested ready descendant too.

H2 GREEN: `bun run test -- tests/driver/worktree-snapshot-timeout.test.ts tests/driver/worktree-snapshot.test.ts` (17 passed). Mutation exit grace 250→2500ms produced red `settles a timeout snapshot git despite inherited pipes` (2321ms > 1800ms); restored.

H3 RED at cd1b58eb0e41b464f871409a15403520d84cd2a5: `bun run test -- tests/driver/worktree-snapshot.test.ts`, `%s protects worker bytes but exempts Drive's own task status`: all 3 policies retained ref for `none` despite no discarded bytes; expected [].

H4 RED at cd1b58eb0e41b464f871409a15403520d84cd2a5: `bun run test -- tests/driver/drive-on-graph-acceptance.test.ts -t 'carries an earlier Done task'`, both aborted and finalization_failed results have undefined retainedSnapshots instead of A's ref.

H4 GREEN: `bun run test -- tests/driver/drive-on-graph-acceptance.test.ts -t 'carries an earlier Done task'` (2 passed). Mutation omitting retained refs from aborted and finalization_failed results made both cases red (undefined instead of A's ref); restored.

H3 GREEN: `bun run test -- tests/driver/worktree-snapshot.test.ts` (15 passed), and `bun run test -- tests/driver/run-one-task.test.ts tests/driver/drive-on-graph-acceptance.test.ts -t 'cleans only contained|compares Done snapshots'` (6 policy/path suites passed). Mutation skipped worktree comparison for missions under driver-commits: `driver-commits protects worker bytes but exempts Drive's own task status` red (retained innocent ref); restored. README reviewed against D-035.

H1 edge RED at cd1b58eb0e41b464f871409a15403520d84cd2a5: `bun run test -- tests/driver/report-parser.test.ts`, `falls back to raw text when the last blocked report has no notes` received stale earlier blocked notes. GREEN after selecting last blocked report then notes: same command 18 passed. Mutation .at(-1)→.at(0) made last-notes and raw-fallback tests red; restored. Changed-scope audit `analysis_audit(base: cd1b58eb0e41b464f871409a15403520d84cd2a5)` unbound: execution-not-consented (not a clean result).

Final verification after all changes: `bun run test` 293 files / 4159 tests passed; `bun run lint`, `bun run typecheck`, `bun run check:reachability` (214/214 runtime modules), `bun run check:suppressions -- --base main` all pass. `git diff --check` clean; no .skip/.only/.todo added. No lib/durable-runtime, suppression, config, threshold, baseline, ignore, or memory edits. Final `analysis_audit(base: cd1b58eb0e41b464f871409a15403520d84cd2a5)` unbound due to execution-not-consented, not evidence of a clean audit. No commit/staging under driver-commits.