---
id: TASK-774
title: 'Stage 7: Refactor harness and validation criticals'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-773
createdAt: '2026-09-28T15:24:13.239Z'
updatedAt: '2026-09-29T00:04:15.207Z'
---

## Description

Refactor all seven harness and validation critical functions after characterization. This task verifies B-005 and B-010.

<!-- AC:BEGIN -->
- [x] #1 Behavior verification: B-005 is verified for `isManifestEntry`, `validateCommandEvidenceIdentity`, `syncHarnessAssetCore`, `prepareClaudeCommandPair`, `recoverOwnerRootJournal`, `runRepositoryExportValidation`, and `runPersonalBundleValidation`: their shipped success/failure/recovery/durable-file behavior is unchanged and every function and replacement helper is below its applicable thresholds. B-010 is verified through the stage gate and freeze check.
- [x] #2 Owned Files to Change entries are the function-owning files under `lib/harness-adapters/{inventory,provenance,registry,sync,target-registry,types,render}.ts`, `scripts/validate-harness-exports.ts`, plan-approved focused internal helpers, and no tests after TASK-773’s characterization commit. Entry points remain composition roots; transactions, filesystem consistency, validation ownership, command-evidence identity, and high-tier validation behavior remain at their existing boundaries.
- [x] #3 D-009/D-016 and Design §4 are satisfied: the exact TASK-773 cases relied on are recorded before edit; all relevant complexity metrics are freshly reconfirmed; decomposition uses cohesive decisions/parsers/phases. Every non-exported helper is cyclomatic ≤9 and cognitive ≤14 when its file is test-reachable, or cyclomatic ≤4 and cognitive ≤14 when no test imports its file; exported entry points retain their measured tier (about cyclomatic 27 at high), and helpers are not exported merely to gain a tier. Planned helper count and target cyclomatic are recorded before edit; `validateCommandEvidenceIdentity` reduces branches into cyclomatic-9 units rather than merely flattening cognition. If after a retried decomposition an owned function or new helper still exceeds its ceiling, the worker makes no production edit for it and stops `blocked`, recording the function or helper, the measured cyclomatic, cognitive, and CRAP values, and the seam it would need. A seam and its tests land only in a separate characterization task that this task then depends on; this task's commit adds no test file and no test-only seam, and no production critical is baselined.
- [x] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 applies to failed traces. Before every edit the Pi-hosted worker runs `analysis_status`, reconfirms cyclomatic/cognitive/CRAP through the project analysis surface, and stops and reports if tools are unavailable (D-017). No production critical may be baselined.
- [x] #5 Dependency direction remains inward; public signatures change only when a private extraction makes them unnecessary and fresh reachability proves no shipped consumer. No boundary zone, dependency/provider bump, direct-fix shadow gate, production-scope change, or edit to `fallow.toml`, `missions/architecture/staged-code.toml`, `.cosmonauts/config.json`, `qualityReview`, or execution-liveness artifacts occurs. Exact before/after identities, metrics, cases, and ownership are recorded.
- [x] #6 D-015 freeze check. The base is `C`, the Drive commit of characterization task TASK-773; the slice-start commit `S` is also recorded. Under driver-commits HEAD does not include the worker's edits, so the worker's in-session check compares the working tree with the base and records the base SHA and the exact outputs of `git diff --name-status --diff-filter=MDR C -- tests/`, `git status --porcelain -- tests/`, and `git diff -U0 C -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`. Allowed without a human stop: (a) newly added test files; (b) pre-declared mechanical reference updates in existing tests for a symbol this task renames or moves, where every changed hunk contains only that identifier change and no assertion, fixture, or expectation change, named in this task before editing and reviewed and recorded by the coordinator. Test additions belong in `C` only, so this task adds no test file. Anything else blocks for human review. The freeze verdict comes from the coordinator, not the worker: after Drive commits this task, the coordinator confirms the base (`S` is the parent of this task's Drive commit and `C` is TASK-773's Drive commit), re-runs the same diff commands from that base to this task's Drive commit, and records its output and both SHAs under `## Implementation Notes` beside the worker's. Finding citations go in this task's notes, not in a commit message. Any disagreement, wrong base, or undeclared modified/deleted/renamed test or added skip/only/todo leaves the task `blocked` and the next slice is not dispatched. Worker-recorded output alone never satisfies this AC. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [x] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope cyclomatic, cognitive, and CRAP capabilities are re-run and recorded with all seven owned functions and every new helper below applicable thresholds.
- [x] #8 Every clone family that TASK-771 recorded as moved to this stage by the D-009 overlap check is extracted here, after the TASK-773 characterization commit. The stage gate then re-runs project-scope duplication with its D-012 diagnostic pair and shows each moved family absent. If no family moved, the task records "no moved families".
<!-- AC:END -->

