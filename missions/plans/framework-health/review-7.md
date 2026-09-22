# Plan Review: framework-health

## Prior Findings

### Review 1

- **review-1.md PR-001 — resolved.** B-005 now limits the marker assertion to executable test declarations/comments and excludes frozen history fixtures (`plan.md`, B-005).
- **review-1.md PR-002 — resolved.** INV-003 now carries the human-ratified 2026-09-22 provider/toolchain/language/framework absence exception, with D-019 naming the retained guards (`plan.md`, INV-003 and D-019).
- **review-1.md PR-003 — resolved.** D-020 preserves the existing public entries and D-029 makes the selected 23-entry set independently machine-readable (`plan.md`, D-020/D-029; `fallow.toml:1-27`).
- **review-1.md PR-004 — resolved.** D-024 names the combined `check:reachability` entry point and D-027/D-029 define the staged/public registry it validates (`plan.md`, D-024/D-027/D-029; `TASK-708:14-22`).
- **review-1.md PR-005 — resolved.** D-020 separates the repository-owned reachability command from the consent-gated Quality Manager capability; B-009 uses the former (`plan.md`, D-020 and B-009).
- **review-1.md PR-006 — resolved.** D-025/D-026 and TASK-710 now define cancellation, completion, and archival for the superseded audit plan (`plan.md`, D-025/D-026; `TASK-710:14-23`). The remaining cross-stage ordering defect is distinct and reported as PR-002 below.
- **review-1.md PR-007 — resolved.** B-002 is narrowed to the two structured supersession syntaxes implemented by the checker (`plan.md`, B-002; `lib/artifacts/plan-conformance.ts:96-190`).
- **review-1.md PR-008 — unresolved.** D-021/D-024/D-030/D-032 make most of the sample deterministic, but qualifying files directly under `tests/` still have no “first directory level” stratum; see PR-005.
- **review-1.md PR-009 — resolved.** B-011 owns runtime gate resolution by the Quality Manager (`plan.md`, B-011).
- **review-1.md PR-010 — resolved.** `## Files to Change` exists and names the post-rename conformance paths plus current Stage 3 ownership (`plan.md`, Files to Change).
- **review-1.md PR-011 — resolved.** Implementation Order no longer declares a plan-local gate list (`plan.md:578-587`).

### Review 2

- **review-2.md PR-001 — resolved by human disposition.** D-023 records the accepted paired-session path for Stages 1–2 and the current plan has three linked Stage 3 tasks. Per the review request, that human-owned choice is not re-raised.
- **review-2.md PR-002 — unresolved, human-owned.** The durable packaged source was corrected, but refreshing the generated user-home copy remains with the human. Per the review request, it is not re-raised as a review-7 finding.
- **review-2.md PR-003 — resolved.** B-005 permits coupled tests deleted on the record in the same marker-removal change (`plan.md`, B-005/D-017).
- **review-2.md PR-004 — resolved.** B-006 excludes the human-ratified provider/toolchain/language/framework vocabulary (`plan.md`, INV-003 and B-006).
- **review-2.md PR-005 — resolved.** B-002 matches the parser's structured supersession grammar (`plan.md`, B-002; `lib/artifacts/plan-conformance.ts:96-190`).
- **review-2.md PR-006 — resolved.** D-021 includes tests reaching `scripts/`, and D-032 broadens admission to transitive helper and shipped-executable reach (`plan.md`, D-021/D-032).
- **review-2.md PR-007 — resolved.** D-021 requires probes to run in a throwaway worktree with local backup restoration (`plan.md`, D-021).
- **review-2.md PR-008 — resolved.** D-024 names `check:reachability`; TASK-708 owns one invocation combining Fallow and owner validation (`plan.md`, D-024; `TASK-708:14-22`).
- **review-2.md PR-009 — resolved.** D-012/D-018 carry explicit supersession records and the affected Design text has dated in-place pointers (`plan.md`, D-012/D-018 and Design — Stages 2–3).
- **review-2.md PR-010 — resolved.** The planned-work example now includes Intent and Decision Log and no plan-local gate declaration (`domains/shared/skills/work-artifacts/references/examples.md:38-105`).

### Review 3

- **review-3.md PR-001 — resolved.** The shipped plans skill and `spec-to-backlog` command use the new format and are included in Stage 1 ownership (`external-skills/cosmonauts/plans/SKILL.md:61-70`; `external-commands/spec-to-backlog.md:27-55`).
- **review-3.md PR-002 — resolved.** D-024 caps each stratum's requested sample at its size (`plan.md`, D-024).
- **review-3.md PR-003 — resolved.** `stage2-probes.md` names every excluded run and its reproduction or isolated-rerun evidence (`stage2-probes.md:3-18,41-45`).
- **review-3.md PR-004 — resolved.** D-025 replaces the false `Done` transition with `Cancelled` while preserving the unfinished records (`plan.md`, D-025; `TASK-710:19-23`).

