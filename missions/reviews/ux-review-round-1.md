# UX Review: round 1

## Overall

incorrect

## Assessment

The conformance command clearly distinguishes blocking issues from advisories in JSON, plain, and human output, and withdrawn counts are visible in all three formats. The prompt flows still contain two contracts agents cannot apply deterministically—size guidance and live probing—plus a stale workflow-step reference.

## Findings

- id: UR-001
  dimension: confusing-states
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "Scope review requires a plan-size threshold the reviewer is not given"
  files: bundled/coding/prompts/plan-reviewer.md
  lineRange: 133-138
  summary: |
    At the scope/size step, the reviewer is explicitly told to apply the project's guidance to
    behaviors or stages “rather than inventing a threshold,” but none of the work-artifact
    references the prompt requires at lines 7-15 defines such a threshold. The only numeric plan
    guidance available in the routed plan skill is for 3-12 tasks
    (`domains/shared/skills/plan/SKILL.md:102-106`), while the checker independently advises above
    12 behaviors. The planner repeats the undefined behavior-or-stage rule at
    `bundled/coding/prompts/planner.md:32`. Consequently, planner and reviewer agents must either
    guess, silently reinterpret task guidance, or mark the dimension unchecked, and can reach
    different size decisions for the same plan.
  suggestedFix: Point both prompts to one explicit canonical behavior/stage size rule that agrees with the checker and task guidance.
  task:
    title: "Make plan-size guidance deterministic across planning contracts"
    labels: [review-fix]
    acceptanceCriteria:
      - "Planner and plan-reviewer can locate an explicit threshold and units for behavior/stage size without inventing or translating task-count guidance."
      - "Planner, reviewer, and conformance advisory contracts apply the same documented size rule, with content tests proving the routing and terminology."

- id: UR-002
  dimension: flow
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: complex
  title: "The required live-probe step conflicts with the reviewer's read-only execution contract"
  files: bundled/coding/prompts/plan-reviewer.md
  lineRange: 26-26
  summary: |
    When a plan wraps an external CLI, the new step requires live invocations to verify flags,
    exit codes, and output envelopes. The Coding (Read-Only) role contract under which this agent
    runs forbids shell execution, while this line merely says to keep probes within that same
    discipline and provides no permitted invocation mechanism. “Where the tool is available” does
    not resolve the conflict: a binary can be installed and still be inaccessible under the role's
    tool policy. The reviewer therefore cannot tell whether to violate its execution contract or
    leave a required verification step unchecked, so the intended live evidence is not reliably
    obtainable.
  suggestedFix: Reconcile the live-probe requirement with the read-only tool contract by naming a permitted non-mutating probe path and retaining the explicit unchecked fallback.
  task:
    title: "Reconcile plan-reviewer live probes with read-only execution"
    labels: [review-fix]
    acceptanceCriteria:
      - "The prompt identifies a probe mechanism that the read-only reviewer is permitted to use without changing agent configuration or project state."
      - "If that mechanism or the external tool is unavailable, the reviewer records the exact limitation as unchecked in the coverage ledger rather than guessing from documentation."

- id: UR-003
  dimension: consistency
  priority: P3
  severity: low
  confidence: 1.0
  complexity: simple
  title: "Sidecar guidance sends the planner to the wrong workflow step"
  files: bundled/coding/prompts/planner.md
  lineRange: 75-75
  summary: |
    The sidecar section says plan-reviewer is step 7, but step 7 is now the newly added closing
    consistency pass and plan-reviewer handoff is step 8 (`bundled/coding/prompts/planner.md:65-68`).
    An agent following the cross-reference can hand off before completing the required closing
    pass, directly contradicting the ordering the new flow is meant to enforce.
  suggestedFix: Change the sidecar cross-reference from step 7 to step 8.