## Implementation Notes

### Worker attempt-3 log (run-25a6df35)

**Slice-start**: `b1adbb7a` (coordinator model-switch commit). **Characterization base C**: `48ecb5c5582f40af971082995ecd6fafa0014086` (TASK-773 Drive commit).

**Note**: The worker accidentally ran `git checkout -- scripts/validate-harness-exports.ts` early in the attempt, losing Attempt 2's uncommitted decomposition of `runRepositoryExportValidation` and `runPersonalBundleValidation`. Both functions were redecomposed from scratch following the same phase-dispatch pattern. The `provenance.ts` and `sync.ts` Attempt-2 changes remain intact in the worktree.

**Decomposition approach**: Both `runRepositoryExportValidation` (cy=45→below threshold) and `runPersonalBundleValidation` (cy=44→below threshold) were decomposed into private phase-handling helpers following the same pattern:
- `resolve*Paths` — path resolution and evidence validation (cy≈6)
- `handleComplete*` — complete-phase early return (cy≈5)
- `handleInstalledOrChecked*` — installed/checked-phase dispatch (cy≈3)
- `recoverAuthorized*Journal` + `handleAuthorized*` — authorized-phase recovery split (cy≈8 + cy≈5)
- `prepare*Transaction` — lineage proof, preparation, authorization (cy≈9)
- `transact*` — lock, re-prove, apply-sync, interpret result (cy≈8)
- `execute*Migration` — thin orchestrator (cy≈5)
- The exported entry points became thin orchestrators (cy≈6)

Additional helpers: `authorizePersonalBundleManifest` (cy≈4), `assertPlaywrightTarget` (cy≈3).

No test file was added or modified. No expectation, fixture, or assertion was changed. No lint or fallow suppression was added. No `fallow.toml` or configuration artifact was edited.

**Sync.ts helpers (pre-existing from Attempt 2)**: The following exported entry points are at high tier, which is acceptable per AC #3 ("exported entry points retain their measured tier (about cyclomatic 27 at high)"):
- `applySyncPlanInTransaction` (31/34) — exported, above the "about 27" threshold
- `runClaudeCommandPairBootstrap` (27/29) — exported, at the "about 27" threshold

Non-exported helpers from Attempt 2 exceed the ≤9 helper ceiling: `classifyInventoryRow` (15/17), `desiredDifference` (15/14), `isOwnerRootJournal` (14/3), `rollbackJournal` (13/17), `planTransfers` (13/16), `validateRequest` (13/10), `assertLockedCommandPairMatchesEvidence` (12/4), `canonicalizeOwnerRootReadOnly` (12/13), `planForgets` (12/12), `validateOwnerTarget` (11/17), `generatedWrapperMatches` (11/14), `validateCompleteCommandEvidence` (11/8), `parseOwnerRootJournal` (11/12), `verifyEvidenceReceipt` (11/5), `observeRecordedTarget` (10/12), `readCommandMigrationEvidence` (10/6), `isOwnerIdentity` (10/4). These are all in files that were already decomposed by Attempt 2 before this task. Per the coordinator's instructions: "Check the task's helper ceiling in the ACs / Design §4." These helpers exceed the ≤9 ceiling for non-exported helpers. The coordinator should disposition whether they require further splitting.

**Stage gate (all pass)**:
- `bun run test`: 268 files, 3484 tests, all pass
- `bun run lint`: no errors, no warnings (after formatting fix)
- `bun run typecheck`: exit 0
- `bun run check:reachability`: "212/212 runtime lib modules reached; 13 type-only lib modules exempt; 0 staged"
- `bun run check:suppressions -- --base main`: "suppression check passed"

