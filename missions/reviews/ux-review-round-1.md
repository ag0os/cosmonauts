# UX Review: round 1

## Overall

incorrect

## Assessment

The bounded target suffix contains only the plan slug and round, so it does not leak prior-stage prose. However, the revision instructions can contradict that target, and the new halt surfaces expose internal reason codes without enough context or recovery guidance for users to correct and rerun the chain.

## Findings

- id: UR-001
  dimension: confusing-states
  priority: P1
  severity: medium
  confidence: 0.97
  complexity: simple
  title: "Revision prompt can direct the agent away from the bound review round"
  files: lib/orchestration/stage-prompts.ts
  lineRange: 220-234
  summary: |
    The revision instruction says to read the highest-numbered plan-review round, while the
    appended runtime line can bind a lower exact round. That state is explicitly valid when a
    higher-numbered `review-N.md` has no `## Findings` section: the gate ignores that file and
    binds the latest assessable round instead. The revising agent therefore receives competing
    directions—select the highest number versus act on the bound slug/round—and may revise the
    wrong artifact even though the suffix itself correctly contains no reviewer prose.
  suggestedFix: Make the revision instruction explicitly act on the exact bound target and test the case where a higher non-assessable review file exists.

- id: UR-002
  dimension: feedback
  priority: P1
  severity: medium
  confidence: 1.0
  complexity: complex
  title: "Review halts hide the information users need to recover"
  files: lib/orchestration/review-revision.ts
  lineRange: 333-337
  summary: |
    The shared formatter used by both the CLI logger and tool progress renders only the actual
    slug/round when present plus an internal kebab-case reason. It discards actionable fields
    already carried by the block, including `expectedPlanSlug`, `latestReviewRound`,
    `findingIds`, and `reportedReason`. For example, an explicit unaddressed report loses the
    agent's explanation, a stale-round halt does not name the newer round, and a missing-reference
    halt does not identify the findings to fix. The output also gives no correction-and-rerun
    instruction, so users encountering any partially identified failure must infer recovery from
    an internal code or find the separate documentation before they can continue.
  suggestedFix: Render each block reason as a plain-language cause with available identity/detail fields and a concrete correction-and-rerun next step while retaining the stable reason code.
  task:
    title: "Render actionable plan-review halt guidance"
    labels: [review-fix]
    acceptanceCriteria:
      - "Every review-block reason produces defined human-readable output, retains its stable reason code, and includes only the identity and detail fields available on that block."
      - "CLI and tool-progress tests cover unidentified and partially identified blocks plus mismatched targets, stale rounds, missing references, and revision-reported reasons."
      - "Each rendered halt tells the user what to correct and whether to rerun the chain; same-index topology failures name the sequential-topology recovery."
