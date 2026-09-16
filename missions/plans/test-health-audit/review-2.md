# Plan Review: test-health-audit

## Findings

- id: PR-001
  dimension: state-sync
  severity: high
  title: "Calibration-driven method changes have no successor-epoch transition"
  plan_refs: Decision Log D-013 and D-014, Design §5, Risks 5 and 9, Implementation Order stage 5
  code_refs: missions/plans/test-health-audit/plan.md:141-153, missions/plans/test-health-audit/plan.md:426-441, missions/plans/test-health-audit/plan.md:545-546
  description: |
    The immutable manifest records the method/schema version, and carry-forward is permitted only when that input is unchanged. The plan creates a successor epoch after remediation or an authority/inventory change, but calibration is explicitly expected to amend the method/schema on a miss; reviewer disagreement may do the same. Neither path creates a successor epoch before rerunning calibration or profiles.

    Implemented literally, the audit must either mutate an immutable manifest, write new evidence against a stale method digest, or remain blocked after the first calibration miss. Extend the persisted epoch transition to every material method/schema change; this is derived mechanism and can be amended on record without changing the ratified calibration requirement.

- id: PR-002
  dimension: behavior-spec
  severity: medium
  title: "The calibration table still does not predeclare the obligations B-003 says are exact"
  plan_refs: Decision Log D-014, B-003, Design §4, Quality Contract assertion 4
  code_refs: missions/plans/test-health-audit/plan.md:387-426, tests/orchestration/spawn-limits.test.ts:1-49, tests/domains/coding-agents.test.ts:72-101
  description: |
    D-014 and B-003 require every stable control to predeclare expected dimension conclusion(s), evidence basis, reason code(s), and portfolio effect. Most table rows specify only a subset: for example P-001 says conclusions “may be” `direct-production` and `isolated-real-unit` but gives no required basis, reasons, or portfolio effect; N-001 gives a reason and portfolio outcome but no dimension conclusions or basis. P-001 also points at an entire file containing many distinct declarations, while N-010 names the allowed-value test only informally rather than by its executable title.

    The proposed artifact validator therefore has no exact expected record against which to compare an actual row, so workers must invent the missing obligations during calibration—the failure D-014 was added to prevent. Pin each control to an exact source identity and enumerate every required conclusion/basis/reason/portfolio field before task creation. This is needed to satisfy ratified AC-009 rather than reinterpret it during execution.

- id: PR-003
  dimension: interface-fidelity
  severity: medium
  title: "The shared profile contract leaves load-bearing cross-module types undefined"
  plan_refs: Decision Log D-015, B-001, B-004, Design §1
  code_refs: missions/plans/test-health-audit/plan.md:308-354, missions/plans/test-health-audit/spec.md:77-124, node_modules/vitest/dist/chunks/reporters.d.BFLkQcL6.d.ts:69-133
  description: |
    `TestEvidenceProfile` is the interchange format between the source census, Vitest reporter, profile reviewers, artifact validator, carry-forward logic, and portfolio join, but its contract references `TestSurface`, `RuntimeState`, `TestRole`, `EvidenceRef`, `EvidenceDigest`, and `PortfolioContribution` without defining their unions or shapes. The spec provides examples of roles and defines portfolio *conclusions*, but not these types. D-015 also promises assessor time/tool-version provenance, while the collector branch of `AssessedValue.assessor` has a version but no observation time.

    Vitest supplies deterministic IDs, source locations, options, and results as separate fields, so the omitted normalization contracts are not supplied by the existing API. Independent workers would have to make incompatible decisions about runtime states, evidence addressing, material digests, and contribution identity. Define these shared types and the collector timestamp contract before splitting schema, census, artifacts, and profiling work.

- id: PR-004
  dimension: lifecycle-invariant
  severity: high
  title: "A noncritical unresolved confirmed weakness has no path to eligibility or a human ruling"
  plan_refs: B-009, Design §6-8, Quality Contract assertion 7, Implementation Order stages 8-11
  code_refs: missions/plans/test-health-audit/plan.md:274-283, missions/plans/test-health-audit/plan.md:455-482, missions/plans/test-health-audit/plan.md:535-557, missions/plans/test-health-audit/spec.md:197-213
  description: |
    B-009 starts with a confirmed weakness and permits `unresolved` when authority is absent or conflicting. Stage 8 halts for a human ruling only when that unresolved row is critical. A noncritical unresolved row proceeds to eligibility, where baseline condition 5 requires every confirmed weakness to be fixed, replaced, removed, or excluded; eligibility therefore fails and returns to the same unresolved remediation stage. The only named human checkpoint comes after eligibility, so this state has no exit.

    The plan needs a pre-eligibility human-decision path for every unresolved confirmed weakness, or it must classify the row as excluded from guardrail evidence before evaluating condition 5. Allowing such a row to pass merely as accepted uncertainty would weaken ratified AC-012 and the baseline condition, so that alternative would require human approval rather than a derived amendment.