### Review 4

- **review-4.md PR-001 — unresolved.** D-026/D-028/D-031 and TASK-710 cover many type, parser, tool, CLI, viewer, scheduler, and prose consumers, but two shipped Done-only lifecycle guides remain outside D-031 and Stage 3 ownership; see PR-004.
- **review-4.md PR-002 — resolved.** D-026 specifies non-dispatch, active/archived dependency behavior, archive acceptance, and coordinator termination (`plan.md`, D-026; `TASK-710:19-23`).
- **review-4.md PR-003 — resolved.** TASK-710 AC #3 owns cancellation of TASK-706/TASK-707, completion of `test-health-audit`, and archival (`TASK-710:21-23`). The premature-execution risk is separately reported as PR-002.
- **review-4.md PR-004 — resolved.** B-010 uses the combined project reachability command rather than the consent-gated capability (`plan.md`, B-010).
- **review-4.md PR-005 — resolved.** D-027 defines parseable owner rows, D-029 defines the independent public list, and current Design/TASK-709 carry the owner rulings (`plan.md`, D-027/D-029 and Design — Stage 3; `TASK-709:14-21`).
- **review-4.md PR-006 — resolved.** B-010 and TASK-709 identify the same two measured orphans (`plan.md`, B-010; `TASK-709:14-21`).

### Review 5

- **review-5.md PR-001 — resolved.** D-028, Files to Change, and TASK-710 own persisted parsing and fresh-process round-trip plus graph completion-candidate behavior (`plan.md`, D-028 and Files to Change; `TASK-710:16-23`).
- **review-5.md PR-002 — resolved.** D-029 supplies an independent public-entry authority, and TASK-708 AC #2 now protects exactly that declared set rather than every physically published `lib/` file (`TASK-708:18-21`).
- **review-5.md PR-003 — resolved.** D-030 selects one median declaration per sampled file and aligns it with B-008's declaration-level record (`plan.md`, D-030/B-008).
- **review-5.md PR-004 — resolved.** Current Stage 3 Design and TASK-709 carry D-027's `autonomy-host`, `episodic-log`, and `memory-consolidation` rulings (`plan.md`, Design — Stage 3; `TASK-709:14-21`).

### Review 6

- **review-6.md PR-001 — unresolved.** D-031 and TASK-710 add the previously listed coordinator/Quality Manager/Drive surfaces, but `domains/shared/skills/plan/SKILL.md` and the durable `external-commands/implement-plan.md` still impose Done-only lifecycle wording and are not Stage 3 owners; see PR-004.
- **review-6.md PR-002 — resolved.** TASK-708 AC #1 now requires truthful pre-triage failure and leaves the clean result to TASK-709 (`TASK-708:17-22`; `TASK-709:18-21`).
- **review-6.md PR-003 — resolved.** TASK-708 AC #2 now distinguishes the declared 23-entry stable API from the rest of physically published `lib/` (`TASK-708:18-21`).
- **review-6.md PR-004 — unresolved.** D-032 fixes transitive/helper/subprocess admission, but it does not define a stratum for qualifying root-level test files; see PR-005.
- **review-6.md PR-005 — resolved.** The plan now has Architecture Context reconciling the Fallow check and curated staged registry with the derived code-structure map's orphan-health ownership (`plan.md:76-89`; `missions/architecture/code-structure-map.md:28-37`).
- **review-6.md PR-006 — unresolved, human-owned.** This is the same generated user-home command as review-2 PR-002. Per the review request, it is not re-raised.

## Findings

- id: PR-001
  dimension: lifecycle-invariant
  severity: high
  title: "A strengthened or replacement survivor can close B-008 without ever being made to fail"
  plan_refs: INV-005, D-008, D-021, D-030, B-008
  code_refs: missions/plans/framework-health/stage2-probes.md:57-60, scripts/test-health-audit/probe.ts:279-288, scripts/test-health-audit/probe.ts:486-510
  description: |
    Ratified INV-005 says the answer to “can this test fail” must be an observed failure. B-008 instead permits a sampled declaration whose mutant survived to be merely “strengthened” or “replaced”; it does not require the strengthened declaration or its replacement to be probed again and killed. The surviving probe path records `probe-survived`, and its validator checks that single run, but no existing contract turns a later code edit into new failure evidence.

    Implemented literally, Stage 2 can dispose of a survivor by editing a test and recording “strengthened,” while the resulting guardrail has still never gone red. The broad sample is still unrun, so this is live rather than historical (`stage2-probes.md:57-60`). INV-005 is ratified ground: the derived B-008/probe mechanism must require a terminal re-probed kill for strengthened or replacement tests, or deletion, rather than weakening the invariant.

