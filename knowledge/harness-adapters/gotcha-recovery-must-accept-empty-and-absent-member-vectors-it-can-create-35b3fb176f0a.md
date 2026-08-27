---
type: gotcha
title: Recovery must accept empty and absent member vectors it can create
description: >-
  A journal schema can reject its own legitimate states when recovery validators
  assume every transaction has at least one present member.
resource: >-
  knowledge/harness-adapters/gotcha-recovery-must-accept-empty-and-absent-member-vectors-it-can-create-35b3fb176f0a.md
tags:
  - harness-adapters
  - journaling
  - recovery
  - state-machine
timestamp: '2026-08-26T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/harness-adapters/plan.md
date: '2026-08-26T00:00:00.000Z'
---
Derive recovery validation from the writer's full state space, including zero-member sets, absent old snapshots, and absent targets created by legitimate create or remove operations. Test every phase against vectors the writer can actually persist, not only populated replacement transactions. Otherwise a valid journal can be classified as malformed and strand recovery even though no foreign mutation occurred.
