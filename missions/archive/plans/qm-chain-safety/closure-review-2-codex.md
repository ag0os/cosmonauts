# Closure review 2 — channel B: codex `gpt-5.6-sol` (read-only), spec-conformance audit

The prompt is `closure-review-2b-prompt.md`. It audited HEAD `7076dc9` (code identical to `fc2d047`). Final message verbatim.

**Coordinator note:** some citations are approximate. For example, the TASK-728 filename and `bundled/coding/agents/archive/README.md` do not exist; the archive README is at `missions/archive/reviews/qm/shared-rounds/README.md`, and AC-015 concerns the eleven review-round files. The findings were checked against the spec and code; dispositions are in `coordinator-status.md`.

# Closure verdict: DO-NOT-SHIP-YET

At audited HEAD `7076dc9d2df0fc371cce79311b57d81b6e7939c9`, the implementation is substantially complete and every configured gate passes. The five invariants also survived targeted mutation checks.

Closure is nevertheless blocked by three medium findings:

- AC-008’s required per-finding actionability fields are requested in a prompt but not enforced.
- Live coordinator/caller instructions still specify the superseded `gpt-6-sol` closure model.
- A live workflow document reverses the ratified evidence-sealing/check-execution order.

There were no HIGH findings.

## Findings

### MEDIUM — M1: AC-008 finding fields are not enforced

AC-008 requires each actionable finding to carry severity, location, impact, fix, and verification input ([spec.md:203](/Users/cosmos/Projects/cosmonauts/missions/plans/qm-chain-safety/spec.md:203)). The QM prompt asks for those fields ([quality-manager.md:31](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/quality-manager.md:31)), but the report parser only validates section structure and nonempty content ([quality-review-report.ts:151](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:151)). The host readiness checks do not add per-finding validation ([quality-review-run.ts:945](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:945)).

A direct probe submitted the finding `F-1 crash`. It was retained and assessed as a structurally valid `not-ready` report despite having no severity, file:line, proposed fix, or verification input.

Accidental failing scenario: a compliant-but-imprecise reviewer identifies a real defect without the mandated fields. The host persists it, leaving the coordinator unable to route an executable remediation task without reopening transcripts and reconstructing the evidence.

Status: AC-008 and B-005 are only PARTLY PROVED.

### MEDIUM — M2: live closure instructions contradict D-034

D-034 ratified `gpt-5.6-sol` for the Codex closure channel, but live caller surfaces still instruct an operator to use `gpt-6-sol`:

- [external-commands/implement-plan.md:55](/Users/cosmos/Projects/cosmonauts/external-commands/implement-plan.md:55)
- [TASK-728:52](/Users/cosmos/Projects/cosmonauts/missions/tasks/TASK-728-closure-review-and-stage-9-completion.md:52)
- [TASK-728:55](/Users/cosmos/Projects/cosmonauts/missions/tasks/TASK-728-closure-review-and-stage-9-completion.md:55)
- [coordinator-status.md:91](/Users/cosmos/Projects/cosmonauts/missions/plans/qm-chain-safety/coordinator-status.md:91)
- [coordinator-status.md:96](/Users/cosmos/Projects/cosmonauts/missions/plans/qm-chain-safety/coordinator-status.md:96)

The same status file records the later D-034 amendment at [coordinator-status.md:202](/Users/cosmos/Projects/cosmonauts/missions/plans/qm-chain-safety/coordinator-status.md:202), so it is internally inconsistent.

Accidental failing scenario: the coordinator copies the prominently documented command, receives an unavailable-model failure, or creates closure evidence under the wrong model-family contract.

Status: D-034 and AC-016/B-012 are only PARTLY honored/proved.

### MEDIUM — M3: workflow documentation reverses D-026 ordering

The live workflow document describes capturing the base, executing checks, and only then obtaining panel bindings and assessment ([fallow-workflow-integration.md:301](/Users/cosmos/Projects/cosmonauts/docs/fallow-workflow-integration.md:301)). The implementation correctly seals reviewer identities and reviewer evidence before preparation or host checks ([quality-review-run.ts:720](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:720), [quality-review-run.ts:785](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:785)).

