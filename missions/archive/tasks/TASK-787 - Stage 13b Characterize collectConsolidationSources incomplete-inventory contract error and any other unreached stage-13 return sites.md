---
id: TASK-787
title: >-
  Stage 13b: Characterize collectConsolidationSources incomplete-inventory
  contract error and any other unreached stage-13 return sites
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-779
createdAt: '2026-09-29T04:10:03.153Z'
updatedAt: '2026-09-29T04:57:24.611Z'
---

## Description

Characterization-only prerequisite for TASK-780 (plan D-033). TASK-780 attempt 1 followed D-031 rule 5 and proved by full-suite probe (zero hits) that the `collectConsolidationSources` contract-error arm at `lib/memory/consolidation-sources.ts:937-943` (a source snapshot with `inventoryComplete: true`, `omitted > 0`, and an inventory that does not cover the omitted records → throws `Source <id> claimed complete inventory without inventorying omitted records.`) is reached by no test; the sibling arm (inventory undefined, omitted > 0) is reached once. This task pins that arm through a shipped entry point and, so that TASK-780 does not stop again, probes every remaining return and throw site of the eight stage-13 functions (`recoverAcceptedEpisodeFinalization`, `applyUnderLock`, `retrieveKnowledge`, `readProposalMaterializations`, `isEpisodePruneJournal`, `candidateConflict`, `readRetirementReceiptInventory`, `collectConsolidationSources`) and pins each zero-hit site that a shipped entry point can reach, recording the rest as Q-002 residual risk. It verifies B-005 at characterization level and B-010 through the freeze check.

<!-- AC:BEGIN -->
- [x] #1 Behavior verification: B-005 is verified at characterization level for `collectConsolidationSources`: a new test file under `tests/memory/` pins, through a shipped entry point, a source snapshot declaring `inventoryComplete: true` with one valid admitted record, `omitted: 1`, and an inventory containing only the admitted record, asserting the exact contract error text and that no partial output is exposed. B-010 is verified through the stage gate and freeze check.
- [x] #2 Return-site sweep: for each of the eight stage-13 functions the worker enumerates every return and throw site, probes each one not already mapped to a TASK-779 or existing case (cp-backed backup, `appendFileSync` tag to a file under `/tmp`, full `bun run test`, restore from the cp, `git status --short -- lib/` empty), records the hit count verbatim, and pins every zero-hit site reachable through a shipped entry point in the new test file(s). Sites no shipped entry point can reach are listed in `## Implementation Notes` with the reason as Q-002 residual-risk items for TASK-780.
- [x] #3 Owned Files to Change entries are new test files under `tests/memory/` only. The stage-13 production files are observed and not edited; if a bounded testability seam is unavoidable it is named in `## Implementation Notes` before editing, limited to module-boundary visibility or injection, and leaves every function body byte-identical (TASK-775 AC #3 wording applies verbatim).
- [x] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); no existing test expectation changes (Q-002 hard stop); INV-003 trace-before-edit does not bind because no finding is acted on; before editing the Pi-hosted worker runs `analysis_status` and records the fresh project-scope complexity rows for the eight functions (D-024 one metric per turn, direct diagnostic for other confirmations).
- [x] #5 D-015 freeze check. Base is the slice-start commit `S` (HEAD at launch). The worker records `S` and the verbatim outputs of `git diff --name-status --diff-filter=MDR S -- tests/`, `git status --porcelain -- tests/`, and `git diff -U0 S -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; only newly added test files are allowed; anything else blocks for human review. The freeze verdict comes from the coordinator after Drive commits (parent must be `S`); worker-recorded output alone never satisfies this criterion (D-020 ticking rule applies). The worker performs no git operation on `missions/reviews/`.
- [x] #6 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; each new case fails when its guarded branch is removed or short-circuited (cp-backed non-vacuity probe, restored, `lib/` clean after) and this is recorded.
- [x] #7 `## Implementation Notes` maps each pinned site to its test case through the shipped entry point, records the fresh metrics, lists every probed site with its hit count, and lists every site left unreached with its reason as a Q-002 residual-risk item for TASK-780.
<!-- AC:END -->

## Implementation Notes

### Standing coordinator note (2026-09-28, applies to every attempt)

