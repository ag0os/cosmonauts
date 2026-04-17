---
id: TASK-179
title: Wire --profile flag into CLI
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - api
  - 'plan:chain-profiler'
dependencies:
  - TASK-177
  - TASK-178
createdAt: '2026-04-13T14:48:11.366Z'
updatedAt: '2026-04-13T14:59:41.477Z'
---

## Description

Integrate `ChainProfiler` into the `--workflow` CLI path in `cli/main.ts` and `cli/types.ts`.

**`cli/types.ts`:**
- Add `profile?: boolean` to the `CliOptions` interface.

**`cli/main.ts`** (changes in the `--workflow` block around line 392–446):
1. Add Commander option: `.option("--profile", "Write profiling trace and summary files after a chain run")`.
2. After resolving `options.workflow` and before `runChain`, when `options.profile` is set:
   - Call `derivePlanSlug(options.completionLabel)` (already imported from `chain-runner.ts`) to get `planSlug`.
   - If `planSlug` is defined, use `sessionsDirForPlan(cwd, planSlug)` (imported from `lib/sessions/session-store.ts`) as `outputDir`.
   - Otherwise use `join(cwd, "missions", "sessions", "_profiles")` as fallback `outputDir`.
   - Instantiate `ChainProfiler({ outputDir })`.
   - Compose `onEvent`: `(event) => { logger(event); profiler.handleEvent(event); }`.
3. Wrap the `runChain(...)` call in a `try/finally`. In the `finally` block, when profiler is set: call `await profiler.writeOutput()`, catch any error and print to stderr, print both output file paths to stderr on success.
4. When `--profile` is not set, `onEvent` remains `createChainEventLogger()` unchanged — zero overhead.

**Import additions to `cli/main.ts`:**
- `ChainProfiler` from `../lib/orchestration/chain-profiler.ts`
- `sessionsDirForPlan` from `../lib/sessions/session-store.ts`
- `derivePlanSlug` added to the existing import from `../lib/orchestration/chain-runner.ts`

<!-- AC:BEGIN -->
- [ ] #1 cli/types.ts CliOptions interface has profile?: boolean field
- [ ] #2 Commander option --profile is registered in cli/main.ts
- [ ] #3 When --profile is set, output directory is resolved using derivePlanSlug + sessionsDirForPlan, falling back to missions/sessions/_profiles
- [ ] #4 ChainProfiler.writeOutput() is called in a finally block so partial profiles are written even on chain abort or error
- [ ] #5 Output file paths are printed to stderr after successful writeOutput()
- [ ] #6 When --profile is not set, no ChainProfiler is instantiated and onEvent is unchanged (zero overhead)
- [ ] #7 No new path-derivation logic is added to chain-profiler.ts — all resolution stays in cli/main.ts
<!-- AC:END -->

## Implementation Notes

Added `profile?: boolean` to CliOptions, registered `--profile` Commander option, and wired ChainProfiler into the --workflow execution path. When --profile is set: resolves outputDir via derivePlanSlug+sessionsDirForPlan (falling back to missions/sessions/_profiles), wraps runChain in try/finally to ensure writeOutput() is called even on error, and prints both output paths to stderr. When not set, onEvent is unchanged (zero overhead). All resolution logic lives in cli/main.ts — chain-profiler.ts was not modified.