Accidental failing scenario: a future maintainer follows the workflow document and moves reviewed-code execution ahead of evidence sealing, recreating the substitution/tampering interval D-026 closed.

Status: D-026 is implemented but not accurately documented; AC-016/B-012 are PARTLY PROVED.

### LOW — L1: several negative/static promises lack executable regression proof

The suite does not directly fail if someone:

- reintroduces a legacy `missions/reviews/*-round-N.md` write, contrary to AC-005;
- lets the Fallow guide, roadmap, and manifest drift apart, contrary to AC-012;
- restores a live link to one of the archived agent paths, contrary to AC-015.

Current inspection shows these promises are true, and concurrency/archive tests provide supporting evidence, but no targeted assertion covers the full negative claim.

Accidental failing scenario: a later refactor adds an old report-path write or stale link while all current tests remain green.

Status: AC-005, AC-012 and AC-015 are PARTLY PROVED under TASK-728’s “test that can fail” standard.

## Invariant and acceptance-criteria traceability

“Removal failure” records whether a focused test failed when the relevant implementation was deleted or neutralized. Mutations occurred only in the private clone.

| Promise | Implementation | Failing proof | Status |
|---|---|---|---|
| INV-001: stable captured tree before clone/review | [quality-review-workspace.ts:312](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-workspace.ts:312), [:372](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-workspace.ts:372) | `quality-review-workspace.test.ts` stable-sample tests. Mutation forcing first sample acceptance failed the three-changing-samples test. | PROVED |
| INV-002: only actual spawned reviewer evidence counts | [spawn-tool.ts:235](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/spawn-tool.ts:235), [quality-review-artifacts.ts:250](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-artifacts.ts:250) | Foreign/missing/duplicate evidence cases in `quality-review-run.test.ts`. Removing foreign-run rejection turned the expected failed outcome into success. | PROVED |
| INV-003: terminal status never precedes durable final report | [quality-review-run.ts:171](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:171), [:1190](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1190), [controller.ts:61](/Users/cosmos/Projects/cosmonauts/lib/orchestration/durable-runtime/controller.ts:61) | Atomic-write failure, remover stall and host-death tests. Deleting the provisional report immediately after creation produced ENOENT failures. | PROVED |
| INV-004: subagent authorization is shared and enforced | [authorization.ts:9](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/authorization.ts:9), [chain-tool.ts:87](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/chain-tool.ts:87), [driver-tool.ts:112](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/driver-tool.ts:112), [spawn-tool.ts:699](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/spawn-tool.ts:699) | Authority, chain, driver and spawn tests. Mutating the predicate to always allow caused three authorization failures. | PROVED |
| INV-005: all committed Fallow floors plus base-owned suppression authorization | [fallow-provider.ts:2010](/Users/cosmos/Projects/cosmonauts/lib/analysis/providers/fallow-provider.ts:2010), [check-new-suppressions.ts:139](/Users/cosmos/Projects/cosmonauts/scripts/check-new-suppressions.ts:139) | Exact-argv baseline test failed when the dupes baseline was removed. Same-change authorization test failed when registry loading was changed from base to current. | PROVED |
| AC-001: QM has only the ratified subagents | [quality-manager.ts:3](/Users/cosmos/Projects/cosmonauts/bundled/coding/agents/quality-manager.ts:3), [quality-review-profile.ts:5](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-profile.ts:5) | `coding-agents.test.ts`, authority tests; mutation above fails. | PROVED |
| AC-002: forbidden delegation fails through chain/driver/spawn surfaces | Shared authorization call sites above | Tests exercise all three surfaces and inspect structured denial. | PROVED |
| AC-003: dirty tracked/untracked/index state is faithfully materialized | [quality-review-workspace.ts:89](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-workspace.ts:89), [:211](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-workspace.ts:211), [:372](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-workspace.ts:372) | Dirty untracked, staged deletion, stale-stat and unsafe-symlink cases; two real dirty-checkout runs in `closure-e2e.md`. | PROVED |
| AC-004: changing capture is refused before clone I/O | [quality-review-workspace.ts:312](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-workspace.ts:312) | Three-changing-samples test; INV-001 mutation failed it. | PROVED |
| AC-005: run-owned evidence, no legacy round files, concurrent isolation | [quality-review-artifacts.ts:58](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-artifacts.ts:58), [:217](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-artifacts.ts:217) | Missing/foreign/late/concurrent-run tests fail on sink regressions; no explicit assertion forbids all legacy writes. | PARTLY PROVED |
| AC-006: evidence validated against expected panel identity | [quality-review-artifacts.ts:250](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-artifacts.ts:250) | Missing, empty, duplicate, foreign and late-substitution tests; INV-002 mutation failed. | PROVED |
| AC-007: report is durable before terminal projection | [quality-review-run.ts:1190](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1190), [run-control-tools.ts:118](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/run-control-tools.ts:118) | Ready/not-ready/refused/failed/cancelled/deadline/host-death/atomic-write tests plus CLI status artifact assertions. | PROVED |
| AC-008: actionable findings include all mandated fields | Prompt at [quality-manager.md:31](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/quality-manager.md:31) | No validator test; direct malformed-finding probe was accepted. | PARTLY PROVED |
| AC-009: one bounded review, no remediation/task/plan mutation | [quality-review-profile.ts:5](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-profile.ts:5), launch flow in `quality-review-run.ts` | `quality-review-one-pass.test.ts` proves assessment-before-check and one QM spawn; shipped named-command tests exercise verify/implement entry points. | PROVED |
| AC-010: fail-safe readiness calibration | [quality-review-models.ts:103](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:103), [quality-review-run.ts:904](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:904) | Calibration and host-ready veto tests cover malformed, uncertain and adverse findings. | PROVED |
| AC-011: configured and runtime diversity | [quality-review-models.ts:13](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:13), [quality-review-run.ts:726](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:726) | Alias, override, same-family, unconfigured, substituted and unresolvable cases. | PROVED |
| AC-012: Fallow docs/roadmap/manifest agree | [fallow.md:8](/Users/cosmos/Projects/cosmonauts/docs/fallow.md:8), [manifest.json:3](/Users/cosmos/Projects/cosmonauts/.fallow-baselines/manifest.json:3), [ROADMAP.md:402](/Users/cosmos/Projects/cosmonauts/ROADMAP.md:402) | Current inspection agrees; no cross-surface drift test. | PARTLY PROVED |
| AC-013: panel disagreement is reported conservatively | Calibration implementation above | Model and end-to-end disagreement tests fail if a conflicting panel becomes ready. | PROVED |
| AC-014: declared and observed model diversity agree | Model resolution and run attestation above | Dynamic substitution, unknown model and same-family runtime cases. | PROVED |
| AC-015: archived agents remain historical only | [README.md:1](/Users/cosmos/Projects/cosmonauts/bundled/coding/agents/archive/README.md:1), Git rename history | Archive map and `git log --follow` verified; live-path search is not regression-tested. | PARTLY PROVED |
| AC-016: shipped commands, prompts, skills and docs expose the contract | [chains.ts:10](/Users/cosmos/Projects/cosmonauts/bundled/coding/chains.ts:10), [orchestration.md:84](/Users/cosmos/Projects/cosmonauts/docs/orchestration.md:84) | Named-chain and CLI entry tests pass, but the stale D-034 and D-026 caller text above violates full conformance. | PARTLY PROVED |

