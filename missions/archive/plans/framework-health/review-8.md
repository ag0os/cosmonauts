# Plan Review: framework-health

## Prior Findings

### Review 1

- **review-1.md PR-001 — resolved.** B-005 limits the marker assertion to executable test declarations/comments and excludes frozen fixtures (`plan.md`, B-005).
- **review-1.md PR-002 — resolved.** INV-003 carries the human-ratified 2026-09-22 provider/toolchain/language/framework absence exception, with D-019 naming the retained guards (`plan.md`, INV-003 and D-019).
- **review-1.md PR-003 — resolved.** D-020 preserves the public Fallow entries and D-029 makes the selected 23-entry set independently machine-readable (`plan.md`, D-020/D-029; `fallow.toml:1-27`).
- **review-1.md PR-004 — resolved.** D-024 names the combined `check:reachability` command and D-027/D-029 define the staged/public registry it validates (`plan.md`, D-024/D-027/D-029; `TASK-708:14-22`).
- **review-1.md PR-005 — resolved.** D-020 separates the repository-owned command from the consent-gated Quality Manager capability, and B-009 uses the direct command (`plan.md`, D-020 and B-009).
- **review-1.md PR-006 — resolved.** D-025/D-026 and TASK-710 define cancellation of the two unfinished audit tasks, completion of the superseded plan, and archival (`plan.md`, D-025/D-026; `TASK-710:14-23`).
- **review-1.md PR-007 — resolved.** B-002 is narrowed to the two structured supersession forms implemented by `plan-conformance.ts` (`plan.md`, B-002; `lib/artifacts/plan-conformance.ts:96-190`).
- **review-1.md PR-008 — resolved.** D-021/D-024/D-030/D-032 now define the population, capped deterministic file sample, declaration unit, and admission by module/executable reach; D-034 supplies the formerly missing `(root)` stratum (`plan.md`, D-021/D-024/D-030/D-032/D-034; `TASK-711:16-20`).
- **review-1.md PR-009 — resolved.** B-011 owns runtime gate resolution by the Quality Manager (`plan.md`, B-011).
- **review-1.md PR-010 — resolved.** `## Files to Change` exists and names the post-rename conformance files plus current stage ownership (`plan.md`, Files to Change).
- **review-1.md PR-011 — resolved.** Implementation Order no longer carries a plan-local gate list (`plan.md`, Implementation Order).

### Review 2

- **review-2.md PR-001 — resolved by human disposition.** D-023 records direct paired-session execution for Stages 1–2 and task-backed Stage 3; the review request confirms that this choice remains with the human and is not to be re-raised (`plan.md`, D-023).
- **review-2.md PR-002 — resolved.** The durable source is corrected and the human refreshed the generated home-directory copy on 2026-09-22; the current files carry the same new-format flow (`external-commands/implement-plan.md:26-65`; `/Users/cosmos/.claude/commands/implement-plan.md:27-66`; `plan.md`, Files to Change — Stage 1).
- **review-2.md PR-003 — resolved.** B-005 permits coupled tests deleted on the record in the marker-removal change (`plan.md`, B-005/D-017).
- **review-2.md PR-004 — resolved.** B-006 excludes the human-ratified provider/toolchain/language/framework vocabulary (`plan.md`, INV-003 and B-006).
- **review-2.md PR-005 — resolved.** B-002 matches the parser's structured supersession grammar (`plan.md`, B-002; `lib/artifacts/plan-conformance.ts:96-190`).
- **review-2.md PR-006 — resolved.** D-021 includes tests reaching `scripts/`, and D-032 covers transitive helpers and shipped subprocess entry points (`plan.md`, D-021/D-032).
- **review-2.md PR-007 — resolved.** D-021 requires a throwaway worktree and local backup restoration (`plan.md`, D-021).
- **review-2.md PR-008 — resolved.** D-024 names `check:reachability`, and TASK-708 owns the composed tool/owner-check invocation (`plan.md`, D-024; `TASK-708:14-22`).
- **review-2.md PR-009 — resolved.** D-012/D-018 carry explicit supersession records and the affected Design text has dated in-place pointers (`plan.md`, D-012/D-018 and Design — Stages 2–3).
- **review-2.md PR-010 — resolved.** The canonical planned-work example includes Intent and Decision Log and no longer declares plan-local gates (`domains/shared/skills/work-artifacts/references/examples.md:38-105`).

### Review 3

