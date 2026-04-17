---
id: TASK-176
title: >-
  Tests: orchestration.test.ts — Update parseChain mocks to ChainStep[] and
  verify abort signal forwarding in chain_run
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:chain-fanout'
dependencies:
  - TASK-168
createdAt: '2026-04-10T18:38:08.778Z'
updatedAt: '2026-04-10T19:11:40.346Z'
---

## Description

Update `tests/extensions/orchestration.test.ts` to align with the new `ChainStep[]` contracts and add explicit coverage for abort signal propagation through the tool path.

**Test updates required:**
- Update all `parseChain()` mocks that currently return flat `ChainStage[]` arrays (lines 166, 200, 225, 252, 555, 584) to return `ChainStep[]` instead.
- Verify that the `chain_run` tool passes the tool's abort signal through to `runChain()` — assert that the mock for `runChain` receives a signal argument when the tool is invoked.
- Existing test behavior for result summaries and stage-name extraction must remain unchanged (since `stageResults` stays flat).

**Constraint:** Do not break existing passing tests — the update must preserve all existing test assertions while adding new signal-forwarding coverage.

<!-- AC:BEGIN -->
- [ ] #1 All parseChain mocks in orchestration.test.ts return ChainStep[] (not ChainStage[])
- [ ] #2 At least one test asserts that runChain receives the tool abort signal when chain_run is invoked
- [ ] #3 All previously passing orchestration.test.ts tests continue to pass
- [ ] #4 stageResults-based summary assertions are unaffected
<!-- AC:END -->

## Implementation Notes

Added `ChainStep` to the import from types. Applied `as ChainStep[]` cast to all 6 `parseChainMock.mockReturnValue(...)` calls (the plain objects were already structurally valid `ChainStep[]`, the cast makes the contract explicit). Added a new test \"chain_run forwards abort signal to runChain\" that calls the tool's `execute` method directly with an `AbortController`'s signal and asserts `runChain` receives `signal: controller.signal`. All 15 tests pass, typecheck clean.
