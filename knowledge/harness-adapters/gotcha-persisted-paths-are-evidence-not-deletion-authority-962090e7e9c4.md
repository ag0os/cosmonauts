---
type: gotcha
title: 'Persisted paths are evidence, not deletion authority'
description: >-
  A manifest's stored output path must never be trusted as the authority for
  destructive cleanup.
resource: >-
  knowledge/harness-adapters/gotcha-persisted-paths-are-evidence-not-deletion-authority-962090e7e9c4.md
tags:
  - deletion
  - filesystem-safety
  - harness-adapters
  - registry
timestamp: '2026-08-26T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/harness-adapters/plan.md
date: '2026-08-26T00:00:00.000Z'
---
Before deleting or moving a managed output, re-resolve the asset through the current registry and re-derive the canonical owner root, output identity, and containment boundary. Compare persisted paths only as provenance evidence; reject mismatches as conflicts or malformed state. Treating a stored path as executable authority lets stale, relocated, or corrupted state redirect deletion outside the registry's current write boundary.