- id: PR-002
  dimension: lifecycle-invariant
  severity: high
  title: "Ready Stage 3 tasks can archive and delete before unfinished Stage 2 evidence lands"
  plan_refs: D-002, D-023, Design — Stage 2, Implementation Order steps 5-7
  code_refs: missions/plans/framework-health/stage2-probes.md:57-60, missions/plans/test-health-audit/spec.md:1-41, missions/tasks/TASK-708 - Stage 3 reachability command with declared roots and annotated staged entries.md:1-10, missions/tasks/TASK-709 - Stage 3 triage every unreachable unit and delete the orphans with their tests.md:1-11, missions/tasks/TASK-710 - Stage 3 a Cancelled task status, and the superseded audit plan archived.md:1-10
  description: |
    The plan orders the broad mutation probes and audit re-spec before Stage 3, and human-decided D-002 requires the old audit method to be replaced. Actual state still says the broad sample is “Not yet probed,” and `test-health-audit/spec.md` still contains the discarded multidimensional/reasoned method. Nevertheless TASK-708 and TASK-710 both have `dependencies: []`; TASK-709 depends only on TASK-708. TASK-710 can therefore archive the still-unrevised audit plan, and TASK-709 can delete code, without a worker-visible condition that Stage 2 has completed.

    The prose Implementation Order is not present in the isolated Stage 3 handoff. This does not require revisiting the human's acceptance of paired sessions or creating Drive tasks for Stages 1–2; it requires an explicit Stage-2-complete precondition or persisted handoff that prevents the existing Stage 3 tasks from being started early. Archiving or deleting first would violate ratified D-002 rather than amend it.

- id: PR-003
  dimension: behavior-spec
  severity: medium
  title: "The new public Cancelled state has no plan behavior"
  plan_refs: D-025 through D-031, Behaviors — Stage 3, TASK-710
  code_refs: domains/shared/extensions/tasks/index.ts:17-22, domains/shared/extensions/tasks/index.ts:250-309, cli/tasks/commands/shared.ts:10-35, lib/plans/archive.ts:64-89
  description: |
    D-025 through D-031 add an observable task state across `task_edit`, the CLI, task listing/viewing, dependency readiness, Drive/coordinator completion, and plan archival. Those are shipped user and agent entry points, but the plan's Stage 3 behavior spine contains only B-009 and B-010, both about reachability. TASK-710's ACs consequently carry no `B-###` ownership for the status behavior.

    This is not merely an internal archive mechanism: users can set, filter, view, and act on the state, and dependents observe distinct semantics before and after archival. Add a behavior with real observers and the shipped status/lifecycle entry points, or narrow the decision so it is genuinely internal. D-025 through D-031 are derived ground, so recording that correction does not require changing a ratified invariant.

- id: PR-004
  dimension: interface-fidelity
  severity: medium
  title: "D-031 still omits shipped Done-only lifecycle guidance"
  plan_refs: D-026, D-028, D-031, Files to Change — Stage 3, TASK-710 description
  code_refs: package.json:19-27, domains/shared/skills/plan/SKILL.md:106-115, external-commands/implement-plan.md:63-66
  description: |
    D-031 says shipped guidance that conditions completion on all tasks being `Done` will be rewritten and lists the coordinator/Quality Manager prompts, Drive skill/capability, and two external skills. The shipped plan skill still says “When all tasks are done, mark the plan completed,” while the durable packaged `implement-plan` command still requires its final report to say “all tasks Done.” Neither path is in Stage 3's Files to Change or TASK-710's enumerated prose set; `package.json` ships `external-commands/`, and the plan skill is a normal runtime skill.

    A plan containing a legitimate `Cancelled` task can therefore be archivable by the new runtime while the shipped lifecycle guidance says it is incomplete. Extend D-031/TASK-710 ownership to these surfaces and make the wording match the precise Done-or-Cancelled terminal rule. This finding concerns the durable repository assets, not the user-owned generated home-directory copy excluded by the review request.

