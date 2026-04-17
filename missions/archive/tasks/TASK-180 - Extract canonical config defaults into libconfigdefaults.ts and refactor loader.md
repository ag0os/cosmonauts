---
id: TASK-180
title: >-
  Extract canonical config defaults into lib/config/defaults.ts and refactor
  loader
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:init-command'
dependencies: []
createdAt: '2026-04-14T13:37:47.292Z'
updatedAt: '2026-04-14T13:41:30.295Z'
---

## Description

Create `lib/config/defaults.ts` as the single source of truth for the default `.cosmonauts/config.json` shape, then update `lib/config/loader.ts` to consume it instead of the inline `DEFAULT_PROJECT_CONFIG` constant.

**Files to change:**
- `lib/config/defaults.ts` — new file; export `createDefaultProjectConfig(): ProjectConfig`
- `lib/config/loader.ts` — replace the inline `DEFAULT_PROJECT_CONFIG` constant with a call to `createDefaultProjectConfig()`
- `tests/config/scaffold.test.ts` — assert the scaffolded config matches the object returned by `createDefaultProjectConfig()`, not a hardcoded snapshot

**Key contract:**
```ts
// lib/config/defaults.ts
export function createDefaultProjectConfig(): ProjectConfig;
```
- Returns a fresh object on every call (no shared reference)
- Contains the same `skills` and `workflows` currently in the inline constant in `loader.ts`

This is the foundation for `lib/init/prompt.ts`, which will import `createDefaultProjectConfig()` to embed the canonical template in the bootstrap message.

<!-- AC:BEGIN -->
- [ ] #1 lib/config/defaults.ts exists and exports createDefaultProjectConfig(): ProjectConfig
- [ ] #2 createDefaultProjectConfig() returns a fresh object each call with the same skills and workflows currently defined inline in lib/config/loader.ts
- [ ] #3 lib/config/loader.ts imports createDefaultProjectConfig() from lib/config/defaults.ts and no longer defines its own inline DEFAULT_PROJECT_CONFIG constant
- [ ] #4 tests/config/scaffold.test.ts asserts that scaffoldProjectConfig() writes the object returned by createDefaultProjectConfig() (skills + all three workflows present)
- [ ] #5 bun run test passes with no regressions
<!-- AC:END -->

## Implementation Notes

Completed AC1-AC5. Added lib/config/defaults.ts with createDefaultProjectConfig(), updated lib/config/loader.ts to scaffold from the canonical factory instead of an inline constant, and changed tests/config/scaffold.test.ts to assert scaffolded config matches createDefaultProjectConfig() and that each call returns fresh nested objects. Verification passed: bun run test, bun run lint, bun run typecheck. Commit: f5a9b11 (TASK-180: Extract canonical config defaults).