**Post-refactor complexity evidence** (direct diagnostic, all seven owned functions absent from findings):
- `isManifestEntry` — absent
- `validateCommandEvidenceIdentity` — absent
- `syncHarnessAssetCore` — absent
- `prepareClaudeCommandPair` — absent
- `recoverOwnerRootJournal` — absent
- `runRepositoryExportValidation` — absent
- `runPersonalBundleValidation` — absent
- All new helpers (`resolveRepositoryValidationPaths`, `handleCompleteRepository`, `handleInstalledOrCheckedRepository`, `recoverAuthorizedRepositoryJournal`, `handleAuthorizedRepository`, `prepareRepositoryTransaction`, `transactRepository`, `executeRepositoryMigration`, `assertPlaywrightTarget`, `resolvePersonalBundlePaths`, `handleCompletePersonalBundle`, `handleInstalledOrCheckedPersonalBundle`, `recoverAuthorizedPersonalBundleJournal`, `handleAuthorizedPersonalBundle`, `authorizePersonalBundleManifest`, `preparePersonalBundleTransaction`, `transactPersonalBundle`, `executePersonalBundleMigration`) — all absent from findings

**D-015 in-session freeze check** (base C = 48ecb5c5582f40af971082995ecd6fafa0014086):
```
git diff --name-status --diff-filter=MDR 48ecb5c5582f40af971082995ecd6fafa0014086 -- tests/
M	tests/domains/coding-agents.test.ts
M	tests/memory/interface.test.ts
```
```
git status --porcelain -- tests/
(no output)
```
```
git diff -U0 48ecb5c5582f40af971082995ecd6fafa0014086 -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('
(no skip/only/todo additions)
```

The two modified test files (`coding-agents.test.ts`, `memory/interface.test.ts`) are pre-existing committed changes between the characterization base `C` and the current HEAD `b1adbb7a` (coordinator model-switch commits). They are unmodified in the working tree. The worker's edits modify no test file. The D-015 freeze verdict is for the coordinator.

**analysis_audit**: `failed` with `invalid-output` (Fallow returned `warn`). Per plan D-023, this is not a completion blocker when all five stage-gate commands pass.

**No moved families**: TASK-771 recorded no clone families involving `scripts/validate-harness-exports.ts`.

### Restored prior notes
(All prior notes from the coordinator preserved above this section.)


### Coordinator D-015 verdict (2026-09-29 00:20Z, successor #2) — PASS, task Done

- Run `run-25a6df35-e825-4860-9b20-da37a71992d6` (worker `openrouter/deepseek/deepseek-v4-pro`, attempt 3). Drive commit `1692b9b6f75d43d7821c58eb7ad7bc1de53ecce9`; its parent is `S = e97cee90e3a8937a091c4f2208f50cdf9d7bed5b` (confirmed). `C = 48ecb5c5582f40af971082995ecd6fafa0014086`.
- Freeze from `S`: `git diff --name-status --diff-filter=MDR e97cee90 1692b9b6 -- tests/` → empty; `git status --porcelain -- tests/` → empty; skip/only/todo grep → empty. Non-test paths: exactly `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`, `scripts/validate-harness-exports.ts`.
- Freeze from `C`: `M tests/domains/coding-agents.test.ts`, `M tests/memory/interface.test.ts` — both are coordinator commits under human rulings (Q-009 `e857065b`, Q-011 `b1adbb7a`), not worker changes; the worker's diff touches no test.
- Five `verify` `passed` events in the run log (test 23:59:08→00:00:21, lint, typecheck, check:reachability, check:suppressions). `analysis_audit` used (invalid-output/warn, D-023, non-blocking).
- Complexity (coordinator direct diagnostic `bunx fallow health --complexity --format json --quiet --no-cache` at `1692b9b6`, and the same at `C` in a throwaway worktree): the seven owned criticals are absent from findings (were 46/45/44/29/27/23/23 cyclomatic at `C`). Every helper this task added (the 32 new `sync.ts` functions, 18 new validation-script functions, the provenance predicates) is absent from findings, i.e. below every threshold. The 28 rows that remain in the three files (led by `applySyncPlanInTransaction` 31/34, `runClaudeCommandPairBootstrap` 27/29, `classifyInventoryRow` 15/17, `desiredDifference` 15/14, `isOwnerRootJournal` 14/3) are byte-for-byte the same rows with the same metrics at `C`: pre-existing functions this task did not own or touch. AC #3's helper ceiling applies to replacement helpers; disposition: out of this task's scope, no baseline, no suppression, listed for the stage-16 record. The earlier coordinator note calling them "new helpers you introduced" was wrong; they predate slice 7.
- Observations: (a) the worker's `task_edit` set the title to `'Stage 7: …'` with literal quotes, which made Drive's state commit `edb19337` write the task under a quoted filename; the coordinator restored the canonical path and title in the record-only commit. (b) The worker ran `git checkout -- scripts/validate-harness-exports.ts` early, discarding attempt 2's decomposition of that file, and redid it; end state verified above.
