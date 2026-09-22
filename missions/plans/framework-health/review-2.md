# Plan Review: framework-health

## Findings

- id: PR-001
  dimension: state-sync
  severity: high
  title: "The implementation has no plan-linked task path, so plan verification is skipped"
  plan_refs: Files to Change — Stage 1 done / Stage 2 in progress, Implementation Order
  code_refs: missions/plans/framework-health/plan.md:1-7, bundled/coding/prompts/quality-manager.md:44-51, bundled/coding/prompts/integration-verifier.md:10-17
  description: |
    `plan_view("framework-health")` reports `Tasks: 0`, even though the plan says Stage 1 is done, Stage 2 is in progress, and several decisions were worker-amended. Both shipped verification paths discover plan context only from `plan:<slug>` task labels: the Quality Manager sets `activePlanSlug = none` when no such label exists, and the Integration Verifier writes no report when there is no unique label.

    Implementing this plan as currently recorded therefore makes its broad prompt, test, CLI, and reachability changes a planless review run: integration verification is skipped, plan-scoped remediation tasks cannot be created, and no durable plan-scoped quality report is produced. The plan needs a linked task handoff before further implementation, or an explicit change to the discovery contract; prose stage labels cannot substitute for the state the shipped lifecycle reads.

- id: PR-002
  dimension: user-experience
  severity: high
  title: "The durable implement-plan command still enforces the format this plan removes"
  plan_refs: D-001, D-016, Design — Stage 1, Files to Change — Stage 1 done
  code_refs: external-commands/implement-plan.md:28-31, external-commands/implement-plan.md:56-62, package.json:17-29, /Users/cosmos/.claude/commands/implement-plan.md:1-35
  description: |
    Stage 1 says to update `~/.claude/commands/implement-plan.md` outside the repository, but that file identifies itself as generated and its durable packaged source is `external-commands/implement-plan.md` (`package.json` ships `external-commands/`). Both copies still tell the coordinator to read a plan Quality Contract, account for `@cosmo-behavior` markers, and run marker-based completeness checks.

    Once Stage 2 removes the markers, a user invoking this shipped command is instructed to prove a condition the new format deliberately makes false. Editing or handing off a patch for only the generated home-directory copy is also not durable because a later sync can recreate it from the stale packaged source. The source asset and its materialized copy must be included in the migration.

- id: PR-003
  dimension: lifecycle-invariant
  severity: medium
  title: "B-005's identical-outcome invariant contradicts the recorded marker-strip result"
  plan_refs: B-005, D-017, Design — Stage 2
  code_refs: missions/plans/framework-health/plan.md:276-291, missions/plans/framework-health/plan.md:337-344
  description: |
    B-005 requires the per-test pass/fail list to be identical before and after marker removal, and the Stage 2 design says any non-flake difference reverts the marker commit. D-017 records the opposite result: one test outcome changed, then the three-test file and two additional source-grep tests were deleted. The final declaration/outcome list therefore cannot be identical to the pre-strip list.

    Deleting executable coupling serves ratified INV-004 and should not be undone, but the derived B-005/design mechanism must be amended before the stage is called delivered. As written, the plan records both a completed result and a behavior that the result fails.

- id: PR-004
  dimension: lifecycle-invariant
  severity: medium
  title: "B-006 remains universal despite the ratified provider-neutrality exception"
  plan_refs: INV-003, D-019, B-006
  code_refs: tests/prompts/provider-neutrality.test.ts:1-35
  description: |
    B-006 says any persona or skill-body rewording that leaves machine-parsed structure untouched keeps the suite green. The retained provider-neutrality tests intentionally fail on a prose-only edit that introduces words such as `fallow`, `vitest`, `React`, or `Rails`; no parsed key or runtime-resolved identifier needs to change.

    INV-003 now carries a human-ratified exception for exactly these guards, but B-006 was not narrowed with it. The behavior must yield to that ratified exception; removing the exception itself would touch human-decided ground and requires escalation.

- id: PR-005
  dimension: interface-fidelity
  severity: medium
  title: "B-002 still promises broader supersession checking than the parser performs"
  plan_refs: B-002, D-004
  code_refs: lib/artifacts/plan-conformance.ts:28-35, lib/artifacts/plan-conformance.ts:85-114, lib/artifacts/plan-conformance.ts:151-180
  description: |
    B-002 says a plan “superseding without a date” fails. The checker recognizes only a line beginning `- Supersedes:` and the italic `*(superseded|withdrawn by ...)*` annotation grammar. Ordinary decision prose such as “this decision supersedes D-001” is not inspected and can pass without a date.

    The round-1 finding was only partially addressed by broadening the two structured forms; the behavior remains unqualified. Either the observable contract must name those structured supersession forms or the parser must implement the broader promise.

