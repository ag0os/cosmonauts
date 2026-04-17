---
id: TASK-175
title: >-
  Tests: orchestration-rendering.test.ts — TUI step-based chain_start and
  parallel event rendering
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:chain-fanout'
dependencies:
  - TASK-169
createdAt: '2026-04-10T18:37:59.511Z'
updatedAt: '2026-04-10T19:02:14.752Z'
---

## Description

Add test coverage to `tests/extensions/orchestration-rendering.test.ts` for the updated TUI rendering behavior.

**Test cases to add:**
- `chain_start` with sequential steps displays the DSL string produced by `formatChainSteps()`.
- `chain_start` with a parallel group step displays the bracket/fanout DSL string correctly.
- `parallel_start` event produces a visible TUI progress entry for the group.
- `parallel_end` with `success: true` updates TUI progress to show the group passed.
- `parallel_end` with `success: false` updates TUI progress to show the group failed.

<!-- AC:BEGIN -->
- [ ] #1 chain_start renders step-based DSL string using formatChainSteps for sequential and parallel chains
- [ ] #2 parallel_start produces a TUI progress entry for the group
- [ ] #3 parallel_end success:true shows group success in TUI output
- [ ] #4 parallel_end success:false shows group failure in TUI output
- [ ] #5 Tests are in tests/extensions/orchestration-rendering.test.ts and pass with bun run test
<!-- AC:END -->

## Implementation Notes

Added 9 new tests across two new describe blocks in tests/extensions/orchestration-rendering.test.ts:
- `chainEventToProgressLine — chain_start`: 4 tests covering single sequential step, multi-step sequential, bracket group, and fanout DSL rendering.
- `chainEventToProgressLine — parallel events`: 4 tests covering parallel_start, parallel_end success, parallel_end failure (no error), and parallel_end failure with error message.
All 25 tests in the file pass. Committed as 010c3da.
