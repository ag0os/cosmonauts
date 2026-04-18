---
id: TASK-066
title: Add CLI domain support with --domain and --list-domains flags
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-059
  - TASK-060
  - TASK-062
  - TASK-063
  - TASK-064
  - TASK-065
createdAt: '2026-03-09T16:04:24.612Z'
updatedAt: '2026-03-09T19:41:00.000Z'
---

## Description

Update the CLI to support domain selection and discovery, and bootstrap domain loading at the entry point.

**Changes to `cli/types.ts`:**
- Add `domain?: string` and `listDomains: boolean` to `CliOptions`

**Changes to `cli/main.ts`:**
- Add `--domain` / `-d` flag for domain context selection
- Add `--list-domains` flag to print discovered domains and exit
- Bootstrap: call `loadDomains()` once at startup, build `DomainRegistry` and `AgentRegistry`
- Replace all `createDefaultRegistry()` calls with the bootstrapped registry
- Replace `COSMO_DEFINITION` import with registry lookup (e.g. `registry.resolve("cosmo", "coding")`)
- `--list-agents` optionally filtered by domain when `-d` is also passed
- `--list-workflows` includes domain-sourced workflows
- Agent resolution uses `registry.resolve(agentId, domainContext)` where context comes from `--domain` flag or project config `domain` field

**Reference:** Plan section "CLI updates". Spec section "CLI Additions". Current CLI at `cli/main.ts`.

<!-- AC:BEGIN -->
- [x] #1 --domain / -d flag sets domain context for agent resolution
- [x] #2 --list-domains prints all discovered domain IDs with descriptions and exits
- [x] #3 Domain loading is bootstrapped once at CLI startup
- [x] #4 No createDefaultRegistry() calls remain in cli/main.ts
- [x] #5 COSMO_DEFINITION is no longer directly imported — resolved via registry
- [x] #6 --list-agents respects --domain filter when both are provided
- [x] #7 Agent resolution uses domain context from --domain flag or project config
- [x] #8 CLI tests verify new flags and domain-aware behavior
<!-- AC:END -->

## Implementation Notes

- Added `domain?: string` and `listDomains: boolean` fields to `CliOptions` in `cli/types.ts`
- Added `-d, --domain <id>` and `--list-domains` Commander options in `cli/main.ts`
- Replaced `cosmoDefinition` direct import with `registry.resolve("cosmo", domainContext)`
- Replaced `createDefaultRegistry()` with `createRegistryFromDomains(domains)` using dynamically loaded domains
- Domain context priority: `--domain` CLI flag > `projectConfig.domain` from `.cosmonauts/config.json`
- `--list-agents` with `--domain` uses `registry.resolveInDomain()` to filter by domain
- Added 5 new test cases plus updated defaults test to cover domain and listDomains fields
