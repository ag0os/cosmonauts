---
id: TASK-785
title: >-
  Stage 8b: Characterize runDurableGraphScheduler saturated-capacity and
  missing-run variants
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-775
createdAt: '2026-09-29T02:25:07.435Z'
updatedAt: '2026-09-29T02:34:34.886Z'
---

## Description

Characterization-only prerequisite for TASK-776 (plan D-030 / Q-014). TASK-776 attempt 1 found two return sites of the owned high-tier `runDurableGraphScheduler` (`lib/durable-runtime/scheduler.ts`) that no test reaches: the `availableSlots === 0` return (lines 215-224: `waiting_for_fresh_external_work` while running work fills the effective parallelism limit and a ready step exists) and the missing-run throw (lines 40-42). This task pins both through shipped entry points before the refactor resumes. It verifies B-005 at characterization level and B-010 through the freeze check.

<!-- AC:BEGIN -->
- [x] #1 Behavior verification: B-005 is verified at characterization level for `runDurableGraphScheduler`: a new test file under `tests/durable-runtime/` pins (a) the saturated-capacity variant — a fixture with one externally running step and one ready step at `maxParallelSteps` 1 asserts the `waiting_for_fresh_external_work` result, that no new backend start occurs, and that the ready step is not mutated; and (b) the missing-run variant — a fixture with no run record asserts the rejection/throw exactly as shipped. B-010 is verified through the stage gate and freeze check.
- [x] #2 Owned Files to Change entries are new test files under `tests/durable-runtime/` only. `lib/durable-runtime/{scheduler,scheduler-state,controller}.ts` are observed and not edited; if a bounded testability seam is unavoidable it is named in `## Implementation Notes` before editing, limited to module-boundary visibility or injection, and leaves every function body byte-identical (TASK-775 AC #3 wording applies verbatim).
- [x] #3 Ratified constraints apply verbatim and are stop-and-escalate ground: no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); no existing test expectation changes (Q-002 hard stop); INV-003 trace-before-edit does not bind because no finding is acted on; before editing the Pi-hosted worker runs `analysis_status` and records the fresh project-scope complexity row for `runDurableGraphScheduler` (cyclomatic/cognitive/CRAP; D-024 one metric per turn, direct diagnostic for other confirmations).
- [x] #4 D-015 freeze check. Base is the slice-start commit `S` (HEAD at launch). The worker records `S` and the verbatim outputs of `git diff --name-status --diff-filter=MDR S -- tests/`, `git status --porcelain -- tests/`, and `git diff -U0 S -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; only newly added test files are allowed; anything else blocks for human review. The freeze verdict comes from the coordinator after Drive commits (parent must be `S`); worker-recorded output alone never satisfies this criterion (D-020 ticking rule applies). The worker performs no git operation on `missions/reviews/`.
- [x] #5 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; the two new cases fail when their guarded branch is removed (cp-backed non-vacuity probe, restored, `lib/` clean after) and this is recorded.
- [x] #6 `## Implementation Notes` maps each of the two variants to its test case through the shipped entry point, records the scheduler's fresh metrics, and names any further `runDurableGraphScheduler` return site it finds unreached as a Q-002 residual-risk item for TASK-776.
<!-- AC:END -->

## Implementation Notes

### Standing coordinator note (2026-09-28, applies to every attempt)

Drive commits this task only when **every** acceptance criterion is checked; an unchecked criterion ends the run `task_blocked` with nothing committed and Drive then overwrites these notes with its block reason. The in-process worker prompt does not say this, so: before your final report, (1) record your evidence (analysis_status output, traces, the D-015 in-session check verbatim against the slice-start commit, stage-gate exit codes and result lines) with `task_edit` `implementationNotes` (append, never drop earlier sections); (2) tick every satisfied criterion with `task_edit` `checkAc`; for a coordinator-verdict freeze criterion, plan D-020 applies: tick it once your in-session half is recorded and the coordinator appends the post-commit verdict; (3) report `outcome: success` only then. Leave source and test files uncommitted; the driver commits. Never run git operations on `missions/reviews/`; write record rows to the record files and copy them here.

Addendum (2026-09-28, plan D-023): a task-close `analysis_audit` that returns `failed` (e.g. `invalid-output` because Fallow answered `warn`) is recorded in these notes with its failure class, the verbatim direct diagnostic `fallow audit --base <sha> --format json --quiet --no-cache --dead-code-baseline .fallow-baselines/dead-code.json --health-baseline .fallow-baselines/health.json --dupes-baseline .fallow-baselines/dupes.json`, and the owning slice of each flagged finding; it is not a completion blocker when the five stage-gate commands pass and every owned finding is dispositioned. Do not edit `fallow-provider.ts` for it.

Addendum (2026-09-28, plan D-024): for critical-complexity functions the INV-003 pre-edit confirmation is the fresh project-scope `analysis_complexity` run per metric that still lists the function row; a symbol `analysis_trace` exit 2 for a non-exported function is a recorded provider limitation (`fallow dead-code --trace` resolves exports only), not a D-013 hard stop. If the surface complexity output is truncated, record its state/count/digest and confirm your owned rows with the direct diagnostic `fallow health --complexity --format json --quiet --no-cache` filtered locally by path and name, recorded verbatim as diagnosis.

### Coordinator note before attempt 1 (2026-09-29, successor #2; plan D-030 / Q-014)

