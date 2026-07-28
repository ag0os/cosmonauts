# Review Report

base: main
range: 360f176c2654745c8a1c46f01f001feeef71950b..HEAD
overall: incorrect

## Overall Assessment

The prompt changes cover most B-001..B-010 obligations, the project test/lint/typecheck gates pass, and the unchanged `analysis-capabilities` fixture has no issues from the newly added checker kinds. The patch is still incorrect because valid Markdown can produce false decision diagnostics, Files-to-Change pairing has an input-shaped blind spot, size guidance is not actually defined for the agents that must apply it, and required caller-facing/mutation evidence is missing.

## Prior Findings

- none

## Findings

- id: F-001
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "[P2] Valid multi-backtick code is scanned as a decision citation"
  files: lib/artifacts/behavior-conformance.ts, tests/artifacts/behavior-conformance.test.ts
  lineRange: lib/artifacts/behavior-conformance.ts:419-433
  summary: Evidence: `maskQuotedText` treats every three-backtick/tilde line as a fence toggle and masks only single-backtick spans. When a plan uses valid Markdown such as ``D-099`` or a four-backtick outer fence containing a three-backtick example, `D-099` remains visible and `checkBehaviorConformance` returns `unresolved-decision-citation`, contrary to D-003's quoted-text-is-a-mention rule. The added test covers only a simple single-backtick span and one flat three-backtick fence, so these realistic delimiter forms are not protected.
  suggestedFix: Track each opening fence's character and length until a matching close, and mask inline code spans using their actual delimiter length; add regression cases for multi-backtick spans and nested fence examples.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Valid inline code spans with two or more backticks do not emit decision or supersession issues.
      2. Content inside a longer outer fence remains masked when it contains shorter fence examples.

- id: F-002
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: simple
  title: "[P2] Fenced Markdown headings are mistaken for artifact sections"
  files: lib/artifacts/behavior-conformance.ts, tests/artifacts/behavior-conformance.test.ts
  lineRange: lib/artifacts/behavior-conformance.ts:977-999
  summary: Evidence: `extractMarkdownSection` selects the first exact heading and the next `##` line without checking whether either is inside a code fence. If a plan shows a fenced Markdown template containing `## Decision Log` before its real log, the template is selected and citations to real entries are reported unresolved; a fenced `##` inside `## Files to Change` can likewise truncate pairing evidence. This violates the accepted rule that fenced examples are mentions rather than live artifact syntax.
  suggestedFix: Make section discovery fence-aware using the same Markdown scan state as quoted-text masking, with tests for fenced headings before and inside real Decision Log and Files to Change sections.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Headings inside fenced examples are ignored when locating artifact sections.
      2. Real section content after a fenced heading remains available to decision and pairing checks.

- id: F-003
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: complex
  title: "[P2] Agents cannot locate the size guidance they must enforce"
  files: bundled/coding/prompts/planner.md, bundled/coding/prompts/plan-reviewer.md, lib/artifacts/behavior-conformance.ts
  lineRange: bundled/coding/prompts/planner.md:32-32
  summary: Evidence: both prompts tell agents to apply “the project's plan-size guidance” for behaviors or stages, but no loaded work-artifact reference, project instruction, or other canonical guidance defines those thresholds; only the checker privately hard-codes a 12-behavior limit at `lib/artifacts/behavior-conformance.ts:115`, and it defines no stage limit. Consequently B-003/B-008 and AC-003/AC-008 require deterministic authoring/review decisions from information the agents do not have, while stage-heavy plans can never trigger a defined checkpoint.
  suggestedFix: Define one discoverable behavior/stage size contract and have both prompts and the checker consume or explicitly reference it, keeping the advisory threshold aligned with the authoring/review rule.
  task:
    title: "Make plan-size guidance deterministic across planning seams"
    labels: "planning, artifacts"
    acceptanceCriteria:
      1. Planner and plan-reviewer can locate explicit behavior and stage thresholds without inventing them.
      2. The checker advisory uses the same behavior threshold, with a consistency test preventing drift.

