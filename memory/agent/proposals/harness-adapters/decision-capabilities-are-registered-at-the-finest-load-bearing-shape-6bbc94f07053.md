---
type: decision
title: Capabilities are registered at the finest load-bearing shape
description: >-
  A target's broad support for a mode does not imply support for every
  materialization shape within that mode.
resource: >-
  knowledge/harness-adapters/decision-capabilities-are-registered-at-the-finest-load-bearing-shape-6bbc94f07053.md
tags:
  - capabilities
  - harness-adapters
  - links
  - validation
timestamp: '2026-08-26T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/harness-adapters/spec.md
date: '2026-08-26T00:00:00.000Z'
---
Model adapter capabilities by target, asset kind, mode, and concrete materialization shape. Validate the resolved shape before any filesystem or provenance write, reject unsupported combinations with an actionable report, and never silently substitute a different mode. This rule arose because a harness that followed directory symlinks ignored file-level symlinks, making a target-level `link` flag too coarse to guarantee that exported assets were actually discoverable.
