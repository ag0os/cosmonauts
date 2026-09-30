---
id: TASK-804
title: 'Codex round 1 remediation: eight correctness and liveness findings'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-801
  - TASK-803
createdAt: '2026-09-29T21:06:34.702Z'
updatedAt: '2026-09-29T21:28:11.092Z'
---

## Description

Remediation slice for plan driver-hardening after the independent codex review round 1 (`missions/reviews/codex/driver-hardening-round-1.md`, coordinator dispositions at its end). Each criterion below is one accepted finding; finding 9 (task_retry before a failed re-spawn) was rejected by the coordinator and is not in scope. Governed by D-001, D-018, D-019, D-020, D-022, D-030, D-032, D-033 and INV-001..006. Files: `lib/driver/report-parser.ts`, `lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/agents/drive-worker-tool-guard.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`, `bundled/coding/extensions/execution-probe/index.ts`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (record RED then GREEN per finding in the notes, D-030); notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit; no suppression/threshold/baseline/ignore/config change; no `lib/durable-runtime/` change; no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [x] #1 F3 (P1, B-013, INV-002/INV-004): the outcome line parser uses the LAST `outcome:` line in the response, matching the report contract's 'final line' rule; a response with `outcome: success` in earlier prose and a final `outcome: blocked` parses as blocked on both Drive paths (no postflight, no retry). Fenced-JSON precedence is unchanged.
- [x] #2 F2 (P1, B-008, AC-012): when the probe's process runner returns `termination-error` (process tree not verified stopped), the probe restores what it can, keeps the journal, and returns `recovery-required` naming the journal instead of a count; the journal is deleted only when the command outcome is a verified exit or signal and every restore verified.
- [x] #3 F1 (P1, B-008, INV-006): on both Drive paths the probe-journal check and the source commit's staging+commit run inside one critical section holding the same project-wide probe lock the `execution_probe` tool takes (share the lock path through `lib/agents/drive-worker-tool-guard.ts`), so a probe cannot start between the check and `git add`; if the lock is held, Drive blocks the task with the existing `recovery-required`-style reason rather than waiting past the bound.
- [x] #4 F4 (P2, B-009/B-008, AC-014): the destructive-Git classifier skips every git global option that can precede the subcommand (`--no-pager`, `-p`/`--paginate`, `-P`, `--bare`, `--no-replace-objects`, `--no-optional-locks`, `--literal-pathspecs`, `--glob-pathspecs`, `--noglob-pathspecs`, `--icase-pathspecs`, `--exec-path[=…]`, `--html-path`, `--man-path`, `--info-path`, `--list-cmds=…`, `--super-prefix=…`, `--attr-source=…`, and the existing `-C`/`-c`/`--git-dir`/`--work-tree`/`--namespace`/`--config-env` forms) so `git --no-pager reset --hard` is refused in Bash and as a probe test command.
- [x] #5 F5 (P2, B-011): every git process `snapshotWorktree` (and its ref cleanup) spawns is bounded by a timeout (derived value, e.g. 60 s) so a stalled filter or hook cannot hang Drive before the task timeout starts; a timeout fails the attempt with a reason naming the git command.
- [x] #6 F6 (P2, B-011): the temporary `core.excludesFile` used by `snapshotWorktree` contains the user's existing global excludes (resolved from `git config --get core.excludesFile`, else `$XDG_CONFIG_HOME/git/ignore`, else `~/.config/git/ignore`, when readable) followed by the session directories, so a file the user's global excludes ignore never enters a snapshot ref; a test proves a globally-ignored file is absent from the snapshot tree while an untracked non-ignored file is present.
- [x] #7 F7 (P2, B-011, AC-015): `reportSummary` classifies the SELECTED summary line (not only the whole notes text) and returns undefined when that line is a JSON fence marker, brace-delimited JSON, an `outcome:` line, or the inferred-outcome sentence, so a first line `{"outcome":"success"}` followed by prose yields the task title as the commit subject on both paths.
- [x] #8 F8 (P2, B-005/B-007, INV-005): `canonicalScopePath` strips trailing separators after normalization (`src/`, `src//`, `./src/` all match findings under `src/`; `./` and `.` both mean the project root), so a trailing-slash scope can no longer return a clean verdict while findings exist below it.
- [x] #9 D-030: implementation notes record, per finding F1..F8, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main` all pass; no `.skip/.only/.todo`; no `lib/durable-runtime/` change; no config, suppression, threshold, baseline, or ignore change.
<!-- AC:END -->

## Implementation Notes

Starting remediation at HEAD 417ea37458b9d0ecad2479bb78695adc7f8f8f77 (changed-scope audit base).

F3 RED at 417ea37458b9d0ecad2479bb78695adc7f8f8f77: `bun x vitest run tests/driver/report-parser.test.ts -t 'uses the last outcome line'` expected blocked, received success. GREEN same suite 12/12. Mutation check: original first-match logic is the failing baseline; restoring first-match would reproduce RED.

F4 RED at 417ea37458b9d0ecad2479bb78695adc7f8f8f77: `bun x vitest run tests/agents/drive-worker-tool-guard.test.ts` 22 global-option cases expected true received false. GREEN same suite 53/53. Mutation: removing new option skip reproduces false for --no-pager; shared classifier is invoked by both Pi Bash guard and probe test command.

F7 RED at 417ea37458b9d0ecad2479bb78695adc7f8f8f77: `bun x vitest run tests/driver/worktree-snapshot.test.ts -t 'rejects a JSON first line'` expected undefined got JSON subject. GREEN suite 3/3. Mutation: removing line-level rejection recreates RED; both paths use reportSummary for commit subject.

