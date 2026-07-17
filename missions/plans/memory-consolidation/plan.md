---
title: 'Agent-memory W4: consolidation (dreaming)'
status: active
createdAt: '2026-07-17T13:42:06.390Z'
updatedAt: '2026-07-17T13:42:06.390Z'
---

## Summary

Make `consolidate()` real: a job that reprocesses raw episodic records into
compact durable knowledge — distilled notes, playbook candidates, pruned
episodes — so agent memory stays small and current without hand-tending. For
the human it means memory that improves while they sleep (eventually); for
this push it ships as a manually-invokable job plus a declarable payload the
autonomy host can schedule, config-gated, never running on its own by default.
Per the 2026-07-17 ◆reassess decision: infrastructure now, adoption later.

This plan is spec-ready and awaits planner design. Depends on `episodic-log`
(its input) and pairs with `autonomy-host` (its scheduler; manual invocation
works without it).

## Scope

The consolidation job itself: episodic → semantic/procedural distillation,
episode pruning, collision-safe playbook candidates, honest reporting, and the
payload contract for scheduled invocation. Trust rules: never touches the
profile, never overwrites human-edited records. No scheduler (sibling plan),
no embeddings, no governance.
