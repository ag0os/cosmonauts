---
type: decision
title: Destructive absence requires a healthy complete inventory
description: >-
  A missing discovery result authorizes deletion only when every relevant source
  root was scanned successfully.
resource: >-
  knowledge/harness-adapters/decision-destructive-absence-requires-a-healthy-complete-inventory-e8e0325ad1c0.md
tags:
  - deletion
  - discovery
  - harness-adapters
  - reconciliation
timestamp: '2026-08-26T18:35:52.963Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/harness-adapters/review-3.md
date: '2026-08-26T18:35:52.963Z'
---
Keep tolerant discovery for user-facing listing separate from strict discovery used by reconciliation. The strict path must return per-root health and abort all selected-owner writes on permission, I/O, parse, or declared-root availability failures. Only a complete healthy snapshot may turn absence into source removal; otherwise transient observation failure can delete a valid managed target.
