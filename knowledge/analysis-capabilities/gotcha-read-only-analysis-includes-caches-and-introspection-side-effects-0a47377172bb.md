---
type: gotcha
title: Read-only analysis includes caches and introspection side effects
description: >-
  A dry-run fix mode is insufficient when ordinary analysis or configuration
  commands can write cache files.
resource: >-
  knowledge/analysis-capabilities/gotcha-read-only-analysis-includes-caches-and-introspection-side-effects-0a47377172bb.md
tags:
  - caches
  - non-mutation
  - safety
  - testing
timestamp: '2026-07-29T16:36:48.071Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/analysis-capabilities/plan.md
date: '2026-07-29T16:36:48.071Z'
---
Treat every provider invocation—including status, version, configuration introspection, and ordinary analysis—as potentially mutating. Disable provider caches on every applicable call, use non-writing version/introspection operations, and require preview or dry-run for fix proposals. Verify the invariant by snapshotting the entire worktree, including ignored paths, before and after all capabilities; deleting generated files afterward is not acceptable because it still mutates and may erase preexisting state.
