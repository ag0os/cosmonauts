---
type: decision
title: >-
  Thinking-level precedence is explicit spawn, role definition, then chain
  default
description: >-
  The nearest explicit choice wins, while agent-owned defaults take priority
  over a chain-wide fallback.
resource: >-
  knowledge/agent-thinking-levels/decision-thinking-level-precedence-is-explicit-spawn-role-definition-then-chain-default-489e6fbbbf7c.md
tags:
  - agents
  - configuration
  - precedence
  - testing
timestamp: '2026-03-05T15:56:35.089Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/agent-thinking-levels/plan.md
date: '2026-03-05T15:56:35.089Z'
---
Resolve an agent's thinking level in this order: an explicit spawn value, the agent definition's default, the chain-level default, then no value. A role-specific chain override should be converted into the explicit spawn value before resolution. Preserve this order in one shared resolver and test every tier plus the undefined case; changing the order can silently increase cost or erase role tuning.
