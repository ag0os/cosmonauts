---
id: TASK-806
title: 'Codex round 3 remediation: four correctness and liveness findings'
status: To Do
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-805
createdAt: '2026-09-29T22:12:35.129Z'
updatedAt: '2026-09-29T22:12:35.129Z'
---

## Description

Remediation slice for plan driver-hardening after codex review round 3 (`missions/reviews/codex/driver-hardening-round-3.md`, coordinator dispositions at its end). Each criterion is one accepted finding; round-3 finding 1 (Git text normalization inside the snapshot) was rejected by the coordinator as a D-020 recorded residual and is out of scope. Governed by D-001, D-004, D-006, D-018, D-020, D-021, D-022, D-030, D-033, D-034, D-035 and INV-001..006. Files: `lib/driver/report-parser.ts`, `lib/driver/runtime-helpers.ts`, `lib/driver/drive-finalization.ts`, `lib/driver/drive-graph-runner.ts`, `lib/driver/README.md`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (RED then GREEN per finding in the notes, D-030, with a mutation check); notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit; no suppression/threshold/baseline/ignore/config change; no `lib/durable-runtime/` change; no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC/D inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [ ] #1 H1 (P1, B-013, INV-002): when the parser resolves a disagreement to blocked, the reason comes from a fenced report whose outcome is blocked (the last such report when several) when that report has notes, else from the raw text; notes from a non-blocked fenced report are never used as the reason. Test: fenced success with notes 'Finished' followed by fenced blocked with notes 'Need approval' yields blocked with notes 'Need approval'; both Drive paths record that verbatim reason in the task's Drive record.
- [ ] #2 H2 (P2, B-011): runCommand settles on the child's exit even when a descendant keeps the stdout/stderr pipes open: after exit (or after the timeout/abort fires) it waits a bounded time for close, then destroys the pipes and resolves with what was captured, so a timed-out or aborted snapshot git whose descendant holds the pipe still fails the attempt within the bound. Test: a fake git child whose grandchild inherits the pipes and sleeps past the bound; the snapshot rejects with the git command named, within the bound, on both the timeout and the abort route; the existing G4 tests keep passing.
- [ ] #3 H3 (P2, B-011, INV-006, D-035): removeDoneTaskSnapshots compares each snapshot path against the Drive commit (driver-commits) or HEAD (backend-commits) for paths those commits may contain, and against the working tree (git hash-object) for paths the commit policy leaves uncommitted (missions/**, memory/**, .cosmonauts/*.lock) and for every path under no-commit; the task's own file is exempt. Tests on both paths, all three commit policies, in a fixture that tracks its task file and ignores nothing relevant: a Done task whose worker discarded nothing loses its ref; a Done task whose worker discarded a snapshotted source file keeps its ref; a Done task whose worker discarded a snapshotted missions/ file other than its own task file keeps its ref; the README states the D-035 rule.
- [ ] #4 H4 (P2, B-011, D-034): the graph runner's aborted and finalization_failed terminal results carry the retained snapshot refs collected from every completed task-status step, and run.completion.json names them, so a retained ref from an earlier Done task is never dropped by a later abort or finalization failure. Test: task A Done with a retained ref, then task B fails finalization; the completion record names A's ref; same for an abort after A.
- [ ] #5 D-030: implementation notes record, per finding H1..H4, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; bun run test, bun run lint, bun run typecheck, bun run check:reachability, bun run check:suppressions -- --base main all pass; no .skip/.only/.todo; no lib/durable-runtime/ change; no config, suppression, threshold, baseline, or ignore change.
<!-- AC:END -->
