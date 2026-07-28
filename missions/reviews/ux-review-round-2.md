# UX Review: round 2

## Overall

incorrect

## Assessment

The remediation makes size guidance deterministic, fixes the planner's step-8 references, and keeps advisory/withdrawn diagnostics clear and terminal-safe across human, plain, and JSON output. The live-probe flow remains unusable under the plan-reviewer's no-shell role contract, and two newly identified integration gaps can show users stale review evidence or a false conformance pass. The targeted prompt, conformance, CLI, and artifact-viewer suites passed (55 tests).

## Prior Findings

- id: UR-001
  status: resolved
  evidence: `bundled/coding/prompts/planner.md:32` and `bundled/coding/prompts/plan-reviewer.md:128-133` now state the same limit of at most 12 behaviors and identify behavior clusters/Implementation Order stages as candidate task units; `lib/artifacts/behavior-conformance.ts:798-812` applies the same threshold. Content coverage is present at `tests/prompts/planner.test.ts:121-136` and `tests/prompts/plan-reviewer.test.ts:97-107`.

- id: UR-002
  status: unresolved
  evidence: `bundled/coding/prompts/plan-reviewer.md:26` now adds consent/sandbox safeguards and an unchecked fallback for project-controlled configuration, but it still requires a live invocation without naming any permitted invocation mechanism. The plan-reviewer loads `coding-readonly` (`bundled/coding/agents/plan-reviewer.ts:7-14`), whose contract expressly forbids shell execution (`bundled/coding/capabilities/coding-readonly.md:1-3`); the agent has no subagent fallback (`bundled/coding/agents/plan-reviewer.ts:23`). The content test at `tests/prompts/plan-reviewer.test.ts:77-95` proves the new phrases exist, not that the reviewer has a contract-compliant way to run the probe.

- id: UR-003
  status: resolved
  evidence: The workflow, handoff, and sidecar references now consistently identify plan-reviewer as step 8 (`bundled/coding/prompts/planner.md:50,65-75`). `tests/prompts/planner.test.ts:159-167` positively requires step 8 and rejects the stale step-7 sidecar text.

## Findings

- id: UR-004
  dimension: consistency
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "Versioned review rounds disappear from the plan viewer"
  files: bundled/coding/prompts/plan-reviewer.md, lib/artifact-viewer/loaders.ts, lib/artifact-viewer/server.ts
  lineRange: 153-155
  summary: |
    The changed reviewer flow writes every new review to `review-<n>.md`
    (`bundled/coding/prompts/plan-reviewer.md:153-155`). The human-facing plan viewer still
    loads only `missions/plans/<slug>/review.md` (`lib/artifact-viewer/loaders.ts:102-117`)
    and renders “No review markdown found” when that legacy file is absent
    (`lib/artifact-viewer/server.ts:410-420`). A new plan with `review-1.md` therefore appears
    unreviewed; a migrated plan with legacy `review.md` plus a newer `review-2.md` silently shows
    only the stale first round. Existing viewer coverage also creates only `review.md`
    (`tests/artifact-viewer/server.test.ts:90-122`), so the versioned flow is untested from the
    human's seat.
  evidence: The write contract and viewer read contract name mutually exclusive default paths; the viewer has no scan or selection path for `review-<n>.md`.
  suggestedFix: Make the plan viewer discover and clearly present versioned rounds while retaining legacy `review.md` as round 1.
  task:
    title: "Show versioned plan-review rounds in the artifact viewer"
    labels: [review-fix]
    acceptanceCriteria:
      - "A plan containing only `review-1.md` displays that review instead of the no-review empty state."
      - "A plan containing legacy `review.md` and newer numbered rounds exposes the rounds in chronological order and does not present the legacy round as current."
      - "Viewer tests cover numbered-only and mixed legacy/numbered plans."

- id: UR-005
  dimension: confusing-states
  priority: P1
  severity: high
  confidence: 1.0
  complexity: simple
  title: "A missing Decision Log turns unresolved citations into a false pass"
  files: lib/artifacts/behavior-conformance.ts
  lineRange: 513-522
  summary: |
    `validateDecisionReferences` returns no issues as soon as `## Decision Log` is absent, without
    scanning the rest of the plan for `D-###` citations. Consequently, a plan that cites `D-999`
    but has no Decision Log receives `ok: true` and the CLI tells the user “Artifact conformance
    passed,” even though the new command contract says unresolved decision citations are checked.
    A direct invocation with such markdown returned `{ "ok": true, "issues": [] }`. The shipped
    test at `tests/artifacts/behavior-conformance.test.ts:603-652` covers an unresolved citation
    only when a Decision Log already exists, so it does not catch this false-green state.
  evidence: `lib/artifacts/behavior-conformance.ts:520-522` exits before the citation scan at lines 533-550.
  suggestedFix: Treat an absent Decision Log as an empty declaration set when citation tokens exist, and add a regression proving the CLI/checker fails that case.
