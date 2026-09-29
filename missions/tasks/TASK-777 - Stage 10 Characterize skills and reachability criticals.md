---
id: TASK-777
title: 'Stage 10: Characterize skills and reachability criticals'
status: Done
priority: medium
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-772
createdAt: '2026-09-28T15:25:14.192Z'
updatedAt: '2026-09-29T00:45:22.277Z'
---

## Description

Land characterization-only coverage for skills and reachability critical functions. This task verifies B-005 and B-010 and is independent of stages 6-9.

<!-- AC:BEGIN -->
- [x] #1 Behavior verification: B-005 is verified at characterization level for skills/reachability entry points by pinning their shipped synchronization, catalogue, row, and reachability outcomes before refactor; B-010 is verified through a green characterization-only stage and freeze check.
- [x] #2 Owned functions are missing-tier `runHarnessSync`, partial-tier `groupCatalogue` and `enhancedRows`, and no-coverage `visit`. Their signatures and return sites are enumerated into named observable variants/durable outputs; `visit` pins the reachability verdict for current `missions/architecture/staged-code.toml`, and `groupCatalogue` pins behavior surrounding its pending same-file clone family. Owned Files to Change entries are new test files under `tests/`; `cli/harness/subcommand.ts`, `lib/skills/exporter.ts`, and `scripts/check-reachability.ts` are observed and not edited except for a bounded seam under AC #3.
- [x] #3 D-009/D-016 are satisfied: `static_estimated` absent/partial/none tiers all trigger this separate characterization commit, exact files/cases are recorded for stage 11, tests assert entry-point results rather than helper calls, and production edits are bounded as follows. Production files stay unedited in this characterization commit, except for a testability seam that the spec's Assumptions allow and that is named in this task's `## Implementation Notes` before the commit. The seam is limited to module-boundary visibility or injection, such as exporting an existing top-level declaration or passing an existing options parameter, and it leaves the body and control flow of every owned critical function (`runHarnessSync`, `groupCatalogue`, `enhancedRows`, `visit`) byte-identical. The recorded evidence shows that the diff from `S` over `cli/harness/subcommand.ts`, `lib/skills/exporter.ts`, and `scripts/check-reachability.ts`, in session against the working tree and from `S` to this task's Drive commit, is empty or touches no line inside any owned function's range at `S`, and that each owned function's fresh cyclomatic, cognitive, and CRAP values and its start and end lines, allowing only an offset from seam lines above it, equal the values at `S`. Any other production change stops the task for escalation. The commit's test changes remain new test files only. No seam can be added later inside the refactor task.
- [x] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 applies to failed traces. Before every edit the Pi-hosted worker runs `analysis_status`, reconfirms owned complexity and exporter-clone evidence through the project analysis surface, and stops and reports if tools are unavailable (D-017).
- [x] #5 The characterization commit changes neither current reachability verdict nor staged-code entries and introduces no production export beyond the bounded seam in AC #3. The analysis/reachability measuring instruments, public signatures, dependency direction, provider version, thresholds, boundary zones, configurations, and execution-liveness artifacts remain unchanged.
- [x] #6 D-015 freeze check. The base is the slice-start commit `S`, the HEAD the worker started from. Under driver-commits HEAD does not include the worker's edits, so the worker's in-session check compares the working tree with the base and records the base SHA and the exact outputs of `git diff --name-status --diff-filter=MDR S -- tests/`, `git status --porcelain -- tests/`, and `git diff -U0 S -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`. Allowed without a human stop: (a) newly added test files; (b) pre-declared mechanical reference updates in existing tests for a symbol this task renames or moves, where every changed hunk contains only that identifier change and no assertion, fixture, or expectation change, named in this task before editing and reviewed and recorded by the coordinator. This characterization task adds only new test files and declares no reference update; existing suites, including mirrored ones, stay unmodified. Anything else blocks for human review. The freeze verdict comes from the coordinator, not the worker: after Drive commits this task, the coordinator confirms the base (`S` is the parent of this task's Drive commit), re-runs the same diff commands from that base to this task's Drive commit, and records its output and both SHAs under `## Implementation Notes` beside the worker's. Finding citations go in this task's notes, not in a commit message. Any disagreement, wrong base, or undeclared modified/deleted/renamed test or added skip/only/todo leaves the task `blocked` and the next slice is not dispatched. Worker-recorded output alone never satisfies this AC. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [x] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope cyclomatic, cognitive, and CRAP plus the exporter duplication capability/diagnostic pair are re-run and recorded for all four functions and the pending clone family.
- [x] #8 `## Implementation Notes` maps, for each owned function, every enumerated result variant and return site to the test case(s) asserting it through a shipped entry point. A variant with no test is listed with the reason it cannot be reached, and is then either covered through the bounded seam in AC #3 or recorded as a Q-002 residual-risk item. Any unreachable variant is flagged to the coordinator before TASK-778 starts.
<!-- AC:END -->

