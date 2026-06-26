---
title: Make the framework coding-agnostic (coding-extraction Wave 1)
status: active
createdAt: '2026-06-26T00:00:00.000Z'
updatedAt: '2026-06-26T14:38:35.000Z'
---

## Summary

Remove the framework's built-in assumption that the `coding` domain exists, so it
can build, test, and run on `shared` + `main` alone — **while `coding` stays
bundled and behaviorally unchanged**. This is the reversible, externally-unblocked
prep wave that de-risks the eventual extraction (`coding-extraction`, Wave 2): once
the framework no longer assumes `coding`, the physical move becomes a small,
mechanical cutover.

This plan is **spec-ready and awaits planner design.** It is Wave 1 of the
`domains` track's `S2 — Extract coding` slice; it must land before
`coding-extraction` (Wave 2).

## Scope

Product-side scope: decouple the framework from `coding` internally — the hardcoded
`"coding"` default-domain fallbacks and the test suite's dependence on the bundled
`coding` domain — without moving `coding` or changing its runtime behavior.

Out: the physical extraction (move, import rewrite, catalog flip, removing
`bundled/`, dogfood/CI wiring) — all Wave 2 (`coding-extraction`); the full
`shared`/`main` audit-and-fix beyond reporting leakage; and the ~13 coding-content
tests that move with the domain in Wave 2.
