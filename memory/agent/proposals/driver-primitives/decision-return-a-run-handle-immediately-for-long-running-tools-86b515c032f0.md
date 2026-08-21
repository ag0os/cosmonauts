---
type: decision
title: Return a run handle immediately for long-running tools
description: >-
  Interactive tool calls should start execution asynchronously and expose
  identity, cancellation, result, and event-tail access.
resource: >-
  knowledge/driver-primitives/decision-return-a-run-handle-immediately-for-long-running-tools-86b515c032f0.md
tags:
  - async
  - driver
  - observability
  - tools
timestamp: '2026-05-04T20:14:02.943Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/driver-primitives/plan.md
date: '2026-05-04T20:14:02.943Z'
---
A tool that starts a potentially long fleet run should not await completion. Return a handle immediately containing stable run identity, artifact paths, cancellation, and a result promise, while progress is delivered through scoped notifications or a cursor-based event reader. This keeps the interactive agent responsive without sacrificing durable observability.
