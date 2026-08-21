---
type: convention
title: Roadmap location encodes item status
description: >-
  Keep roadmap items lightweight by using their horizon as status and their
  stable slug as identity.
resource: >-
  knowledge/roadmap-system/convention-roadmap-location-encodes-item-status-874717a06386.md
tags:
  - convention
  - metadata
  - roadmap
  - slug
timestamp: '2026-03-05T20:40:06.400Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/roadmap-system/plan.md
date: '2026-03-05T20:40:06.400Z'
---
Represent each roadmap item as a titled Markdown section with a stable slug and a short outcome-oriented description. Do not add separate IDs, YAML metadata, or status fields: the item’s horizon is its status, and its slug is its identity. Reuse that slug for the downstream plan so roadmap and planning artifacts can be correlated without another mapping layer.
