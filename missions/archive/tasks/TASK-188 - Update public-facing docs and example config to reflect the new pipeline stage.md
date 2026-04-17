---
id: TASK-188
title: Update public-facing docs and example config to reflect the new pipeline stage
status: Done
priority: medium
assignee: worker
labels:
  - frontend
  - 'plan:integration-verifier'
dependencies:
  - TASK-187
createdAt: '2026-04-14T19:29:08.024Z'
updatedAt: '2026-04-14T19:43:46.773Z'
---

## Description

Refresh all user-facing documentation and example files so they accurately show the updated `plan-and-build` chain including `integration-verifier`.

**Files to modify:**
- `README.md` — update any chain example that shows `planner -> task-manager -> coordinator -> quality-manager` to include `integration-verifier` before `quality-manager`. Update the agent/role count and description if it lists eight roles.
- `AGENTS.md` — update the Named Workflows table row for `plan-and-build` from `planner → task-manager → coordinator → quality-manager` to `planner → task-manager → coordinator → integration-verifier → quality-manager`. Add a row or description for the new `integration-verifier` agent role if there is an agent roles table.
- `.cosmonauts/config.example.json` — update the `plan-and-build` chain string to `"planner -> task-manager -> coordinator -> integration-verifier -> quality-manager"` to match `lib/config/defaults.ts`.

Acceptance Criteria:
  [x] #1 README.md pipeline/chain examples show integration-verifier before quality-manager in the plan-and-build chain
  [x] #2 AGENTS.md Named Workflows table shows the updated plan-and-build chain with integration-verifier
  [x] #3 .cosmonauts/config.example.json plan-and-build chain string includes integration-verifier immediately before quality-manager
  [x] #4 No remaining references to the old plan-and-build chain (without integration-verifier) in README.md, AGENTS.md, or config.example.json

<!-- AC:BEGIN -->
- [ ] #1 README.md pipeline/chain examples show integration-verifier before quality-manager in the plan-and-build chain
- [ ] #2 AGENTS.md Named Workflows table shows the updated plan-and-build chain with integration-verifier
- [ ] #3 .cosmonauts/config.example.json plan-and-build chain string includes integration-verifier immediately before quality-manager
- [ ] #4 No remaining references to the old plan-and-build chain (without integration-verifier) in README.md, AGENTS.md, or config.example.json
<!-- AC:END -->

## Implementation Notes

Updated README.md, AGENTS.md, and .cosmonauts/config.example.json so public plan-and-build examples include integration-verifier before quality-manager. Also updated README role count/workflow description for the new stage.

Verification:
- `rg -n "planner( ->| → )task-manager( ->| → )coordinator( ->| → )quality-manager" README.md AGENTS.md .cosmonauts/config.example.json` returned no matches.
- `bun run test -- tests/config/scaffold.test.ts` passed.
- `bun run typecheck` passed.
- `bun run lint` is currently blocked by a pre-existing Biome formatting issue in `bundled/coding/coding/agents/quality-manager.ts`, unrelated to this task.
