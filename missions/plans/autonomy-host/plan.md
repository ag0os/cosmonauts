---
title: 'Autonomy W1: scheduling and lifecycle substrate'
status: active
createdAt: '2026-07-17T13:42:06.808Z'
updatedAt: '2026-07-17T13:42:06.808Z'
---

## Summary

The always-on base (Layer A of the autonomy track): agents and domains declare
"wake me every N / once in an hour / when this completes / keep me looping,"
and an in-process host fires those wakes cost-efficiently, with durable
wake-state carried in the episodic log. This is the substrate that powers
memory dreaming, periodic result-checks, and — on later rungs — the executive
and ambient assistants; it also delivers the orchestration runtime's deferred
scheduler seam from the always-on side. Ships config-gated **off** by default
per the 2026-07-17 ◆reassess decision; the demonstration payload is the
`memory-consolidation` job. In-process host only — the daemon (survives
restarts) is autonomy W2, explicitly out.

This plan is spec-ready and awaits planner design. Depends on `episodic-log`
(the wake-state store); `memory-consolidation` provides its first payload.

## Scope

Trigger vocabulary and declaration model, the in-process lifecycle host,
durable wake-state on the episodic log, cost-efficient wake handling
(skip-empty, dedup, silent-ack), observability of armed triggers and wake
outcomes, and the master config gate. No daemon, no governance tiers, no
external channels.
