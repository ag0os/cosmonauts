---
type: gotcha
title: Malformed execution-identity bindings must not disappear silently
description: >-
  Invalid binding entries should warn and be skipped without making the rest of
  project configuration unloadable.
resource: >-
  knowledge/domain-authoring/gotcha-malformed-execution-identity-bindings-must-not-disappear-silently-0ca22b5e1c57.md
tags:
  - bindings
  - configuration
  - diagnostics
  - domains
timestamp: '2026-06-23T21:05:57.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/domain-authoring/plan.md
date: '2026-06-23T21:05:57.000Z'
---
Treat role bindings more strictly than inert optional filters because they determine execution identity. When a binding key or target is malformed, keep loading valid configuration but emit an actionable diagnostic naming the offending entry and explaining that it was skipped. Silent fallback to same-name resolution can execute the wrong provider or produce a misleading later not-found error; throwing away the entire configuration is unnecessarily disruptive.
