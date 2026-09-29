---
id: TASK-804
title: 'Codex round 1 remediation: eight correctness and liveness findings'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-801
  - TASK-803
createdAt: '2026-09-29T21:06:34.702Z'
updatedAt: '2026-09-29T21:06:34.702Z'
---

## Description

Remediation slice for plan driver-hardening after the independent codex review round 1 (`missions/reviews/codex/driver-hardening-round-1.md`, coordinator dispositions at its end). Each criterion below is one accepted finding; finding 9 (task_retry before a failed re-spawn) was rejected by the coordinator and is not in scope. Governed by D-001, D-018, D-019, D-020, D-022, D-030, D-032, D-033 and INV-001..006. Files: `lib/driver/report-parser.ts`, `lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/agents/drive-worker-tool-guard.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`, `bundled/coding/extensions/execution-probe/index.ts`, plus tests. Standing rules: every behavior change gets a test that fails on the current code first (record RED then GREEN per finding in the notes, D-030); notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit; no suppression/threshold/baseline/ignore/config change; no `lib/durable-runtime/` change; no pre-existing expectation changes except where a test pinned one of these defects (cite the finding and INV/AC inline). Keep both Drive paths in parity.

<!-- AC:BEGIN -->
- [ ] #1 F3 (P1, B-013, INV-002/INV-004): the outcome line parser uses the LAST `outcome:` line in the response, matching the report contract's 'final line' rule; a response with `outcome: success` in earlier prose and a final `outcome: blocked` parses as blocked on both Drive paths (no postflight, no retry). Fenced-JSON precedence is unchanged.
- [ ] #2 F2 (P1, B-008, AC-012): when the probe's process runner returns `termination-error` (process tree not verified stopped), the probe restores what it can, keeps the journal, and returns `recovery-required` naming the journal instead of a count; the journal is deleted only when the command outcome is a verified exit or signal and every restore verified.
- [ ] #3 F1 (P1, B-008, INV-006): on both Drive paths the probe-journal check and the source commit's staging+commit run inside one critical section holding the same project-wide probe lock the `execution_probe` tool takes (share the lock path through `lib/agents/drive-worker-tool-guard.ts`), so a probe cannot start between the check and `git add`; if the lock is held, Drive blocks the task with the existing `recovery-required`-style reason rather than waiting past the bound.
- [ ] #4 F4 (P2, B-009/B-008, AC-014): the destructive-Git classifier skips every git global option that can precede the subcommand (`--no-pager`, `-p`/`--paginate`, `-P`, `--bare`, `--no-replace-objects`, `--no-optional-locks`, `--literal-pathspecs`, `--glob-pathspecs`, `--noglob-pathspecs`, `--icase-pathspecs`, `--exec-path[=…]`, `--html-path`, `--man-path`, `--info-path`, `--list-cmds=…`, `--super-prefix=…`, `--attr-source=…`, and the existing `-C`/`-c`/`--git-dir`/`--work-tree`/`--namespace`/`--config-env` forms) so `git --no-pager reset --hard` is refused in Bash and as a probe test command.
- [ ] #5 F5 (P2, B-011): every git process `snapshotWorktree` (and its ref cleanup) spawns is bounded by a timeout (derived value, e.g. 60 s) so a stalled filter or hook cannot hang Drive before the task timeout starts; a timeout fails the attempt with a reason naming the git command.
- [ ] #6 F6 (P2, B-011): the temporary `core.excludesFile` used by `snapshotWorktree` contains the user's existing global excludes (resolved from `git config --get core.excludesFile`, else `$XDG_CONFIG_HOME/git/ignore`, else `~/.config/git/ignore`, when readable) followed by the session directories, so a file the user's global excludes ignore never enters a snapshot ref; a test proves a globally-ignored file is absent from the snapshot tree while an untracked non-ignored file is present.
- [ ] #7 F7 (P2, B-011, AC-015): `reportSummary` classifies the SELECTED summary line (not only the whole notes text) and returns undefined when that line is a JSON fence marker, brace-delimited JSON, an `outcome:` line, or the inferred-outcome sentence, so a first line `{"outcome":"success"}` followed by prose yields the task title as the commit subject on both paths.
- [ ] #8 F8 (P2, B-005/B-007, INV-005): `canonicalScopePath` strips trailing separators after normalization (`src/`, `src//`, `./src/` all match findings under `src/`; `./` and `.` both mean the project root), so a trailing-slash scope can no longer return a clean verdict while findings exist below it.
- [ ] #9 D-030: implementation notes record, per finding F1..F8, one failing run before the change (test name, commit, one-line failure) and one passing run after, plus a mutation check; `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main` all pass; no `.skip/.only/.todo`; no `lib/durable-runtime/` change; no config, suppression, threshold, baseline, or ignore change.
<!-- AC:END -->