## B-001 through B-012

“O/E/O” means observer, shipped entry point, and externally visible outcome.

| Behavior | Implementation | Observer/entry/outcome proof | Status |
|---|---|---|---|
| B-001: shared delegation authorization | Authorization/profile call sites above | O/E/O: yes—denials observed through chain, driver and spawn tools; mutation red. | PROVED |
| B-002: stable dirty-state materialization | Workspace capture/materializer above | O/E/O: yes—run launcher, dirty checkout outcomes and real E2E hash evidence. | PROVED |
| B-003: run-scoped reviewer evidence | Artifact sink and spawn final-message capture above | O/E/O: yes—spawned reviewer messages flow into run-owned evidence and terminal results; legacy-write negative lacks a direct test. | PARTLY PROVED |
| B-004: durable terminal report/status contract | Run persistence, durable controller and `run_status` above | O/E/O: yes—tool and CLI projections tested, including failure and host-death paths. | PROVED |
| B-005: actionable bounded report | [quality-review-report.ts:25](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:25), run merge/readiness flow | O/E/O: partial—report is visible through status, but mandatory finding fields are not enforced. | PARTLY PROVED |
| B-006: one-pass read-only QM | Review profile and one-pass launcher | O/E/O: yes—named QM commands tested; panel precedes checks and QM spawns once. | PROVED |
| B-007: three committed Fallow baselines | [fallow-provider.ts:2010](/Users/cosmos/Projects/cosmonauts/lib/analysis/providers/fallow-provider.ts:2010), refresh script | O/E/O: yes—real CLI audit and exact provider argv; baseline-removal mutation red. | PROVED |
| B-008: base-owned suppression policy | Scanner/script/run-owned-file gate above | O/E/O: yes—configured check runs through Bun command and rejects same-change authorization; mutation red. | PROVED |
| B-009: Fallow documentation agreement | Guide, manifest and roadmap above | O/E/O: static caller surfaces currently agree, but no test fails on drift. | PARTLY PROVED |
| B-010: fail-safe calibration | Model and host calibration above | O/E/O: yes—final readiness/status is blocked on ambiguity or adverse evidence. | PROVED |
| B-011: model diversity | Model resolver/runtime attestation above | O/E/O: yes—configured and observed model identity are exercised through complete runs. | PROVED |
| B-012: archive and caller-surface cleanup | Archive map and five named chains | O/E/O: entry points and archive state are proved, but current D-034/D-026 caller surfaces are stale. | PARTLY PROVED |

