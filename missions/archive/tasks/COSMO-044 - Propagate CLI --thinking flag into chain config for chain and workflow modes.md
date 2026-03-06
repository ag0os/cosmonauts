---
id: COSMO-044
title: Propagate CLI --thinking flag into chain config for chain and workflow modes
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:agent-thinking-levels'
dependencies:
  - COSMO-042
createdAt: '2026-03-05T16:02:59.207Z'
updatedAt: '2026-03-05T16:15:29.880Z'
---

## Description

Update `cli/main.ts` to thread the `--thinking` flag value into `ChainConfig.thinking` when running chains or workflows, so all spawned agents in a chain inherit the CLI thinking level as a chain-wide default.

**Files to change:**
- `cli/main.ts`:
  - In the `--chain` mode block (around line 182), when calling `runChain()`, set `thinking: { default: options.thinking }` in the config if `options.thinking` is defined
  - In the `--workflow` mode block (around line 195), same treatment
  - This makes `--thinking high --chain "planner -> coordinator"` apply `"high"` as `ThinkingConfig.default` for all stages, unless overridden by definition or per-role config

<!-- AC:BEGIN -->
- [ ] #1 When --thinking is set and --chain is used, runChain() receives thinking config with the CLI value as the default
- [ ] #2 When --thinking is set and --workflow is used, runChain() receives thinking config with the CLI value as the default
- [ ] #3 When --thinking is not set, no thinking config is passed to runChain() (existing behavior preserved)
- [ ] #4 Project compiles without type errors
<!-- AC:END -->

## Implementation Notes

Added `...(options.thinking && { thinking: { default: options.thinking } })` to both the `--chain` and `--workflow` `runChain()` calls in `cli/main.ts`. When `--thinking` is not set, `options.thinking` is `undefined` (falsy), so the spread is a no-op and existing behavior is preserved. Committed as 9c96850.
