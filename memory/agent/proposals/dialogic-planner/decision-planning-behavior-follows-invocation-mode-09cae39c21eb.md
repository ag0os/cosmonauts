---
type: decision
title: Planning behavior follows invocation mode
description: >-
  Interactive planning uses dialogue and staged approval, while chain-invoked
  planning remains autonomous.
resource: >-
  knowledge/dialogic-planner/decision-planning-behavior-follows-invocation-mode-09cae39c21eb.md
tags:
  - automation
  - decision-log
  - interaction-mode
  - planning
timestamp: '2026-06-06T14:31:23.038Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/dialogic-planner/plan.md
date: '2026-06-06T14:31:23.038Z'
---
A planner should distinguish how it was invoked. In an interactive session, it should surface two or three meaningful alternatives for each major engineering decision, record the selected choice, and seek incremental approval before moving on. In an automated workflow stage, it should make and document those decisions autonomously so the chain does not block on unavailable human input. Keep one plan format usable in both modes, including a decision log that preserves the reasoning either way.
