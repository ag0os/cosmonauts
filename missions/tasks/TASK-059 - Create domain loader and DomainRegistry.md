---
id: TASK-059
title: Create domain loader and DomainRegistry
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-052
  - TASK-054
createdAt: '2026-03-09T16:03:04.090Z'
updatedAt: '2026-03-09T21:28:00.000Z'
---

## Description

Build the domain discovery and loading system that scans the `domains/` directory at startup, imports manifests and agent definitions, and indexes all domain resources.

**New files:**
- `lib/domains/loader.ts` — `loadDomains(domainsDir)` function
- `lib/domains/registry.ts` — `DomainRegistry` class
- `lib/domains/index.ts` — re-exports

**`loadDomains(domainsDir)` performs:**
1. `readdir(domainsDir)` → filter to directories containing `domain.ts`
2. Sort: `shared` first, then alphabetical
3. For each domain:
   a. `import()` the `domain.ts` to get manifest
   b. Walk `agents/*.ts`, `import()` each, stamp `domain` field
   c. Index `capabilities/*.md`, `prompts/*.md`, `skills/`, `extensions/` directories
   d. `import()` `workflows.ts` if present
4. Return a `DomainRegistry` with all domains loaded

**DomainRegistry API:**
- `getDomain(id)` — get a LoadedDomain by ID
- `listDomains()` — all loaded domains
- `getAllAgents()` — all agents across all domains (Map<qualifiedId, AgentDefinition>)
- `getWorkflows()` — merged workflows from all domains

**Reference:** Plan section "Domain loader". Uses types from `lib/domains/types.ts` (TASK-052). Dynamic `import()` for `.ts` files works natively in Bun.

**Tests:** Create temp directory trees with valid `.ts` module files to test discovery, load order (shared first), agent stamping, and resource indexing.

<!-- AC:BEGIN -->
- [x] #1 loadDomains function exists in lib/domains/loader.ts and scans a domains directory
- [x] #2 shared domain is always loaded first regardless of directory ordering
- [x] #3 Agent definitions are dynamically imported and stamped with their domain ID
- [x] #4 Capabilities, prompts, skills, and extensions directories are indexed per domain
- [x] #5 workflows.ts is imported when present in a domain directory
- [x] #6 DomainRegistry class provides lookup methods for domains, agents, and workflows
- [x] #7 lib/domains/index.ts re-exports all public types and functions
- [x] #8 Tests verify discovery, load order, agent stamping, and resource indexing
<!-- AC:END -->

## Implementation Notes

**Files created:**
- `lib/domains/loader.ts` — `loadDomains()` scans domains directory, imports manifests (supports both default and named `manifest` export), dynamically imports agent definitions, indexes resources
- `lib/domains/registry.ts` — `DomainRegistry` class with `get`, `has`, `listIds`, `listAll`, and `resolveCapability` (domain-first with shared fallback)
- `lib/domains/index.ts` — Re-exports loader, registry, prompt-assembly, and types
- `tests/domains/loader.test.ts` — 13 tests covering discovery, sort order, skipping, agent stamping, resource indexing, workflows, empty dirs
- `tests/domains/registry.test.ts` — 12 tests covering construction, lookups, capability resolution

**Design decisions:**
- `resolveCapability` uses two-tier resolution: preferred domain first, then shared fallback — matches the prompt assembly pattern
- Manifest import supports both `export default` and `export const manifest` (existing domain.ts files use named export)
- Resource indexing is non-recursive: capabilities/prompts index top-level .md files, skills/extensions index subdirectory names
- Domains without a `domain.ts` file are silently skipped (not errors)
