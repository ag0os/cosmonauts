---
id: TASK-772
title: 'Stage 5: Extract memory, skills, and task clones'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-770
  - TASK-771
createdAt: '2026-09-28T15:23:32.781Z'
updatedAt: '2026-09-28T19:26:02.230Z'
---

## Description

Eliminate the remaining memory, skills, and task clone families assigned to duplication cleanup, record the two three-file refusals, and reconcile the 41/2 split. This task verifies B-004 and B-010.

<!-- AC:BEGIN -->
- [x] #1 Behavior verification: B-004 is verified by removing every owned reproduced one-/two-file family, retaining the two three-file families with exact files/reasons and measured totals, and preserving the actual surface outcome; B-010 is verified by a green stage and freeze check.
- [x] #2 Owned families are judgment-provider/living-memory byte formatting; judgment-provider/retirement-receipt exact-object helpers outside the baseline family; proposal/retirement validation; consolidation-source same-file validation and source/store reads; durable-files with knowledge/retirement stores; episode-transition and episode locking; knowledge-record/OKF parsing; knowledge/markdown-store reads; markdown-store paths; proposal-files/retirement-store operations; retirement receipt/store parsing; and task-manager dependency/status work. Owned Files to Change entries are `cli/memory/judgment-provider.ts`, `lib/memory/{consolidation-proposals,consolidation-sources,durable-files,episode-transition-lock,episode,knowledge-records,knowledge-store,living-memory,markdown-store,okf,proposal-files,retirement-receipts,retirement-store}.ts`, `lib/tasks/{lock,task-manager}.ts`, focused internal helpers, and new focused tests. `lib/memory/consolidation-receipts.ts` and the consolidation-proposals/consolidation-receipts family (supplied family 26, inside partial-tier `readProposalMaterializations`) are not edited in this stage, stay present in the stage-5 duplication evidence, and are owned by TASK-780.
- [x] #3 D-008’s exact three-file dispositions are recorded: validation stays local across `cli/memory/judgment-provider.ts`, `lib/memory/consolidation-proposals.ts`, and `lib/memory/retirement-receipts.ts` because model-output and persisted-record trust/error ownership differ; read loops stay local across `lib/memory/consolidation-sources.ts`, `lib/memory/knowledge-store.ts`, and `lib/memory/living-memory.ts` because no-follow, consistency, error, and record-validation semantics differ. The persisted 87-group mapping is reconciled to 41 extract families/2 baseline families, fresh unmapped groups are classified by file count, and living-memory, proposals/receipts, and exporter families gated by below-high critical functions remain pending stages 15, 13, and 11 respectively.
- [x] #4 D-009 is enforced before extraction: current clone ranges are compared with current partial/none/missing-tier critical ranges; any newly overlapping family moves to its critical owner and is recorded. Local-first/narrow-primitive sharing preserves trust boundaries, TOCTOU, lock, durable-file, validation, and error semantics; a one-/two-file family that cannot be removed without violating ratified scope or dependency direction stops for human scope review and is not silently baselined.
- [x] #5 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 requires reproduced-but-untraceable findings to record failed/narrow successful traces plus repository-wide search and escalate without edit. Before every edit the Pi-hosted worker runs `analysis_status`, traces each owned group through the project analysis surface, and stops and reports if tools are unavailable (D-017).
- [x] #6 D-012 evidence pairs the completed project-scope duplication surface outcome with direct diagnostic `fallow ["dupes", "--format", "json", "--quiet", "--no-cache"]`, never treating diagnostic evidence as a surface pass. Every owned group is absent from the diagnostic inventory and its pre-edit location trace; the two baseline families and three moved families remain explicitly visible with dispositions. No public-entry/configuration/boundary/dependency change substitutes for extraction.
- [x] #7 D-015 freeze check. The base is the slice-start commit `S`, the HEAD the worker started from. Under driver-commits HEAD does not include the worker's edits, so the worker's in-session check compares the working tree with the base and records the base SHA and the exact outputs of `git diff --name-status --diff-filter=MDR S -- tests/`, `git status --porcelain -- tests/`, and `git diff -U0 S -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`. Allowed without a human stop: (a) newly added test files; (b) pre-declared mechanical reference updates in existing tests for a symbol this task renames or moves, where every changed hunk contains only that identifier change and no assertion, fixture, or expectation change, named in this task before editing and reviewed and recorded by the coordinator. Anything else blocks for human review. The freeze verdict comes from the coordinator, not the worker: after Drive commits this task, the coordinator confirms the base (`S` is the parent of this task's Drive commit), re-runs the same diff commands from that base to this task's Drive commit, and records its output and both SHAs under `## Implementation Notes` beside the worker's. Finding citations go in this task's notes, not in a commit message. Any disagreement, wrong base, or undeclared modified/deleted/renamed test or added skip/only/todo leaves the task `blocked` and the next slice is not dispatched. Worker-recorded output alone never satisfies this AC. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [x] #8 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope duplication and the D-012 diagnostic pair are re-run and recorded, with all owned families absent and the 41/2 reconciliation plus pending critical-owned families explicit. The post-edit surface duplication outcome is completed with `verdict: "fail"`; any other state is recorded as it is and fails this stage (Design §3).
<!-- AC:END -->