## Implementation Notes

### Standing coordinator note (2026-09-28, applies to every attempt)

Drive commits this task only when **every** acceptance criterion is checked; an unchecked criterion ends the run `task_blocked` with nothing committed and Drive then overwrites these notes with its block reason. The in-process worker prompt does not say this, so: before your final report, (1) record your evidence (analysis_status output, traces, the D-015 in-session check verbatim against the slice-start commit, stage-gate exit codes and result lines) with `task_edit` `implementationNotes` (append, never drop earlier sections); (2) tick every satisfied criterion with `task_edit` `checkAc`; for a coordinator-verdict freeze criterion, plan D-020 applies: tick it once your in-session half is recorded and the coordinator appends the post-commit verdict; (3) report `outcome: success` only then. Leave source and test files uncommitted; the driver commits. Never run git operations on `missions/reviews/`; write record rows to the record files and copy them here.

Addendum (2026-09-28, plan D-023): a task-close `analysis_audit` that returns `failed` (e.g. `invalid-output` because Fallow answered `warn`) is recorded in these notes with its failure class, the verbatim direct diagnostic `fallow audit --base <sha> --format json --quiet --no-cache --dead-code-baseline .fallow-baselines/dead-code.json --health-baseline .fallow-baselines/health.json --dupes-baseline .fallow-baselines/dupes.json`, and the owning slice of each flagged finding; it is not a completion blocker when the five stage-gate commands pass and every owned finding is dispositioned. Do not edit `fallow-provider.ts` for it.

Addendum (2026-09-28, plan D-024): for critical-complexity functions the INV-003 pre-edit confirmation is the fresh project-scope `analysis_complexity` run per metric that still lists the function row; a symbol `analysis_trace` exit 2 for a non-exported function is a recorded provider limitation (`fallow dead-code --trace` resolves exports only), not a D-013 hard stop. If the surface complexity output is truncated, record its state/count/digest and confirm your owned rows with the direct diagnostic `fallow health --complexity --format json --quiet --no-cache` filtered locally by path and name, recorded verbatim as diagnosis.


### Coordinator note before attempt 1 (2026-09-29, successor #2; plan D-028 / Q-012): backend and rules

This slice runs on the `claude-cli` backend (Claude Code, `ANTHROPIC_MODEL=sonnet`), detached mode, not the Pi subagent. You have no `analysis_*` tools: for AC #4/#7 record the direct diagnostic `bunx fallow health --complexity --format json --quiet --no-cache` filtered to your owned functions (path, name, line, cyclomatic, cognitive, CRAP, coverage tier), verbatim as diagnosis; the coordinator adds the `analysis_status` and surface-capability record at verdict time (D-028), so tick #7 once the five gate commands exit 0 and your rows are recorded. Mark acceptance criteria by editing the checkboxes in this task file and append your evidence under `## Implementation Notes` (never rewrite earlier sections, never change the title line). New test files only; never modify an existing test (Q-002 hard stop → report `blocked`); never touch production files except a seam the ACs allow and you name here first; never touch `missions/reviews/`; never run git write operations; the driver commits. Record the slice-start `S` (HEAD at launch) and the D-015 in-session check verbatim. For AC #8 include a per-owned-function variant → test map.


