---
title: 'Agent-memory W3: episodic log'
status: active
createdAt: '2026-07-17T13:42:05.969Z'
updatedAt: '2026-07-17T18:00:00.000Z'
---

## Summary

Give cosmonauts a durable, human-legible, append-only record of what agents
actually did — the episodic facet of agent memory. Serves the human reviewing
agent activity, Cosmo answering "what happened", and two downstream consumers
built in sibling plans: the consolidation job (`memory-consolidation`) and the
autonomy host (`autonomy-host`), for which this log is the durable wake-state
and audit trail. Ships config-gated **off** by default per the 2026-07-17
◆reassess decision: build the full infrastructure now, decide to live with it
later.

This plan is spec-ready and awaits planner design. It is the first of the
three-plan infrastructure push (episodic-log → autonomy-host,
memory-consolidation) and both siblings depend on it.

## Scope

Episodic record capture and storage through the existing shared memory
interface and OKF store conventions; retrieval eligibility without polluting
the injected index; the config gate. No consolidation, no scheduling, no
governance — those are the sibling plans.
