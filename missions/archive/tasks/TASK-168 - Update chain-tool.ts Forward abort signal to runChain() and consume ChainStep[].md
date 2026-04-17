---
id: TASK-168
title: >-
  Update chain-tool.ts: Forward abort signal to runChain() and consume
  ChainStep[]
status: Done
priority: high
assignee: worker
labels:
  - backend
  - api
  - 'plan:chain-fanout'
dependencies:
  - TASK-163
  - TASK-164
  - TASK-167
createdAt: '2026-04-10T18:36:52.921Z'
updatedAt: '2026-04-10T19:08:51.940Z'
---

## Description

Update `domains/shared/extensions/orchestration/chain-tool.ts` to correctly thread the tool's abort signal into `runChain()` and update call sites to work with the `ChainStep[]` contract.

**Changes required:**
- Thread `_signal` (currently received but dropped at line 68–116) into the `runChain()` call so that abort semantics apply in the extension/TUI path, not only in direct runner tests.
- Update any call sites that previously passed or built a `ChainConfig` with `stages` to use `steps` instead.
- Update prompt injection call site to use `injectUserPrompt` from `chain-steps.ts` (which handles parallel first steps).
- Update tool description and `--workflow` examples in the tool definition to include at least one fan-out and one bracket-group example.
- Keep `result.stageResults.map((s) => s.stage.name)` logic for the summary — `stageResults` stays flat so this remains valid.

<!-- AC:BEGIN -->
- [ ] #1 chain-tool.ts passes _signal to runChain() so abort fires in the extension path
- [ ] #2 ChainConfig is built with steps: ChainStep[] not stages: ChainStage[]
- [ ] #3 injectUserPrompt from chain-steps.ts is used for prompt injection
- [ ] #4 Tool description or examples reference the bracket-group or fanout syntax
- [ ] #5 Result summary still works because stageResults is flat
<!-- AC:END -->

## Implementation Notes

All 5 ACs satisfied:
1. _signal renamed to signal and passed to runChain() as signal property.
2. ChainConfig was already built with steps: ChainStep[] (no change needed — TASK-167 had already done this).
3. injectUserPrompt now imported directly from chain-steps.ts instead of chain-runner.ts (chain-runner.ts re-exports it, but the direct import is now canonical).
4. Tool description and expression parameter description both updated with bracket-group and fan-out examples.
5. stageResults.map() summary logic unchanged — stageResults is flat.
