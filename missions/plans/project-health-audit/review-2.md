# Plan Review: project-health-audit

## Findings

- id: PR-006
  dimension: lifecycle-invariant
  severity: high
  title: "Clone remediation edits a critical function before its required characterization commit"
  plan_refs: spec.md §Intent INV-002, plan.md §Decision Log D-009, plan.md §Implementation Order stages 4 and 9
  code_refs: lib/skills/exporter.ts:436-500, .shepherd/work/in-progress/project-health-audit/evidence/health.json:790-827
  description: |
    INV-002 requires focused characterization tests to be committed green before the first edit to every critical function, and D-009 repeats that ordering. The implementation order nevertheless removes same-file duplicate blocks from `groupCatalogue` in stage 4, while the critical-function characterization slice does not run until stage 9.

    This is not hypothetical overlap. A live `analysis_trace` for duplicate location `lib/skills/exporter.ts:467` under Fallow 2.54.2 returned the two instances at lines 467-475 and 484-492, both inside `groupCatalogue` (`lib/skills/exporter.ts:436-500`). The supplied health evidence classifies that function as critical with partial static coverage. Implemented literally, stage 4 therefore makes the first critical-function edit before the separate green characterization commit. The ordering must be changed or the overlapping clone work must be split behind an earlier characterization slice. INV-002 is ratified ground; weakening it requires the deviation protocol rather than an implementation-time exception.

- id: PR-007
  dimension: interface-fidelity
  severity: medium
  title: "The mandatory 41/2 clone-family split has no provider-observable family mapping"
  plan_refs: spec.md §Scope decisions Q-003, spec.md §Acceptance Criteria AC-004, plan.md §Design 3, plan.md §Decision Log D-005 and D-006, plan.md §Implementation Order stage 4
  code_refs: domains/shared/extensions/project-tools/fallow-provider.ts:1844-1883, lib/analysis/types.ts:203-211, .shepherd/work/in-progress/project-health-audit/evidence/dupes.json:112-246
  description: |
    The plan assigns mandatory dispositions to 43 derived “families” (41 extraction, two three-file baselines), but the actual provider contract contains only `clone_groups`. `normalizeDuplicationFindings` emits one `AnalysisFinding` per group with an index-based adapter ID and no family identifier or relation. The supplied payload demonstrates why file membership is insufficient: a three-instance validation-helper group across `judgment-provider.ts`, `consolidation-proposals.ts`, and `retirement-receipts.ts` is immediately followed by an overlapping two-instance group using two of those same files. The plan itself intends different dispositions for overlapping validation helpers, yet D-005 defines only group-coordinate identity and never maps those group identities to the 43 family decisions.

    Whole-project duplication analysis currently cannot fill that gap: the live capability failed as `invalid-output` because provider exit 0 contradicted 87 normalized findings. Without an explicit, persisted starting group-to-family mapping, isolated workers cannot mechanically prove the ratified 41/2 split or reliably distinguish a mandatory extraction from part of an accepted family. The plan needs to make that mapping part of the handoff. Reinterpreting “family” as an individual provider group or a simple per-group file count would alter human-ratified Q-003/AC-004 and must be escalated rather than silently adopted.

## Missing Coverage

- All five findings in `review-1.md` remain unresolved because the plan has not been revised: the AC-008/final-commit contradiction, the unexecutable exact member trace, the incomplete replay schema, the non-observable B-005 outcome, and missing extraction-edge acceptance coverage.
- The implementation order does not protect other possible overlaps between stages 2-8 and the stage-9 critical inventory; `groupCatalogue` is a proven instance, but every earlier extraction/removal slice still needs an explicit overlap check before task creation.
- The clone inventory lacks a durable mapping from all 87 provider groups to the 43 scope-decision families and their extraction/baseline dispositions.
- Current whole-project clone completeness remains unverified because the bound duplication capability returned invalid output rather than a usable result.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared the clone-family contract with the raw Fallow payload, normalized `AnalysisFinding` contract, and adapter normalization path; prior baseline-refresh and trace interfaces from review 1 remain applicable.
  findings: PR-007; review-1 PR-001, PR-002, PR-003 remain unresolved

- dimension: duplication
  status: unchecked
  checked: Whole-project duplication analysis was attempted and failed with `invalid-output` (`fallow@2.54.2`, exit 0, 87 normalized findings). A targeted duplicate-location trace for `lib/skills/exporter.ts:467` succeeded and supports PR-006, and the supplied raw payload was inspected for PR-007, but current project-wide completeness could not be established.
  findings: PR-006, PR-007

- dimension: state-sync
  status: checked
  checked: Rechecked health-record and baseline closeout state ownership against the baseline refresh flow; no new finding beyond review-1 PR-001 and PR-003.
  findings: review-1 PR-001, PR-003 remain unresolved

- dimension: risk-blast-radius
  status: checked
  checked: Traced the stage-4 exporter clone into a stage-9 critical function and checked the effect of ambiguous family disposition on mandatory extraction versus baseline scope.
  findings: PR-006, PR-007

- dimension: user-experience
  status: checked
  checked: Rechecked the plan’s behavior-preservation observer and recovery claims; no new finding beyond review-1 PR-004.
  findings: review-1 PR-004 remains unresolved

- dimension: behavior-spec
  status: checked
  checked: Rechecked all ten B-IDs against shipped CLI, runtime, and persisted-artifact observers, including failure cases and the ratified Intent ranking.
  findings: review-1 PR-004 remains unresolved

- dimension: architecture-record
  status: unchecked
  checked: Read the named living-memory and tool-ecosystem records and the public-entry staging record manually. Automated boundary conformance is unbound (`provider-not-configured`) and `memory/architecture/index.md` is missing, so project-wide conformance was not established.
  findings: none

- dimension: quality-contract
  status: checked
  checked: Confirmed the plan carries quality through behaviors, invariants, dispositions, and risks rather than a separate QC list or hard-coded quality-gate table.
  findings: none

- dimension: lifecycle-invariant
  status: checked
  checked: Attacked first-edit ordering, closeout sequencing, trace-before-edit requirements, and recurring rerun states against the implementation order.
  findings: PR-006; review-1 PR-001, PR-002 remain unresolved

- dimension: constraint-ownership
  status: checked
  checked: Traced D-009 and the ratified 41/2 clone disposition into implementation stages and worker-visible contracts.
  findings: PR-006, PR-007

- dimension: scope-size
  status: checked
  checked: Counted ten behaviors and eleven sequential implementation slices and assessed them as candidate handoff units; no additional size finding was raised.
  findings: none

## Assessment

The plan is not ready for task creation: all five first-round findings remain, and the current order now has a demonstrated violation of ratified INV-002. The AC-008/final-commit contradiction from review 1 remains the first issue to resolve because it requires a human ruling; after that, the planner should repair characterization ordering and make the 43-family clone disposition mapping explicit.
