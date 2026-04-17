---
id: TASK-060
title: Refactor AgentRegistry for qualified IDs and domain-context resolution
status: Done
priority: high
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-059
createdAt: '2026-03-09T16:03:17.698Z'
updatedAt: '2026-03-09T16:03:17.698Z'
---

## Description

Update `lib/agents/resolver.ts` to support domain-qualified agent IDs (`coding/worker`) and domain-context resolution.

**Changes to AgentRegistry class:**
- Keys become fully qualified `{domain}/{agent}` (e.g. `coding/worker`)
- New `resolve(id: string, domainContext?: string)` overload:
  - If `id` contains `/`, treat as qualified — direct lookup
  - If unqualified + `domainContext`, try `{domainContext}/{id}`
  - If unqualified + no context, scan all domains — error if ambiguous
- New `resolveInDomain(domain: string): AgentDefinition[]` method
- New `createRegistryFromDomains(domains: DomainRegistry): AgentRegistry` factory
- Remove `createDefaultRegistry()` and `resolveAgent()` convenience functions
- Backward compat: `get(id)` works with both qualified and unqualified IDs

**Reference:** Plan section "AgentRegistry changes". Spec section "Registry API" for target interface. Current implementation at `lib/agents/resolver.ts`.

<!-- AC:BEGIN -->
- [x] #1 AgentRegistry stores agents with qualified {domain}/{agent} keys
- [x] #2 resolve(id) with qualified ID performs direct lookup
- [x] #3 resolve(id, domainContext) with unqualified ID tries {domainContext}/{id}
- [x] #4 resolve(id) with unqualified ID and no context scans all domains and errors on ambiguity
- [x] #5 resolveInDomain(domain) returns all agents for a given domain
- [x] #6 createRegistryFromDomains factory function creates a registry from a DomainRegistry
- [x] #7 createDefaultRegistry and resolveAgent kept as sync bridges (callers not yet migrated to async)
- [x] #8 Tests cover qualified lookup, unqualified with context, unqualified ambiguity error, and resolveInDomain
<!-- AC:END -->
