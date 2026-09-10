# Plan Review: chain-stage-context

## Findings

- id: PR-001
  dimension: state-sync
  severity: high
  title: "The reported slug is not bound to the chain's existing plan identity"
  plan_refs: D-004 through D-006, B-005 through B-008, Design §2
  code_refs: lib/orchestration/stage-prompts.ts:37-55, lib/orchestration/chain-runner.ts:647-664, lib/orchestration/durable-chain-compiler.ts:88-96, lib/orchestration/durable-chain-compiler.ts:270-299, lib/orchestration/types.ts:116-123
  description: |
    Both execution paths already resolve an expected plan identity from `ChainConfig.planSlug` or `completionLabel` and pass it into the spawn. D-005 instead describes validating only the slug supplied by the assistant's terminal report; neither its accepted predicate nor its reason union requires that slug to equal the chain's resolved slug. A planner running for plan A can therefore report an addressed latest round from existing plan B and authorize task decomposition for A.

    The shared check must consume and compare the existing expected plan identity when one is available, and the plan must define what “active plan” means when neither `planSlug` nor a plan-scoped completion label is present. This repairs derived D-005/D-006 while preserving ratified AC-004. All Decision Log provenance can remain `Decided-by: derived`.

- id: PR-002
  dimension: interface-fidelity
  severity: high
  title: "`run_activity` is not an event supported by the durable chain seam"
  plan_refs: D-006, B-008, Design §4, Quality Contract criterion 5
  code_refs: lib/orchestration/durable-chain-runner.ts:236-257, lib/orchestration/chain-event-adapter.ts:87-151, missions/architecture/durable-orchestration-runtime.md (Normalized events)
  description: |
    Design §4 says the durable backend appends an existing `run_activity` event, but the current backend persists chain-local evidence as `step_tool_activity`, and the adapter switch handles `step_tool_activity`; neither inspected durable chain seam recognizes `run_activity`. The architecture record's normalized event union likewise names `step_tool_activity`, not `run_activity`. Implemented literally, the proposed append cannot satisfy the event contract and the adapter cannot project the required machine-readable halt.

    The plan must name the actual existing event envelope and specify the validation shape at that seam. This is a derived mechanism correction; it does not require changing the ratified acceptance criterion or generic durable event/result contracts.

- id: PR-003
  dimension: lifecycle-invariant
  severity: high
  title: "An inline blocked stage can still produce `ChainResult.success: true`"
  plan_refs: D-004, B-006, Design §3
  code_refs: lib/orchestration/chain-runner.ts:300-342, lib/orchestration/chain-runner.ts:355-386, lib/orchestration/types.ts:205-240
  description: |
    The existing loop stops on `ChainStepOutcome.success === false`, but `recordChainStepOutcome` adds a chain error only when `outcome.error` is present, and `finalizeChainResult` computes success from `state.errors.length === 0`. The design says to mark the stage unsuccessful, attach `reviewRoundBlock`, and rely on the existing stop loop, but it never requires a nonempty `error` or changes the final success predicate. A literal implementation can stop before task-manager while returning a successful chain with an empty error list.

    B-006's test must assert the final `ChainResult.success` and errors contract, and the design must specify how the typed block participates in final chain failure. The fix belongs to derived D-004/D-006 and must not weaken AC-004.

- id: PR-004
  dimension: risk-blast-radius
  severity: high
  title: "A task-manager parallel to the revision stage starts before the halt can be enforced"
  plan_refs: D-003, D-004, B-002, B-006, B-008, Risks (`stage could be misclassified in parallel`)
  code_refs: lib/orchestration/chain-runner.ts:311-321, lib/orchestration/chain-runner.ts:462-475, lib/orchestration/durable-chain-compiler.ts:98-124, bundled/coding/chains.ts:4-32
  description: |
    For `planner -> plan-reviewer -> [planner, task-manager]`, the repeated planner is still classified from earlier top-level history, but the inline runner launches every current-group member concurrently with `Promise.allSettled`; task-manager is already spawned before the planner's terminal report can be checked. The durable compiler also gives siblings the same frontier, so declaration/scheduler order—not the review gate—decides which sibling starts first. Ignoring current-group members as positional history does not solve this execution race.

    D-004 promises zero task-manager and later-stage spawns, while the behavior matrix covers parallel classification but not parallel enforcement. The plan must define and test the unsafe topology's outcome or move enforcement to a boundary that dominates task decomposition. This amends derived D-003/D-004; AC-004 remains ratified.

