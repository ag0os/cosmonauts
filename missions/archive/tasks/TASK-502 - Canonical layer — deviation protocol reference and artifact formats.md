---
id: TASK-502
title: Canonical layer — deviation protocol reference and artifact formats
status: Done
priority: high
assignee: claude-code
labels:
  - 'plan:spec-plan-intent'
  - documentation
dependencies: []
createdAt: '2026-07-26T14:31:40.737Z'
updatedAt: '2026-07-26T14:35:31.924Z'
---

## Description

Stage 1 of plan spec-plan-intent (B-001..B-004). Create
`domains/shared/skills/work-artifacts/references/deviation-protocol.md` as
the single canonical home for the mutability defaults, the four-route
deviation classifier (snap back / amend-on-record / halt-and-escalate /
record), the five amend-on-record steps, the reviewer/remediation rule,
and the test-rewrite red flag. Add the required `## Intent` section to
`references/spec-format.md`, the required `## Decision Log` (entry shape,
provenance-derived mutability, INV citation rule) to
`references/plan-format.md`, and the routing line to the work-artifacts
SKILL. Test-first: content tests in
`tests/prompts/work-artifacts-skill.test.ts` written RED before each edit,
carrying the B-### markers. Per plan Risks, respect INV-1/INV-2 (D-005):
the reference owns the rules; other files only route.

<!-- AC:BEGIN -->
- [x] #1 B-001 spec-format requires `## Intent` (goal + INV-### invariants, ratified, ranked where conflicting) with its named test and marker green
- [x] #2 B-002 plan-format requires `## Decision Log` with Decision/Alternatives/Why/Decided by + Supersedes, provenance-derived mutability defaults, and INV-citation rule, with its named test and marker green
- [x] #3 B-003 deviation-protocol reference defines classifier routes, mutability defaults, amend-on-record steps, reviewer rule, and test-rewrite red flag, with its named test and marker green
- [x] #4 B-004 work-artifacts SKILL routes to the new reference, with its named test and marker green
- [x] #5 Classifier leg names are byte-identical everywhere they appear
- [x] #6 All shipped content remains stack-agnostic (no project-specific commands)
<!-- AC:END -->

## Implementation Notes

Implemented test-first: 4 RED content tests in tests/prompts/work-artifacts-skill.test.ts, then references/deviation-protocol.md (new canonical home), spec-format Intent section, plan-format Decision Log + provenance mutability, work-artifacts routing. 12/12 tests green. Classifier leg names appear verbatim only in deviation-protocol.md; other files route.
