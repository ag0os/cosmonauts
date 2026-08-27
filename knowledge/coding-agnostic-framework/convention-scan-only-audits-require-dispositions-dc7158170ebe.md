---
type: convention
title: Scan-only audits require dispositions
description: >-
  A deferred leakage audit is useful only when every finding, including a
  zero-finding category, records an owner and disposition.
resource: >-
  knowledge/coding-agnostic-framework/convention-scan-only-audits-require-dispositions-dc7158170ebe.md
tags:
  - audits
  - conformance
  - migration
  - ownership
timestamp: '2026-06-29T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/coding-agnostic-framework/leakage-findings.md
date: '2026-06-29T00:00:00.000Z'
---
For audit-only migration work, record the scan patterns and classify each result with an explicit action such as fix now, fix in a named later wave, escalate, or accept with no action. Represent an important category with no matches as an explicit zero-findings row. Gate the artifact structurally so the report cannot become an unowned list that later work must rediscover.