- id: PR-006
  dimension: risk-blast-radius
  severity: medium
  title: "The mutation population excludes the audit tooling Stage 2 explicitly keeps in scope"
  plan_refs: D-008, B-008, Design — Stage 2, stage2-probes.md — Not yet probed
  code_refs: tests/scripts/test-health-audit/artifacts.test.ts:1-35, tests/scripts/test-health-audit/census.test.ts:1-28, missions/plans/framework-health/stage2-probes.md:43-47
  description: |
    D-008 defines the population as test files importing from `lib/`, `cli/`, or `domains/`. The surviving audit suites import only from `scripts/test-health-audit/**`, while Stage 2 explicitly says the audit tooling remains in scope and that census/probe likely survive the re-spec. Those files are therefore omitted before stratification, not sampled at any rate.

    B-008 can still pass for the chosen sample while the machinery replacing the failed audit receives no fault-sensitivity probe at all. The population boundary needs to include every retained production/source zone this stage claims to assess, or the exclusion and its effect on the plan's suite-health claim must be explicit.

- id: PR-007
  dimension: risk-blast-radius
  severity: medium
  title: "D-008 regresses from copy-isolated probes to interruption-unsafe mutation"
  plan_refs: D-008, B-008, Risks
  code_refs: scripts/test-health-audit/probe.ts:376-493
  description: |
    D-008 says to mutate the production unit and restore it from a `cp` backup, but defines no sandbox, `finally` restoration, source digest check, or crash-recovery path. An interruption after mutation can leave the working checkout running deliberately broken production code.

    The in-scope probe implementation already seeds a temporary sandbox, mutates only the copied target, restores it in `finally`, verifies the source checkout status/digest is unchanged, and removes the sandbox in an outer `finally`. Because the plan says this probe code likely survives, replacing that safety contract with an unspecified in-place backup procedure is a regression. The plan must preserve an interruption-safe isolation/recovery contract before broad sampling begins.

- id: PR-008
  dimension: interface-fidelity
  severity: medium
  title: "The staged-owner check is still not composed into B-009's single gate"
  plan_refs: D-006, D-007, B-009, Files to Change — Stage 3
  code_refs: package.json:28-40, fallow.toml:1-33, domains/shared/extensions/project-tools/fallow-provider.ts:1976-2020, domains/shared/extensions/project-tools/fallow-provider.ts:2456-2519
  description: |
    D-007 now makes staged modules Fallow `entry` roots and proposes a separate small check for whether the annotation names a live owner. B-009, however, exposes one “project's dead-code gate” that must fail both unreachable code and an archived staged owner. No composition point is named: `package.json` has no reachability script, and the analysis adapter invokes and normalizes Fallow directly without owner-annotation logic.

    Capability evidence from `analysis_status` currently reports `dead-code` unbound with `execution-not-consented`, so no live capability result can fill the gap; the adapter source shows that even a later bound invocation would run only Fallow. A literal implementation can ship two independent checks while neither B-009 entry point enforces both. Define the combined invocation/exit contract and its shipped registration before assigning Stage 3.

- id: PR-009
  dimension: constraint-ownership
  severity: medium
  title: "Worker amendments overwrite decision history and blur ratified provenance"
  plan_refs: D-006, D-007, D-008, D-010, D-012, D-018
  code_refs: domains/shared/skills/work-artifacts/references/deviation-protocol.md:9-29, domains/shared/skills/work-artifacts/references/deviation-protocol.md:71-84
  description: |
    The revision folds worker changes directly into existing entries (“amended by the worker” / “worker-amended”) instead of adding a dated decision with `Supersedes:` and marking the old text in place. D-010 is especially ambiguous: its lifecycle paragraph says it is a derived worker amendment, but the entry still ends `Decided by: human, 2026-09-20`, which makes the whole entry ratified under the shipped mutability table.

    The deviation protocol requires a new amendment entry and preserved superseded text precisely so downstream agents can distinguish human ground from worker-derived mechanism. Repairing the trail must preserve D-010's original human-decided portion; rewriting that ratified ground is not an automated fix.

