# Security Review: round 1

## Overall

incorrect

## Assessment

The new review-round boundary validates paths, report JSON, and persisted activity defensively, but its plan-status parser can execute JavaScript supplied by the project. This is a reachable host-process code-execution path and must be fixed before merge.

## Findings

- id: SR-001
  dimension: injection
  priority: P1
  severity: high
  confidence: 1.0
  complexity: simple
  title: "Plan frontmatter executes project-controlled JavaScript"
  files: lib/plans/review-rounds.ts
  lineRange: 298-309
  summary: |
    `validatePlanReviewReport`, revision validation, and the task-manager freshness guard all reach `assessPlanReviewRound`, which reads the selected project's `plan.md` and passes its bytes to `matter(content)`. Gray-matter 4 recognizes an opening delimiter such as `---javascript` and dispatches to its bundled JavaScript engine, which evaluates the frontmatter; an attacker-controlled checkout can therefore execute arbitrary JavaScript in the Cosmonauts host process merely when a chain validates plan status. The code can return `{status: "active"}` so assessment continues, and the surrounding `catch` does not undo side effects, allowing access to the user's files, environment secrets, and process privileges.
  suggestedFix: Parse only the expected non-executable frontmatter format, reject language-tagged executable frontmatter before parsing, and add a regression proving JavaScript frontmatter has no side effects and fails closed.
