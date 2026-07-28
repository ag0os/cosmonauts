# Review Report

base: main
range: 360f176c2654745c8a1c46f01f001feeef71950b..HEAD
overall: incorrect

## Overall Assessment

The final test, lint, and typecheck gates pass, and the review-history, supersession, pairing, and chain-synchronization remediations are present with regression evidence. The patch remains incorrect because two prior scanner findings are not fully resolved: code-quoted withdrawal examples can still bypass all active-behavior checks, and multiline code-span masking can cross Markdown block boundaries and hide real decision citations.

## Prior Findings

- id: UR-004
  status: resolved
  evidence: `lib/artifact-viewer/loaders.ts:77-145` discovers numbered rounds, preserves legacy `review.md` as round 1, sorts numerically, and selects the latest round; `lib/artifact-viewer/server.ts:432-455` renders all rounds and labels only the latest current. `tests/artifact-viewer/server.test.ts:137-225` covers numbered-only, mixed legacy/numbered chronological ordering with round 10 current, and legacy-only compatibility.

- id: UR-005
  status: resolved
  evidence: `lib/artifacts/behavior-conformance.ts:519-554` treats a missing Decision Log as an empty declaration set while still scanning citations; `tests/artifacts/behavior-conformance.test.ts:653-686` proves a real `D-404` citation fails when the log is absent and citation-free content still passes.

- id: SR-003
  status: resolved
  evidence: `lib/artifacts/behavior-conformance.ts:578-594` validates the date on the structured `Supersedes:` value itself, while `tests/artifacts/behavior-conformance.test.ts:887-936` covers one- and multi-D-ID forms with and without pointer-local dates.

- id: F-009
  status: resolved
  evidence: `lib/artifacts/behavior-conformance.ts:130-131,578-594` recognizes structured one/multi-D-ID pointers using comma, slash, or `and` connectors. `tests/artifacts/behavior-conformance.test.ts:887-959` proves undated structured pointers fail, dated forms pass, and the ratified descriptive legacy grounds remain free of new issue kinds without editing the parked fixture.

- id: SR-007
  status: unresolved
  evidence: Although the exact dated grammar is now required at `lib/artifacts/behavior-conformance.ts:132-133`, withdrawal is still derived from the raw heading title at `lib/artifacts/behavior-conformance.ts:255-282`. A public-checker probe with ``### B-001 - Sample `*(withdrawn by D-001, 2026-07-28)*` `` returned `ok: true`, `withdrawn: 1`, and no issues, so a quoted mention still bypasses required evidence.

- id: SR-008
  status: resolved
  evidence: `lib/artifacts/behavior-conformance.ts:622-743` indexes exact paths in a set, caches wildcard results, and caps wildcard comparisons at 4,096. The collection regression at `tests/artifacts/behavior-conformance.test.ts:965-1020` exercises many references/candidates and proves exact test paths remain indexed when wildcard work reaches the bound.

- id: F-008
  status: unresolved
  evidence: `lib/artifacts/behavior-conformance.ts:440-442` joins the entire artifact before matching inline delimiters. The added multiline test covers soft line breaks within one paragraph, but a public-checker probe with unmatched backticks in two separate paragraphs and a real `D-999` citation between them returned no issue because the delimiters were paired across the blank-line block boundary.

- id: C-003
  status: resolved
  evidence: `tests/orchestration/chain-runner.test.ts:2383-2452` now synchronizes on explicit worker-start and planner-failure signals and always releases the blocked worker in `finally`; the final full run passed all 82 chain-runner tests, including the seven parallel-group cases.

- id: C-004
  status: resolved
  evidence: `fallow.toml:10` declares the public artifact barrel as an entry point, the stale command helper export is absent, and the supplied final scoped Fallow audit is clean.

- id: F-001
  status: resolved
  evidence: Fence character/length and exact inline delimiter runs are tracked at `lib/artifacts/behavior-conformance.ts:418-513`; same-block multi-backtick, longer-fence, tilde-fence, and unmatched-fence regressions remain at `tests/artifacts/behavior-conformance.test.ts:722-785`.

- id: SR-004
  status: resolved
  evidence: Decision declarations, citations, and supersession scans consume the shared quoted-masked representation at `lib/artifacts/behavior-conformance.ts:516-604`, and quoted declarations cannot satisfy real citations in the masking regression.

- id: F-002
  status: resolved
  evidence: Section discovery uses fence-masked lines at `lib/artifacts/behavior-conformance.ts:1097-1119`; the fenced-heading regressions at `tests/artifacts/behavior-conformance.test.ts:787-823` preserve the real Behaviors section.

- id: F-003
  status: resolved
  evidence: Both prompts define at most 12 behaviors and name behavior clusters/Implementation Order stages as candidate task units (`bundled/coding/prompts/planner.md:32`, `bundled/coding/prompts/plan-reviewer.md:127-133`), aligned with the checker advisory threshold.

