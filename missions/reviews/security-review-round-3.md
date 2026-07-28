# Security Review: round 3

## Overall

incorrect

## Assessment

The round resolves the safe-probe, wildcard-ReDoS, structured supersession, supersession-rescan, terminal-output, collection-pairing, multiline-span, and missing-Decision-Log defects. Security is not clear, however: malformed withdrawal suffixes can still bypass evidence checks, the multiline masking remediation crosses Markdown block boundaries and can hide real citations, its delimiter search is superlinear on adversarial input, and numbered review files can follow symlinks outside the project root.

## Prior Findings

- id: SR-001
  status: resolved
  evidence: |
    `bundled/coding/prompts/plan-reviewer.md:26` permits a live probe only through a mechanism that cannot load or execute project-controlled configuration/plugins, otherwise requiring explicit consent or an approved sandbox; when none is available, the reviewer must record the limitation as `unchecked`. `tests/prompts/plan-reviewer.test.ts:78-95` pins the guard, consent/sandbox, and degradation paths.

- id: SR-002
  status: resolved
  evidence: |
    `lib/artifacts/behavior-conformance.ts:719-777` uses deterministic segment matching rather than an attacker-derived regular expression. `tests/artifacts/behavior-conformance.test.ts:1024-1061` retains repeated-wildcard and long-nonmatch coverage, and the targeted conformance suite passed.

- id: SR-003
  status: resolved
  evidence: |
    The final ratified scope is structured D-ID pointers, not all descriptive legacy ground. `lib/artifacts/behavior-conformance.ts:130-131,578-594` recognizes one-or-more D-IDs joined by comma, slash, or `and` and tests the date in that pointer value itself. `tests/artifacts/behavior-conformance.test.ts:863-921` covers single and multi-ID dated/undated pointers, while lines 923-938 preserve the parked descriptive free-text fixtures used by `missions/plans/analysis-capabilities/plan.md`.

- id: SR-004
  status: unresolved
  evidence: |
    The earlier same-line/fence cases remain fixed, but `lib/artifacts/behavior-conformance.ts:440-442,468-508` now joins the entire document before matching inline-code delimiters. Markdown code spans cannot cross paragraph or heading block boundaries. A direct public-checker probe placed an unmatched backtick in one paragraph, a real `D-404` citation after a blank line and `## Overview`, and the closing backtick in another paragraph; with a valid D-001 declaration and withdrawn behavior, the checker returned `ok: true` and no issues. This bypass is reported below as SR-004.

- id: SR-005
  status: resolved
  evidence: |
    `lib/artifacts/behavior-conformance.ts:557-575` traverses the shared masked lines once and validates each pointer or annotation in place. The former per-pointer section rescans and block copies remain absent.

- id: SR-006
  status: resolved
  evidence: |
    `cli/plans/commands/check-artifacts.ts:127-170,213-218` visibly escapes C0, DEL, and C1 controls from every plain/human output line while JSON remains structured and JSON-escaped. `tests/cli/plans/subcommand.test.ts:32-63` covers ESC, LF, and CR in both text modes and unchanged JSON.

- id: SR-007
  status: unresolved
  evidence: |
    `lib/artifacts/behavior-conformance.ts:132-133` narrows the recognized withdrawal substring, so the originally demonstrated bare `*(withdrawn)*` no longer bypasses checks. The regex is not anchored to the heading suffix, however, and line 282 uses `.test(title)` before lines 213-215 skip all active evidence checks. A direct probe with `### B-001 - active *(withdrawn by D-001, 2026-07-28)* garbage` returned `withdrawn: 1`, `ok: true`, and no issues. This remains a malformed-withdrawal bypass and is reported below as SR-007.

- id: SR-008
  status: resolved
  evidence: |
    `lib/artifacts/behavior-conformance.ts:622-647,719-743` indexes literal paths in a Set, caches wildcard results, and caps all wildcard candidate comparisons at 4,096 before failing closed. `tests/artifacts/behavior-conformance.test.ts:975-1022` exercises many behavior/path entries and proves exact Test references remain paired after wildcard work reaches the bound.

- id: F-008
  status: resolved
  evidence: |
    `lib/artifacts/behavior-conformance.ts:440-442,468-489` preserves newlines while masking a matching delimiter run across lines. `tests/artifacts/behavior-conformance.test.ts:777-823` proves a multiline quoted declaration cannot bless a real citation and a multiline quoted citation is ignored. The separate over-broad cross-block behavior is reconciled under SR-004.

- id: UR-005
  status: resolved
  evidence: |
    `lib/artifacts/behavior-conformance.ts:516-554` treats an absent Decision Log as an empty declaration set and still scans the complete masked plan for citations. `tests/artifacts/behavior-conformance.test.ts:654-681` proves a real `D-404` citation without a Decision Log becomes an unresolved-citation issue.

## Commit Assessment

