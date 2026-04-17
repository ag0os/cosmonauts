---
id: TASK-052
title: Create domain types and manifest files
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies: []
createdAt: '2026-03-09T16:01:33.921Z'
updatedAt: '2026-03-09T16:13:06.628Z'
---

## Description

Create the foundational type definitions for the domain system and the initial domain manifest files. This establishes the `domains/` directory structure and the TypeScript interfaces that all subsequent domain work depends on.

**New files:**
- `lib/domains/types.ts` — `DomainManifest`, `LoadedDomain` interfaces per spec
- `domains/shared/domain.ts` — shared domain manifest (id: "shared", description of shared capabilities)
- `domains/coding/domain.ts` — coding domain manifest (id: "coding", lead: "cosmo")
- Create empty directory structure: `domains/shared/{prompts,capabilities,skills,extensions}` and `domains/coding/{agents,prompts,capabilities,skills}`

**Reference:** `lib/agents/types.ts` for existing type conventions. Spec section "Domain Manifest Type" for exact interfaces.

<!-- AC:BEGIN -->
- [x] #1 DomainManifest interface exists in lib/domains/types.ts with id, description, lead?, and defaultModel? fields
- [x] #2 LoadedDomain interface exists with manifest, agents, capabilities, prompts, skills, extensions, workflows, and rootDir fields
- [x] #3 domains/shared/domain.ts exports a valid DomainManifest with id 'shared'
- [x] #4 domains/coding/domain.ts exports a valid DomainManifest with id 'coding'
- [x] #5 Domain directory structure exists with expected subdirectories for both shared and coding domains
- [x] #6 Unit tests verify manifest exports and type correctness
<!-- AC:END -->

## Implementation Notes

Verified all 6 ACs against prior implementation (commit d09ffbe). All files exist and are correct. All 19 unit tests pass. Typecheck errors are pre-existing and unrelated to domain types.