- id: PR-010
  dimension: behavior-spec
  severity: medium
  title: "The shipped planned-work example still generates an incomplete, gate-declaring artifact"
  plan_refs: D-016, Design — Stage 1, Files to Change — Stage 1 done
  code_refs: domains/shared/skills/work-artifacts/references/examples.md:38-105, domains/shared/skills/work-artifacts/references/spec-format.md:5-27, domains/shared/skills/work-artifacts/references/plan-format.md:5-31
  description: |
    The canonical planned feature/refactor example omits the required spec `## Intent` and plan `## Decision Log` sections, then ends with “Run the declared checks.” The adjacent canonical formats require Intent and Decision Log and say plans do not declare checks or gates.

    Stage 1 explicitly says `examples.md` was fixed and is done, but a planner following the shipped example still produces an artifact the shipped format declares incomplete and preserves the old plan-local check model removed by D-016. Align the example before treating the format stage as complete.

## Missing Coverage

- No plan-linked task graph owns the already-completed and remaining stages, so plan-scoped integration and quality reporting have no discovery path.
- The packaged `external-commands/implement-plan.md` source and its generated harness copies are absent from the migration ownership list.
- The marker-strip behavior does not state how intentionally coupled tests affect the before/after outcome comparison.
- The mutation sample has no coverage rule for retained `scripts/` (or other source zones outside `lib/`, `cli/`, and `domains/`).
- Stage 3 does not define one registered invocation whose exit combines Fallow reachability with staged-owner liveness.
- D-008 has no cancellation/crash recovery outcome for a mutation interrupted before restoration.

## Coverage Ledger

- dimension: interface-fidelity
  status: unchecked
  checked: Internal plan-checker, Quality Manager, Fallow-adapter, package-script, and staged-owner seams were read. A live Fallow probe was not run because execution consent is absent and the available invocation would load project-controlled `fallow.toml`; external flags, exit codes, and envelopes remain unchecked.
  findings: PR-005, PR-008

- dimension: duplication
  status: unchecked
  checked: `analysis_status` reports duplication and trace unbound with `execution-not-consented`; no capability evidence was available for a project-wide duplicate-path check.
  findings: none

- dimension: state-sync
  status: checked
  checked: Active plan/task association, Quality Manager plan discovery, Integration Verifier plan discovery, and decision-provenance state were compared.
  findings: PR-001, PR-009

- dimension: risk-blast-radius
  status: unchecked
  checked: Mutation safety, sampling scope, packaged command propagation, and staged-owner enforcement were inspected. Proposed Stage 3 deletions could not be mechanically traced because dead-code and trace capabilities are unbound with `execution-not-consented`.
  findings: PR-002, PR-006, PR-007, PR-008

- dimension: user-experience
  status: checked
  checked: The generated/package-backed implement-plan flow and plan-check CLI promises were walked from a maintainer's entry points.
  findings: PR-002, PR-005

- dimension: behavior-spec
  status: checked
  checked: All eleven behaviors were checked for observer, shipped entry point, observable outcome, exceptions, failure cases, and consistency with recorded stage results.
  findings: PR-003, PR-004, PR-006, PR-010

- dimension: architecture-record
  status: checked
  checked: The plan declares no architecture record; no Architecture Context contract was available to verify. The review did not infer boundary conformance from the missing architecture map or unbound boundary capability.
  findings: none

- dimension: quality-contract
  status: checked
  checked: D-016 and B-011 were compared with the runtime-resolving Quality Manager, canonical gate references, the staged reachability check, packaged command, and planned-work example.
  findings: PR-002, PR-008, PR-010

- dimension: lifecycle-invariant
  status: checked
  checked: Marker-strip before/after state, provider-neutrality exception, mutation interruption, taskless sign-off, and amendment provenance were attacked for contradictory or exitless states.
  findings: PR-001, PR-003, PR-004, PR-007, PR-009

- dimension: constraint-ownership
  status: checked
  checked: Decision/design constraints and Files to Change entries were traced to task-visible ownership and shipped sources.
  findings: PR-001, PR-002, PR-008, PR-009, PR-010

- dimension: scope-size
  status: checked
  checked: The plan has eleven behaviors, within the twelve-behavior guidance, and its four stages are explicit slice seams. The absence of any linked implementation tasks is tracked as a lifecycle finding rather than a behavior-count finding.
  findings: none

## Assessment

The plan remains viable, but it is not ready for further implementation. First restore a plan-linked task/verification path; without it, every subsequent stage is implemented and signed off as planless. Then correct the durable external command source and reconcile the contradictory Stage 2/Stage 3 contracts before deletion work begins.
