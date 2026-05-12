---
id: TASK-301
title: 'Phase 1 documentation: README and orchestration guide'
status: Done
priority: low
assignee: worker
labels:
  - backend
  - 'plan:external-agent-orchestration'
dependencies:
  - TASK-300
  - TASK-294
createdAt: '2026-05-11T21:38:26.906Z'
updatedAt: '2026-05-12T01:14:12.625Z'
---

## Description

Document the new package definition format, the `cosmonauts export` command, exported binary usage, and the Phase 1 architecture boundaries in `README.md` and `docs/orchestration.md`.

Files to change:
- `README.md`
- `docs/orchestration.md`

Depends on: TASK-300, TASK-294

<!-- AC:BEGIN -->
- [x] #1 README.md documents the AgentPackageDefinition JSON format with an example, the cosmonauts export --definition and cosmonauts export <agent-id> invocation forms, and exported binary runtime flags (--allow-api-billing, --claude-binary, --prompt-mode).
- [x] #2 README.md explains the subscription-safety default: ANTHROPIC_API_KEY is removed unless --allow-api-billing is passed.
- [x] #3 docs/orchestration.md introduces the packaged-agent and export concept, explains that AgentPackage is a compiled artifact derived from AgentPackageDefinition, and explicitly states that existing chains and Drive behavior are unchanged in Phase 1.
- [x] #4 All documented CLI flags and behavior match the final implemented and test-verified contracts from TASK-300 and earlier tasks.
<!-- AC:END -->

## Implementation Notes

Updated README.md with AgentPackageDefinition JSON format, export command forms, exported binary runtime flags, prompt input behavior, and subscription-safety default. Updated docs/orchestration.md with Phase 1 packaged-agent/export architecture boundaries and noted chains/Drive remain unchanged. Verified with bun run test, bun run lint, and bun run typecheck.