- **review-3.md PR-001 — resolved.** The shipped plans skill and `spec-to-backlog` command use the new format and are included in Stage 1 ownership (`external-skills/cosmonauts/plans/SKILL.md:61-70`; `external-commands/spec-to-backlog.md:27-55`; `plan.md`, Files to Change — Stage 1).
- **review-3.md PR-002 — resolved.** D-024 caps each requested stratum sample at that stratum's size (`plan.md`, D-024).
- **review-3.md PR-003 — resolved.** `stage2-probes.md` identifies each excluded run and records reproduction or isolated-rerun evidence (`stage2-probes.md:3-18,41-45`).
- **review-3.md PR-004 — resolved.** D-025 replaces the false `Done` transition with `Cancelled` while preserving the unfinished records (`plan.md`, D-025; `TASK-710:17-22`).

### Review 4

- **review-4.md PR-001 — resolved for the interfaces it identified.** D-026/D-028/D-031/D-035, B-012, Files to Change, and TASK-710 now own the type, parser, tool, CLI, viewer, scheduler, archive, and named guidance surfaces (`plan.md`, D-026/D-028/D-031/D-035, B-012, Files to Change; `TASK-710:14-23`). Additional consumers missed by the revised inventory are a new round-8 finding, PR-003.
- **review-4.md PR-002 — resolved.** D-026 specifies non-dispatch, active/archived dependency behavior, archive acceptance, and coordinator closure (`plan.md`, D-026; `TASK-710:17-22`).
- **review-4.md PR-003 — resolved.** TASK-710 owns cancellation of TASK-706/TASK-707, completion of `test-health-audit`, and archival (`TASK-710:17-22`), and D-033 now makes it wait for Stage 2.
- **review-4.md PR-004 — resolved.** B-010 uses the combined project reachability command (`plan.md`, B-010).
- **review-4.md PR-005 — resolved.** D-027 defines parseable owner rows, D-029 defines the independent public list, and current Design/TASK-709 carry the owner rulings (`plan.md`, D-027/D-029 and Design — Stage 3; `TASK-709:14-21`).
- **review-4.md PR-006 — resolved.** B-010 and TASK-709 identify the same two measured orphans (`plan.md`, B-010; `TASK-709:14-21`).

### Review 5

- **review-5.md PR-001 — resolved.** D-028, Files to Change, and TASK-710 own persisted parsing, fresh-process round-trip, and graph completion-candidate behavior (`plan.md`, D-028 and Files to Change; `TASK-710:16-23`).
- **review-5.md PR-002 — resolved.** D-029 supplies an independent public-entry authority and TASK-708 protects exactly that declared set (`plan.md`, D-029; `TASK-708:18-21`).
- **review-5.md PR-003 — resolved.** D-030 selects one median declaration per sampled file and aligns it with B-008's declaration-level record (`plan.md`, D-030/B-008).
- **review-5.md PR-004 — resolved.** Current Stage 3 Design and TASK-709 carry D-027's `autonomy-host`, `episodic-log`, and `memory-consolidation` rulings (`plan.md`, Design — Stage 3; `TASK-709:14-21`).

### Review 6

- **review-6.md PR-001 — resolved for the named surfaces.** D-031 owns the coordinator, Quality Manager, Drive, and external-skill prose; D-035 adds the plan skill and packaged implement-plan command (`plan.md`, D-031/D-035; `TASK-710:17`). Additional omitted Done-only surfaces are reported separately as round-8 PR-003.
- **review-6.md PR-002 — resolved.** TASK-708 requires truthful pre-triage failure and leaves the clean result to TASK-709 (`TASK-708:17-22`; `TASK-709:18-21`).
- **review-6.md PR-003 — resolved.** TASK-708 distinguishes the declared 23-entry stable API from the rest of physically published `lib/` (`TASK-708:18-21`).
- **review-6.md PR-004 — resolved.** D-032 supplies transitive/helper/subprocess admission and D-034 defines the root-level stratum (`plan.md`, D-032/D-034; `TASK-711:16-20`).
- **review-6.md PR-005 — resolved.** Architecture Context now reconciles the Fallow check and curated staged registry with the derived code-structure map (`plan.md`, Architecture Context; `missions/architecture/code-structure-map.md:28-37`).
- **review-6.md PR-006 — resolved by the human-owned refresh.** This was the same generated home-directory asset as review-2 PR-002; both current copies carry the corrected flow (`external-commands/implement-plan.md:26-65`; `/Users/cosmos/.claude/commands/implement-plan.md:27-66`).

### Review 7

