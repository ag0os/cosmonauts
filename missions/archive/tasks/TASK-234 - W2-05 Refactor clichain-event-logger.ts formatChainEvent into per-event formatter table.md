---
id: TASK-234
title: >-
  W2-05: Refactor cli/chain-event-logger.ts formatChainEvent into per-event
  formatter table
status: Done
priority: medium
labels:
  - 'wave:2'
  - 'area:cli-infra'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T13:58:51.326Z'
updatedAt: '2026-04-29T15:49:08.780Z'
---

## Description

Refactor the `formatChainEvent(event)` function at `cli/chain-event-logger.ts:27` into a per-event formatter table, removing the complexity suppression.

**Suppression:** `cli/chain-event-logger.ts:27`, `formatChainEvent(event)`.

**Current responsibilities:** formats every `ChainEvent` variant for stderr logging, including chain/stage lifecycle, stats, iterations, spawn lifecycle, forwarded agent turn/tool events, errors, parallel groups, and spawn completions.

**Target pattern:** per-event formatter table:
```ts
type ChainEventFormatter<K extends ChainEvent["type"]> = (event: Extract<ChainEvent, { type: K }>) => string
const CHAIN_EVENT_FORMATTERS: { [K in ChainEvent["type"]]: ChainEventFormatter<K> }
```
`formatChainEvent(event)` dispatches through the table.

**Coverage status:** `add-characterization-tests` — existing `tests/cli/chain-event-logger.test.ts:27` covers most event variants but misses `stage_stats`, `agent_turn`, both `agent_tool_use` branches, and `spawn_completion`; add those cases before refactor.

**TDD note:** yes for per-event formatters.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/chain-event-logger.ts:27`.
- Commit the change as a single commit: `W2-05: Refactor cli/chain-event-logger.ts formatChainEvent`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 2 / W2-05

<!-- AC:BEGIN -->
- [ ] #1 Missing event characterization tests are green before refactor.
- [ ] #2 Formatter table covers every ChainEvent["type"] with TypeScript exhaustiveness.
- [ ] #3 Suppression at cli/chain-event-logger.ts:27 is removed.
- [ ] #4 createChainEventLogger continues writing one formatted line to stderr.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
