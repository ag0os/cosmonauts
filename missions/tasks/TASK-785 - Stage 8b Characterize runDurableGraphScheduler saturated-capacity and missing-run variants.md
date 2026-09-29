---
id: TASK-785
title: >-
  Stage 8b: Characterize runDurableGraphScheduler saturated-capacity and
  missing-run variants
status: To Do
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-775
createdAt: '2026-09-29T02:25:07.435Z'
updatedAt: '2026-09-29T02:25:38.945Z'
---

## Description

Characterization-only prerequisite for TASK-776 (plan D-030 / Q-014). TASK-776 attempt 1 found two return sites of the owned high-tier `runDurableGraphScheduler` (`lib/durable-runtime/scheduler.ts`) that no test reaches: the `availableSlots === 0` return (lines 215-224: `waiting_for_fresh_external_work` while running work fills the effective parallelism limit and a ready step exists) and the missing-run throw (lines 40-42). This task pins both through shipped entry points before the refactor resumes. It verifies B-005 at characterization level and B-010 through the freeze check.

<!-- AC:BEGIN -->
- [ ] #1 Behavior verification: B-005 is verified at characterization level for `runDurableGraphScheduler`: a new test file under `tests/durable-runtime/` pins (a) the saturated-capacity variant — a fixture with one externally running step and one ready step at `maxParallelSteps` 1 asserts the `waiting_for_fresh_external_work` result, that no new backend start occurs, and that the ready step is not mutated; and (b) the missing-run variant — a fixture with no run record asserts the rejection/throw exactly as shipped. B-010 is verified through the stage gate and freeze check.
- [ ] #2 Owned Files to Change entries are new test files under `tests/durable-runtime/` only. `lib/durable-runtime/{scheduler,scheduler-state,controller}.ts` are observed and not edited; if a bounded testability seam is unavoidable it is named in `## Implementation Notes` before editing, limited to module-boundary visibility or injection, and leaves every function body byte-identical (TASK-775 AC #3 wording applies verbatim).
- [ ] #3 Ratified constraints apply verbatim and are stop-and-escalate ground: no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); no existing test expectation changes (Q-002 hard stop); INV-003 trace-before-edit does not bind because no finding is acted on; before editing the Pi-hosted worker runs `analysis_status` and records the fresh project-scope complexity row for `runDurableGraphScheduler` (cyclomatic/cognitive/CRAP; D-024 one metric per turn, direct diagnostic for other confirmations).
- [ ] #4 D-015 freeze check. Base is the slice-start commit `S` (HEAD at launch). The worker records `S` and the verbatim outputs of `git diff --name-status --diff-filter=MDR S -- tests/`, `git status --porcelain -- tests/`, and `git diff -U0 S -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; only newly added test files are allowed; anything else blocks for human review. The freeze verdict comes from the coordinator after Drive commits (parent must be `S`); worker-recorded output alone never satisfies this criterion (D-020 ticking rule applies). The worker performs no git operation on `missions/reviews/`.
- [ ] #5 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; the two new cases fail when their guarded branch is removed (cp-backed non-vacuity probe, restored, `lib/` clean after) and this is recorded.
- [ ] #6 `## Implementation Notes` maps each of the two variants to its test case through the shipped entry point, records the scheduler's fresh metrics, and names any further `runDurableGraphScheduler` return site it finds unreached as a Q-002 residual-risk item for TASK-776.
<!-- AC:END -->

## Implementation Notes

### Standing coordinator note (2026-09-28, applies to every attempt)

Drive commits this task only when **every** acceptance criterion is checked; an unchecked criterion ends the run `task_blocked` with nothing committed and Drive then overwrites these notes with its block reason. The in-process worker prompt does not say this, so: before your final report, (1) record your evidence (analysis_status output, traces, the D-015 in-session check verbatim against the slice-start commit, stage-gate exit codes and result lines) with `task_edit` `implementationNotes` (append, never drop earlier sections); (2) tick every satisfied criterion with `task_edit` `checkAc`; for a coordinator-verdict freeze criterion, plan D-020 applies: tick it once your in-session half is recorded and the coordinator appends the post-commit verdict; (3) report `outcome: success` only then. Leave source and test files uncommitted; the driver commits. Never run git operations on `missions/reviews/`; write record rows to the record files and copy them here.

Addendum (2026-09-28, plan D-023): a task-close `analysis_audit` that returns `failed` (e.g. `invalid-output` because Fallow answered `warn`) is recorded in these notes with its failure class, the verbatim direct diagnostic `fallow audit --base <sha> --format json --quiet --no-cache --dead-code-baseline .fallow-baselines/dead-code.json --health-baseline .fallow-baselines/health.json --dupes-baseline .fallow-baselines/dupes.json`, and the owning slice of each flagged finding; it is not a completion blocker when the five stage-gate commands pass and every owned finding is dispositioned. Do not edit `fallow-provider.ts` for it.

Addendum (2026-09-28, plan D-024): for critical-complexity functions the INV-003 pre-edit confirmation is the fresh project-scope `analysis_complexity` run per metric that still lists the function row; a symbol `analysis_trace` exit 2 for a non-exported function is a recorded provider limitation (`fallow dead-code --trace` resolves exports only), not a D-013 hard stop. If the surface complexity output is truncated, record its state/count/digest and confirm your owned rows with the direct diagnostic `fallow health --complexity --format json --quiet --no-cache` filtered locally by path and name, recorded verbatim as diagnosis.

### Coordinator note before attempt 1 (2026-09-29, successor #2; plan D-030 / Q-014)

Model: `openai-codex/gpt-6-sol` on the Pi `cosmonauts-subagent` backend (D-029). Characterization-only slice: new test file(s) under `tests/durable-runtime/` only; never modify an existing test (Q-002 hard stop → report `blocked`); no production edit unless a bounded seam named here first (AC #2). Call `analysis_complexity` one metric per turn, never in parallel, at most twice per metric; use the direct diagnostic `bunx fallow health --complexity --format json --quiet --no-cache` filtered to `runDurableGraphScheduler` for other confirmations (D-024). Never run `git checkout`, `git stash`, `git reset`, or any git write; the driver commits. Never pass `title` to `task_edit`; only `implementationNotes` (paste the whole existing body back plus your additions) and `checkAc`. Never touch `missions/reviews/`. Record the slice-start `S` (HEAD at launch) and the D-015 in-session check verbatim; tick every satisfied criterion (D-020 for the coordinator-verdict one) and end with `outcome: success` — Drive's parser accepts only success|failure|partial|completed, so a blocked stop must still be reported with your full record in these notes first.
