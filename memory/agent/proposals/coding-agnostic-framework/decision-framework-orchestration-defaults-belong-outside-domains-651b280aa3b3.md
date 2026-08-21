---
type: decision
title: Framework orchestration defaults belong outside domains
description: >-
  A default orchestration prompt used by multiple entrypoints should be
  framework-owned and resolved by one shared helper.
resource: >-
  knowledge/coding-agnostic-framework/decision-framework-orchestration-defaults-belong-outside-domains-651b280aa3b3.md
tags:
  - defaults
  - dependency-direction
  - orchestration
  - prompts
timestamp: '2026-06-29T20:14:59.444Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/coding-agnostic-framework/plan.md
date: '2026-06-29T20:14:59.444Z'
---
Place default orchestration substrate under a framework-owned prompt location rather than inside an optional domain or behind domain resolution. All entrypoints that omit an override—such as a CLI and an agent tool—must call the same resolver, which verifies the file exists and reports how to provide an explicit override when missing. This prevents entrypoint drift and keeps the framework usable without any particular optional domain.
