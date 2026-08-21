---
type: trade-off
title: Convention-based contracts avoid schema overhead
description: >-
  A simple markdown contract minimizes infrastructure changes at the cost of
  weaker parsing guarantees.
resource: >-
  knowledge/quality-contracts/trade-off-convention-based-contracts-avoid-schema-overhead-e4ca30aafbb1.md
tags:
  - markdown
  - parsing
  - quality-contracts
  - schemas
timestamp: '2026-04-01T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/quality-contracts/plan.md
date: '2026-04-01T00:00:00.000Z'
---
Prefer a constrained, human-readable contract section when introducing plan-level gates does not justify new storage types or schema migrations. Accept that runtime parsing can encounter malformed entries; keep the syntax simple and surface explicit warnings rather than silently dropping criteria.