Drive commits this task only when **every** acceptance criterion is checked; an unchecked criterion ends the run `task_blocked` with nothing committed and Drive then overwrites these notes with its block reason. The in-process worker prompt does not say this, so: before your final report, (1) record your evidence (analysis_status output, traces, the D-015 in-session check verbatim against the slice-start commit, stage-gate exit codes and result lines) with `task_edit` `implementationNotes` (append, never drop earlier sections); (2) tick every satisfied criterion with `task_edit` `checkAc`; for a coordinator-verdict freeze criterion, plan D-020 applies: tick it once your in-session half is recorded and the coordinator appends the post-commit verdict; (3) report `outcome: success` only then. Leave source and test files uncommitted; the driver commits. Never run git operations on `missions/reviews/`; write record rows to the record files and copy them here.

Addendum (2026-09-28, plan D-023): a task-close `analysis_audit` that returns `failed` (e.g. `invalid-output` because Fallow answered `warn`) is recorded in these notes with its failure class, the verbatim direct diagnostic `fallow audit --base <sha> --format json --quiet --no-cache --dead-code-baseline .fallow-baselines/dead-code.json --health-baseline .fallow-baselines/health.json --dupes-baseline .fallow-baselines/dupes.json`, and the owning slice of each flagged finding; it is not a completion blocker when the five stage-gate commands pass and every owned finding is dispositioned. Do not edit `fallow-provider.ts` for it.

Addendum (2026-09-28, plan D-024): for critical-complexity functions the INV-003 pre-edit confirmation is the fresh project-scope `analysis_complexity` run per metric that still lists the function row; a symbol `analysis_trace` exit 2 for a non-exported function is a recorded provider limitation (`fallow dead-code --trace` resolves exports only), not a D-013 hard stop. If the surface complexity output is truncated, record its state/count/digest and confirm your owned rows with the direct diagnostic `fallow health --complexity --format json --quiet --no-cache` filtered locally by path and name, recorded verbatim as diagnosis.

### Coordinator note before attempt 1 (2026-09-29, successor #3; plan D-033)