Model: `openai-codex/gpt-6-sol` on the Pi `cosmonauts-subagent` backend (D-029). Characterization-only slice: new test file(s) under `tests/durable-runtime/` only; never modify an existing test (Q-002 hard stop → report `blocked`); no production edit unless a bounded seam named here first (AC #2). Call `analysis_complexity` one metric per turn, never in parallel, at most twice per metric; use the direct diagnostic `bunx fallow health --complexity --format json --quiet --no-cache` filtered to `runDurableGraphScheduler` for other confirmations (D-024). Never run `git checkout`, `git stash`, `git reset`, or any git write; the driver commits. Never pass `title` to `task_edit`; only `implementationNotes` (paste the whole existing body back plus your additions) and `checkAc`. Never touch `missions/reviews/`. Record the slice-start `S` (HEAD at launch) and the D-015 in-session check verbatim; tick every satisfied criterion (D-020 for the coordinator-verdict one) and end with `outcome: success` — Drive's parser accepts only success|failure|partial|completed, so a blocked stop must still be reported with your full record in these notes first.

### Worker evidence (2026-09-29)

Slice-start S = `5251a314ff50a94efc63cce2bb3b98e429250884` (`feature/project-health-audit`). `analysis_status` before test edits: dead-code bound fallow@2.54.2 scopes project,paths; duplication bound fallow@2.54.2 project; complexity bound fallow@2.54.2 project metrics cyclomatic,cognitive,crap; boundary-conformance unbound provider-not-configured (fallow); changed-scope-audit bound fallow@2.54.2 changed; trace bound fallow@2.54.2 target (symbol path required, file, dependency, duplicate-location line required); fix-preview bound fallow@2.54.2 project. Resolution provenance package-native. Fresh project-scope `analysis_complexity({metric:"cyclomatic"})`: completed findings, verdict fail, `runDurableGraphScheduler` lib/durable-runtime/scheduler.ts:37:7 cyclomatic 29 / cognitive 30 / CRAP 31.8, coverage_tier high, severity high, exceeded all. Direct diagnostic `bunx fallow health --complexity --format json --quiet --no-cache` filtered to name/path returned verbatim row: `{"path":"lib/durable-runtime/scheduler.ts","name":"runDurableGraphScheduler","line":37,"col":7,"cyclomatic":29,"cognitive":30,"line_count":237,"param_count":1,"exceeded":"all","severity":"high","crap":31.8,"coverage_tier":"high"}` (provider also emitted actions to increase coverage, refactor, suppress). No finding acted on; INV-003 trace-before-edit does not bind.

One added file `tests/durable-runtime/scheduler-capacity-characterization.test.ts`; no production or existing test edit, seam, config, suppression, threshold, ignore, entry or fallow.toml change. `waits without starting or changing ready work when external running work fills capacity` invokes the shipped public `runDurableGraphScheduler` export from durable-runtime/index.ts with a persisted external running step and independent ready step at maxParallelSteps=1. Asserts wait reason, no backend prepare/start, unchanged persisted ready step and result step. `rejects a scheduler pass when the run record does not exist` invokes the same export with an absent run and checks the exact shipped Error message/type.

Cp-backed non-vacuity probes: backup `/tmp/task-785-scheduler.ts.backup`, original/restored SHA-256 `4ff3468d50d6abbc357410394a53faddcabe8ee31f2e706921986ae3c5421a77`. Removing the `availableSlots === 0` return temporarily and running `bun run test tests/durable-runtime/scheduler-capacity-characterization.test.ts -t 'waits without starting'` exited 1: `expected 'drained' to be 'waiting_for_fresh_external_work'` (1 failed, 1 skipped). Restored from cp. Removing missing-run throw temporarily and running `bun run test tests/durable-runtime/scheduler-capacity-characterization.test.ts -t 'rejects a scheduler pass'` exited 1: `expected [Function] to throw error including 'Run plan-a/absent does not exist.' but got 'Cannot read properties of undefined (reading status)'` (1 failed, 1 skipped). Restored from cp. `git status --short -- lib/` empty afterward; both new tests green against restored source (2 passed).

Stage gate after restoration: `bun run test` exit 0: `Test Files 283 passed (283); Tests 3897 passed (3897)`; `bun run lint` exit 0: `Checked 639 files in 389ms. No fixes applied.`; `bun run typecheck` exit 0: `$ tsc --noEmit`; `bun run check:reachability` exit 0: `reachability: 212/212 runtime lib modules reached; 13 type-only lib modules exempt; 0 staged`; `bun run check:suppressions -- --base main` exit 0: `suppression check passed`. Earlier lint (before formatting the new test) exited 1 for two formatter layout changes in that new file; fixed formatting, rerun green. Changed-scope `analysis_audit({base:"5251a314ff50a94efc63cce2bb3b98e429250884"})`: completed pass, findings [], native exitCode 0, changed_files_count 2.

D-015 in-session freeze, S literal above, verbatim command outputs (empty blocks indicate no stdout):
`git diff --name-status --diff-filter=MDR 5251a314ff50a94efc63cce2bb3b98e429250884 -- tests/`
```
```
`git status --porcelain -- tests/`
```
?? tests/durable-runtime/scheduler-capacity-characterization.test.ts
```
`git diff -U0 5251a314ff50a94efc63cce2bb3b98e429250884 -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`
```
```
Only added test file; no skip/only/todo added. Coordinator must confirm Drive commit parent S and rerun freeze after commit before final verdict (D-020). No git operation on review artifacts. Q-002 residual risk for TASK-776: the other `runDurableGraphScheduler` returns (terminal, persisted-terminal promotion, persisted-diagnostics blocked, committed-work block, stale transition, unknown backend, already-finalized, owned-running lease renewal, no-runnable, final drained/cancelled/terminal) have not been independently branch-coverage enumerated by this narrow slice; no further specifically unreached return site was established here. TASK-776 should verify any remaining site before refactoring it.