- **review-7.md PR-001 — resolved.** D-033 and B-008 require every strengthened or replacement survivor to be re-probed to a recorded kill or deleted; TASK-711 carries that terminal evidence (`plan.md`, D-033/B-008; `TASK-711:16-20`).
- **review-7.md PR-002 — resolved.** TASK-711 records the remaining Stage 2 work, and both TASK-708 and TASK-710 depend on it; TASK-709 is transitively blocked by TASK-708 (`TASK-711:1-20`; `TASK-708:8-10`; `TASK-709:8-10`; `TASK-710:8-10`).
- **review-7.md PR-003 — resolved.** B-012 now gives `Cancelled` an observer, shipped lifecycle entry points, and observable outcomes, and TASK-710 owns it (`plan.md`, B-012; `TASK-710:14-23`).
- **review-7.md PR-004 — resolved for the two identified guides.** D-035 and TASK-710 add the shipped plan skill and durable implement-plan command (`plan.md`, D-035 and Files to Change; `TASK-710:17`). Further omitted guidance is a new round-8 finding, PR-003.
- **review-7.md PR-005 — resolved.** D-034 defines `(root)` as a real stratum and TASK-711 requires its size and stride in the census (`plan.md`, D-034; `TASK-711:16-20`).

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: medium
  title: "The surviving probe tool rejects test shapes D-032 deliberately admits"
  plan_refs: D-030, D-032, D-033, B-008, TASK-711 description
  code_refs: scripts/test-health-audit/probe.ts:43-49, scripts/test-health-audit/probe.ts:313-318, scripts/test-health-audit/probe.ts:460-468, scripts/test-health-audit/probe.ts:619, tests/cli/dump-prompt.test.ts:10-12, tests/cli/dump-prompt.test.ts:37-45, tests/helpers/packages.test.ts:5-16, tests/helpers/packages.ts:162-174
  description: |
    D-030 says the surviving probe tool's one-declaration contract fits the sample, while D-032 deliberately admits tests through transitive helpers and shipped executables. The actual probe contract is narrower: a `ProbeDefinition` must name a `declaredImportRoute`; execution requires that route's resolved path equal the mutation target and that the selected test module contain the route text. It also prepares its queue from an audit epoch's matrix and work-unit profiles.

    The repository contains the exact D-032 shapes that do not satisfy that boundary. `tests/cli/dump-prompt.test.ts` invokes `bin/cosmonauts` as a subprocess rather than importing a production mutation target, and `tests/helpers/packages.test.ts` imports a test helper whose dynamic imports of `lib/packages/scanner.ts` and `lib/domains/loader.ts` occur in another module. Pointing the probe at the helper would mutate test code rather than the production unit D-008 requires; pointing it at the production module fails the direct-route check. TASK-711 says only to “run the mutation probe” and does not own an adapter or an alternative evidence contract for these admitted shapes. The derived probe mechanism needs reconciliation before the sample is drawn; INV-005 itself should not be weakened.

- id: PR-002
  dimension: constraint-ownership
  severity: medium
  title: "TASK-711 can retain known-bad audit tooling by recording only a prose fate"
  plan_refs: Design — Stage 2 known rot, D-002, D-033, TASK-711 AC #2
  code_refs: scripts/test-health-audit/artifacts.ts:1144, scripts/test-health-audit/artifacts.ts:1213-1222, missions/tasks/TASK-711 - Stage 2 close-out probe the full sample and re-specify the test-health audit.md:16-20
  description: |
    Stage 2 explicitly says `validateCalibrationRecord` is known rot that must be fixed or deleted: it accepts a calibration source when `path` and `identity` are merely non-empty, so a nonexistent test can still certify a control. That implementation remains unchanged. TASK-711 is now the sole owner of deciding the audit scripts' fate, but its acceptance criterion requires only that every script have a “stated fate.” A worker can write “keep `artifacts.ts`” in the re-spec and satisfy all three criteria without repairing the validator, deleting it, or proving that the new method no longer calls it.

    This drops a load-bearing Design constraint at the task boundary and lets the obsolete evidence defect survive the task that is supposed to replace the old method under human-ratified D-002. Carry the fix/delete outcome—not merely a prose classification—into the task-visible acceptance contract.

