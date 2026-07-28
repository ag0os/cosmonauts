# Review Report

base: main
range: 360f176c2654745c8a1c46f01f001feeef71950b..HEAD
overall: incorrect

## Overall Assessment

All 17 prior finding IDs are resolved with current code and regression evidence, including the CLI caller and shared-result blast radius. The patch remains incorrect because the replacement Markdown scanner still mishandles valid multiline code spans, and the supersession validator silently skips common multi-decision pointer syntax.

## Prior Findings

- id: F-001
  status: resolved
  evidence: The shared scan now tracks fence character/length and exact inline delimiter runs (`lib/artifacts/behavior-conformance.ts:414-499`), with multi-backtick, longer-fence, tilde-fence, and unmatched-fence regressions at `tests/artifacts/behavior-conformance.test.ts:694-747`.
- id: SR-004
  status: resolved
  evidence: Decision declarations, citations, and supersession annotations now consume the same quoted-masked scan (`lib/artifacts/behavior-conformance.ts:510-574`), and the regression proves quoted declarations cannot resolve real citations (`tests/artifacts/behavior-conformance.test.ts:694-747`).
- id: F-002
  status: resolved
  evidence: Section discovery uses fence-masked lines (`lib/artifacts/behavior-conformance.ts:1097-1118`); fenced headings before and within real sections are covered at `tests/artifacts/behavior-conformance.test.ts:749-785` and by the Files-to-Change case at `tests/artifacts/behavior-conformance.test.ts:853-876`.
- id: F-003
  status: resolved
  evidence: Planner and reviewer now both expose the 12-behavior guidance and identify behavior clusters/Implementation Order stages as task-unit seams (`bundled/coding/prompts/planner.md:32`, `bundled/coding/prompts/plan-reviewer.md:130`), aligned with the checker threshold at `lib/artifacts/behavior-conformance.ts:125` and pinned by prompt/checker tests.
- id: UR-001
  status: resolved
  evidence: The reviewer can deterministically locate “at most 12 behaviors per plan” and candidate task units in its own prompt (`bundled/coding/prompts/plan-reviewer.md:130-134`), with content evidence at `tests/prompts/plan-reviewer.test.ts:98-109`.
- id: F-004
  status: resolved
  evidence: Seam extraction now considers quoted and unquoted tokens (`lib/artifacts/behavior-conformance.ts:744-755`), and the public checker regression pairs an unquoted file while ignoring a non-file seam name (`tests/artifacts/behavior-conformance.test.ts:853-876`).
- id: F-005
  status: resolved
  evidence: The real command is exercised with a conforming 13-behavior plan in human, plain, and JSON modes, asserting no exit call and advisory output in each mode (`tests/cli/plans/commands/check-artifacts.test.ts:144-189`).
- id: F-006
  status: resolved
  evidence: A separate mutation-sensitive case pairs the Seam but omits the Test file and asserts `field: "test"`, behavior ID, and path (`tests/artifacts/behavior-conformance.test.ts:879-908`).
- id: F-007
  status: resolved
  evidence: The sidecar now points to workflow step 8 (`bundled/coding/prompts/planner.md:75`), with positive and stale-step negative assertions at `tests/prompts/planner.test.ts:159-170`.
- id: UR-003
  status: resolved
  evidence: Both the sanity-check cross-reference and sidecar identify plan-reviewer as step 8 (`bundled/coding/prompts/planner.md:50,75`), and the sidecar reference is pinned at `tests/prompts/planner.test.ts:159-170`.
- id: SR-001
  status: resolved
  evidence: Live probes must not load or execute project-controlled configuration/plugins and otherwise require explicit consent or an approved sandbox, with an unchecked fallback (`bundled/coding/prompts/plan-reviewer.md:26`); the restrictions are pinned at `tests/prompts/plan-reviewer.test.ts:78-95`.
- id: UR-002
  status: resolved
  evidence: The prompt reconciles read-only review with probing by requiring a non-project-executing mechanism and explicitly routes unavailable unsafe mechanisms to consent/sandbox or `unchecked` (`bundled/coding/prompts/plan-reviewer.md:26`).
- id: SR-002
  status: resolved
  evidence: Wildcard pairing now uses bounded segment/index matching rather than a dynamic regular expression (`lib/artifacts/behavior-conformance.ts:710-742`), with repeated-wildcard and 20,000-character nonmatch evidence at `tests/artifacts/behavior-conformance.test.ts:814-851`.
- id: SR-003
  status: resolved
  evidence: The validator tests the captured `Supersedes:` value itself for an ISO date (`lib/artifacts/behavior-conformance.ts:577-593`), and a dated `Decided by` line no longer blesses `Supersedes: D-001` (`tests/artifacts/behavior-conformance.test.ts:787-812`).
- id: SR-005
  status: resolved
  evidence: Supersession checks now traverse the shared masked lines once and validate each pointer/annotation in place without per-line section rescans or block copies (`lib/artifacts/behavior-conformance.ts:556-574`).
- id: SR-006
  status: resolved
  evidence: Human/plain lines visibly escape C0, DEL, and C1 controls while JSON preserves structured values (`cli/plans/commands/check-artifacts.ts:129-170,213-219`), proven at `tests/cli/plans/subcommand.test.ts:32-63`.
- id: C-004
  status: resolved
  evidence: The public artifact barrel is now a scoped Fallow entry (`fallow.toml:10`), the unused command helper export was removed (`cli/plans/commands/check-artifacts.ts:53`), and the supplied round-2 verifier reports the scoped Fallow audit passing.

## Findings

- id: F-008
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "[P2] Multiline Markdown code spans escape the shared masking pass"
  files: lib/artifacts/behavior-conformance.ts, tests/artifacts/behavior-conformance.test.ts
  lineRange: lib/artifacts/behavior-conformance.ts:414-489
  summary: `scanMarkdown` calls `maskInlineCodeSpans` independently for each line, but valid Markdown code spans can cross line boundaries. When a multiline span contains `- **D-999 - ...**` inside the real Decision Log, that quoted declaration is collected and can bless a later real `D-999` citation; a multiline span containing only `D-999` instead produces a false unresolved issue. The new delimiter regressions cover only same-line spans, so both failure paths remain reachable for valid plan Markdown.
  suggestedFix: Preserve inline code-span delimiter state across lines in the shared scan, and add public-checker regressions for multiline quoted declarations and citations.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. A decision declaration inside a multiline code span cannot resolve a real citation.
      2. A citation inside a multiline code span does not emit an unresolved-decision issue.

- id: F-009
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: simple
  title: "[P2] Common multi-decision Supersedes pointers bypass date validation"
  files: lib/artifacts/behavior-conformance.ts, tests/artifacts/behavior-conformance.test.ts
  lineRange: lib/artifacts/behavior-conformance.ts:577-584
  summary: The early shape check recognizes only a leading `D-###` followed by an optional comma, so an undated pointer such as `Supersedes: D-001 and D-002` or `Supersedes: D-001/D-002` is silently skipped even though both are decision supersession pointers under AC-010. This occurs specifically when authors name multiple replaced decisions with natural connector syntax; `checkBehaviorConformance` then returns no `undated-supersession` issue.
  suggestedFix: Recognize supported one-or-more decision-ID pointer syntax before checking the pointer value for its own date, with regressions for connector-separated IDs.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Undated Supersedes values containing multiple decision IDs produce `undated-supersession`.
      2. Dated multi-decision pointers remain conformant without changing accepted legacy descriptive ground.