F8 RED at 417ea37458b9d0ecad2479bb78695adc7f8f8f77: `bun x vitest run tests/extensions/project-tools-fallow.test.ts -t 'scopes trailing directory'` 4/5 cases returned pass with empty findings; GREEN 5/5. Mutation: original normalize-only function reproduces 4 failing cases.

F2 RED at 417ea37458b9d0ecad2479bb78695adc7f8f8f77: `bun x vitest run tests/extensions/execution-probe.test.ts -t 'retains the journal when process-tree termination'` returned counts/status termination-error instead of recovery-required; GREEN full probe suite 17/17. Mutation: original branch deleting journal reproduces RED.

F1 RED at 417ea37458b9d0ecad2479bb78695adc7f8f8f77: `bun x vitest run tests/driver/drive-scheduler-backend.test.ts -t 'blocks a source commit when a probe owns'` committed instead of blocked. GREEN same targeted test 1/1; both legacy and graph use finalizeDriveSourceCommit, which now holds the shared probe lock from journal check through add/commit. Mutation: removing lock wrapper recreates RED. F6 RED at same base: `bun x vitest run tests/driver/worktree-snapshot.test.ts -t "preserves a user's global excludes"` snapshot tree contained secret.env; GREEN snapshot suite 4/4; mutation: omit existing excludes returns secret.env to ref.

F5 RED (pre-change behavior preserved for test-first check at base 417ea37458b9d0ecad2479bb78695adc7f8f8f77): `bun x vitest run tests/driver/worktree-snapshot-timeout.test.ts` without timeout on snapshot git returned undefined instead of rejecting (mutation reverting timeout); second RED with timeout but swallowed preflight timeout returned undefined; third RED cleanup timeout emitted only 'timed out' without git command. GREEN same test 1/1; mutation removing timeout reproduced RED. Every snapshot and cleanup git execFileSync is bounded at 60000ms.

Changed-scope analysis_audit(base literal 417ea37458b9d0ecad2479bb78695adc7f8f8f77) unbound (execution-not-consented), not a clean verdict. Required checks: bun run test 293 files / 4118 tests pass; bun run lint pass; bun run typecheck pass; bun run check:reachability 214/214 reached; bun run check:suppressions -- --base main passed. No .skip/.only/.todo in touched test files, no durable-runtime, config, suppression, baseline, threshold, ignore changes. F3 parity legacy and graph blocked-final-line suites green 41/41 and 28/28; F7 JSON-first-line title subjects likewise green in both suites.

F2 additional mutation/edge RED after initial green: `bun x vitest run tests/extensions/execution-probe.test.ts -t 'retains the journal when process-tree termination'` subsequent probe deleted unsafe journal and returned counts. GREEN full probe suite 17/17 after durable termination-error marker; later probes restore but cannot delete unsafe journal.

Actual mutation checks after GREEN: F1 wrong project lock path -> source committed instead of blocked (`bun x vitest run tests/driver/drive-scheduler-backend.test.ts -t 'blocks a source commit when a probe owns'` RED); F3 first outcome .at(0) -> success instead of blocked (`bun x vitest run tests/driver/report-parser.test.ts -t 'uses the last outcome line'` RED); F4 omit --no-pager option -> false instead of true (`bun x vitest run tests/agents/drive-worker-tool-guard.test.ts -t 'git --no-pager reset --hard'` RED); F6 omit global excludes -> secret.env entered snapshot (`bun x vitest run tests/driver/worktree-snapshot.test.ts -t "preserves a user's global excludes"` RED); F7 omit selected-line JSON check -> JSON summary returned (`bun x vitest run tests/driver/worktree-snapshot.test.ts -t 'rejects a JSON first line'` RED); F8 omit trailing strip -> four scoped findings lost (`bun x vitest run tests/extensions/project-tools-fallow.test.ts -t 'scopes trailing directory'` RED). Each mutation restored through targeted edit, no reset/checkout.

F7 selected-line additional RED at 417ea37458b9d0ecad2479bb78695adc7f8f8f77: `bun x vitest run tests/driver/worktree-snapshot.test.ts -t 'uses a prose summary'` expected prose, got undefined because a later outcome line invalidated the whole note. GREEN worktree snapshot + both Drive suites 74/74. Preserve existing whole-text JSON fence and inferred-outcome exclusions (legacy pinned behavior), but outcome-line classification now depends on selected line only.

Final verification after all edits/mutations: bun run test PASS (293 files, 4119 tests); bun run lint PASS (653 files); bun run typecheck PASS; bun run check:reachability PASS (214/214); bun run check:suppressions -- --base main PASS; git diff --check PASS. Changed-scope audit literal base 417ea37458b9d0ecad2479bb78695adc7f8f8f77: unbound execution-not-consented (evidence unavailable, not zero findings). No .skip/.only/.todo added; no lib/durable-runtime or config/suppression/threshold/baseline/ignore changes. Driver-commits policy: no staging or commit.

F1 additional RED after lock implementation: `bun x vitest run tests/driver/drive-scheduler-backend.test.ts -t 'blocks a source commit when a probe owns'` returned blocked result but task status remained To Do; GREEN after shared finalization marks task Blocked and emits task_blocked, targeted driver suites 72/72. Final verification after this fix: bun run test 293/293 files and 4119/4119 tests PASS; bun run lint PASS; bun run typecheck PASS; bun run check:reachability PASS (214/214); bun run check:suppressions -- --base main PASS; git diff --check PASS; changed-scope audit base 417ea37458b9d0ecad2479bb78695adc7f8f8f77 unbound execution-not-consented.