---
id: TASK-770
title: 'Stage 3: Extract core runtime and driver clones'
status: To Do
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-769
createdAt: '2026-09-28T15:22:47.494Z'
updatedAt: '2026-09-28T18:17:51.150Z'
---

## Description

Eliminate the core runtime, CLI, domain, and driver one-/two-file clone families after runner/lock characterization. This task is the primary owner of B-004 and verifies B-010 and B-011.

<!-- AC:BEGIN -->
- [ ] #1 Owned behavior B-004 — observer: maintainer reviewing duplication evidence; entry point: committed project-health record; outcome: every reproduced family confined to one or two files is absent from the after inventory, each reproduced three-file family remains visible with exact files and extraction-refusal reason, resulting group/instance/duplicated-line/percentage totals are recorded, and the surface outcome is represented exactly rather than promoted from diagnostic evidence. This stage delivers its core-runtime/CLI/domain/driver share and verifies B-010 and B-011, including unchanged runner and lock edge contracts.
- [ ] #2 Owned clone families are model-session setup (`createNarrativeSession`/`createJudgmentSession`); plan archive/view setup, errors, and repeated not-found branch; plan/task extension warnings; process-runner stream teardown; `runClaudeBinary`/`runCodexBinary` cleanup/materialization/spawn/I/O/diagnostics; same-file skill discovery and architecture-map retrieval; driver `partialReason`/`progressText`, scheduler/run-one-task command execution and expectation assembly, scheduler blocks, finalizer task-id handling, event/watch parsing, lock primitives, run-state/atomic writes, heartbeat selection, and scheduler finalization. Owned Files to Change entries are `cli/architecture/narrative-provider.ts`, `cli/memory/judgment-provider.ts`, applicable plan/task CLI files, `domains/shared/extensions/{plans,tasks}/index.ts`, `domains/shared/extensions/project-tools/process-runner.ts`, `lib/agent-packages/{claude-binary-runner,codex-binary-runner,skills}.ts`, `lib/architecture-map/retrieval.ts`, `lib/driver/{drive-finalization,run-one-task,drive-scheduler-backend,shell-command-finalizer,event-stream,watch-events-compat,lock,run-state,state-commit}.ts`, `lib/entity-file-lock.ts`, `lib/fs/atomic-file.ts`, `lib/durable-runtime/{scheduler,scheduler-state}.ts`, focused internal helper modules only under the plan-approved directories, and new focused tests where required.
- [ ] #3 D-008/D-009 govern the extraction: fresh instance ranges are checked against fresh partial/none/missing-tier critical ranges before edit; overlaps move to the owning critical stage and are recorded, never extracted here. Same-file helpers stay private, same-subsystem sharing uses an internal sibling, cross-subsystem sharing exposes only the smallest semantically identical pure/infrastructure primitive, and no global utility bucket is introduced. Pi session sharing uses the named Pi runtime/registry/resource/session primitives through a narrow CLI-infrastructure helper, not the broader orchestration factory. Runner sharing injects runtime/process collaborators; lock sharing preserves race, timeout, stale-owner, warning, and release-confirmation differences.
- [ ] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). A below-high critical overlap cannot be edited until its separate green characterization commit (D-009). D-013 requires reproduced-but-untraceable findings to record failed/narrow successful traces plus repository-wide search and escalate without edit. Before every edit the Pi-hosted worker runs `analysis_status`, traces a current instance of every owned group through the analysis surface, and stops and reports if the tools are unavailable (D-017).
- [ ] #5 The stage preserves inward dependency direction and every shipped signature/CLI/error contract. It neither extracts the two ratified three-file families nor the living-memory, proposals/receipts, or exporter families moved to critical stages. For each owned group, post-edit diagnostic inventory and exact-location trace show absence; any surviving group fails the stage. D-012 pairing records the completed surface inventory and direct diagnostic `fallow ["dupes", "--format", "json", "--quiet", "--no-cache"]` separately, with the direct result never treated as a capability pass.
- [ ] #6 D-015 freeze check. The base is `C`, the Drive commit of characterization task TASK-769; the slice-start commit `S` is also recorded. Under driver-commits HEAD does not include the worker's edits, so the worker's in-session check compares the working tree with the base and records the base SHA and the exact outputs of `git diff --name-status --diff-filter=MDR C -- tests/`, `git status --porcelain -- tests/`, and `git diff -U0 C -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`. Allowed without a human stop: (a) newly added test files; (b) pre-declared mechanical reference updates in existing tests for a symbol this task renames or moves, where every changed hunk contains only that identifier change and no assertion, fixture, or expectation change, named in this task before editing and reviewed and recorded by the coordinator. Test additions belong in `C` only, so this task adds no test file. Anything else blocks for human review. The freeze verdict comes from the coordinator, not the worker: after Drive commits this task, the coordinator confirms the base (`S` is the parent of this task's Drive commit and `C` is TASK-769's Drive commit), re-runs the same diff commands from that base to this task's Drive commit, and records its output and both SHAs under `## Implementation Notes` beside the worker's. Finding citations go in this task's notes, not in a commit message. Any disagreement, wrong base, or undeclared modified/deleted/renamed test or added skip/only/todo leaves the task `blocked` and the next slice is not dispatched. Worker-recorded output alone never satisfies this AC. The exact relied-on TASK-769 characterization cases are recorded. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope duplication is re-run through the surface with its actual outcome and paired D-012 diagnostic, and neither inventory nor per-location traces contain an owned family. The post-edit surface duplication outcome is completed with `verdict: "fail"`; any other state is recorded as it is and fails this stage (Design §3).
<!-- AC:END -->

