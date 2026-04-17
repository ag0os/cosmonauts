---
id: TASK-120
title: 'Multi-source domain loading: loadDomainsFromSources() with merge strategy'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:package-system'
dependencies:
  - TASK-113
  - TASK-114
createdAt: '2026-03-28T20:36:03.965Z'
updatedAt: '2026-03-28T20:48:47.402Z'
---

## Description

Add `loadDomainsFromSources(sources, mergeStrategy?)` to `lib/domains/loader.ts`. Loads domains from all `DomainSource[]`, detects same-ID domains across sources, invokes `MergeStrategy` callback to decide merge/replace/skip, and returns a unified `LoadedDomain[]`. Define `DomainMergeConflict` and `MergeStrategy` types. Update `lib/domains/index.ts` exports. Update tests in `tests/domains/loader.test.ts`.

<!-- AC:BEGIN -->
- [ ] #1 loadDomainsFromSources() accepts DomainSource[] and returns LoadedDomain[]
- [ ] #2 DomainMergeConflict type describes overlapping agents, capabilities, skills, extensions, and prompts between two sources
- [ ] #3 MergeStrategy callback is invoked for each same-ID domain conflict
- [ ] #4 Default strategy (when omitted) is merge: union of resources with higher-precedence source winning on file conflicts
- [ ] #5 Merged LoadedDomain tracks rootDirs as ordered array for downstream path resolution
- [ ] #6 Tests cover: single source, multi-source no conflicts, merge strategy, replace strategy, skip strategy
<!-- AC:END -->

## Implementation Notes

Implemented loadDomainsFromSources() in lib/domains/loader.ts. Changed LoadedDomain.rootDir: string to rootDirs: readonly string[] — updated all consumers (resolver.ts, runtime.ts, skills/discovery.ts) and all test fixtures. DomainSource, DomainMergeConflict, MergeStrategy types added to lib/domains/types.ts. Default merge strategy unions resources with incoming (higher-precedence) winning on agent key conflicts. Sources sorted ascending by precedence so incoming always has higher precedence. The prompt-assembly.test.ts (pre-existing changes from another task) also needed the rootDirs fix. All 1057 tests pass.
