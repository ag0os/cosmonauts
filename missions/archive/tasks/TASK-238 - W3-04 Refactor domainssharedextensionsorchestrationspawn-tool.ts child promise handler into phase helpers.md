---
id: TASK-238
title: >-
  W3-04: Refactor domains/shared/extensions/orchestration/spawn-tool.ts child
  promise handler into phase helpers
status: Done
priority: medium
labels:
  - 'wave:3'
  - 'area:orchestration'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T13:59:41.784Z'
updatedAt: '2026-04-29T16:04:09.282Z'
---

## Description

Refactor the `.then(async ({ session, sessionFilePath }) => ...)` handler at `domains/shared/extensions/orchestration/spawn-tool.ts:352` into named lifecycle phase helpers, removing the complexity suppression.

**Suppression:** `domains/shared/extensions/orchestration/spawn-tool.ts:352`, `.then(async ({ session, sessionFilePath }) => ...)`.

**Current responsibilities:** registers child depth/tracker/plan context, publishes activity events from child session, prompts child, drains nested completions, extracts assistant summary, completes/fails parent tracker, sends self-delivered completion when needed, captures stats, cleanup subscriptions/trackers/context/session, writes transcript/manifest lineage, and handles session creation failure.

**Target pattern:** phase split:
- `runDetachedChildSession(params: DetachedChildSessionParams): Promise<void>`
- `subscribeChildActivity(session, spawnId, params): () => void`
- `executeChildPromptLoop(session, childTracker, prompt): Promise<ChildPromptResult>`
- `settleSpawnTracker(tracker, spawnId, result, pi): void`
- `persistChildLineage(params, result, finalMessages): Promise<void>`

**Coverage status:** `add-characterization-tests` — existing `tests/extensions/orchestration.test.ts:332` covers accepted spawn, authorization, nested completions, and completion message; `tests/extensions/orchestration-lineage.test.ts:214` covers lineage; add focused tests that: child session activity publishes `tool_start`, `tool_end`, `turn_start`, `turn_end`, and `compaction`, and that cleanup runs when child prompt throws after subscribing.

**TDD note:** no for detached lifecycle; yes for pure activity mapping helper.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `domains/shared/extensions/orchestration/spawn-tool.ts:352`.
- Commit the change as a single commit: `W3-04: Refactor spawn-tool.ts child promise handler`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 3 / W3-04

<!-- AC:BEGIN -->
- [ ] #1 Added activity/cleanup characterization tests are green before refactor.
- [ ] #2 Promise handler delegates to named lifecycle helpers.
- [ ] #3 Suppression at domains/shared/extensions/orchestration/spawn-tool.ts:352 is removed.
- [ ] #4 Self-delivery and external delivery modes remain unchanged.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
