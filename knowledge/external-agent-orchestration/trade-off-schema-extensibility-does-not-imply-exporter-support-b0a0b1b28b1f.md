---
type: trade-off
title: Schema extensibility does not imply exporter support
description: >-
  A package schema may reserve target-specific blocks before their exporters
  exist, provided unsupported execution targets fail before build.
resource: >-
  knowledge/external-agent-orchestration/trade-off-schema-extensibility-does-not-imply-exporter-support-b0a0b1b28b1f.md
tags:
  - forward-compatibility
  - schema
  - targets
  - trade-off
timestamp: '2026-05-12T14:49:53.204Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-agent-orchestration/plan.md
date: '2026-05-12T14:49:53.204Z'
---
Keep target options nested under stable runtime keys so future exporters can reuse the package format, but maintain a narrower supported-target type and reject unsupported requested targets before package building or compilation. This preserves forward-compatible authoring structure without shipping placeholder runtime behavior or implying parity that has not been implemented.
