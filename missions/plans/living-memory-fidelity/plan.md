---
title: 'Living memory: honest measurement, discharge, and reporting'
status: active
createdAt: '2026-09-07T14:06:12.817Z'
updatedAt: '2026-09-07T14:06:12.817Z'
---

## Summary

Close the four open findings from the `living-memory` implementation's seven
independent review rounds (`missions/plans/living-memory/review-rounds.md`).
None is a data-safety issue; all four are one class — **the pass does not
measure or report what it actually did**. Index pressure can diverge from the
combined-context injection it claims to measure, in both directions; receipt
discharge can mistake a record it could not read for a record that is gone; and
two committed-write bits are lost before they reach the result.

Behaviours B-012, B-016 and B-021 therefore carry their exact markers and
plan-declared test names while counterexamples exist, and INV-007 of the
living-memory spec is violated.

This plan exists as a separate slug with its own review budget because
iterating on the parent branch stopped converging: six of seven review rounds'
fixes introduced a fresh defect, and rounds 6 and 7 each regressed the pressure
measurement the previous round had just fixed.

This plan is spec-ready and awaits planner design. Its spec inherits
`missions/plans/living-memory/spec.md` INV-001..INV-007 verbatim; **D-026 (the
ratified check-then-destructive-pathname class) is closed ground and is not
reopened here.**

## Scope

The four recorded findings plus the one sibling instance of finding 2's class in
the episodic source; regression tests that encode each counterexample rather
than restating the marker test; and one real-composition-root evidence run
against the live 237-record corpus.

Out: any live retirement round (a separate owner-triggered act, recommended to
be gated on finding 1); the D-026 class; retirement ordering, the receipt floor,
Option C authority, the deferred retired-area TTL; new behaviours, OKF types,
proposal kinds or config gates; `TASK-623`; and any edit outside `lib/memory/`,
`lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests.

