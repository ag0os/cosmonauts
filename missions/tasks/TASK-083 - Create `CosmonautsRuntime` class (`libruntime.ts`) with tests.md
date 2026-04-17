---
id: TASK-083
title: Create `CosmonautsRuntime` class (`lib/runtime.ts`) with tests
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:runtime-consolidation'
dependencies:
  - TASK-081
  - TASK-082
createdAt: '2026-03-10T13:53:14.698Z'
updatedAt: '2026-03-10T17:11:25.770Z'
---

## Description

Create a new `CosmonautsRuntime` class at `lib/runtime.ts` that centralizes the bootstrap sequence currently duplicated across `cli/main.ts:run()` (lines 183-202), `domains/shared/extensions/orchestration/index.ts:loadRuntimeDomainContext()` (lines 155-164), and `lib/orchestration/agent-spawner.ts` (the `DEFAULT_REGISTRY` constant).

The class exposes a static async `create()` factory that:
1. Calls `loadProjectConfig(projectRoot)`
2. Calls `loadDomains(domainsDir)`
3. Runs `validateDomains()` — throws `DomainValidationError` on error-severity diagnostics, logs warnings to stderr
4. Builds `DomainRegistry` and `AgentRegistry` from loaded domains via `createRegistryFromDomains`
5. Computes effective `domainContext` (override ?? projectConfig.domain)
6. Computes effective workflows via `selectDomainWorkflows`
7. Returns a frozen immutable runtime object

Interface per spec:
```typescript
interface CosmonautsRuntimeOptions {
  domainsDir: string;
  projectRoot: string;
  domainOverride?: string;
}

class CosmonautsRuntime {
  readonly projectConfig: ProjectConfig;
  readonly domains: readonly LoadedDomain[];
  readonly domainRegistry: DomainRegistry;
  readonly agentRegistry: AgentRegistry;
  readonly domainContext: string | undefined;
  readonly domainsDir: string;
  readonly workflows: readonly WorkflowDefinition[];
  readonly projectSkills: readonly string[] | undefined;
  static async create(options: CosmonautsRuntimeOptions): Promise<CosmonautsRuntime>;
}
```

Create tests at `tests/runtime.test.ts`.

<!-- AC:BEGIN -->
- [ ] #1 Module `lib/runtime.ts` exports `CosmonautsRuntime` class and `CosmonautsRuntimeOptions` type
- [ ] #2 `CosmonautsRuntime.create()` loads config, domains, validates, builds registries, computes domain context and workflows
- [ ] #3 The returned runtime object is immutable (frozen)
- [ ] #4 Validation errors during `create()` throw `DomainValidationError` with all issues aggregated
- [ ] #5 Validation warnings are emitted to stderr without halting startup
- [ ] #6 Tests verify the full bootstrap sequence including validation integration, domain context resolution (override vs config), and workflow selection
<!-- AC:END -->

## Implementation Notes

Implemented `CosmonautsRuntime` class at `lib/runtime.ts` with static `create()` factory that performs the full bootstrap sequence: loadProjectConfig → loadDomains → validateDomains → build DomainRegistry + AgentRegistry → compute domainContext (override ?? config) → selectDomainWorkflows → return frozen immutable runtime.\n\nExports: `CosmonautsRuntime` class and `CosmonautsRuntimeOptions` interface.\n\n18 tests at `tests/runtime.test.ts` covering:\n- Full bootstrap (config, domains, registries)\n- projectSkills propagation\n- Agent/domain registry construction\n- Immutability (Object.isFrozen, rejects assignment)\n- Domain context resolution (override vs config vs undefined)\n- Workflow selection (matching domain, all domains, filtering)\n- Validation errors throw DomainValidationError with aggregated diagnostics\n- Warnings emitted to stderr without halting\n- Full integration test with all fields populated\n\nCommit: 4ed5a78"
