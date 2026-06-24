---
id: TASK-397
title: Document the domain authoring contract and update stale references
status: To Do
priority: medium
labels:
  - testing
  - 'plan:domain-authoring'
dependencies:
  - TASK-396
createdAt: '2026-06-23T21:15:11.837Z'
updatedAt: '2026-06-23T21:15:11.837Z'
---

## Description

Implementation Order step 9. Write the author-facing domain authoring documentation, update prompt-layer docs for framework prompt relocation, and remove stale references to old bundled or prompt paths. This task owns B-015 and must include the exact marker in the docs coverage test.

<!-- AC:BEGIN -->
- [ ] #1 B-015 domain authoring documentation covers manifest, agent, persona, capability, skill, extension, chain, `internal` visibility, active domains, and bindings with path/format/declaration/config split guidance, proven in `tests/docs/domain-authoring.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-015`.
- [ ] #2 `docs/prompts.md` describes the four prompt layers using the new framework prompt paths and states that domain `prompts/` contains personas only.
- [ ] #3 `README.md` and docs/tests no longer present active examples that depend on `bundled/coding/coding/**` or `domains/shared/prompts/*` as runtime paths.
- [ ] #4 Documentation explains package layouts, live `/domain-bind` behavior, in-flight behavior, session replay, and actionable fixes for the plan's listed failure flows.
<!-- AC:END -->
