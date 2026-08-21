---
type: decision
title: Retry contradicted missing-path blocks once
description: >-
  A driver may retry a backend block only when the cited path exists from the
  driver's authoritative project view.
resource: >-
  knowledge/drive-smoke-fixes/decision-retry-contradicted-missing-path-blocks-once-0c0f18f82edb.md
tags:
  - blocked-task
  - driver
  - path-validation
  - retry
timestamp: '2026-05-12T20:55:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/drive-smoke-fixes/plan.md
date: '2026-05-12T20:55:00.000Z'
---
If a worker reports failure or blockage because an input path is missing, compare the cited path with the driver's authoritative project root. When a conservatively extracted path resolves inside that root and exists on disk, annotate the event as contradicted and retry once with the verified absolute location. Do not retry when the path is absent, ambiguous, outside the project, or already retried. This bounded structural check is more reliable than prompt wording alone and prevents retry loops.
