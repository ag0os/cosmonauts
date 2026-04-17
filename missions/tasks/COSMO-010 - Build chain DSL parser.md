---
id: COSMO-010
title: Build chain DSL parser
status: Done
priority: high
labels:
  - orchestration
dependencies:
  - COSMO-009
createdAt: '2026-02-09T19:09:00.466Z'
updatedAt: '2026-02-09T19:13:25.049Z'
---

## Description

Create lib/orchestration/chain-parser.ts. Parse chain expressions like 'planner -> task-manager -> coordinator:20'. Arrow (->) separates pipeline stages. Colon (:N) sets max iterations for loop stages. Returns array of ChainStage objects. Handle edge cases: whitespace, invalid names, missing parts.

<!-- AC:BEGIN -->
- [x] #1 parseChain(expr) returns ChainStage array
- [x] #2 Pipeline mode: 'a -> b -> c' parses to 3 stages with maxIterations=1
- [x] #3 Loop mode: 'coordinator:20' parses to stage with maxIterations=20
- [x] #4 Combined: 'planner -> coordinator:20' works correctly
- [x] #5 Throws on invalid expressions (empty, malformed)
<!-- AC:END -->
