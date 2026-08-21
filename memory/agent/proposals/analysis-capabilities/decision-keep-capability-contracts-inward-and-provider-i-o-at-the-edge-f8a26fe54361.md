---
type: decision
title: Keep capability contracts inward and provider I/O at the edge
description: >-
  A stable analysis core should define provider-neutral capabilities and
  outcomes while adapters own discovery, execution, normalization, and host
  registration.
resource: >-
  knowledge/analysis-capabilities/decision-keep-capability-contracts-inward-and-provider-i-o-at-the-edge-f8a26fe54361.md
tags:
  - adapters
  - architecture
  - capabilities
  - dependency-direction
timestamp: '2026-07-29T16:36:48.071Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/analysis-capabilities/plan.md
date: '2026-07-29T16:36:48.071Z'
---
Define the durable contract in an infrastructure-independent core: capability names, request and result types, binding states, and pure resolution rules. Put provider detection, subprocess execution, result normalization, and host-tool registration in edge adapters that depend on that core. Never let the core import a concrete provider or orchestration framework; this dependency direction keeps consumer procedures stable when providers change.
