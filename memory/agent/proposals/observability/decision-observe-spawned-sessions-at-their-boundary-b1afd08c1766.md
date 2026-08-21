---
type: decision
title: Observe spawned sessions at their boundary
description: >-
  Attach external event observation before a spawned session starts and remove
  it before disposal so orchestration can report progress without coupling
  worker internals to the runner.
resource: >-
  knowledge/observability/decision-observe-spawned-sessions-at-their-boundary-b1afd08c1766.md
tags:
  - events
  - lifecycle
  - observability
  - orchestration
  - sessions
timestamp: '2026-03-11T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/observability/plan.md
date: '2026-03-11T00:00:00.000Z'
---
Treat the spawned-session boundary as the integration seam for orchestration observability. Subscribe before execution begins, normalize only the lifecycle signals the orchestration layer needs—turns, tool activity, message progress, and completion—and forward those through the runner's existing event channel. Always unsubscribe before disposing the session. This preserves a single event path for consumers while keeping session-specific event payloads and cleanup inside the spawner.