## Implementation Notes

### Standing coordinator note (2026-09-28, applies to every attempt)

Drive commits this task only when **every** acceptance criterion is checked; an unchecked criterion ends the run `task_blocked` with nothing committed and Drive then overwrites these notes with its block reason. The in-process worker prompt does not say this, so: before your final report, (1) record your evidence (analysis_status output, traces, the D-015 in-session check verbatim against the slice-start commit, stage-gate exit codes and result lines) with `task_edit` `implementationNotes` (append, never drop earlier sections); (2) tick every satisfied criterion with `task_edit` `checkAc`; for a coordinator-verdict freeze criterion, plan D-020 applies: tick it once your in-session half is recorded and the coordinator appends the post-commit verdict; (3) report `outcome: success` only then. Leave source and test files uncommitted; the driver commits. Never run git operations on `missions/reviews/`; write record rows to the record files and copy them here.

Addendum (2026-09-28, plan D-023): a task-close `analysis_audit` that returns `failed` (e.g. `invalid-output` because Fallow answered `warn`) is recorded in these notes with its failure class, the verbatim direct diagnostic `fallow audit --base <sha> --format json --quiet --no-cache --dead-code-baseline .fallow-baselines/dead-code.json --health-baseline .fallow-baselines/health.json --dupes-baseline .fallow-baselines/dupes.json`, and the owning slice of each flagged finding; it is not a completion blocker when the five stage-gate commands pass and every owned finding is dispositioned. Do not edit `fallow-provider.ts` for it.

### Worker attempt (2026-09-28)

Slice-start commit `S`: `60338d6a8d0ae34b1944691d021089419d2adb99`, recorded before source edits. Drive owns commits; source changes remain uncommitted.

#### Analysis consent, traces, and overlap disposition

- `analysis_status` was run before edits and repeatedly during the refactor. Fallow 2.54.2 reported `dead-code`, `duplication`, cyclomatic/cognitive/CRAP `complexity`, `trace`, `fix-preview`, and `changed-scope-audit` bound; boundary conformance remained `unbound` / `provider-not-configured` as recorded by the plan.
- The no-cache slice-start diagnostic reproduced 37 groups / 76 instances / 1,085 duplicated lines / 1.1755910460051575% across 18 files. Current reproduced owned groups were traced through the analysis surface before extraction. Stale supplied coordinates that no longer selected a group returned provider exit 2 with empty stderr and were not treated as current findings; current locations supplied duplicate evidence. No owned range overlapped the `runPass` critical range. The nine-group living-memory family was left to TASK-782; the proposals/receipts family to TASK-780; the exporter family to TASK-778. Eight validation-script groups already transferred by TASK-771's D-009 check remain for TASK-774.
- Post-edit traces at old owned locations returned provider exit 2 with empty stderr where no duplicate remained. Coordinates at judgment-provider 308/320 and retirement-receipts 594 now resolve only to the ratified three-file validation baseline; proposals 551 resolves only to TASK-780's protected proposals/receipts family. The former owned two-file identities at those coordinates are absent. Direct inventory comparison independently confirms all 16 owned slice-start groups are absent.
- Path-scoped dead-code analysis over all changed/new source files found only the recorded Fallow false positive `TaskManager.getTaskDependencyStatusSnapshot`. It remains live at `lib/driver/drive-graph-runner.ts:578`; repository search also found its declaration at `lib/tasks/task-manager.ts:570`. This method was not edited or removed. The task-manager clone extraction changed only list-filter reuse.

#### Behavior-preserving extraction

- Added focused internal primitives for byte-ceiling formatting, optional no-follow regular-file reads, memory-query matching, episode warning formatting, required OKF fields, and path containment.
- Consolidated same-file source-record validation, markdown record hashing, and task-list filtering.
- Preserved caller-owned error text, trust/validation ownership, no-follow and bounded-read checks, durable file behavior, TOCTOU checks, lock behavior, query field ordering, and public entry points. `lib/memory/consolidation-receipts.ts` and the TASK-780 body were not edited. No tests, expectations, fixtures, suppressions, thresholds, ignores, entries, dependencies, configuration, boundary records, or `fallow.toml` changed.

#### D-008 / D-012 duplication evidence and 41/2 reconciliation

