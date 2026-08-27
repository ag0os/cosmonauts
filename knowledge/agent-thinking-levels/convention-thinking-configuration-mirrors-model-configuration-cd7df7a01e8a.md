---
type: convention
title: Thinking configuration mirrors model configuration
description: >-
  Reasoning-effort configuration follows the same API shape and orchestration
  path as per-agent model selection.
resource: >-
  knowledge/agent-thinking-levels/convention-thinking-configuration-mirrors-model-configuration-cd7df7a01e8a.md
tags:
  - agents
  - api-shape
  - configuration
  - orchestration
timestamp: '2026-03-05T15:56:35.089Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/agent-thinking-levels/plan.md
date: '2026-03-05T15:56:35.089Z'
---
When adding a per-agent session option that has definition defaults, role overrides, and a chain-wide default, mirror the established model-selection structure. For thinking levels, use a dedicated role-keyed configuration map, resolve it at the same orchestration seam as the model, and pass the resolved value in spawn configuration. Parallel configuration shapes reduce surprise and avoid one-off runner logic.
