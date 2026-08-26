---
type: decision
title: Recorded materialization mode is sticky
description: >-
  Unqualified sync and check preserve a managed asset's recorded mode so
  verification previews mutation exactly.
resource: >-
  knowledge/harness-adapters/decision-recorded-materialization-mode-is-sticky-84453608cb9c.md
tags:
  - check
  - harness-adapters
  - provenance
  - sync
timestamp: '2026-08-25T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/harness-adapters/plan.md
date: '2026-08-25T00:00:00.000Z'
---
Resolve desired mode in this order: an explicit request, the managed asset's recorded mode, then the default for a never-managed asset. Mode conversion must be explicit and may proceed only while the target still matches its recorded baseline. Reports should expose both old and requested modes before conversion. This prevents a bare sync from replacing a valid link with a copy after a bare check reported it current.
