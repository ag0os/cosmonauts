---
type: decision
title: Serialize file-backed ID allocation with a filesystem lock
description: >-
  Concurrent creation must lock the complete read–allocate–write critical
  section across both threads and processes.
resource: >-
  knowledge/drive-smoke-fixes/decision-serialize-file-backed-id-allocation-with-a-filesystem-lock-bcda72ead313.md
tags:
  - concurrency
  - id-allocation
  - locking
  - task-storage
timestamp: '2026-05-12T20:55:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/drive-smoke-fixes/plan.md
date: '2026-05-12T20:55:00.000Z'
---
When identifiers are derived from the current maximum in a file-backed collection, protect the entire sequence—reload records, choose the next identifier, write the new record, and update related metadata—with a filesystem-visible lock. Acquire the lock before re-reading the collection; allocating from state read before lock acquisition can still produce duplicates. A process-local mutex is insufficient when multiple application processes may write the same store.