- id: PR-005
  dimension: behavior-spec
  severity: medium
  title: "The halt is attached only to a specialized revision stage, not to task decomposition"
  plan_refs: D-004, B-006 through B-008, Design §3, Design §7
  code_refs: bundled/coding/chains.ts:4-32, lib/orchestration/chain-runner.ts:300-342, lib/orchestration/durable-chain-compiler.ts:98-154
  description: |
    AC-004 is phrased at the task-decomposition boundary, but every halt behavior assumes a successful repeated planner already classified as `reviewKind:"plan"`. A valid custom topology such as `planner -> plan-reviewer -> task-manager`, or `plan-reviewer -> planner -> task-manager`, reaches task-manager without executing the proposed validator because there is no specialized repeated-role revision stage. The graph dependency alone cannot block a predecessor that returned ordinary success.

    The plan must either add behavior for task-decomposition entry with an outstanding review or explicitly reconcile this narrowing with ratified AC-004. It cannot silently redefine that acceptance criterion through derived D-004.

- id: PR-006
  dimension: interface-fidelity
  severity: medium
  title: "The shared positional API uses conflicting index conventions"
  plan_refs: D-002, B-002, B-003, Design §1
  code_refs: lib/orchestration/chain-runner.ts:300-340, lib/orchestration/durable-chain-compiler.ts:88-101, lib/orchestration/durable-chain-compiler.ts:168-205
  description: |
    Design §1 defines `deriveStagePromptPurpose(..., stepIndex, ...)` using the inline runner's zero-based top-level index. The durable compiler immediately converts its array index to `index + 1` and carries that one-based value through `CompileStageOptions` and persisted metadata. The plan does not specify whether purpose is derived before that conversion or passed through the existing one-based field, creating an off-by-one contract at the exact parity seam AC-003 calls out.

    Prescribe separate names/types or the exact conversion point and include first, middle, and terminal positions in B-003. This is a derived plumbing clarification and keeps all Decision Log entries `Decided-by: derived`.

## Missing Coverage

- No negative report test binds a valid but wrong `planSlug` to the expected chain plan, or rejects a completed/non-active plan when the report is the only identity source.
- No parallel test proves task-manager cannot start when it shares a group/frontier with a plan-review revision stage.
- No inline test asserts that a typed review block makes the final chain unsuccessful even if no ordinary spawn error occurred.
- No custom-chain test covers task decomposition after a review when the topology omits the repeated revision stage.
- Durable evidence tests name the nonexistent `run_activity` envelope rather than the existing `step_tool_activity` contract.

## Coverage Ledger

- dimension: interface-fidelity
  status: checked
  checked: Stage-prompt options, zero-/one-based call-site indexes, resolved plan identity, inline result aggregation, durable backend result/evidence, and adapter event handling were compared with the proposed contracts.
  findings: PR-001, PR-002, PR-003, PR-006
- dimension: duplication
  status: unchecked
  checked: Duplication and trace capabilities are unbound because provider `fallow` reports `execution-not-consented`; they were not retried and no project-wide duplication claim is made.
  findings: none
- dimension: state-sync
  status: checked
  checked: Self-reported slug versus existing chain plan identity, persisted purpose, artifact-derived addressability, and the unchanged `behaviorsReviewPending` field were traced.
  findings: PR-001
- dimension: risk-blast-radius
  status: checked
  checked: Both shipped sequential chains, custom chains without a terminal revision, parallel revision/task-manager groups, inline stop behavior, and durable graph dependencies were walked.
  findings: PR-003, PR-004, PR-005
- dimension: user-experience
  status: checked
  checked: Addressed and blocked reruns, wrong-plan attestation, misleading inline success, and visible durable evidence were reviewed from operator and calling-agent perspectives.
  findings: PR-001, PR-002, PR-003
- dimension: behavior-spec
  status: checked
  checked: B-001 through B-010 were mapped to the seven authoritative acceptance bullets, with the user-directed absence of Intent/INV deliberately not treated as a finding.
  findings: PR-001, PR-003, PR-004, PR-005, PR-006
- dimension: architecture-record
  status: checked
  checked: The two named orchestration records, prompt-layer documentation, and ROADMAP `factory-modes` were read; the local user-message purpose is appropriately separate, but normalized durable evidence must use the recorded event vocabulary.
  findings: PR-002
- dimension: quality-contract
  status: checked
  checked: The ordered abstract ladder, failure cases, parity requirements, observability, and generic-runtime exclusions were reviewed.
  findings: PR-001, PR-002, PR-003, PR-004, PR-005, PR-006
- dimension: lifecycle-invariant
  status: checked
  checked: Stage failure to chain failure, later-stage suppression, parallel launch order, durable blocking, rerun reconstruction, and report/artifact identity were attacked.
  findings: PR-001, PR-003, PR-004
- dimension: constraint-ownership
  status: checked
  checked: D-001 through D-007 and Files-to-Change constraints were traced to behaviors or implementation stages. All current decisions remain `Decided-by: derived`; no finding asks to alter provenance.
  findings: PR-004, PR-005, PR-006
- dimension: scope-size
  status: checked
  checked: The plan has 10 behaviors, below the 12-behavior guidance, and its implementation stages are coherent task candidates.
  findings: none

## Assessment

The plan is viable only after revisions to the fail-closed contract. Bind the report to the chain's expected plan first, then correct the durable evidence envelope and ensure both sequential and parallel task-decomposition paths are actually dominated by the review gate.
