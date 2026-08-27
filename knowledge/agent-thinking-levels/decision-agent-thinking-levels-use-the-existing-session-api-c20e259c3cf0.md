---
type: decision
title: Agent thinking levels use the existing session API
description: >-
  Per-agent reasoning effort is forwarded to the underlying session constructor
  rather than implemented as a custom orchestration mechanism.
resource: >-
  knowledge/agent-thinking-levels/decision-agent-thinking-levels-use-the-existing-session-api-c20e259c3cf0.md
tags:
  - agents
  - orchestration
  - pi-first
  - thinking-level
timestamp: '2026-03-05T15:56:35.089Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/agent-thinking-levels/plan.md
date: '2026-03-05T15:56:35.089Z'
---
Treat thinking level as an optional session-creation setting throughout orchestration. Carry it through agent definitions, spawn configuration, chain execution, and agent-spawn tools, then pass it unchanged to the underlying agent-session API. Do not encode thinking behavior in prompts or add a parallel runtime subsystem when the session provider already owns this capability.