- id: PR-003
  dimension: constraint-ownership
  severity: medium
  title: "The Cancelled inventory still omits shipped Done-only consumers"
  plan_refs: D-026, D-028, D-031, D-035, B-012, Files to Change — Stage 3, TASK-710 description
  code_refs: domains/shared/skills/spawning/SKILL.md:52, lib/driver/README.md:300, lib/driver/run-run-loop.ts:223, cli/drive/subcommand.ts:1457, missions/tasks/TASK-710 - Stage 3 a Cancelled task status, and the superseded audit plan archived.md:17
  description: |
    The latest amendments add the two guides named in review 7, but the current repository still has additional Done-only consumers outside D-031/D-035 and the flat Stage 3 file list. The shipped spawning skill tells readers that the coordinator loops until all tasks are Done; the packaged `lib/driver/README.md` says a completion candidate requires all Done; the legacy run-loop path makes that exact check; and Drive resume finalization has another `status !== "Done"` boundary.

    TASK-710 repeats the enumerated guidance list and asks for a production-code literal search, but it neither names these paths nor carries an acceptance outcome proving that every surviving completion/finalization path and shipped guide was reconciled. This matters especially for `run-run-loop.ts`: TASK-709 may delete it, but B-010 also permits wiring or staging it, in which case its Done-only completion behavior remains live. The plan should make these concrete consumers part of TASK-710/TASK-709 ownership or explicitly prove why each does not adopt the Done-or-Cancelled terminal rule. D-026 through D-035 are derived ground; this does not require changing the ratified Intent.

## Missing Coverage

- B-007's committed probe table covers skill `name`/`description` frontmatter and the runtime `{{objective}}` token, but no remaining task owns the behavior's separate “tool name that code resolves” case (`stage2-probes.md:47-55`; `TASK-711:16-20`).
- TASK-711 does not define how the D-032 module/executable census maps an indirectly reached declaration to a production mutation target when the surviving probe contract cannot express that route.
- Exact Stage 3 deletion candidates and actual project Fallow output remain mechanically unchecked because `dead-code` and `trace` are unbound with `execution-not-consented`.

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: Internal probe definitions/execution, D-032 example tests, task-status consumers, task handoffs, package scripts, and Fallow configuration were read. A live project Fallow invocation was not run because available project execution loads repository-controlled configuration and analysis execution is not consented.
  findings: PR-001, PR-003

- dimension: duplication
  status: unchecked
  checked: `analysis_status` reports `duplication` and `trace` unbound with `execution-not-consented`; no capability evidence was available for a project-wide duplicate-path check.
  findings: none

- dimension: state-sync
  status: checked
  checked: The Stage 2 barrier, all four framework-health task dependencies, survivor exits, cancellation persistence design, old audit-plan exit, and generated-versus-packaged command state were compared.
  findings: PR-003

- dimension: risk-blast-radius
  status: unchecked
  checked: Probe population/tool compatibility, old audit-tool retention, Cancelled consumers, public/staged roots, and the two known orphan paths were inspected. The exact deletion set could not be mechanically traced because `dead-code` and `trace` are unbound with `execution-not-consented`.
  findings: PR-001, PR-002, PR-003

- dimension: user-experience
  status: checked
  checked: Maintainer probe evidence, task cancellation/readback/archive flows, coordinator/Drive completion guidance, and the durable plus generated implement-plan commands were walked from user and agent entry points.
  findings: PR-003

- dimension: behavior-spec
  status: checked
  checked: All twelve behaviors were checked for observer, shipped entry point, failure/edge outcomes, the INV-003 exception, implementation reachability, and ownership in TASK-708 through TASK-711.
  findings: PR-001

- dimension: architecture-record
  status: checked
  checked: Architecture Context was compared with `missions/architecture/code-structure-map.md`; the Fallow check remains framed as the first orphan-health delivery with a future handoff to the derived-map contract.
  findings: none

- dimension: quality-contract
  status: checked
  checked: D-016/B-011 remain aligned with runtime capability resolution; the plan has no quality-gate table or predicted binding state, and B-009's direct command remains distinct from the consent-gated capability.
  findings: none

- dimension: lifecycle-invariant
  status: checked
  checked: INV-001 through INV-007, including the human-ratified INV-003 exception, were attacked against survivor re-probes, Stage 2-to-Stage 3 ordering, cancellation exits, owner expiry, and obsolete audit evidence.
  findings: PR-001, PR-002, PR-003

- dimension: constraint-ownership
  status: checked
  checked: D-020 through D-035, Files to Change, Implementation Order, TASK-708 through TASK-711, known Stage 2 rot, and shipped Done-only guidance were traced into worker-visible ownership and acceptance outcomes.
  findings: PR-002, PR-003

- dimension: scope-size
  status: checked
  checked: The plan has twelve behaviors, at the project's guidance ceiling, with explicit stage clusters and four linked task units; no behavior-count split is required.
  findings: none

## Assessment

The plan remains viable, and the latest amendments close all findings as they were concretely stated in rounds 1–7. Before TASK-711 runs, reconcile D-032's indirect/subprocess population with the actual probe interface; otherwise the Stage 2 barrier can either block or produce evidence against the wrong target. Then carry the known audit-validator disposition and the remaining Cancelled consumers into task-visible outcomes.