## Implementation Notes

### Standing coordinator note (2026-09-28, applies to every attempt)

Drive commits this task only when **every** acceptance criterion is checked; an unchecked criterion ends the run `task_blocked` with nothing committed and Drive then overwrites these notes with its block reason. The in-process worker prompt does not say this, so: before your final report, (1) record your evidence (analysis_status output, traces, the D-015 in-session check verbatim against the slice-start commit, stage-gate exit codes and result lines) with `task_edit` `implementationNotes` (append, never drop earlier sections); (2) tick every satisfied criterion with `task_edit` `checkAc`; for a coordinator-verdict freeze criterion, plan D-020 applies: tick it once your in-session half is recorded and the coordinator appends the post-commit verdict; (3) report `outcome: success` only then. Leave source and test files uncommitted; the driver commits. Never run git operations on `missions/reviews/`; write record rows to the record files and copy them here. 

### Worker blocked evidence (TASK-770)

- Slice-start `S`: `ab78192d1dfe2de5df7490f64376201f3db75fd4`.
- TASK-769 characterization Drive commit `C`: `d17a49724709c37e09abb2d535c5a3db9fcaed0f` (followed by record-only freeze commit `ab78192d1dfe2de5df7490f64376201f3db75fd4`).
- Pre-edit `analysis_status`: Fallow 2.54.2 bound for duplication, dead-code, complexity, changed-scope audit, trace, and fix-preview; boundary conformance unbound (`provider-not-configured`). Current duplicate-location traces reproduced the owned groups. Several stale/non-instance retry coordinates exited provider code 2, while the current inventory coordinates traced successfully.
- Fresh uncached before diagnostic: 85 groups, 172 instances, 2,990 duplicated lines, 3.218653117464692%. A working refactor reduced the diagnostic to 48 groups, 98 instances, 1,434 duplicated lines, 1.5527883053600433%; the surface duplication result remained the required actual `verdict: "fail"`. All otherwise-owned runtime/CLI/domain/driver locations disappeared at that point.
- D-015 worker commands against `C` all produced no output and exited 0: `git diff --name-status --diff-filter=MDR d17a49724709c37e09abb2d535c5a3db9fcaed0f -- tests/`; `git status --porcelain -- tests/`; `git diff -U0 d17a49724709c37e09abb2d535c5a3db9fcaed0f -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('` (no matching additions). No test file was changed.
- Relied-on TASK-769 cases: `tests/agent-packages/binary-runners.characterization.test.ts` and `tests/driver/lock-primitives.characterization.test.ts`. Focused verification passed 50 files / 350 tests, including both characterization suites and affected runner, lock, driver, CLI plan, skill, and entity-lock suites. Typecheck and lint passed after formatting. Path-scoped dead-code analysis passed with zero findings.
- Blocking ratified collision (Q-002 / AC #4): eliminating the owned same-file architecture-map retrieval clone requires changing `lib/architecture-map/retrieval.ts`. The full required `bun run test` then failed `tests/memory/interface.test.ts` at line 658 because that test ratifies the exact SHA-256 of the architecture adapter source (`ab64b61e...`) and observed the refactored hash (`97adca73...`). Updating that expected hash is a test expectation change, which this task explicitly hard-stops for human review; TASK-770 also declares no test changes. The retrieval source was restored byte-for-byte (SHA-256 `ab64b61e95f6393db8e1edeec56e3d9994cb4e8d3a2fc525962f1b7ff04454d7`). Consequently its owned clone survives and AC #5/#7 cannot be satisfied without a human decision changing the ratified test ground.
- Full-suite result before restoration: 265 files passed, 1 failed; 3,474 tests passed, 1 failed. The remaining required stage gates and changed-scope audit were not claimed after the hard stop.

Decision needed: authorize a narrowly reviewed update to the source-hash expectation after the behavior-preserving retrieval extraction, or remove `lib/architecture-map/retrieval.ts` from this stage's owned clone inventory. Either option changes ratified ground and must be human-approved before implementation resumes.

### Worker final message (attempt 1, run-d744cc20, restored by the coordinator)

{
  "outcome": "failure",
  "files": [],
  "verification": [
    {
      "command": "bun run test",
      "status": "fail"
    },
    {
      "command": "bun run lint",
      "status": "pass"
    },
    {
      "command": "bun run typecheck",
      "status": "pass"
    }
  ],
  "notes": "Blocked under Q-002: extracting the owned architecture-map retrieval clone changes a source hash asserted by tests/memory/interface.test.ts. Updating that expectation requires human approval. The retrieval source was restored byte-for-byte, evidence was recorded, and TASK-770 was marked Blocked."
}
outcome: failure

### Coordinator note before attempt 2 (2026-09-28): Q-008 ruled (a)

Human ruling, relayed by Shepherd (plan D-022; spec Q-008; rulings file round 3): **authorize the narrow expectation update.** In `tests/memory/interface.test.ts` only the SHA-256 literal for `lib/architecture-map/retrieval.ts` (currently `ab64b61e95f6393db8e1edeec56e3d9994cb4e8d3a2fc525962f1b7ff04454d7`, at the `architectureAdapterSource` assertion) changes to the hash of the refactored file; every other assertion in that test, including the `types.ts` hash and the `registry|backend|plugin|dispatch` blacklist, stays untouched. Citation for the D-015 record: this modification pins finding `dupes	lib/architecture-map/retrieval.ts:198:213;lib/architecture-map/retrieval.ts:237:251` (family `family-e85de5923f89360e`), extracted in this task under Q-003; test expectation change authorized by human ruling Q-008 (a). This is the task's one pre-declared existing-test modification; the D-015 output must list no other M/D/R test path.

Worktree state: attempt 1's extraction of every other owned family is present, uncommitted (22 modified + 7 new source files) and passed all five Drive postflight gates on the restored `retrieval.ts`. Do not redo or revert it. Steps: (1) `analysis_status`; trace the retrieval.ts group again immediately before editing; (2) re-apply the same-file extraction in `lib/architecture-map/retrieval.ts`; (3) compute the new SHA-256 of the file and update only that literal; (4) run the stage gate and the fresh duplication diagnostic pair; (5) record the D-015 in-session check against `C = d17a497` verbatim (expect exactly `M tests/memory/interface.test.ts`), the new hash, and the citation above in these notes via `task_edit` (append); (6) tick every satisfied AC with `checkAc` (D-020 applies to the freeze AC); (7) report `outcome: success`.
