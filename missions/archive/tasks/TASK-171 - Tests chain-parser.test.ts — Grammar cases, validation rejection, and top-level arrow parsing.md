---
id: TASK-171
title: >-
  Tests: chain-parser.test.ts — Grammar cases, validation rejection, and
  top-level arrow parsing
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:chain-fanout'
dependencies:
  - TASK-165
createdAt: '2026-04-10T18:37:27.788Z'
updatedAt: '2026-04-10T19:26:12.730Z'
---

## Description

Add comprehensive test coverage to `tests/orchestration/chain-parser.test.ts` for the new bracket-aware parser.

**Test cases to add:**
- Valid single-step: plain stage, single fan-out `reviewer[2]`, single bracket group `[planner, reviewer]`.
- Valid multi-step: sequential chain, mixed `planner -> [task-manager, reviewer] -> coordinator`.
- Fan-out expansion: verify `reviewer[2]` produces a `ParallelGroupStep` with 2 identical `ChainStage` leaves and `syntax.kind === "fanout"`.
- Bracket group: verify `[planner, reviewer]` produces a `ParallelGroupStep` with 2 stages and `syntax.kind === "group"`.
- Count cap: `reviewer[0]` and `reviewer[11]` are rejected with explicit error messages.
- Loop-stage rejection: known loop stages (e.g. `coordinator`) inside parallel steps are rejected.
- Nested groups rejected: `[[planner, reviewer]]` or `reviewer[2]` inside `[...]` are rejected.
- Empty group rejected: `[]` is rejected.
- Existing behaviors preserved: lowercasing, empty stage, colon notation still error.
- Top-level arrow split: `a -> [b, c]` splits correctly at the top-level `->`, not inside brackets.

<!-- AC:BEGIN -->
- [ ] #1 Valid sequential, fanout, group, and mixed chain expressions all parse without error
- [ ] #2 Fan-out produces ParallelGroupStep with correct stage count, names, and syntax.kind='fanout'
- [ ] #3 Bracket group produces ParallelGroupStep with correct stages and syntax.kind='group'
- [ ] #4 Counts 0 and 11 are rejected; counts 1 and 10 are accepted
- [ ] #5 Known loop-stage names inside parallel steps cause a rejection error
- [ ] #6 Nested groups and fanout inside brackets are rejected
- [ ] #7 Empty groups are rejected
- [ ] #8 All pre-existing validation behaviors still produce errors in their original cases
<!-- AC:END -->

## Implementation Notes

All 48 tests pass. The required test cases were already added to tests/orchestration/chain-parser.test.ts in TASK-165 (commit a9e801e) as part of the parser implementation. No new changes were needed.

Coverage confirmed:
- AC#1: Sequential (1–3 stages), fan-out, bracket group, and mixed chains all parse (fan-out expansion, bracket group in a mixed chain tests)
- AC#2: reviewer[3] → ParallelGroupStep with 3 stages, syntax.kind='fanout' verified
- AC#3: [planner, reviewer] → ParallelGroupStep with syntax.kind='group' verified
- AC#4: count 0 and 11 rejected with /count.*between 1 and 10/ error; count 1 and 10 accepted
- AC#5: coordinator[2] and [planner, coordinator] both throw /Loop stage/
- AC#6: [[planner, reviewer], task-manager] → /Nested/; [planner, reviewer[2]] → /Fan-out.*bracket/
- AC#7: [] → /Empty.*group/
- AC#8: lowercasing, empty stage, trailing ->, leading ->, role:count all still error
