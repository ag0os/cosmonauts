# UX Review: round 3

## Overall

incorrect

## Assessment

The prior UX findings are resolved: review history is visible and ordered, the constrained live-probe flow degrades explicitly and safely, and conformance output remains clear and terminal-safe. One low-severity accessibility gap remains in the new multi-round viewer: embedded review headings override the round hierarchy presented to screen-reader users. The supplied final verifier result is 8/8 green.

## Prior Findings

- id: UR-001
  status: resolved
  evidence: `bundled/coding/prompts/planner.md:32` defines the limit as at most 12 behaviors and names behavior clusters/Implementation Order stages as candidate task units; `bundled/coding/prompts/plan-reviewer.md:127-133` applies the same units and threshold. Content regressions remain at `tests/prompts/planner.test.ts:121-136` and `tests/prompts/plan-reviewer.test.ts:97-107`.

- id: UR-002
  status: resolved
  evidence: `bundled/coding/prompts/plan-reviewer.md:26` permits a live invocation only through a mechanism that cannot load or execute project-controlled configuration/plugins. Otherwise it requires explicit consent or an approved sandbox, and requires the exact config/plugin limitation to be recorded as `unchecked`. This is a safe explicit degradation under the ratified constraints: `bundled/coding/capabilities/coding-readonly.md:1-3` still forbids shell execution, while `bundled/coding/agents/plan-reviewer.ts:7-23` retains the existing tool/config and no-subagent shape. No forbidden tool or agent-configuration expansion is needed.

- id: UR-003
  status: resolved
  evidence: The planner identifies plan-reviewer as step 8 in both the sanity-check transition and sidecar guidance (`bundled/coding/prompts/planner.md:50,65-75`); `tests/prompts/planner.test.ts:159-167` requires step 8 and rejects the stale step-7 reference.

- id: UR-004
  status: resolved
  evidence: `lib/artifact-viewer/loaders.ts:66-145` discovers numbered rounds, treats legacy `review.md` as round 1, sorts numerically, and selects the final round as current. `lib/artifact-viewer/server.ts:432-455` renders every discovered round and labels the latest `(current)`. Integration coverage at `tests/artifact-viewer/server.test.ts:137-225` proves numbered-only, mixed legacy/numbered chronological ordering with round 10 current, and legacy-only compatibility.

- id: UR-005
  status: resolved
  evidence: `lib/artifacts/behavior-conformance.ts:513-550` now treats a missing Decision Log as an empty declaration set and still scans real citations, so `D-404` produces an unresolved-citation issue rather than a false pass. `tests/artifacts/behavior-conformance.test.ts:653-686` covers both the citation-free pass and missing-log unresolved-citation failure path.

## UX Recheck

- Numbered-only, mixed, and legacy review flows render without the false empty state; mixed rounds are numeric/chronological and only the latest is marked current (`tests/artifact-viewer/server.test.ts:137-225`).
- Prompt handoff, revision history, and constrained live-probe/`unchecked` flows are explicit (`bundled/coding/prompts/planner.md:65-75`; `bundled/coding/prompts/plan-reviewer.md:26,127-160`).
- Human and plain conformance output separately names withdrawn counts, issues, and advisories; advisories remain visibly non-blocking (`cli/plans/commands/check-artifacts.ts:107-170`; `tests/cli/plans/commands/check-artifacts.test.ts:144-189`).
- Human/plain diagnostics escape terminal control characters and use text labels rather than color-only or symbol-only status (`cli/plans/commands/check-artifacts.ts:127-170,213-219`; `tests/cli/plans/subcommand.test.ts:32-63`).

## Findings

- id: UR-006
  dimension: accessibility
  priority: P3
  severity: low
  confidence: 0.98
  complexity: complex
  title: "Embedded review headings break the multi-round heading hierarchy"
  files: lib/artifact-viewer/server.ts, tests/artifact-viewer/server.test.ts
  lineRange: 432-455
  summary: |
    The multi-round viewer emits an `h2` for Reviews and an `h3` for each round, then inserts
    `review.document.html` unchanged beneath that `h3`. Review artifacts conventionally begin
    with `#`, including every new integration fixture, so the resulting outline is `h2 Reviews →
    h3 Round 1 → h1 review title → h3 Round 2 → h1 review title`. A screen-reader user navigating
    by heading level hears each embedded artifact title as a higher-level page heading instead of
    content belonging to its round, obscuring the otherwise clear chronological structure.
  evidence: `lib/artifact-viewer/server.ts:447-453` inserts unchanged document HTML after each round heading; `tests/artifact-viewer/server.test.ts:145-196` supplies `#` headings for numbered and mixed rounds but asserts only text/order/current labels, not the rendered heading outline.
  suggestedFix: Render each review's headings at levels subordinate to its round heading and add a multi-round heading-outline regression.
  task:
    title: "Preserve semantic heading hierarchy for versioned reviews"
    labels: [review-fix]
    acceptanceCriteria:
      - "Numbered and mixed review pages expose Reviews, each round, and each review's internal headings in a logical nested heading order without embedded h1 page headings."
      - "Viewer coverage asserts the semantic heading outline while preserving chronological order and the text-based current label."
