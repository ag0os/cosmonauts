---
id: TASK-237
title: 'W3-03: Refactor lib/orchestration/agent-spawner.ts spawn into phase helpers'
status: Done
priority: medium
labels:
  - 'wave:3'
  - 'area:orchestration'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T13:59:29.496Z'
updatedAt: '2026-04-29T15:59:57.664Z'
---

## Description

Refactor the `createPiSpawner(...).spawn(config)` method at `lib/orchestration/agent-spawner.ts:95` into named lifecycle phase helpers, removing the complexity suppression.

**Suppression:** `lib/orchestration/agent-spawner.ts:95`, `createPiSpawner(...).spawn(config)`.

**Current responsibilities:** abort precheck, resolves agent definition, creates session, tracker, plan context, event subscription, prompts session, delivers child completions, captures stats, cleans trackers/context/subscription/session, writes transcript/manifest lineage for plan-linked sessions, swallows lineage errors, and returns success/failure.

**Target pattern:** phase split:
- `prepareSpawnSession(registry, config, domainsDir, resolver): Promise<PreparedSpawnSession>`
- `runSpawnSession(prepared, config, spawnTimeoutMs): Promise<SpawnExecutionResult>`
- `cleanupSpawnSession(prepared, config): FinalMessages`
- `persistPlanLinkedSpawn(prepared, execution, finalMessages, config): Promise<void>`
- `toSpawnFailure(err: unknown): SpawnResult`

**Coverage status:** `existing-coverage-sufficient` — `tests/orchestration/agent-spawner.spawn.test.ts:120` covers success/failure/stats/event subscription/cleanup; `tests/orchestration/agent-spawner.completion-loop.test.ts:118` covers child completion loop/timeout/tracker cleanup; `tests/orchestration/agent-spawner.lineage.test.ts:112` covers plan-linked transcript/manifest success/failure and lineage error swallowing.

**TDD note:** no for lifecycle orchestration; yes only for pure mapper helpers if exported for tests.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `lib/orchestration/agent-spawner.ts:95`.
- Commit the change as a single commit: `W3-03: Refactor lib/orchestration/agent-spawner.ts spawn`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 3 / W3-03

<!-- AC:BEGIN -->
- [ ] #1 Existing spawner tests are green before refactor.
- [ ] #2 spawn delegates lifecycle, completion loop, cleanup, and lineage persistence phases.
- [ ] #3 Suppression at lib/orchestration/agent-spawner.ts:95 is removed.
- [ ] #4 Cleanup still runs after prompt/subscription failures.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