- id: PR-005
  dimension: behavior-spec
  severity: medium
  title: "D-032 still leaves qualifying root-level tests outside any defined stratum"
  plan_refs: D-021, D-024, D-030, D-032, B-008
  code_refs: tests/entity-file-lock.test.ts:1-9, tests/harness-runtime-inventory.test.ts:1-9, tests/runtime.test.ts:1-9
  description: |
    D-032 correctly admits tests through transitive helper reach and shipped subprocesses, but D-021 still defines strata as “the first directory level under `tests/`.” Qualifying files directly under `tests/` have no such directory level. The repository has multiple examples that directly import production code, including `entity-file-lock.test.ts`, `harness-runtime-inventory.test.ts`, and `runtime.test.ts`.

    A literal census can omit those files or assign them inconsistently while still recording every named directory stratum. Define a root-level stratum and include its size/stride in the committed census. D-021/D-032 are derived ground; this is the unresolved remainder of review-6 PR-004, not a reason to narrow ratified INV-005.

## Missing Coverage

- The broad D-021/D-030/D-032 mutation sample remains explicitly unrun, and the record does not yet contain the population census, root stratum, per-file admission rule, or survivor re-probes.
- B-007's current probe table demonstrates frontmatter and runtime-template failures but does not yet record the behavior's tool-name-removal case.
- The Stage 2-to-Stage 3 handoff has no persisted completion signal visible to isolated TASK-708/TASK-709/TASK-710 workers.
- Exact Stage 3 deletion candidates and actual project Fallow output remain mechanically unchecked because `dead-code` and `trace` are unbound with `execution-not-consented`.

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: Internal task status types/parsing, tool and CLI schemas, archive, scheduler/completion paths, shipped lifecycle guidance, package publication, reachability tasks, and Fallow configuration were read. A live project Fallow invocation was not run because available project execution loads repository-controlled configuration and analysis execution is not consented.
  findings: PR-004

- dimension: duplication
  status: unchecked
  checked: `analysis_status` reports `duplication` and `trace` unbound with `execution-not-consented`; no capability evidence was available for a project-wide duplicate-path check.
  findings: none

- dimension: state-sync
  status: checked
  checked: Current Stage 2 evidence state, active audit plan/spec state, Stage 3 task dependencies, cancellation persistence, archived dependency semantics, and archive ownership were compared.
  findings: PR-002

- dimension: risk-blast-radius
  status: unchecked
  checked: Cancellation guidance, task scheduling, audit archival, mutation remediation, public/staged roots, and the two known orphan paths were inspected. The exact deletion set could not be mechanically traced because `dead-code` and `trace` are unbound with `execution-not-consented`.
  findings: PR-001, PR-002, PR-004

- dimension: user-experience
  status: checked
  checked: `task_edit`, CLI status handling, plan completion/archive guidance, the durable implement-plan flow, reachability command flow, and maintainer probe record were walked from user and agent entry points.
  findings: PR-003, PR-004

- dimension: behavior-spec
  status: checked
  checked: All eleven behaviors were checked for observer, shipped entry point, failure/edge outcomes, ratified INV-003 exception handling, reachability from Design, and alignment with D-021 through D-032.
  findings: PR-001, PR-003, PR-005

- dimension: architecture-record
  status: checked
  checked: The new Architecture Context was compared with `missions/architecture/code-structure-map.md`; it now explains the Fallow check, curated staged registry, derived map, and future ownership handoff.
  findings: none

- dimension: quality-contract
  status: checked
  checked: D-016/B-011 remain aligned with runtime capability resolution, the plan has no gate table or predicted binding state, and B-009's direct project command remains distinct from the consent-gated capability.
  findings: none

- dimension: lifecycle-invariant
  status: checked
  checked: INV-001 through INV-007, including the human-ratified INV-003 exception, were attacked against survivor remediation, stage ordering, cancellation exits, owner expiry, and archived-plan transitions.
  findings: PR-001, PR-002, PR-005

- dimension: constraint-ownership
  status: checked
  checked: D-020 through D-032, Files to Change, Implementation Order, and TASK-708 through TASK-710 were traced into worker-visible ownership and acceptance outcomes.
  findings: PR-002, PR-003, PR-004

- dimension: scope-size
  status: checked
  checked: The plan has eleven behaviors, within the twelve-behavior guidance, with explicit stage seams; no size split is required.
  findings: none

## Assessment

The plan remains viable, but Stage 3 is not ready. First make B-008 require observed post-remediation kills and create a worker-visible Stage 2 completion barrier; otherwise the plan can archive/delete before its central evidence exists. Then give `Cancelled` behavior ownership and finish its shipped guidance inventory.
