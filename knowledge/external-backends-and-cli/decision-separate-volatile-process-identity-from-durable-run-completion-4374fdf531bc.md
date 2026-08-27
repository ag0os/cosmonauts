---
type: decision
title: Separate volatile process identity from durable run completion
description: >-
  A live PID marker and a durable completion record must be separate artifacts
  with completion taking precedence in status checks.
resource: >-
  knowledge/external-backends-and-cli/decision-separate-volatile-process-identity-from-durable-run-completion-4374fdf531bc.md
tags:
  - persistence
  - process-liveness
  - run-records
  - status
timestamp: '2026-05-05T16:24:56.227Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-backends-and-cli/plan.md
date: '2026-05-05T16:24:56.227Z'
---
Represent process liveness and terminal outcome with different records. The PID record is volatile and may be removed on normal exit; the completion record persists and contains the final run result. Status must read completion first, then fall back to PID liveness plus process start-time matching to detect stale files and PID reuse. Listing must combine both records rather than assuming a pidfile survives completion.