## Decision Log

### Ratified decisions

| Decision | Verdict |
|---|---|
| D-001 | HONORED. Structural and evidence-ordering requirements are implemented, subject to M1’s incomplete per-finding contract. |
| D-002 | IN PROGRESS. This review is the required cross-family, non-QM Codex channel; durable completion still needs both Stage 9 outputs saved. |
| D-018 | HONORED. Terminal summary ownership and bounded presentation are implemented and tested. |
| D-019 | HONORED. Run-owned reviewer evidence and validation are implemented. |
| D-020 | HONORED. Terminal lifecycle/report ordering is implemented. |
| D-021 | HONORED. Fallow and suppression policy are part of the configured review gates. |
| D-022 | HONORED by current tree/history inspection; lacks a full live-path regression test. |
| D-023 | CONSISTENT, NOT YET DUE. The execution-liveness rebase/amendment trigger has not occurred. |
| D-027 | HONORED. The audit and implementation target accidental damage, not a hostile reviewed repository. |
| D-028 | HONORED. Host-run checks and unsandboxed operator authority are disclosed in the execution contract. |
| D-029 | HONORED. Manifest records all three baselines with base commit, category and reason. |
| D-030 | HONORED. Backup exists at `.shepherd/backups/cosmonauts-packages-coding-2026-09-23`; the original package location is absent and follow-up provenance remains recorded. |
| D-033 | SUPERSEDED. Preserved historically and correctly displaced by D-034. |
| D-034 | PARTLY HONORED. This channel uses the ratified family/model, but live operating instructions still advertise the superseded model. |

### Derived decisions

| Decision | Consistency verdict |
|---|---|
| D-003 | Consistent and honored by shared authorization. |
| D-004 | Consistent as amended by D-025/D-026. |
| D-005 | Consistent and honored by stable source capture/materialization. |
| D-006 | Consistent and honored by run-owned evidence. |
| D-007 | Consistent and honored by durable report/status projection. |
| D-008 | Consistent as amended by D-029’s three-baseline manifest. |
| D-009 | Consistent and honored by base-owned suppression authorization. |
| D-010 | Superseded by D-018; retained only as history. |
| D-011 | Consistent and honored by conservative report assessment. |
| D-012 | Consistent as superseded by D-026; check durations are not panel input. |
| D-013 | Consistent; owner-death generalization remains outside this plan. |
| D-014 | Consistent with the authoritative plan format: Source, Observer, Entry point, Outcome. |
| D-015 | Consistent and honored by preserved history/citations. |
| D-016 | Consistent and honored by the inline one-step durable chain design. |
| D-017 | Consistent and honored by unavailable-index fail-safe behavior. |
| D-024 | Consistent as historical sequencing rationale. |
| D-025 | Consistent and honored by base/material/config/runtime capture. |
| D-026 | Code is consistent and honored; live workflow documentation is stale per M3. |
| D-031 | Consistent within its explicitly accepted calibration limits. |
| D-032 | Consistent within its explicitly accepted host-readiness limits. |

