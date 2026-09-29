---
id: TASK-805
title: 'Codex round 2 remediation: five correctness and liveness findings'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-804
createdAt: '2026-09-29T21:35:34.390Z'
updatedAt: '2026-09-29T21:35:34.390Z'
---

## Description

Remediation slice for plan driver-hardening after codex review round 2 (`missions/reviews/codex/driver-hardening-round-2.md`, coordinator dispositions at its end). Each criterion is one accepted finding; round-2 findings 3 and 4 were rejected by the coordinator (D-019 residual; B-009 recorded residual) and are out of scope. Governed by D-001, D-004, D-006, D-018, D-020, D-021, D-022, D-030, D-033, D-034 and INV-001..006. Files: `lib/driver/report-parser.ts`, `lib/driver/runtime-helpers.ts`, `lib/driver/drive-finalization.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/README.md`, `docs/orchestration.md`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (RED then GREEN per finding in the notes, D-030, with a mutation check); notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit; no suppression/threshold/baseline/ignore/config change; no `lib/durable-runtime/` change; no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC/D inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [ ] #1 G1 (P1, B-013, INV-002/INV-004): when a response contains both a fenced JSON report and an `outcome:` line (or two forms that disagree), the parser never resolves the disagreement to `success`: if either form says `blocked` the report is blocked (reason from the JSON `notes` when present, else the raw text); any other disagreement yields `unknown` with raw retained; agreeing forms behave as today. Tests: fenced success + final `outcome: blocked` is blocked on both Drive paths with no postflight and no retry; fenced failure + final `outcome: success` is unknown.
- [ ] #2 G2 (P1, B-011, INV-006, D-034): terminal cleanup deletes a Done task's snapshot refs only when every path in the snapshot tree is byte-identical in the task's final tree (Drive commit under driver-commits, HEAD under backend-commits, worktree under no-commit); otherwise the ref is kept and the run's terminal record (run.completion.json / run_completed summary, and the Drive README) names the retained ref. Tests on both paths: a Done task whose final tree lacks a snapshotted file keeps its ref; a Done task whose final tree contains every snapshotted byte loses its ref as before; blocked keeps its refs.
- [ ] #3 G3 (P2, B-011, AC-015): `reportSummary` classifies the final normalized value (after stripping `implemented|status|summary:` prefixes and truncation) so `summary: outcome: success` and `summary: {"outcome":"success"}` yield undefined and the commit subject falls back to the task title on both paths.
- [ ] #4 G4 (P2, B-011): `snapshotWorktree` and the ref cleanup run every git process through the attempt's abortable runner (`runCommand` with the attempt's AbortSignal and a bound), not `execFileSync`; an aborted attempt cancels an in-flight snapshot git process and fails the attempt with a reason naming the git command; the existing timeout test keeps passing.
- [ ] #5 G5 (P2, B-002, INV-003): `task_retry` is emitted after the next attempt's preparation (prompt render and worktree snapshot) succeeds and immediately before that attempt's `spawn_started`, on both paths; a retry whose preparation fails emits no `task_retry` and the attempt's failure/abort is recorded as today. Tests: preparation failure yields no `task_retry`; the success path still shows `task_retry` before the second `spawn_started` and after attempt 1's block evidence.
- [ ] #6 D-030: implementation notes record, per finding G1..G5, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main` all pass; no `.skip/.only/.todo`; no `lib/durable-runtime/` change; no config, suppression, threshold, baseline, or ignore change.
<!-- AC:END -->
