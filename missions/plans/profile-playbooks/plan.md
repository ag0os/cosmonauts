---
title: Profile + explicit playbooks (agent-memory W2)
status: active
createdAt: '2026-07-13T13:15:32.000Z'
updatedAt: '2026-07-13T13:15:32.000Z'
---

## Summary

Agent-memory W2: grow the authored record vocabulary from `note` to
`note | profile | playbook` and ship explicit-save v1 — Cosmo proposes ("save
that as a playbook?"), the user confirms, the save is visible; no silent
capture. The profile is one evolving user-scoped document injected each
session; playbooks are named, refinable procedures in project and user
scopes. For the human who stops re-explaining themselves, and for Cosmo as
the sole W2 consumer.

This plan is spec-ready and awaits planner design. The spec at
`missions/plans/profile-playbooks/spec.md` is authoritative; its Assumptions
carry the ratified W1 decisions and the spec-writer's veto-able proposals.

## Scope

Two new OKF record types with type-specific write semantics (singleton
update-in-place profile; name-keyed updatable playbooks) through the existing
`lib/memory/` interface and markdown store; confirmation-gated saves and
profile-first single-budget injection in Cosmo's agent-memory extension; a
Pi-First re-audit of Pi 0.80.6 before new machinery. Out: W3 episodic, W4
consolidation/mining, non-Cosmo consumers, caches, embeddings, push recall,
distilled-bundle convergence.