## TASK-728 AC #1–#7

| AC | Result |
|---|---|
| #1 — two independent non-QM channels | INCOMPLETE. Channel B is complete here; both channel artifacts still need to be durably saved, with Channel A independently completed. |
| #2 — attack/inspect every stage behavior | SUBSTANTIVELY SATISFIED by prior attacks plus these matrices and mutations; durable Channel A/B artifacts remain pending. |
| #3 — R-014 structural closure | SATISFIED. QM-specific policy remains in `quality-review-*`; durable runtime contains only generic artifact/child/disposition concepts. No generic panel graph, Git ownership, or QM policy was added. |
| #4 — gates plus observer/entry/outcome evidence | NOT SATISFIED because B-005, B-009 and B-012 remain partly proved and M1–M3 remain open. |
| #5 — findings routed through tasks/Drive/re-review | NOT SATISFIED. The coordinator must route M1–M3 and L1 through the required lifecycle, then repeat both closure reviews. |
| #6 — minimum attack set | SATISFIED. Historical closure attacks, two dirty-checkout real runs, and fresh invariant mutations cover the required classes. |
| #7 — both channels saved with no unresolved findings | NOT SATISFIED. Findings remain, and this read-only output still needs to be saved as the channel-B artifact. |

The task frontmatter still says `To Do`, while coordinator state describes it as in progress. The coordinator should reconcile this during disposition rather than treating the current task metadata as closure evidence.

## Documentation and caller surfaces

Accurate current surfaces include:

- README and AGENTS descriptions of the read-only QM;
- the five shipped named QM chains;
- orchestration documentation and spawning/dispatch skills;
- Cody and QM prompts;
- the archive map for historical agent paths;
- Fallow baseline and suppression documentation.

The surface is not fully conformant because of M2 and M3. In particular, external commands, the active task, coordinator operating instructions, and the Fallow/QM workflow document are exactly where operators and future maintainers are likely to look.

## Gates

All commands ran in the private no-hardlinks clone, not the source checkout.

| Gate | Result |
|---|---|
| `bun run test` | PASS — 261 files, 3,432 tests |
| `bun run lint` | PASS — 599 files checked, no fixes |
| `bun run typecheck` | PASS |
| Changed-scope Fallow audit against `main`, using all three committed baselines | PASS — 266 changed files; zero dead-code, complexity or duplication findings |
| `bun run check:suppressions -- --base main` | PASS |
| Source checkout cleanliness | Remained clean |
| Private clone after mutations | Restored clean |

The analysis role’s wrapper/status facility was unavailable, so the configured provider audit was run directly with the committed dead-code, health, and duplication floors.

## Residuals

- Hostile-only: deliberately malicious reviewed code could escape process groups or tamper with clone objects, materials, or the host during unsandboxed checks; this is outside D-027/D-028’s accidental-damage boundary.
- D-031’s heuristic calibration limits are accepted and are not findings.
- D-032’s bounded host-readiness interpretation limits are accepted and are not findings.
- D-023 remains a future amendment obligation if execution-liveness is rebased.
- The real dirty-checkout E2E evidence was captured at `cca8f7d`, before the final remediation commits; its hash assertions remain valid, but it is not a fresh live run of this audited HEAD.

Coordinator action required: route M1–M3 and L1 through tasks/Drive, independently re-review the remediation, rerun both Stage 9 channels, save both full outputs, reconcile TASK-728 state, and only then reconsider closure.
