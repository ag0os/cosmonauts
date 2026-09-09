---
title: 'Living memory: make commit fidelity structural rather than conventional'
status: active
createdAt: '2026-09-09T00:00:00.000Z'
updatedAt: '2026-09-09T00:00:00.000Z'
---

## Summary

The three structural remedies the `living-memory-fidelity` run identified as the
changes that would have caught its own defects mechanically: collapse (or
parity-test) the deterministic/judgment duplication in
`lib/memory/living-memory.ts`, make omitting a durable write's commit fact a type
error rather than a review item, and bind the `duplication` structural-analysis
gate that shipped degraded.

Evidence base, all from `missions/reviews/improvements/living-memory-fidelity.md`
and the sixteen `missions/archive/plans/living-memory-fidelity/review-*.md`
rounds: the deterministic-path blind spot survived ten fresh reviews before the
Quality Manager found it; the commit-fidelity class was closed in four components
across five rounds and then reopened in four more places by review-15; and every
one of the five bindable gates shipped `unbound`, so none of it was caught by a
machine.

`living-memory-fidelity` D-013 already did the first half of remedy 2 — the
primitives now *return* the mutation fact. What remains is forcing callers to
thread it.

This plan is spec-ready and awaits planner design. It depends on the analysis
capability runtime (`analysis-capability-runtime`, `analysis-gate-coverage`) for
the gate-binding mechanism, and on `living-memory` + `living-memory-fidelity`
being archived, which they are.

## Scope

The deterministic/judgment duplication in `lib/memory/living-memory.ts`; the
commit-fact threading contract over `lib/memory/durable-files.ts` and its callers
inside `lib/memory/`; binding the `duplication` gate on the existing analysis
runtime and demonstrating it against a reconstruction of the historical SR-010
defect.

Out: the other four unbound gates, any redefinition of `writesCommitted`, D-026
and `lib/memory/retirement-store.ts`, and the three pre-existing defects escalated
for separate rulings.
