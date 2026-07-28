# Security Review: round 2

## Overall

incorrect

## Assessment

The remediation resolves five of six prior findings, but supersession validation remains bypassable for canonical free-text pointers. The remediation also introduces a malformed-withdrawal conformance bypass and a new quadratic behavior/file-pairing denial-of-service path.

## Prior Findings

- id: SR-001
  status: resolved
  evidence: |
    `bundled/coding/prompts/plan-reviewer.md:26` now forbids a live probe unless its mechanism cannot load or execute project-controlled configuration/plugins, or the user explicitly consents or an approved sandbox isolates execution. It also requires the limitation to be recorded as `unchecked` when no safe probe exists. `tests/prompts/plan-reviewer.test.ts:77-95` pins all three paths, and the targeted prompt test passed.

- id: SR-002
  status: resolved
  evidence: |
    `lib/artifacts/behavior-conformance.ts:703-741` replaces the dynamic regular expression with a deterministic segment matcher; no attacker-controlled regex is constructed. `tests/artifacts/behavior-conformance.test.ts:814-851` exercises repeated/separated wildcards and a 20,000-character nonmatch under Vitest's timeout, and the targeted test passed. The separate collection-level quadratic path introduced around this matcher is reported as SR-008.

- id: SR-003
  status: unresolved
  evidence: |
    `lib/artifacts/behavior-conformance.ts:581-583` checks the date on the pointer value itself for the narrow `D-###` form, and `tests/artifacts/behavior-conformance.test.ts:787-812` covers that case even when `Decided by` carries another date. However, line 582 silently skips every other `Supersedes:` value. That conflicts with the canonical free-text contract at `domains/shared/skills/work-artifacts/references/plan-format.md:32` (`the exact ground replaced`). Direct probes showed both undated `Supersedes: behavior B-001` and `Supersedes: D-001 and D-002` return `ok: true` with no issues. The required pointer-local date check therefore remains bypassable.
  suggestedFix: Validate the date on every non-empty `Supersedes:` pointer value rather than returning early for values outside the single-ID shape.

- id: SR-004
  status: resolved
  evidence: |
    `lib/artifacts/behavior-conformance.ts:414-510` performs one delimiter-aware scan that tracks fence character/run length and masks matching inline-code runs. Decision declarations and citations both consume `quotedMaskedLines` at lines 524-549, while section discovery consumes fence-masked headings at lines 1097-1119. `tests/artifacts/behavior-conformance.test.ts:694-785` covers fake declarations, multiple-backtick spans, longer backtick and tilde fences, unmatched fences, and fenced section headings; the targeted test passed.

- id: SR-005
  status: resolved
  evidence: |
    `lib/artifacts/behavior-conformance.ts:556-574` now makes one forward pass over the masked lines and validates each pointer/annotation in place. The former per-pointer `findIndex`, `slice`, and `join` rescans are gone. The supersession tests at `tests/artifacts/behavior-conformance.test.ts:603-651,787-812` passed.

- id: SR-006
  status: resolved
  evidence: |
    `cli/plans/commands/check-artifacts.ts:127-170,213-218` visibly escapes C0, DEL, and C1 controls after constructing every plain/human line, while JSON returns the structured result unchanged at lines 99-105. `tests/cli/plans/subcommand.test.ts:32-63` verifies ESC, LF, and CR escaping in both text modes and unchanged JSON; the targeted test passed.

## Findings

- id: SR-007
  dimension: input-validation
  priority: P1
  severity: medium
  confidence: 1.0
  complexity: simple
  title: "Malformed withdrawal annotations bypass all behavior evidence checks"
  files: lib/artifacts/behavior-conformance.ts
  lineRange: 130, 203-218, 273-285, 395-411
  summary: |
    A project-controlled plan reaches this code through `cosmonauts plan check-artifacts <slug>`. The broad withdrawal regex at line 130 accepts any heading suffix shaped like `*(withdrawn ...)*`; lines 208-210 then route that behavior around required-field, test-file, marker, and marker-content validation, and `buildWithdrawnBehaviorEvidence` always returns no issues. A direct probe containing only `## Behaviors` and `### B-001 - active work *(withdrawn)*` returned `ok: true`, `withdrawn: 1`, and an empty issue list. An attacker can therefore make active, completely untested work pass the artifact gate by using an invalid withdrawal annotation with no decision pointer or date.
  evidence: |
    The recognized syntax is broader than `SUPERSESSION_ANNOTATION_REGEX` at lines 131-132 and than the documented `*(withdrawn by D-###, <date>)*` grammar. No regression test rejects malformed or undated withdrawal headings; existing withdrawn fixtures only assert the valid dated form.
  suggestedFix: Only grant withdrawn status after validating the exact dated decision-pointer grammar, and report malformed withdrawal annotations instead of skipping evidence checks.

- id: SR-008
  dimension: input-validation
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: complex
  title: "Pairing remediation introduces a quadratic reference-by-file scan"
  files: lib/artifacts/behavior-conformance.ts
  lineRange: 619-657, 703-741
  summary: |
    `cosmonauts plan check-artifacts <slug>` parses attacker-controlled behaviors and Files-to-Change entries. For every active behavior reference, lines 654-655 call `fileReferenceAppears`, which scans every changed path at lines 703-707 and reruns the wildcard matcher. This creates O(behavior references × changed paths) work even though each individual wildcard match no longer backtracks. A 1.53 MB probe with 8,000 accepted behavior entries and 8,000 changed paths took 9.7 seconds; 4,000 of each took 2.5 seconds, confirming quadratic growth. Larger repository artifacts can stall local or CI conformance gates.
  evidence: |
    The committed stress test at `tests/artifacts/behavior-conformance.test.ts:814-851` covers one behavior against a single long candidate, so it does not exercise collection cardinality. Direct measurements on the current code were 183 ms at 1,000×1,000, 670 ms at 2,000×2,000, 2,485 ms at 4,000×4,000, and 9,717 ms at 8,000×8,000.
  suggestedFix: Eliminate or explicitly bound the behavior-reference × changed-path Cartesian scan while preserving deterministic wildcard matching.
  task:
    title: "Bound behavior/file pairing across large artifact collections"
    labels: [review-fix]
    acceptanceCriteria:
      - "Pairing no longer performs attacker-controlled reference-count × changed-path-count comparisons, or rejects excessive work before entering that scan."
      - "A fixed-timeout regression with many behaviors and many nonmatching Files-to-Change paths preserves literal/wildcard semantics and completes within the bound."