### Worker evidence — attempt 1 (claude-cli, 2026-09-28)

**Slice-start S** = `e7843a472351a40ba1b1843726cded47da8fd4bd` (HEAD at launch). No production seam was needed or added: `cli/harness/subcommand.ts`, `lib/skills/exporter.ts`, `scripts/check-reachability.ts` are untouched (`git diff --stat S -- <3 files>` prints nothing). No existing test modified. Two new test files only:
- `tests/skills/exporter-sync-characterization.test.ts` (25 tests; `runHarnessSync`, `groupCatalogue`, `enhancedRows` through the shipped `runHarnessSync` entry point, real temp-dir filesystem, no helper-call assertions)
- `tests/scripts/check-reachability-visit.test.ts` (27 tests; `visit` through the shipped command run over throwaway projects + the real repo verdict)

**D-015 in-session check (base S, working tree):**
- `git diff --name-status --diff-filter=MDR S -- tests/` → (empty)
- `git status --porcelain -- tests/` →
  `?? tests/scripts/check-reachability-visit.test.ts`
  `?? tests/skills/exporter-sync-characterization.test.ts`
- `git diff -U0 S -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('` → (empty; untracked files are not in `git diff`, so also grepped the two new files directly: the only match is `test.skipIf(process.getuid?.() === 0)` on the chmod-based write-failure test, a root-user guard, not a skip/only/todo)

**Stage gate exit codes:** `bun run test` 0 (277 files / 3770 tests passed); `bun run lint` 0; `bun run typecheck` 0 (after fixing one TS1360 in my new file); `bun run check:reachability` 0 (`reachability: 212/212 runtime lib modules reached; 13 type-only lib modules exempt; 0 staged`); `bun run check:suppressions -- --base main` 0 (`suppression check passed`). No suppressions added.

**Direct diagnostic** `bunx fallow health --complexity --format json --quiet --no-cache` (no analysis_* tools in claude-cli; diagnosis only), before and after my edits identical (production untouched; the coverage input is not regenerated by my run, so CRAP/tier are unchanged by construction):
| path | name | line | lines | cyc | cog | CRAP | tier |
|---|---|---|---|---|---|---|---|
| lib/skills/exporter.ts | runHarnessSync | 228 | 154 | 26 | 56 | (none listed) | missing |
| lib/skills/exporter.ts | groupCatalogue | 436 | 65 | 24 | 45 | 148.4 | partial |
| lib/skills/exporter.ts | enhancedRows | 567 | 69 | 21 | 20 | 116.3 | partial |
| scripts/check-reachability.ts | visit | 141 | 44 | 26 | 17 | 702.0 | none |
Exporter clone family not edited; exporter duplication capability/diagnostic pair left for the coordinator's surface record (D-028).

**Stage 11 pointer (D-009/D-016):** exact files/cases are the two new test files above; every case asserts entry-point results (report rows/exitCode/on-disk bytes, or command exit status/stdout).

### AC #8 variant → test map