- id: F-004
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "[P2] Unquoted Seam paths bypass Files-to-Change pairing"
  files: lib/artifacts/behavior-conformance.ts, tests/artifacts/behavior-conformance.test.ts
  lineRange: lib/artifacts/behavior-conformance.ts:623-632
  summary: Evidence: `extractSeamFilePaths` inspects only text inside backticks, although behavior field parsing does not require backticks and the pairing contract is about file paths, not Markdown styling. For a behavior with `- Seam: lib/missing.ts` and a present `## Files to Change` section, the function returns no seam references and the checker emits no `unpaired-behavior-file`, allowing AC-010's mechanical pairing rule to be bypassed by ordinary unquoted Markdown.
  suggestedFix: Parse file-shaped Seam values whether quoted or unquoted, or emit an actionable issue when a file-shaped Seam cannot be parsed; add both quoted and unquoted pairing tests.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. An unquoted project file in Seam is checked against Files to Change.
      2. Non-file seams such as skills or named sections remain excluded from file pairing.

- id: F-005
  priority: P2
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "[P2] The existing CLI call site lacks advisory-only regression evidence"
  files: tests/cli/plans/commands/check-artifacts.test.ts, tests/cli/plans/subcommand.test.ts, cli/plans/commands/check-artifacts.ts
  lineRange: tests/cli/plans/commands/check-artifacts.test.ts:12-66
  summary: The sole pre-existing production caller of `checkBehaviorConformance` is `registerCheckArtifactsCommand` at `cli/plans/commands/check-artifacts.ts:39-49`. Its integration tests exercise success with zero advisories and blocking failure, while the new advisory test calls only the renderer with a fabricated result; therefore a mutation that exits non-zero whenever `advisories.length > 0` would pass every added test. The required shared-code blast-radius evidence does not prove the caller-level non-blocking contract in AC-010/B-012.
  suggestedFix: Add an end-to-end command test with a conforming 13-behavior plan in human/plain/JSON modes, asserting advisory output and no `process.exit(1)` call.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. The real CLI command returns success for an advisory-only checker result.
      2. Human, plain, and JSON command output expose the advisory through the public result shape.

- id: F-006
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: simple
  title: "[P2] Pairing tests do not prove missing Test-file detection"
  files: tests/artifacts/behavior-conformance.test.ts, lib/artifacts/behavior-conformance.ts
  lineRange: tests/artifacts/behavior-conformance.test.ts:695-790
  summary: The B-012 test omits only `lib/unpaired.ts` from Files to Change while every Test path remains present, then asserts only the issue-kind list. Removing the Test-field branch from `validateBehaviorFilePairing` would leave the same seam issue and the suite would still pass, so half of AC-010's “behavior seam/test files” pairing contract lacks mutation-style proof.
  suggestedFix: Add a separate case where the Seam is paired but the Test path is absent, and assert `kind`, `field: "test"`, `behaviorId`, and `path`.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. A missing Test path in Files to Change produces an `unpaired-behavior-file` issue with test-field evidence.
      2. Removing Test-field pairing logic makes the regression test fail.

- id: F-007
  priority: P3
  severity: low
  confidence: 1.0
  complexity: simple
  title: "[P3] Planner sidecar guidance points to the wrong workflow step"
  files: bundled/coding/prompts/planner.md, tests/prompts/planner.test.ts
  lineRange: bundled/coding/prompts/planner.md:75-75
  summary: Adding the closing consistency pass moved plan-reviewer handoff to step 8, and the main workflow was updated accordingly, but the sidecar section still says plan-reviewer is “step 7”; step 7 is now the closing pass. This introduced internal prompt inconsistency at exactly the handoff boundary AC-001 requires to occur after that pass, and the content tests do not catch the stale reference.
  suggestedFix: Change the sidecar reference to step 8 and assert the cross-reference in the planner prompt test.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Every plan-reviewer cross-reference names workflow step 8.
      2. A content test fails if the sidecar step number drifts again.
