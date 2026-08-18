---
title: 'Knowledge surface: project knowledge for every agent'
status: active
createdAt: '2026-08-18T20:03:19.945Z'
updatedAt: '2026-08-18T20:03:19.945Z'
---

## Summary

First plan of the ratified `knowledge-and-memory` sequence
(`missions/architecture/knowledge-and-memory.md` §10): a project knowledge
base — `knowledge/` beside `memory/` plus a user-scoped twin — with one
authoritative format (OKF markdown, `decision | trade-off | gotcha |
convention`), framework-wide retrieval through the shared memory interface
(compact always-injected index + `recall`, inside one reassessed combined
budget), migration of the existing 36-distillation + 10-bundle seed corpus,
and consistent distiller coverage emitting OKF proposals. Builds the
reservoir before the pump: `memory-consolidation` (reframed) writes into the
structures this plan creates. Runtime surface ships config-gated **off**.

This plan is spec-ready and awaits planner design. See `spec.md` for Intent
(INV-1..6), acceptance criteria (AC-001..008), and scope.

## Scope

Layout + user twin, OKF knowledge record class, seed-corpus migration +
JSONL retirement, all-agent retrieval + injected index + combined budget,
proposals area (mechanism only), distiller-to-OKF-proposals + coverage
backfill, config gate + OFF-state identity. No consolidation pass, no
working-state singleton (rides adjacent as its own plan), no episode or
explicit-save changes, no embeddings, no retention implementation, nothing
on by default.

## Decision Log

- **D-001 — Derived from the ratified architecture (2026-08-18).**
  This plan exists per `knowledge-and-memory.md` §10 (resequencing) and
  implements its §11 rulings: OKF-markdown-only records, proposals-area write
  authority, injected-index-plus-recall retrieval, and the track's
  infrastructure-first gate posture. Decided by: human (ratified 2026-08-18).
- **D-002 — Working state excluded (adjacent plan).** The ratified order
  allows item ② to ride with this plan or adjacent; it is scoped out to keep
  this plan within task bounds and ships as its own small plan reusing
  profile mechanics. Decided by: planner-proposed, 2026-08-18.
- **D-003 — Intent invariants INV-5 and INV-6 promoted from candidates
  C-6 and C-4** of `knowledge-and-memory.md` §9 into this spec's `## Intent`.
  Decided by: human (ratified 2026-08-18).