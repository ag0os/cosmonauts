---
type: trade-off
title: Machine-global generated assets use visible last-writer freshness
description: >-
  A single personal asset generated from project-specific facts cannot be
  current for multiple projects simultaneously.
resource: >-
  knowledge/harness-adapters/trade-off-machine-global-generated-assets-use-visible-last-writer-freshness-f4dcb631a6bc.md
tags:
  - generated-assets
  - harness-adapters
  - multi-project
  - trade-off
timestamp: '2026-08-26T18:35:52.966Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/harness-adapters/review-4.md
date: '2026-08-26T18:35:52.966Z'
---
For a fixed machine-global output whose generated content depends on the invoking project, use stable authority to avoid false foreign-owner conflicts but record the generating project. A different project may regenerate the asset under last-writer-wins semantics; sync and check must annotate the previous generator and report stale project context rather than silently claiming universal freshness. The accepted cost is cross-project oscillation instead of merging inventories or multiplying a path that consumers address by one fixed name.
