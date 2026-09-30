---
id: TASK-809
title: >-
  Quality Manager run 1 remediation: Drive snapshot, guard, and note-editor
  findings
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-808
createdAt: '2026-09-29T23:22:19.537Z'
updatedAt: '2026-09-29T23:37:20.142Z'
---

## Description

Remediation slice for plan driver-hardening after Quality Manager run 1 (`missions/reviews/qm/driver-hardening-run-1/README.md`, coordinator dispositions; `final.md` is the QM report). Accepted findings F-003, F-004, F-005/SR-006, SR-001. Governed by D-001, D-004, D-006, D-018, D-020, D-021, D-022, D-030, D-033..D-036 and INV-001..006. Files: `lib/tasks/task-note-editor.ts`, `lib/tasks/task-parser.ts`, `lib/driver/runtime-helpers.ts`, `lib/agents/drive-worker-tool-guard.ts`, `lib/driver/README.md`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (RED then GREEN per finding in the notes, D-030, with a mutation check); notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit; no suppression/threshold/baseline/ignore/config change; no `lib/durable-runtime/` change; no `domains/shared/extensions/` change (D-025); no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC/D inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [x] #1 M1 (F-003, B-003, INV-001): the note editor and the task parser share one heading grammar for Implementation Notes (same anchoring, case and whitespace tolerance, including a heading indented by one to three spaces), so a status-only update preserves every note byte for any heading the parser reads as the notes section. Test: red with a three-space-indented heading and a KEEP THIS note on the current editor; green after; four-space indentation (a code block) is read by neither.
- [x] #2 M2 (F-004, B-011): snapshot commit-tree runs with a deterministic framework author and committer supplied through the environment, so a host with no user.name/user.email still snapshots. Test: with GIT_CONFIG_GLOBAL and GIT_CONFIG_SYSTEM pointed at empty files and no identity env, snapshotWorktree succeeds on both Drive paths; red on the current code (commit-tree fails).
- [x] #3 M3 (F-005/SR-006, B-011, INV-006, D-036): containment compares each delta path's mode together with its object id, so a reverted executable bit or type change (file to symlink) keeps the ref. Test: worker reverts chmod +x that the snapshot captured: ref retained; worker keeps it: ref deleted; red on the current code.
- [x] #4 M4 (SR-001, B-009): the Bash guard classifies git switch -f and git switch --force as destructive exactly like --discard-changes, on the guard and on the probe test-command path. Test: both forms refused; git switch main allowed; red on the current code.
- [x] #5 D-030: implementation notes record, per finding M1..M4, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; bun run test, bun run lint, bun run typecheck, bun run check:reachability, bun run check:suppressions -- --base main all pass; no .skip/.only/.todo; no lib/durable-runtime/ or domains/shared/extensions/ change; no config, suppression, threshold, baseline, or ignore change.
<!-- AC:END -->

## Implementation Notes

M1 F-003 RED b72d5121e5191daa45cb43eb24da5ae1fd49d913: 'preserves a three-space-indented notes heading read by the parser on a status update' (bun run test -- tests/tasks/task-note-preservation.test.ts -t 'preserves a three-space-indented'): expected source to contain '   ## Implementation Notes  \r\nKEEP THIS', got notes removed. GREEN: bun run test -- tests/tasks/task-note-preservation.test.ts tests/tasks/task-parser.test.ts tests/tasks/task-serializer.test.ts (63 passed); four-space code-heading check passes. Mutation: changed shared heading allowance from {0,3} to {0,2}; targeted test failed expected 'KEEP THIS' but received undefined; restored.

M2 F-004 RED b72d5121e5191daa45cb43eb24da5ae1fd49d913: 'snapshots without a host Git identity for either Drive path' (bun run test -- tests/driver/worktree-snapshot.test.ts -t 'snapshots without a host Git identity'): expected 'Cosmonauts Drive <drive@cosmonauts.local>|...' received host 'Agustin Calabrese <cosmos@Cosmos.local>|...'; empty global/system config and unset local user.* and identity env. GREEN: same command 1 passed with deterministic author/committer on shared snapshotWorktree used by both paths. Mutation: changed GIT_AUTHOR_NAME to Wrong; test failed received 'Wrong <drive@cosmonauts.local>|...' then restored.

M3 F-005/SR-006 RED b72d5121e5191daa45cb43eb24da5ae1fd49d913: '%s retains reverted executable mode but removes a contained snapshot' (bun run test -- tests/driver/worktree-snapshot.test.ts -t 'retains reverted executable mode'): driver-commits/backend-commits/no-commit expected [ref], received [] when chmod +x was reverted. GREEN: bun run test -- tests/driver/worktree-snapshot.test.ts (19 passed, plus captured symlink test passed separately). Mutation: force worktreeMode regular files to 100644; no-commit kept-mode test failed expected [] got [ref]; restored. Shared cleanup is reached from both Drive paths.

M4 SR-001 RED b72d5121e5191daa45cb43eb24da5ae1fd49d913: 'refuses destructive invocation git switch -f main' / '--force main' (bun run test -- tests/agents/drive-worker-tool-guard.test.ts -t 'git switch -f|git switch --force'): expected true received false; probe test 'refuses destructive probe test command ...' (bun run test -- tests/extensions/execution-probe.test.ts -t 'destructive probe test command') received exitCode 128 instead of refused true. GREEN: bun run test -- tests/agents/drive-worker-tool-guard.test.ts (55 passed); bun run test -- tests/extensions/execution-probe.test.ts -t 'destructive probe test command' (2 passed). Mutation: removed -f/--force aliases from classifier; guard tests failed true vs false; restored. `git switch main` allowed in existing test.

M1 additional RED (after first green): 'keeps indented notes separate from an earlier description' failed with 'Duplicate Implementation Notes sections' when parser included indented notes in Description; changed extractSection next-heading delimiter to recognize one-to-three-space headings; GREEN bun run test -- tests/tasks/task-note-preservation.test.ts tests/tasks/task-parser.test.ts tests/tasks/task-serializer.test.ts (64 passed). Final verification: bun run test (293 files, 4220 passed); bun run lint (653 files, no fixes); bun run typecheck; bun run check:reachability (214/214 runtime modules); bun run check:suppressions -- --base main (passed). Changed-scope analysis_audit(base=b72d5121e5191daa45cb43eb24da5ae1fd49d913) unbound: fallow execution-not-consented; evidence unavailable, not clean. git diff --check passed; no new .skip/.only/.todo in touched tests; no lib/durable-runtime/, domains/shared/extensions/, config, suppression, threshold, baseline or ignore file changed. Other actor's pre-existing missions/plans/driver-hardening/coordinator-status.md change left untouched; only task_edit modified missions/tasks/TASK-809.

M2 strengthened fixture to set user.useConfigOnly=true in its temporary Git repo (so Git cannot infer a machine-local identity despite empty global/system config). RED against the original commit-tree env behavior, reproduced by temporarily passing only env to commit-tree: bun run test -- tests/driver/worktree-snapshot.test.ts -t 'snapshots without a host Git identity' failed 'git commit-tree ... failed: Author identity unknown; fatal: no email was given and auto-detection is disabled'. GREEN after restoring framework identity env: same command 1 passed; no production behavior changed from earlier green.

Final re-verification after tightening M2 fixture: bun run test 293 files/4220 passed; bun run lint checked 653 files; bun run typecheck passed; bun run check:reachability 214/214 runtime modules; bun run check:suppressions -- --base main passed. Changed-scope audit with literal base b72d5121e5191daa45cb43eb24da5ae1fd49d913 remains unbound (fallow execution-not-consented).