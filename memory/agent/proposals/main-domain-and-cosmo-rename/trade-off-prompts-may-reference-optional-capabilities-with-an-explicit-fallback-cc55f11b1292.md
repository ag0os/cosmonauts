---
type: trade-off
title: Prompts may reference optional capabilities with an explicit fallback
description: >-
  A persona can ship ahead of optional runtime primitives when it clearly
  degrades to available mechanisms.
resource: >-
  knowledge/main-domain-and-cosmo-rename/trade-off-prompts-may-reference-optional-capabilities-with-an-explicit-fallback-cc55f11b1292.md
tags:
  - capabilities
  - delivery
  - fallback
  - prompts
timestamp: '2026-05-04T21:09:14.040Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/main-domain-and-cosmo-rename/plan.md
date: '2026-05-04T21:09:14.040Z'
---
To keep independently mergeable work streams, a prompt may describe optional orchestration primitives before they are guaranteed to be installed. It must detect or tolerate their absence, tell the user the capability is unavailable, and fall back to supported single-agent or chain mechanisms. This trades temporary feature completeness for lower coupling between delivery plans.
