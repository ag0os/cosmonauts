---
id: TASK-807
title: >-
  Codex round 4 remediation and coordinator finding C-001: five correctness
  findings
status: To Do
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-806
createdAt: '2026-09-29T22:32:09.666Z'
updatedAt: '2026-09-29T22:32:09.666Z'
---

## Description

Remediation slice for plan driver-hardening after codex review round 4 (`missions/reviews/codex/driver-hardening-round-4.md`, coordinator dispositions at its end) plus the coordinator's own finding C-001 (coordinator-status.md, 2026-09-29: the snapshot containment check iterates the whole snapshot tree, so every Done task whose worker edited any tracked file keeps its ref). Governed by D-001, D-004, D-006, D-018, D-020, D-021, D-022, D-030, D-033, D-034, D-035, D-036 and INV-001..006. Files: `lib/driver/runtime-helpers.ts`, `lib/driver/report-parser.ts`, `lib/driver/drive-finalization.ts`, `lib/tasks/task-note-editor.ts`, `lib/driver/README.md`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (RED then GREEN per finding in the notes, D-030, with a mutation check); notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit; no suppression/threshold/baseline/ignore/config change; no `lib/durable-runtime/` change; no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC/D inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [ ] #1 J1 (C-001, B-011, INV-006, D-036): removeDoneTaskSnapshots compares only the snapshot's delta from its parent commit (added and modified entries of `git diff-tree -r <ref>^ <ref>`; a deleted entry is satisfied when the path is absent from the final tree), with the final tree per path as D-035 defines it and the task's own file exempt; a snapshot with an empty delta is deleted on Done without comparison. Tests on both Drive paths and all three commit policies, in a fixture that tracks its task file: (a) first attempt on a tree that is clean apart from the task file, the worker edits two tracked source files and reports success: the ref is deleted; (b) tree dirty at spawn with a modified tracked file X and an untracked file Y, the worker leaves X and Y intact and edits other files: the ref is deleted; (c) same start, the worker reverts X or deletes Y: the ref is retained and named in the terminal record; (d) the snapshot's delta contains a deletion of a tracked file and the worker keeps it deleted: the ref is deleted. Each of (a) and (b) must fail on the current code (retained) before the change.
- [ ] #2 K1 (P1, B-011, INV-006): runCommand reports a timeout and an abort as distinct result states (not only as stderr text), and snapshotWorktree's preflight and every other snapshot/cleanup git call fail the attempt on a timeout or abort regardless of what the child wrote to stderr; a genuine not-a-worktree answer still returns undefined. Test: a fake git that writes a warning to stderr and then stalls past the bound makes the snapshot reject naming the command on both Drive paths (no spawn without a snapshot); the existing timeout/abort tests keep passing.
- [ ] #3 K2 (P1, B-003, INV-001): the task note editor recognizes the Implementation Notes heading exactly as the task parser does (case-insensitive, same whitespace tolerance), so a status-only update on a task whose heading is '## implementation notes' preserves every existing note byte. Test: red on the current editor with a lower-case heading and a KEEP THIS note; green after; the duplicate-section error still fires for two headings in any case.
- [ ] #4 K3 (P2, B-011, D-035): the containment exemption covers exactly the task's own file path as resolved by the task manager, not every 'missions/tasks/<taskId> - *.md' path. Test: a snapshot containing '<taskId> - backup.md' whose worker deletes that file keeps its ref on both paths.
- [ ] #5 K4 (P2, B-013, INV-002): when several fenced reports all say blocked, the reason is the last blocked report's notes (raw text when it has none), matching the H1 rule under disagreement. Test: fenced blocked notes Old then fenced blocked notes New yields New on both Drive paths.
- [ ] #6 D-030: implementation notes record, per finding J1 and K1..K4, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; bun run test, bun run lint, bun run typecheck, bun run check:reachability, bun run check:suppressions -- --base main all pass; no .skip/.only/.todo; no lib/durable-runtime/ change; no config, suppression, threshold, baseline, or ignore change; the README states the D-036 rule.
<!-- AC:END -->
