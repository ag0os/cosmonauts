---
type: trade-off
title: Drive Resilience and Finalization State Model — trade-off 9
description: >-
  Migrated trade-off record fac9f54b-ce9f-462a-bc1e-8b323d26eedd from
  drive-resilience-state-model.
resource: knowledge/drive-resilience-state-model/fac9f54b-ce9f-462a-bc1e-8b323d26eedd.md
tags:
  - drive
  - plan-lifecycle
  - completion-candidate
  - scope
timestamp: '2026-05-26T16:21:11.000Z'
scope: project
kind: semantic
writer: distiller
source: >-
  memory/drive-resilience-state-model.knowledge.jsonl#fac9f54b-ce9f-462a-bc1e-8b323d26eedd
date: '2026-05-26T16:21:11.000Z'
id: fac9f54b-ce9f-462a-bc1e-8b323d26eedd
planSlug: drive-resilience-state-model
planTitle: Drive Resilience and Finalization State Model
taskId: TASK-334
sourceRole: worker
files:
  - lib/driver/run-run-loop.ts
  - lib/driver/types.ts
  - domains/shared/extensions/orchestration/watch-events-tool.ts
legacyType: trade-off
legacyCreatedAt: '2026-05-26T16:21:11Z'
legacyBundleDistilledAt: '2026-05-26T16:21:11Z'
legacyBundleDistilledBy: distiller
legacySourceSha256: 8b8b8472175ff23749db9c89779f697515e1a112d8ed93cb8b900ce2c429e97e
---
Drive emits `plan_completion_candidate` when all tasks labeled `plan:<slug>` are Done after successful finalization, but it intentionally does not edit the plan, archive artifacts, distill memory, push, or open PRs. This gives coordinators useful completion evidence without moving lifecycle ownership into the driver.