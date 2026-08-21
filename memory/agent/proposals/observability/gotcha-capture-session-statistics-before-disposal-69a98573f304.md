---
type: gotcha
title: Capture session statistics before disposal
description: >-
  A spawned session's final usage must be captured after execution completes but
  before the session is disposed, with lifecycle usage events as the
  compatibility fallback.
resource: >-
  knowledge/observability/gotcha-capture-session-statistics-before-disposal-69a98573f304.md
tags:
  - cleanup
  - compatibility
  - cost
  - observability
  - sessions
timestamp: '2026-03-11T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/observability/plan.md
date: '2026-03-11T00:00:00.000Z'
---
Do not postpone usage extraction until after session cleanup: session-owned statistics may no longer be accessible. The spawner should capture final statistics immediately after execution and before disposal. Because the framework's direct statistics API may vary across pinned versions, isolate extraction behind a typed helper and be prepared to accumulate usage from turn-completion events when no reliable final getter exists.
