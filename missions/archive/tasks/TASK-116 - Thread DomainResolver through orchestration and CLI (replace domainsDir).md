---
id: TASK-116
title: Thread DomainResolver through orchestration and CLI (replace domainsDir)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:package-system'
dependencies:
  - TASK-115
createdAt: '2026-03-28T20:35:30.175Z'
updatedAt: '2026-03-28T20:41:11.444Z'
---

## Description

Replace every `domainsDir: string` call-site with `DomainResolver`. Files touched: `lib/domains/prompt-assembly.ts`, `lib/orchestration/definition-resolution.ts`, `lib/orchestration/session-factory.ts`, `lib/orchestration/agent-spawner.ts`, `lib/orchestration/types.ts`, `cli/session.ts`. Each `join(domainsDir, ...)` becomes a `resolver.resolveXxx(...)` call. Update existing tests to construct resolvers via `DomainResolver.fromSingleDir()`.

<!-- AC:BEGIN -->
- [ ] #1 prompt-assembly.ts accepts DomainResolver instead of domainsDir and uses resolver.resolveCapabilityPath() / resolvePersonaPath()
- [ ] #2 definition-resolution.ts resolveExtensionPaths() uses resolver.resolveExtensionPath() instead of raw join(domainsDir, ...)
- [ ] #3 session-factory.ts accepts DomainResolver instead of domainsDir
- [ ] #4 agent-spawner.ts threads DomainResolver instead of domainsDir
- [ ] #5 ChainConfig and SpawnConfig in lib/orchestration/types.ts replace domainsDir?: string with resolver field
- [ ] #6 cli/session.ts accepts DomainResolver instead of domainsDir
- [ ] #7 All existing tests pass after updating test setup to use DomainResolver.fromSingleDir()
<!-- AC:END -->

## Implementation Notes

Worker completed: replaced domainsDir with DomainResolver in prompt-assembly.ts, definition-resolution.ts, session-factory.ts, agent-spawner.ts, types.ts, cli/session.ts; updated all tests to use fromSingleDir(). Status corrected by coordinator.
