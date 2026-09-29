---
id: TASK-809
title: >-
  Quality Manager run 1 remediation: Drive snapshot, guard, and note-editor
  findings
status: To Do
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-808
createdAt: '2026-09-29T23:22:19.537Z'
updatedAt: '2026-09-29T23:22:19.537Z'
---

## Description

Remediation slice for plan driver-hardening after Quality Manager run 1 (`missions/reviews/qm/driver-hardening-run-1/README.md`, coordinator dispositions; `final.md` is the QM report). Accepted findings F-003, F-004, F-005/SR-006, SR-001. Governed by D-001, D-004, D-006, D-018, D-020, D-021, D-022, D-030, D-033..D-036 and INV-001..006. Files: `lib/tasks/task-note-editor.ts`, `lib/tasks/task-parser.ts`, `lib/driver/runtime-helpers.ts`, `lib/agents/drive-worker-tool-guard.ts`, `lib/driver/README.md`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (RED then GREEN per finding in the notes, D-030, with a mutation check); notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit; no suppression/threshold/baseline/ignore/config change; no `lib/durable-runtime/` change; no `domains/shared/extensions/` change (D-025); no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC/D inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [ ] #1 M1 (F-003, B-003, INV-001): the note editor and the task parser share one heading grammar for Implementation Notes (same anchoring, case and whitespace tolerance, including a heading indented by one to three spaces), so a status-only update preserves every note byte for any heading the parser reads as the notes section. Test: red with a three-space-indented heading and a KEEP THIS note on the current editor; green after; four-space indentation (a code block) is read by neither.
- [ ] #2 M2 (F-004, B-011): snapshot commit-tree runs with a deterministic framework author and committer supplied through the environment, so a host with no user.name/user.email still snapshots. Test: with GIT_CONFIG_GLOBAL and GIT_CONFIG_SYSTEM pointed at empty files and no identity env, snapshotWorktree succeeds on both Drive paths; red on the current code (commit-tree fails).
- [ ] #3 M3 (F-005/SR-006, B-011, INV-006, D-036): containment compares each delta path's mode together with its object id, so a reverted executable bit or type change (file to symlink) keeps the ref. Test: worker reverts chmod +x that the snapshot captured: ref retained; worker keeps it: ref deleted; red on the current code.
- [ ] #4 M4 (SR-001, B-009): the Bash guard classifies git switch -f and git switch --force as destructive exactly like --discard-changes, on the guard and on the probe test-command path. Test: both forms refused; git switch main allowed; red on the current code.
- [ ] #5 D-030: implementation notes record, per finding M1..M4, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; bun run test, bun run lint, bun run typecheck, bun run check:reachability, bun run check:suppressions -- --base main all pass; no .skip/.only/.todo; no lib/durable-runtime/ or domains/shared/extensions/ change; no config, suppression, threshold, baseline, or ignore change.
<!-- AC:END -->