- The persisted starting map remains reconciled as 87 supplied groups -> 43 families: 41 extraction families and 2 three-file baselines. The fresh Stage-1 reconciliation was 85 groups / 43 families / 172 instances / 2,990 lines. After prior extraction slices, this slice began at 37 groups; its 16 owned groups disappeared.
- Project-scope `analysis_duplication` completed with the required actual `verdict: fail` and 21 remaining groups.
- Direct diagnostic invocation: `fallow ["dupes", "--format", "json", "--quiet", "--no-cache"]`; exit 0; 21 groups / 44 instances / 752 duplicated lines / 0.814425732387502% across 9 files. Surface and direct diagnostic inventories agree.
- Baseline 1 remains visible exactly at `cli/memory/judgment-provider.ts:307-332`, `lib/memory/consolidation-proposals.ts:803-828`, and `lib/memory/retirement-receipts.ts:580-605`: model-output and persisted-record trust/error ownership differ, so validation stays local.
- Baseline 2 remains visible exactly at `lib/memory/consolidation-sources.ts:1468-1484`, `lib/memory/knowledge-store.ts:818-834`, and `lib/memory/living-memory.ts:2460-2476`: no-follow, consistency, error, and record-validation semantics differ, so bounded reads stay local.
- The three planned moved families remain visible and pending: proposals/receipts at proposals `551-566` / receipts `66-80` -> TASK-780; nine living-memory groups / 174 duplicated lines -> TASK-782; exporter `467-475` / `484-492` -> TASK-778. The eight validation-script groups transferred earlier remain pending TASK-774. No fresh unmapped group appeared.

#### Verification and B-010 stage gate

- Focused existing suites: 8 files / 231 tests passed (`memory` CLI, consolidation sources, episode transition locking, interface, living memory, markdown store, and both task-manager suites).
- `bun run test`: exit 0; 266 files / 3,475 tests passed.
- `bun run lint`: exit 0; 622 files checked.
- `bun run typecheck`: exit 0.
- `bun run check:reachability`: exit 0; `reachability: 212/212 runtime lib modules reached; 13 type-only lib modules exempt; 0 staged`.
- `bun run check:suppressions -- --base main`: exit 0; `suppression check passed`.

#### Worker D-015 freeze evidence

Base `S`: `60338d6a8d0ae34b1944691d021089419d2adb99`; current pre-Drive HEAD was the identical SHA.

- `git diff --name-status --diff-filter=MDR 60338d6a8d0ae34b1944691d021089419d2adb99 -- tests/` -> no output.
- `git status --porcelain -- tests/` -> no output.
- `git diff -U0 60338d6a8d0ae34b1944691d021089419d2adb99 -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('` -> no output (no match).

No test file changed. Coordinator must append the post-Drive-commit D-015 verdict.

#### Task-close changed-scope audit (D-023)

- `analysis_audit` with literal base `60338d6a8d0ae34b1944691d021089419d2adb99` returned `failed`, failure class `invalid-output`: provider exit 0 returned unsupported adapter verdict `warn` instead of `pass` or `fail`; stderr was empty.
- Verbatim diagnostic: `fallow audit --base 60338d6a8d0ae34b1944691d021089419d2adb99 --format json --quiet --no-cache --dead-code-baseline .fallow-baselines/dead-code.json --health-baseline .fallow-baselines/health.json --dupes-baseline .fallow-baselines/dupes.json`; exit 0; verdict `warn`; 21 changed files; 0 dead-code issues; 0 complexity findings; 12 changed-scope clone groups.
- Those 12 groups are fully dispositioned: validation baseline (TASK-772), bounded-read baseline (TASK-772), protected proposals/receipts family (TASK-780), and the nine-group living-memory family (TASK-782). No TASK-772 extraction group is flagged. Per D-023 this adapter failure is recorded and is not a completion blocker because all five gates pass and every finding has an owner.

### Coordinator D-015 verdict (2026-09-28, after Drive commit)

- Drive commit `3346fa91ff8abf814d5d0b644a0ebd7f8014c8fa` (run `run-2d2e01fa-6cbc-46af-a2ca-5e4d48ece363`, attempt 1), parent `60338d6a` = slice-start `S`. State commit `f53b552e`.
- `git diff --name-status --diff-filter=MDR 60338d6a 3346fa91 -- tests/` → empty; no added test files; `git status --porcelain -- tests/` → empty; skip/only/todo grep → none. **Verdict: freeze check clean; not blocked.**
- INV-002 overlap check on `lib/memory/living-memory.ts`: the three hunks sit at lines 4 (imports), 1625-1633 (`readInventoryFile`), and after 2458 (new helper following `throwIfAborted`); none falls inside `runPass` or `recoverAcceptedEpisodeFinalization` (1043-1171 at `S`), whose characterization stages come later.
- Postflight (`verify` phase `post`): all five gates `passed`. Task-close `analysis_audit` recorded per D-023 with the direct diagnostic; the 12 flagged groups are dispositioned (two three-file baselines here, proposals/receipts → TASK-780, living-memory family → TASK-782). Worker used `analysis_status`, `analysis_trace` (124), `analysis_duplication`, `analysis_dead_code`, `analysis_complexity`, `analysis_audit` (INV-003). Both three-file baseline reasons are recorded above (validation family; bounded-read family).
