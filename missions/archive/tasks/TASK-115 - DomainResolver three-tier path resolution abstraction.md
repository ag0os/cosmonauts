---
id: TASK-115
title: 'DomainResolver: three-tier path resolution abstraction'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:package-system'
dependencies:
  - TASK-113
createdAt: '2026-03-28T20:35:22.677Z'
updatedAt: '2026-03-28T20:42:43.174Z'
---

## Description

Create `lib/domains/resolver.ts` implementing the `DomainResolver` class. Encapsulates three-tier resolution: agent domain → portable domains → shared. Includes `DomainResolver.fromSingleDir()` static factory for backward-compatible single-directory use. Add tests in `tests/domains/resolver.test.ts`.

<!-- AC:BEGIN -->
- [ ] #1 DomainResolver class exists in lib/domains/resolver.ts with resolveCapabilityPath(), resolvePersonaPath(), resolveBasePath(), resolveRuntimeTemplatePath(), resolveExtensionPath(), and allSkillDirs() methods
- [ ] #2 Resolution follows three-tier order: agent's own domain → portable domains (in discovery order) → shared
- [ ] #3 shared domain always resolves last regardless of portable flag
- [ ] #4 DomainResolver.fromSingleDir(dir, domains) static factory constructs a resolver from a single directory for backward compatibility
- [ ] #5 resolver.registry getter returns the underlying DomainRegistry
- [ ] #6 Tests cover all three tiers, portable domain ordering, and fromSingleDir behavior
<!-- AC:END -->

## Implementation Notes

Created lib/domains/resolver.ts with DomainResolver class. Uses domain.portable (the resolved boolean on LoadedDomain) rather than manifest.portable. The fromSingleDir factory accepts dir as first arg (unused internally since LoadedDomain carries rootDir) for backward compat call sites. allSkillDirs() returns skill dirs for all domains with non-shared first, shared last. 31 tests cover all tiers, portable ordering, fromSingleDir, and shared-always-last invariant.
