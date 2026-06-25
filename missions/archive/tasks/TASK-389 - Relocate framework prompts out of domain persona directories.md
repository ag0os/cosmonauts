---
id: TASK-389
title: Relocate framework prompts out of domain persona directories
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:domain-authoring'
dependencies:
  - TASK-388
createdAt: '2026-06-23T21:14:09.706Z'
updatedAt: '2026-06-24T13:34:19.948Z'
---

## Description

Implementation Order step 3. Move framework-owned base and sub-agent runtime prompts to the framework prompt location, and keep domain `prompts/` exclusively for agent personas. This task owns B-004 and must include the exact behavior marker in the named test file.

<!-- AC:BEGIN -->
- [x] #1 B-004 prompt assembly loads layer 0 from `lib/prompts/framework/base.md`, layer 3 from `lib/prompts/framework/runtime/sub-agent.md`, and layer 2 personas from `<domain>/prompts/<agent-id>.md`, proven in `tests/domains/prompt-assembly.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-004`.
- [x] #2 No active runtime code path depends on `lib/prompts/framework/base.md` or `lib/prompts/framework/runtime/sub-agent.md` being supplied by a domain persona directory after the relocation.
- [x] #3 Existing top-level and sub-agent prompt assembly behavior remains covered with test fixtures that can override the framework prompt directory.
<!-- AC:END -->
