---
type: gotcha
title: Do not assume automatic compaction works for ephemeral sessions
description: >-
  Verify automatic compaction with the actual in-memory session mode before
  relying on it, and retain a manual threshold-based fallback.
resource: >-
  knowledge/observability/gotcha-do-not-assume-automatic-compaction-works-for-ephemeral-sessions-9608b54dbb0d.md
tags:
  - compaction
  - context-window
  - observability
  - reliability
  - sessions
timestamp: '2026-03-11T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/observability/plan.md
date: '2026-03-11T00:00:00.000Z'
---
Compaction behavior can depend on persistence and session-manager capabilities, so successful automatic compaction in file-backed sessions does not prove it works for ephemeral sessions. Test the actual orchestration session mode first. If it does not compact reliably, track context usage from lifecycle events and compact between prompts before the model reaches its context limit, preserving a configurable recent-context window.