- id: UR-001
  status: resolved
  evidence: The reviewer has deterministic size units and threshold in its own prompt at `bundled/coding/prompts/plan-reviewer.md:127-133`, pinned by `tests/prompts/plan-reviewer.test.ts:97-108`.

- id: F-004
  status: resolved
  evidence: `lib/artifacts/behavior-conformance.ts:777-789` extracts quoted and unquoted file-shaped seam tokens; the public checker regression at `tests/artifacts/behavior-conformance.test.ts:1055-1083` pairs an unquoted path while ignoring a non-file seam name.

- id: F-005
  status: resolved
  evidence: `tests/cli/plans/commands/check-artifacts.test.ts:144-189` exercises the real command in human, plain, and JSON modes with 13 conforming behaviors and asserts no exit call plus visible advisory output.

- id: F-006
  status: resolved
  evidence: `tests/artifacts/behavior-conformance.test.ts:1085-1118` pairs the Seam but omits the Test path and asserts the test-field behavior ID and path, so removal of Test pairing would fail the regression.

- id: F-007
  status: resolved
  evidence: Planner handoff and sidecar guidance consistently identify plan-reviewer as step 8 at `bundled/coding/prompts/planner.md:50,65-75`, with stale-step rejection in `tests/prompts/planner.test.ts:159-169`.

- id: UR-003
  status: resolved
  evidence: The sanity-check transition, handoff, and sidecar all identify workflow step 8 (`bundled/coding/prompts/planner.md:50,65-75`).

- id: SR-001
  status: resolved
  evidence: `bundled/coding/prompts/plan-reviewer.md:26` permits a live probe only through a mechanism that cannot load or execute project-controlled configuration/plugins; otherwise it requires consent or an approved sandbox and the exact limitation as `unchecked`.

- id: UR-002
  status: resolved
  evidence: Under the ratified no-agent-config and reviewer no-shell constraints, `bundled/coding/prompts/plan-reviewer.md:26` is a coherent safe degradation: unavailable safe execution routes to consent/approved isolation or exact `unchecked`, without proposing forbidden tool/config expansion.

- id: SR-002
  status: resolved
  evidence: `lib/artifacts/behavior-conformance.ts:746-776` uses deterministic segment/index wildcard matching rather than a dynamic regular expression; repeated-wildcard and 20,000-character nonmatch coverage remains at `tests/artifacts/behavior-conformance.test.ts:1022-1053`.

- id: SR-005
  status: resolved
  evidence: Supersession validation makes one forward pass over masked lines at `lib/artifacts/behavior-conformance.ts:557-575`, without the former per-pointer section rescans and block copies.

- id: SR-006
  status: resolved
  evidence: Human/plain output visibly escapes C0, DEL, and C1 controls at `cli/plans/commands/check-artifacts.ts:127-170,213-219`, while JSON preserves structured values; `tests/cli/plans/subcommand.test.ts:32-63` covers the contract.

## Findings

- id: SR-007
  priority: P1
  severity: high
  confidence: 1.0
  complexity: simple
  title: "[P1] Code-quoted withdrawal examples still bypass active evidence checks"
  files: lib/artifacts/behavior-conformance.ts, tests/artifacts/behavior-conformance.test.ts
  lineRange: lib/artifacts/behavior-conformance.ts:247-283
  summary: Withdrawal status is matched against the raw behavior title, so when a project-controlled heading contains the exact dated grammar inside an inline code span—such as a syntax example—the checker classifies the behavior as withdrawn and skips required fields, test files, markers, uniqueness, and pairing. This contradicts the branch's explicit rule that code-quoted annotations are mentions and lets a plan return `ok: true` with no evidence for the behavior; the malformed-grammar regression does not cover quoted exact grammar.
  suggestedFix: Determine withdrawal status from a quote-masked heading (or otherwise require the annotation token to be outside code), and add a public-checker regression for an exact dated withdrawal inside inline code.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. An exact dated withdrawal inside inline code remains an active behavior and receives normal evidence validation.
      2. The same exact dated annotation outside code still marks the behavior withdrawn.

- id: F-008
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "[P2] Multiline code-span masking crosses Markdown block boundaries"
  files: lib/artifacts/behavior-conformance.ts, tests/artifacts/behavior-conformance.test.ts
  lineRange: lib/artifacts/behavior-conformance.ts:418-491
  summary: The remediation joins the complete artifact before finding matching backtick runs, but Markdown inline code can continue only within the same inline block; blank lines and block headings terminate that context. When unmatched literal backticks occur in separate paragraphs, the scanner pairs them anyway and masks all intervening content, so a real unresolved decision citation between those paragraphs falsely passes; the committed multiline regressions cover only valid same-paragraph soft line breaks.
  suggestedFix: Preserve delimiter state across soft line breaks within a Markdown block, but reset it at paragraph/block boundaries; add regressions for same-paragraph multiline spans and unmatched backticks in separate paragraphs.
  task:
    title: "-"
    labels: "-"
    acceptanceCriteria:
      1. Valid multiline code spans within one paragraph remain masked.
      2. Backticks in separate Markdown blocks cannot hide a real decision citation or declaration between them.
