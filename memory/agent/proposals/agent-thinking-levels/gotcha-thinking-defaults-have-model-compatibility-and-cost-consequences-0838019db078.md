---
type: gotcha
title: Thinking defaults have model-compatibility and cost consequences
description: >-
  A valid thinking-level value may still be unsupported by the selected model
  and can materially increase token use.
resource: >-
  knowledge/agent-thinking-levels/gotcha-thinking-defaults-have-model-compatibility-and-cost-consequences-0838019db078.md
tags:
  - compatibility
  - cost
  - models
  - thinking-level
timestamp: '2026-03-05T15:56:35.089Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/agent-thinking-levels/plan.md
date: '2026-03-05T15:56:35.089Z'
---
Keep built-in thinking defaults conservative and assign elevated levels only to roles with a demonstrated quality benefit. Type validity does not guarantee that a selected model supports a given level; the provider may reject or ignore the combination. Validate allowed values at configuration boundaries, preserve undefined as a legitimate fallback, and include compatibility and token cost when changing defaults.