- id: PR-005
  dimension: user-experience
  severity: medium
  title: "The only permanent audit command has no defined command, output, or exit contract"
  plan_refs: Decision Log D-018, B-002, B-008, B-010, Design §1-2 and §6
  code_refs: package.json:14-33, scripts/vitest-runner.mjs:1-29, missions/plans/test-health-audit/plan.md:164-168, missions/plans/test-health-audit/plan.md:304-306
  description: |
    D-018 exposes `bun scripts/test-health-audit/cli.ts --audit-root <path> <command>` as the repeatable maintainer interface, but `<command>` is never enumerated. The plan does not define which command collects versus validates versus probes, required arguments, output envelope, or exit statuses for `complete`, `incomplete`, `blocked`, calibration miss, stale evidence, and `eligible-for-ratification`. D-009 says objective failures *may* fail the command, which also leaves the automation contract undecided.

    This repository’s existing test wrapper deliberately propagates Vitest exit status, while the new CLI must distinguish an observed failing test run from failure of the audit itself. Because no package script is added, the documented bare command is the sole durable UX; its contract cannot be deferred to one worker. Specify the command vocabulary and outcome/exit mapping, including where one explicit maintainer invocation authorizes project-controlled execution.

## Missing Coverage

- The claimed census of 267 `tests/**/*.test.ts` files could not be independently counted with the available read-only tools; analysis entry-point counts are not semantically equivalent to the glob.
- No live Vitest command or reporter probe was run. Every available invocation would load project-controlled `vitest.config.ts`, setup, and potentially tests, and this role has no approved sandbox or shell execution. Static inspection confirmed Vitest 3.2.4, the reporter/watcher hooks, package scripts, wrapper argument forwarding, and signal/exit handling.
- Project duplication evidence is unavailable: `analysis_duplication` failed with `invalid-output` because Fallow exited 0 while returning 91 normalized findings. Existing adjacent audit/artifact code was read, but project-wide duplicate-path absence was not established.
- Boundary-conformance capability is unbound, and the proposed `scripts/test-health-audit/**` modules do not yet exist. Their dependency direction was reviewable only as a declared contract, not as executable boundary evidence.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Compared package scripts, the wrapper, installed Vitest 3.2.4 reporter types, proposed profile schema, command adapter, and current session/calibration specimens.
  findings: PR-003
- dimension: duplication
  status: unchecked
  checked: Bound Fallow duplication analysis failed normalization because exit 0 contradicted 91 normalized findings; the proposed files do not yet exist.
  findings: none
- dimension: state-sync
  status: checked
  checked: Traced immutable manifests, calibration amendments, profile carry-forward, remediation epochs, index updates, candidate digest, and ratification transitions.
  findings: PR-001
- dimension: risk-blast-radius
  status: checked
  checked: Walked calibration misses, long-running profile work, unresolved authority, repeated command execution, probe interruption, remediation, and final eligibility.
  findings: PR-001, PR-004
- dimension: user-experience
  status: checked
  checked: Walked the maintainer CLI from collection and consent through validation, probing, stale evidence, eligibility, and owner ratification.
  findings: PR-005
- dimension: behavior-spec
  status: checked
  checked: Mapped AC-001 through AC-015 and INV-001 through INV-007 to B-001 through B-011, named tests, seams, markers, calibration controls, and failure exits.
  findings: PR-002, PR-004
- dimension: architecture-record
  status: checked
  checked: Read the declared code-structure-map record and live architecture-map result; the plan correctly treats the missing generated map as unavailable rather than clean and does not claim a new durable architecture record.
  findings: none
- dimension: quality-contract
  status: checked
  checked: Checked the ordered universal/bindable ladder, exact calibration assertion, targeted-probe degradation, confirmed-weakness closure, and owner-ratification conditions.
  findings: PR-002, PR-004
- dimension: lifecycle-invariant
  status: checked
  checked: Attacked every calibration, census, profile, epoch, probe, remediation, unresolved, eligibility, and ratification state for a defined exit.
  findings: PR-001, PR-004
- dimension: constraint-ownership
  status: checked
  checked: Traced field provenance, inventory independence, copy-only probes, execution consent, workload caps, archive safety, scope exclusions, and human-only decisions into behaviors or implementation owners.
  findings: PR-003, PR-005
- dimension: scope-size
  status: checked
  checked: Confirmed 11 behaviors remain under guidance and that the large human-review phase is bounded by persisted declaration/span work units with at most two concurrent reviewers.
  findings: none

## Assessment

The plan remains viable, and the first review’s unsafe probe and revision-carry issues are materially improved. Fix the missing epoch transition and unresolved-row exit first; both can otherwise wedge the audit before it reaches the ratifiable baseline.
