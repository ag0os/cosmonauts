---
id: TASK-165
title: >-
  Update chain-parser.ts: Bracket-aware parsing, fan-out expansion, and
  validation
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:chain-fanout'
dependencies:
  - TASK-163
  - TASK-164
createdAt: '2026-04-10T18:36:15.614Z'
updatedAt: '2026-04-10T19:01:17.558Z'
---

## Description

Extend `lib/orchestration/chain-parser.ts` so `parseChain()` returns `ChainStep[]` instead of `ChainStage[]`, with full support for bracket groups, fan-out notation, and all new validation rules.

**Parser changes:**
- Split on top-level `->` arrows only (not arrows inside bracket groups).
- Parse each token: if it starts with `[`, parse as a parallel group step; if it matches `name[n]`, parse as a fan-out step; otherwise parse as a plain `ChainStage` (existing behavior).
- Expand fan-out `role[n]` into a `ParallelGroupStep` with `n` identical `ChainStage` leaves and `syntax: { kind: "fanout", role, count: n }`.
- Expand bracket groups `[a, b, c]` into a `ParallelGroupStep` with the listed stages and `syntax: { kind: "group" }`.

**Validation rules (all must produce explicit errors):**
- `count` for fan-out must be in range `1..10` (reject counts outside this range).
- Empty parallel group `[]` is rejected.
- Nested groups or fan-out inside a bracket group are rejected.
- Known loop-stage names (e.g. `coordinator`, `tdd-coordinator`) inside any parallel step are rejected.
- `role:count` syntax remains invalid (existing behavior preserved).
- Preserve existing lowercasing, empty-stage rejection, and colon validation for sequential stages.

**Return type:** `parseChain()` returns `ChainStep[]`.

<!-- AC:BEGIN -->
- [ ] #1 parseChain returns ChainStep[] and correctly parses single sequential stages, single fanout, single bracket groups, and multi-step mixed chains
- [ ] #2 Fan-out role[n] expands to a ParallelGroupStep with n identical ChainStage leaves and syntax.kind='fanout'
- [ ] #3 Bracket group [a,b] expands to a ParallelGroupStep with listed stages and syntax.kind='group'
- [ ] #4 Parser rejects count outside 1..10 with an explicit error message
- [ ] #5 Parser rejects known loop-stage names inside any parallel step with an explicit error
- [ ] #6 Parser rejects nested groups and fanout inside bracket groups
- [ ] #7 Parser rejects empty groups
- [ ] #8 All existing sequential parse behaviors (lowercasing, empty-stage rejection, colon validation) are preserved
<!-- AC:END -->

## Implementation Notes

Implementation was already complete in chain-parser.ts from a prior worker attempt. Verified all 48 parser tests pass. Fixed TypeScript errors in test files introduced by parseChain() returning ChainStep[]:
- chain-parser.test.ts:315 — completionCheck access on ChainStep needed a type guard ('kind' in step)
- chain-runner.test.ts — makeConfig signature updated to ChainStep[], .loop accesses on parsed sequential stages cast to ChainStage, @ts-expect-error added for the stages: field (chain-runner.ts still reads config.stages — TASK-167's responsibility)

Remaining typecheck errors (not this task's scope):
- cli/main.ts: injectUserPrompt expects ChainStage[] (TASK-167 must update chain-runner.ts to accept ChainStep[]), and stages field in ChainConfig (TASK-167)
- chain-tool.ts: same pattern (TASK-168)
- chain-runner.ts: config.stages references (TASK-167)

All 1451 tests pass."
