---
type: gotcha
title: Use an isolated worktree when moving live-loaded agent definitions
description: >-
  Reorganizing definitions used by the running orchestrator can break subsequent
  agent spawns unless changes occur in an isolated checkout.
resource: >-
  knowledge/framework-extraction/gotcha-use-an-isolated-worktree-when-moving-live-loaded-agent-definitions-9860b515e4ac.md
tags:
  - agent-loading
  - migration-safety
  - self-hosting
  - worktrees
timestamp: '2026-04-01T03:32:49.715Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/framework-extraction/plan.md
date: '2026-04-01T03:32:49.715Z'
---
If an orchestration session dynamically loads agent definitions from the checkout being modified, moving or deleting those definitions can strand the session midway through its own migration. Perform the reorganization in a separate worktree or equivalent isolated checkout, keep the controlling session on the intact tree, and merge only after verification. This is operational safety for self-hosting systems, not merely branch hygiene.