`runHarnessSync` (exporter-sync-characterization.test.ts unless noted):
- check mode, missing target rows → "reports missing targets without writing and exits 1"
- check mode source-ahead / current rows → "reports a changed source as source-ahead…", "exits 0 when every target is current"
- check + baseRows with consistencyReason (pending-journal) → "reports a pending journal on every row of the group"
- check + no rows + consistencyReason → "emits one owner-root recovery row when a pending journal group has no rows" (syntheticRecoveryRow)
- evaluateGroup throws → syntheticFailureRow "observation" → "emits an observation-failure row when the manifest cannot be parsed"
- write: completed/applied create + noop → "creates missing targets, then reports current rows as no-ops"
- write: replace + locally-edited rows → "replaces a source-ahead target and keeps a locally edited one"
- write: applied non-committed (evidence) → "reports a failed apply with the restored-old evidence…" (chmod; skipped only when uid 0)
- transactionResult recovery-required with rows / without rows → "reports an ambiguous recovery on each row…", "emits an owner-root recovery row for an ambiguous journal on an empty group"
- lock-contended with rows / without rows → "reports lock contention on each row with the holder pid", "emits an owner-root lock-contended row for an empty group"
- multi-group iteration (claude + codex) → "writes both default targets as separate owner groups"; personal scope → "writes personal scope under the home root"
- exitCode 1/0 branches → asserted in the above (check vs write predicate)
- pre-existing coverage of local-edit-conflict (`before: locally-edited` override), inventory-incomplete, legacy-entry refresh stays in `tests/skills/exporter.test.ts`.
- **Unreachable through the entry point (Q-002 residual-risk items):** (1) `withOwnerRootTransaction` catch branch (throw inside the transaction) — both `baseRows.length === 0` `syntheticFailureRow("write")` and the `write-failure:` rows; the apply path converts failures to result states rather than throwing, and `lockRunner` is not injectable via `HarnessSyncOptions`. (2) `persisted-release-unconfirmed` and its `break`, same reason (needs an injected lockRunner / release failure). (3) the `localEditConflict` override needs a lock-held mutation via `onOwnerGroupTargetsObserved`; covered by the existing `exporter.test.ts` boundary-mutation tests, not duplicated. Flag these to the coordinator before TASK-778 starts; a bounded injection seam (passing an existing options parameter) would cover (1)/(2) if wanted.

`groupCatalogue` (via runHarnessSync):
- rows grouped by (ownerRoot, target) → two assets share one owner group (rows a,b in one pass; multi-target test gives two groups)
- reconciliation "complete" + skill kinds adds empty groups → "complete reconciliation removes a synced target whose source is gone…", "…in check mode…", and the two empty-group recovery/lock tests
- reconciliation "complete" + kinds excluding skill adds none → "complete reconciliation that excludes skills does not create an owner group"
- forgetRemovedAssetIds groups over default targets × scopes → "forgetting a removed asset spans every default target and scope"; incomplete source health → "forgetting keeps a removed asset's target when the source health is incomplete"
- `!descriptor || unimplemented || no skill adapter` skip inside the complete-reconciliation loop: the default `listImplementedHarnessTargetIds("skill")`/explicit claude targets never include such a target; the unimplemented `open-code` explicit target throws earlier in resolveCatalogue, so that `continue` is unreachable through the entry point (residual-risk item). Same for `!descriptor || status !== "implemented"` in the forget loop.
- resolveCatalogue errors surfaced by the same entry: unregistered / unimplemented / unsupported-kind targets throw; omitted targets skip unsupported kinds; empty selection returns `{rows: [], exitCode: 0}`.

`enhancedRows` (evaluateGroup mapper):
- passthrough reasons → `source-removed` and `explicit-forget` rows above, `inventory-incomplete` (forget test), `pending-journal` short-circuit before mapper (consistencyReason path)
- no matching catalogue row → passthrough (forget/complete-removal rows with `assets: []`)
- `locally-edited` row returned unchanged → "replaces a source-ahead target and keeps a locally edited one"
- action variants none (check) / create / replace / none(current) → check, create, replace, no-op tests
- `refresh-entry` (legacy entry, outputIdentity undefined) → pre-existing `exporter.test.ts` "accepts and upgrades a legacy manifest entry…"; not duplicated
- `generatingProjectRoot` / `previousGeneratingProjectRoot` conditional spreads and `foreign-owner`/`owner-transfer`/`source-unavailable`/`transaction-aborted-incomplete-inventory` reasons: not exercised (owner-transfer/foreign-owner need authority-owned manifests; generating-root needs link/generated-wrapper mode) → residual-risk items for Q-002.

`visit` (check-reachability-visit.test.ts): reached forms — side-effect, default, namespace, mixed named, default+type-only names, export-all, namespace re-export, mixed re-export, require(), dynamic import(), runnerModule string, extension-less specifier; not reached — import type, import type default, all-type named import, export type, all-type re-export, export type *, bare specifier, two-arg require, non-literal import(), non-string runnerModule, other property name, unresolved relative import; plus transitivity, cycle termination, and "reaches every runtime lib module under the committed staged-code registry" (real repo verdict: exit 0, N/N reached, staged count = `[[staged]]` rows in `missions/architecture/staged-code.toml`).
