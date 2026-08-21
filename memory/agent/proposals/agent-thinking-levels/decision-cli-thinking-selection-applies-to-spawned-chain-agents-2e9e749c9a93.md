---
type: decision
title: CLI thinking selection applies to spawned chain agents
description: >-
  A top-level thinking option becomes the chain-wide fallback instead of
  affecting only the interactive parent session.
resource: >-
  knowledge/agent-thinking-levels/decision-cli-thinking-selection-applies-to-spawned-chain-agents-2e9e749c9a93.md
tags:
  - chains
  - cli
  - orchestration
  - thinking-level
timestamp: '2026-03-05T15:56:35.089Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/agent-thinking-levels/plan.md
date: '2026-03-05T15:56:35.089Z'
---
When a user starts a chain or workflow with a CLI thinking-level option, propagate that option into chain configuration so spawned agents inherit it as the default. Retain role-specific and agent-definition precedence rather than forcing the CLI value onto every spawn. This keeps the user's invocation meaningful across orchestration without removing per-role tuning.
