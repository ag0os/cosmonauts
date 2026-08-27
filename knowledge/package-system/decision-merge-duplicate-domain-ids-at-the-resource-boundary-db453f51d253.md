---
type: decision
title: Merge duplicate domain IDs at the resource boundary
description: >-
  Same-ID domains can be merged, replaced, or skipped through an explicit
  strategy, with non-interactive operation defaulting to merge.
resource: >-
  knowledge/package-system/decision-merge-duplicate-domain-ids-at-the-resource-boundary-db453f51d253.md
tags:
  - automation
  - conflicts
  - domains
  - merge
timestamp: '2026-04-01T03:32:49.716Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/package-system/plan.md
date: '2026-04-01T03:32:49.716Z'
---
Detect duplicate domain identifiers while loading ordered sources and present the overlap by resource kind. Make conflict handling injectable with merge, replace, and skip outcomes so interactive clients can ask while automation stays deterministic. Under merge, union resources and let the later, higher-precedence source win name collisions; under replace or skip, apply the choice to the whole incoming domain.