Model: `openai-codex/gpt-6-sol` on the Pi `cosmonauts-subagent` backend (D-029). Characterization-only slice: new test file(s) under `tests/memory/` only; never modify an existing test (Q-002 hard stop → write the full record here, then report); no production edit unless a bounded seam is named here first (AC #3). Fixture models: TASK-779's five `tests/memory/*-characterization.test.ts` files and `tests/memory/consolidation-sources.test.ts`. The known zero-hit site is `lib/memory/consolidation-sources.ts:937-943` (TASK-780 attempt 1 probe, verbatim in that task's notes: `inventoryComplete: true`, one admitted record, `omitted: 1`, inventory covering only the admitted record → contract error). AC #2's sweep is the bulk of the work: list every return/throw site of the eight functions first, map the ones TASK-779 or existing tests reach by reading those tests, then probe only the unmapped ones — one instrumented full-suite run can carry many tags at once (one tag per site, `appendFileSync` to one file), so batch the probes into one or two runs rather than one run per site; restore from the cp after each run and confirm `git status --short -- lib/` is empty. Known suite flake: `tests/extensions/project-tools.test.ts` abort-terminates-child (2000 ms condition); rerun before believing it. Call `analysis_complexity` one metric per turn, never in parallel, at most twice per metric; use the direct diagnostic `bunx fallow health --complexity --format json --quiet --no-cache` filtered to the eight functions for other confirmations (D-024). Never run `git checkout`, `git stash`, `git reset`, or any git write; the driver commits. Never pass `title` to `task_edit`; only `implementationNotes` (paste the whole existing body back plus your additions) and `checkAc`. Never touch `missions/reviews/`. Record the slice-start `S` (HEAD at launch) and the D-015 in-session check verbatim; tick every satisfied criterion (D-020 for the coordinator-verdict one) and end with `outcome: success` — Drive's parser accepts only success|failure|partial|completed, so a blocked stop must still be reported with your full record in these notes first.

### Worker evidence (Pi worker; TASK-787)

S = `91524cd47aa3c249445fd92b4c8838fa86d5eeef` (HEAD at launch). `analysis_status`: resolution package-native, Fallow 2.54.2 bound dead-code (project/paths), duplication (project), complexity (project; cyclomatic/cognitive/crap), changed-scope-audit (changed), trace (target), fix-preview (project); boundary-conformance unbound (provider-not-configured). Fresh `analysis_complexity({metric:"cyclomatic"})`: project-scope findings, verdict fail, all eight rows present (native Fallow summary files_analyzed 616, functions_analyzed 14608, functions_above_threshold 202). Direct diagnostic `bunx fallow health --complexity --format json --quiet --no-cache` filtered to names, verbatim owned rows:
```
{"path":"lib/memory/retirement-receipts.ts","name":"readRetirementReceiptInventory","line":71,"cyclomatic":40,"cognitive":87,"crap":45.4,"coverage_tier":"high","severity":"critical"}
{"path":"lib/memory/consolidation-sources.ts","name":"collectConsolidationSources","line":767,"cyclomatic":36,"cognitive":85,"crap":40.4,"coverage_tier":"high","severity":"critical"}
{"path":"lib/memory/living-memory.ts","name":"recoverAcceptedEpisodeFinalization","line":1049,"cyclomatic":26,"cognitive":40,"crap":172,"coverage_tier":"partial","severity":"critical"}
{"path":"lib/memory/retirement-store.ts","name":"applyUnderLock","line":540,"cyclomatic":26,"cognitive":24,"crap":172,"coverage_tier":"partial","severity":"critical"}
{"path":"lib/memory/knowledge-store.ts","name":"retrieveKnowledge","line":152,"cyclomatic":24,"cognitive":54,"crap":148.4,"coverage_tier":"partial","severity":"critical"}
{"path":"lib/memory/consolidation-proposals.ts","name":"readProposalMaterializations","line":548,"cyclomatic":22,"cognitive":26,"crap":126.5,"coverage_tier":"partial","severity":"critical"}
{"path":"lib/memory/consolidation-sources.ts","name":"isEpisodePruneJournal","line":715,"cyclomatic":22,"cognitive":8,"crap":126.5,"coverage_tier":"partial","severity":"critical"}
{"path":"lib/memory/retirement-store.ts","name":"candidateConflict","line":766,"cyclomatic":20,"cognitive":13,"crap":106.4,"coverage_tier":"partial","severity":"critical"}
```
No structural edit or finding acted on; INV-003 trace-before-edit not engaged. No seam. Production bodies byte-identical to S. No suppression/config/threshold/ignore/entry changes or prior test edits. Owned new files: `tests/memory/consolidation-source-contract-characterization.test.ts`, `tests/memory/proposal-disappeared-characterization.test.ts`.

Return/throw inventory from TypeScript AST (line numbers at S; nested functions excluded) and **final cp-backed full-suite appendFileSync probe hit counts verbatim** (`bun run test` exit 0, 286 files/3910 tests; cp restores all six instrumented lib files, `git status --short -- lib/` empty). Sites with preexisting coverage mapped by existing `tests/memory/consolidation-sources.test.ts`, `tests/memory/living-memory.test.ts`, or TASK-779's five characterization files; every function/site including previously mapped sites was tagged in this stronger full-suite check. Initial probe before new cases (exit 0) showed 0 at collect:806,824,829,942; proposal:581; apply:599. Final inventory (return/throw; every other listed site has >=1):
```
recoverAcceptedEpisodeFinalization return 1117=99, throw 1124=1, return 1173=11
applyUnderLock return 560=3, throw 578=5, return 583=20, return 590=33, throw 599=0, return 658=16, return 684=19
retrieveKnowledge return 267=74
readProposalMaterializations throw 556=2, return 562=27, throw 563=2, throw 570=2, throw 581=1, throw 593=9, throw 598=8, return 619=18
isEpisodePruneJournal return 717=8, return 740=24, return 750=12, return 755=10, return 757=19
candidateConflict return 781=8, return 797=8, return 807=4, return 816=6, return 823=2, return 832=3, return 844=1, return 856=3, return 863=42
readRetirementReceiptInventory return 273=9, return 275=114
collectConsolidationSources throw 806=1, throw 824=1, throw 829=1, throw 838=1, throw 843=1, throw 854=1, throw 872=2, throw 885=2, throw 892=1, throw 921=1, throw 934=1, throw 942=1, return 967=137
```
Pinned sites → shipped entry point → new test: collect:942 → `collectConsolidationSources` → `rejects a complete inventory that lists the admitted record but not the omitted one without exposing a partial result` (one valid admitted record, omitted=1, only admitted inventory, previous source processed, exact typed error + undefined output); collect:806 → same entry → `rejects duplicate source ids before collecting the second source`; collect:824 → same entry → `rejects a source that does not declare inventory completeness`; collect:829 → same entry → `rejects an invalid omitted count`; proposal:581 → `createConsolidationProposalStore({projectRoot}).readMaterializations()` → `fails the entire read when an enumerated proposal disappears before its body is read` (filesystem boundary mock deletes the enumerated file just before safe read; exact error; next read empty). No production seam required. Existing tests cover every other hit site (TASK-779 variant map for six functions and existing consolidation-source/retirement receipt tests).

Q-002 residual risk for TASK-780: `applyUnderLock` throw at retirement-store.ts:599 stays 0. No shipped input can drive it: `authorizeCandidates` returns `authorized: []` for unhealthy `receipts`, and `applyUnderLock` returns at :590 whenever `authorized.length === 0`; only a manufactured invalid internal return value (without a production seam that changes control flow) would reach :599. This is a defensive dead-by-construction throw, not an untested externally reachable contract; flag it before refactoring.

Cp-backed non-vacuity: with all four contract guards short-circuited, `bunx vitest run tests/memory/consolidation-source-contract-characterization.test.ts` exit 1, **4 failed** (missing error/other error for each); restore from `/tmp/task787-contract-nonvacuity.ts`; with proposal raw-undefined guard short-circuited, `bunx vitest run tests/memory/proposal-disappeared-characterization.test.ts` exit 1, **1 failed** (got generic `expected input to be a string or buffer` rather than exact disappeared error); restore from `/tmp/task787-proposal-nonvacuity.ts`. `git status --short -- lib/` empty after each restoration. The newly covered branches are discriminated, not vacuous.

Five final stage gates after both new files: `bun run test` exit 0: `Test Files 286 passed (286)`, `Tests 3910 passed (3910)`; `bun run lint` exit 0: `Checked 642 files in 357ms. No fixes applied.`; `bun run typecheck` exit 0: `$ tsc --noEmit`; `bun run check:reachability` exit 0: `reachability: 212/212 runtime lib modules reached; 13 type-only lib modules exempt; 0 staged`; `bun run check:suppressions -- --base main` exit 0: `suppression check passed`. Task-close `analysis_audit({base:"91524cd47aa3c249445fd92b4c8838fa86d5eeef"})`: completed/pass; zero findings, 0 dead-code issues, 0 complexity findings, 0 clone groups; changed_files_count 3 includes task state; no owned findings.

D-015 in-session freeze (S literal; coordinator post-commit verdict pending under D-020):
```
$ git diff --name-status --diff-filter=MDR 91524cd47aa3c249445fd92b4c8838fa86d5eeef -- tests/
$ git status --porcelain -- tests/
?? tests/memory/consolidation-source-contract-characterization.test.ts
?? tests/memory/proposal-disappeared-characterization.test.ts
$ git diff -U0 91524cd47aa3c249445fd92b4c8838fa86d5eeef -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('
grep exit: 1
$ git status --short -- lib/
```
Grep diff excludes untracked files; direct content review of both new files shows no skip/only/todo call. No git operation on `missions/reviews/`; Drive owns the commit and coordinator owns the post-commit freeze verdict.

### Coordinator D-015 verdict (2026-09-29 05:00Z, successor #3) — PASS, task Done

Run `run-3741fef4`, attempt 1 on `openai-codex/gpt-6-sol`, 13 min. `S = 91524cd4`; Drive commit `86b44e34` (parent confirmed `91524cd4`); state commit `3933993f`. Coordinator re-run from `S`: `git diff --name-status --diff-filter=MDR -- tests/` empty; `git status --porcelain -- tests/` empty; skip/only/todo grep empty; non-test paths empty. Drive commit = exactly two added files, `tests/memory/consolidation-source-contract-characterization.test.ts` and `tests/memory/proposal-disappeared-characterization.test.ts` (5 cases, non-vacuity recorded). The AST return/throw inventory with full-suite probe hit counts above is the authoritative reachability map for TASK-780; the single zero-hit site left, `applyUnderLock` throw `retirement-store.ts:599`, is dead-by-construction and recorded as Q-002 residual risk. Five `verify passed` events. Worker used `analysis_status`, `analysis_complexity` (one metric), `analysis_audit`; git use read-only. AC #5 freeze verdict: PASS. This commit is `C` for TASK-780 attempt 2.