- `3003ac9` closes F-008, UR-005, SR-008, and the originally demonstrated SR-007 input, but introduces the cross-block masking bypass, leaves the delimiter-scan DoS reachable, and leaves SR-007 bypassable through a malformed suffix containing a valid substring.
- `33b4d14` restricts date enforcement to structured one-or-more D-ID pointers while preserving the ratified descriptive fixtures. Its anchored pointer expression showed no attacker-amplifiable behavior in direct long-input probing.
- `e269c72` renders review bodies through the existing HTML-escaping Markdown renderer and generates round labels from safe integers, so no new active-output injection was found. Its new numbered-file reads do introduce SR-009's canonical-path escape.
- `804ada5` changes only test synchronization and adds no production parser, path, output, privilege, dependency, or secret surface.

The supplied final verifier was 8/8 green. A targeted run of the conformance, CLI output, viewer, prompt, and chain-runner suites also passed 123/123 tests; the findings below come from adversarial probes not represented by those suites.

## Findings

- id: SR-004
  dimension: input-validation
  priority: P1
  severity: medium
  confidence: 1.0
  complexity: complex
  title: "Cross-block backticks can hide real decision citations"
  files: lib/artifacts/behavior-conformance.ts, tests/artifacts/behavior-conformance.test.ts
  lineRange: lib/artifacts/behavior-conformance.ts:418-508; tests/artifacts/behavior-conformance.test.ts:777-823
  summary: |
    `cosmonauts plan check-artifacts <slug>` passes project-controlled plan Markdown to `scanMarkdown`. The scanner joins the whole document and lets an opening backtick match a closing run after blank lines and headings, even though inline Markdown code spans are confined to an inline block. An attacker can put an unmatched opener before a real `D-###` citation and close it in a later paragraph; the citation is replaced with spaces before validation. A probe with a valid D-001 declaration/withdrawal and a real D-404 citation between such cross-block delimiters returned `ok: true`, so the artifact gate can be made falsely green.
  suggestedFix: Preserve multiline code spans only within valid Markdown inline block boundaries; unmatched delimiters must not mask later blocks.
  task:
    title: "Confine decision masking to valid Markdown code-span boundaries"
    labels: [review-fix]
    acceptanceCriteria:
      - "Backticks separated by a paragraph or heading boundary cannot hide a real decision citation or declaration."
      - "Valid multiline code spans within one inline block remain masked, including the existing F-008 declaration and citation cases."

- id: SR-007
  dimension: input-validation
  priority: P1
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "A valid withdrawal substring blesses a malformed heading suffix"
  files: lib/artifacts/behavior-conformance.ts
  lineRange: 132-133,207-215,277-283
  summary: |
    A project-controlled behavior heading is classified as withdrawn whenever its title contains the valid annotation substring anywhere. The regex is unanchored, so `### B-001 - active *(withdrawn by D-001, 2026-07-28)* garbage` is accepted as withdrawn. `checkBehaviorConformance` then skips required fields, test-file/marker evidence, pairing, and marker uniqueness for that entry; the direct probe returned `withdrawn: 1`, `ok: true`, and no issues. Malformed headings can therefore still bypass the artifact gate.
  suggestedFix: Require the complete behavior-title suffix to match the documented dated withdrawal grammar before granting withdrawn status.

- id: SR-009
  dimension: injection
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Numbered review symlinks escape the artifact viewer root"
  files: lib/artifact-viewer/loaders.ts, lib/artifact-viewer/server.ts
  lineRange: lib/artifact-viewer/loaders.ts:117-145,289-300,325-332; lib/artifact-viewer/server.ts:111-141,276-303
  summary: |
    `GET /plans/<slug>` discovers every `review-<n>.md` in the project-controlled plan directory and reads it. `safeProjectFilePath` checks only the lexical path; `readFile` follows symlinks without checking the canonical target. A malicious repository can commit `missions/plans/<slug>/review-1.md` as a symlink to a predictable file outside the checkout. A direct loader probe symlinked that filename to an external file and returned its `OUTSIDE_SECRET_7f43` contents as the review document, which the server renders. Anyone able to reach a viewer explicitly bound beyond localhost can read the served file; even the default local viewer violates its stated project-root confinement.
  suggestedFix: Canonically confine each discovered review file to the project root before reading it, rejecting symlinks whose target escapes the root.

- id: SR-010
  dimension: input-validation
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "Inline-code delimiter search permits superlinear parser denial of service"
  files: lib/artifacts/behavior-conformance.ts
  lineRange: 468-508
  summary: |
    Project-controlled plan Markdown reaches `maskInlineCodeSpans` through `cosmonauts plan check-artifacts <slug>`. For every unmatched backtick run, `findMatchingRun` rescans all later runs looking for the same length. A sequence of uniquely sized descending runs therefore repeatedly scans the remaining input. On the current HEAD, an 8.01 MB plan containing 4,000 such runs took 9.4 seconds in `checkBehaviorConformance`; increasing the run count continues the superlinear growth and can stall local or CI artifact gates.
  suggestedFix: Index delimiter runs or otherwise scan code-span delimiters in bounded linear work, with an adversarial unmatched-run regression under a fixed timeout.
  task:
    title: "Make multiline code-span masking resistant to adversarial delimiter runs"
    labels: [review-fix]
    acceptanceCriteria:
      - "Masking does not rescan the remaining document for every unmatched backtick run."
      - "A fixed-timeout test with thousands of uniquely sized unmatched runs completes within the bound while preserving valid multiline span behavior."
