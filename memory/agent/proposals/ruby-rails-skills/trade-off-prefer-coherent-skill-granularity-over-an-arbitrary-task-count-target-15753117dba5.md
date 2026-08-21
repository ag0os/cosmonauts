---
type: trade-off
title: Prefer coherent skill granularity over an arbitrary task-count target
description: >-
  Preserve one focused skill per materially distinct concern even when this
  increases implementation task count.
resource: >-
  knowledge/ruby-rails-skills/trade-off-prefer-coherent-skill-granularity-over-an-arbitrary-task-count-target-15753117dba5.md
tags:
  - granularity
  - skills
  - task-decomposition
  - trade-off
timestamp: '2026-04-23T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/ruby-rails-skills/plan.md
date: '2026-04-23T00:00:00.000Z'
---
Do not collapse distinct concerns into a catch-all umbrella solely to fit a preferred task-count range. Separate skills provide more precise loading triggers, clearer ownership, and better cross-links. The accepted cost is more files and worker tasks; if coordination needs compression, combine implementation ownership for closely related foundational skills without changing the public skill architecture.
