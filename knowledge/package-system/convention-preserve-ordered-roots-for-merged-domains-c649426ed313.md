---
type: convention
title: Preserve ordered roots for merged domains
description: >-
  A merged domain retains all contributing root directories in precedence order
  instead of pretending to have one canonical root.
resource: >-
  knowledge/package-system/convention-preserve-ordered-roots-for-merged-domains-c649426ed313.md
tags:
  - domains
  - filesystem
  - merge
  - precedence
timestamp: '2026-04-01T03:32:49.716Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/package-system/plan.md
date: '2026-04-01T03:32:49.716Z'
---
When one logical domain spans multiple providers, store an ordered list of roots with the highest-precedence root searched first. Merge resource indexes by name, but resolve actual files through that root list. A singular root field becomes ambiguous and can silently select the wrong implementation after a domain merge.
