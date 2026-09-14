---
title: 'Autonomy W1: scheduling and lifecycle substrate'
status: active
createdAt: '2026-07-17T13:42:06.808Z'
updatedAt: '2026-09-13T04:14:42.465Z'
---

## Summary

The always-on base (Layer A of the autonomy track): agents and domains declare
“wake me every N / once in an hour / when this completes / keep me looping,”
and an in-process host evaluates those wakes cost-efficiently, with durable
wake-state carried in the episodic log. This later powers memory dreaming,
periodic result checks, and the executive and ambient assistants.

It is an autonomy-side service compatible with a future shared host process;
it does not deliver orchestration's scheduler, durable coordinator loops, or
attempt lifecycle. It ships config-gated **off** by default per the 2026-07-17
decision. The demonstration payload is `living-memory`. Daemon survival is W2.

This plan is spec-ready and awaits planner design. It depends on the episodic
log for wake-state and on the `execution-liveness` attempt contract before any
shared-process integration. `living-memory` provides its first payload.

## Architecture Context

Source of truth: `missions/architecture/autonomy.md`; orchestration boundary:
`missions/architecture/orchestration-future.md`.

The autonomy host may evaluate triggers and request work through orchestration
control. The `RunStore` remains authoritative for graphs, attempts, leases,
activity, deadlines, cancellation, and terminal state. The episodic log remains
authoritative for wake-state, autonomy audit, and memory. Sharing a future
process never permits either service to mutate the other's records.

## Decision Log

- **D-001 — Distinct authority inside a future shared host.** The in-process
  autonomy service owns trigger evaluation and episodic wake-state only. This
  supersedes the earlier shorthand that the plan “delivers the orchestration
  scheduler seam.”
- **D-002 — Wakes invoke orchestration control.** Payloads are requested as
  spawn, Chain, Drive, or later graph work through public orchestration
  commands/events; autonomy never launches a backend or writes scheduler state.
- **D-003 — Heartbeat is not an autonomy wake outcome.** Use skip-empty, dedup,
  and silent acknowledgement for cost discipline. Heartbeat remains the
  execution-ownership term in `execution-liveness`.
- **D-004 — Review amendment, 2026-09-13.** D-001 through D-003 and the matching
  spec edits are codex-proposed from the independent orchestration review and
  await human ratification. W1 stays in-process and off by default; no runtime
  implementation is added by this amendment.

## Scope

Trigger vocabulary and declaration model, the in-process autonomy service,
durable wake-state on the episodic log, cost-efficient wake handling
(skip-empty, dedup, silent acknowledgement), observability of armed triggers and
wake outcomes, and the master config gate. No daemon, orchestration attempt
lifecycle, coordinator loops, governance tiers, or external channels.

## Readiness

Before implementation planning, re-check the active `execution-liveness` plan
and select the exact public command/event seam for payload invocation. The
planner must preserve the separate run-store and episodic-store authorities and
must not add a second lease, heartbeat, deadline, or cancellation model.
