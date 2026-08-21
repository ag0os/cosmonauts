---
type: gotcha
title: Filesystem locks need stale-owner recovery
description: >-
  A lock file without owner-liveness checks can permanently disable writes after
  a process crash.
resource: >-
  knowledge/drive-smoke-fixes/gotcha-filesystem-locks-need-stale-owner-recovery-1ac71644b732.md
tags:
  - concurrency
  - crash-recovery
  - filesystem
  - locking
timestamp: '2026-05-12T20:55:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/drive-smoke-fixes/plan.md
date: '2026-05-12T20:55:00.000Z'
---
A filesystem lock used for a short write critical section must record enough owner identity to test whether the owning process is still alive. On acquisition, reclaim a lock only when its owner is demonstrably dead; otherwise wait or fail without deleting it. Keep the protected section small to reduce contention and make crash recovery an exceptional path rather than routine lock stealing.
