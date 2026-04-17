---
id: TASK-142
title: Add `planSlug` to orchestration types and thread through chain-runner
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:session-lineage'
dependencies:
  - TASK-140
createdAt: '2026-04-07T19:04:08.122Z'
updatedAt: '2026-04-07T19:08:43.277Z'
---

## Description

Extend `SpawnConfig` and `ChainConfig` with an optional `planSlug` field, then derive and thread it through chain-runner spawns. This is a pure type/plumbing change with no behavioral effect until the session-factory change lands.\n\n**Modified files:**\n- `lib/orchestration/types.ts` — add `planSlug?: string` to `SpawnConfig` and `ChainConfig`\n- `lib/orchestration/chain-runner.ts` — add `derivePlanSlug(completionLabel?)` helper; pass `planSlug` in every `spawner.spawn()` call inside `runStage()`\n\n**No behavioral change:** when `planSlug` is undefined (all current callers), session behavior is identical to today.

<!-- AC:BEGIN -->
- [x] #1 SpawnConfig has planSlug?: string field in lib/orchestration/types.ts
- [x] #2 ChainConfig has planSlug?: string field in lib/orchestration/types.ts
- [x] #3 chain-runner derives planSlug from completionLabel using pattern `plan:<slug>` (strips `plan:` prefix)
- [x] #4 All spawner.spawn() calls in runStage() receive planSlug from config
- [x] #5 Existing chain-runner tests continue to pass (no behavioral regression)
- [x] #6 When completionLabel is absent or does not start with `plan:`, planSlug is undefined and behavior is unchanged (QC-005 precondition)
<!-- AC:END -->

## Implementation Notes

All 6 ACs were already partially satisfied from a prior attempt — SpawnConfig.planSlug, ChainConfig.planSlug, and derivePlanSlug() were all in place, as was planSlug on the one-shot stage spawn. The only gap was the loop stage spawn inside the for-loop in runStage() which was missing planSlug. Added it. All 60 chain-runner tests pass.
