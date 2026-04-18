---
title: >-
  Runtime Consolidation: Unified Bootstrap, Domain Validation, and
  Qualified-Role Utilities
status: completed
createdAt: '2026-03-09T18:56:03.663Z'
updatedAt: '2026-03-18T20:45:34.196Z'
---

## Summary

Consolidate duplicated bootstrap logic into a single `CosmonautsRuntime` object, add load-time validation of domain manifests and agent definitions, and extract qualified-role string utilities into a shared helper module. These three changes eliminate the primary source of recent bugs (scattered initialization), turn runtime surprises into fast startup errors, and remove a class of string-handling drift.

## Scope

**Included:**
1. A new `CosmonautsRuntime` class that loads config, discovers domains, builds both registries, derives workflows, and exposes them as a single immutable snapshot.
2. Load-time validation of domain/agent invariants during `CosmonautsRuntime.create()`.
3. A `lib/agents/qualified-role.ts` utility module replacing inline `baseRoleName`, `qualifyAgentId`, ad-hoc slash parsing, and `roleToConfigKey` scattered across four files.
4. Migration of all four consumer sites (`cli/main.ts`, `cli/session.ts`, `domains/shared/extensions/orchestration/index.ts`, `lib/orchestration/agent-spawner.ts`) to use the new runtime and utilities.
5. Tests for all new modules and updated tests for migrated consumers.

**Excluded:**
- Changes to agent definitions themselves (no new agents or capability changes).
- Changes to the domain loader's discovery mechanism (scan, import, index). That stays in `lib/domains/loader.ts`.
- Workflow validation beyond checking that referenced agent roles exist (no chain-DSL semantic analysis).
- Changes to session persistence, interactive mode, or Pi SDK integration.

**Assumptions:**
- `CosmonautsRuntime` is async to create (domain loading requires `import()`), so it exposes a static `create()` factory.
- The runtime is immutable after creation — no hot-reload of domains.
- Validation errors are collected and thrown as a single aggregate `DomainValidationError` so the user sees all problems at once, not one at a time.

## Approach

### 1. Qualified-Role Utilities (`lib/agents/qualified-role.ts`)

Extract from the scattered inline implementations into a single module:

| Function | Source(s) | Purpose |
|----------|-----------|---------|
| `qualifyRole(id, domain?)` | `runtime-identity.ts:13` `qualifyAgentId` | `"coding" + "worker"` → `"coding/worker"` |
| `unqualifyRole(qualified)` | `agent-spawner.ts:368` `baseRoleName`, `chain-runner.ts:68` `baseRoleName`, `orchestration/index.ts:41-42` inline | `"coding/worker"` → `"worker"` |
| `splitRole(qualified)` | `resolver.ts:117-118` inline, several `indexOf("/")` sites | `"coding/worker"` → `{ domain: "coding", id: "worker" }` |
| `roleToConfigKey(role)` | `agent-spawner.ts:348-366` | `"coding/task-manager"` → `"taskManager"` |

`qualifyAgentId` in `runtime-identity.ts` becomes a re-export of `qualifyRole` for backward compatibility. The private `baseRoleName` functions in `agent-spawner.ts` and `chain-runner.ts` are deleted and replaced with imports of `unqualifyRole`. The inline slash-splitting in `orchestration/index.ts:41-42` is replaced with `unqualifyRole`.

### 2. CosmonautsRuntime (`lib/runtime.ts`)

A new class that centralizes the bootstrap sequence currently duplicated across `cli/main.ts:run()` (lines 183-202), `domains/shared/extensions/orchestration/index.ts:loadRuntimeDomainContext()` (lines 155-164), and `lib/orchestration/agent-spawner.ts` (the `DEFAULT_REGISTRY` constant and per-spawn `resolveModel`).

```
interface CosmonautsRuntime {
  readonly projectConfig: ProjectConfig;
  readonly domains: readonly LoadedDomain[];
  readonly domainRegistry: DomainRegistry;
  readonly agentRegistry: AgentRegistry;
  readonly domainContext: string | undefined;
  readonly domainsDir: string;
  readonly workflows: readonly WorkflowDefinition[];
}
```

Static factory: `CosmonautsRuntime.create(options: { domainsDir: string; projectRoot: string; domainOverride?: string })`.

The factory:
1. Calls `loadProjectConfig(projectRoot)`.
2. Calls `loadDomains(domainsDir)`.
3. Runs domain/agent validation (see §3).
4. Builds `DomainRegistry` and `AgentRegistry` from the loaded domains.
5. Computes effective `domainContext` (override ?? projectConfig.domain).
6. Computes effective workflows via `selectDomainWorkflows`.
7. Returns a frozen runtime object.

**Consumer migration:**

- **`cli/main.ts`**: `run()` replaces its 20-line bootstrap block with `const runtime = await CosmonautsRuntime.create(...)`. Passes `runtime.agentRegistry` where it currently passes `registry`, `runtime.workflows` where it computes `domainWorkflows`, etc.
- **`cli/session.ts`**: Receives `domainsDir` from caller (already computed in main.ts) instead of computing its own `DOMAINS_DIR` constant. Alternatively, receives the full runtime. The session creator doesn't need the runtime *object* — it needs `domainsDir` for prompt assembly and extension resolution, both of which it already parameterizes. The simplest change is to add `domainsDir` to `CreateSessionOptions` and remove the module-level `DOMAINS_DIR` constant.
- **`orchestration/index.ts` (the extension)**: Replaces `loadRuntimeDomainContext()` with a single `CosmonautsRuntime.create()` call. Caches it per-`cwd` to avoid reloading domains on every tool call.
- **`agent-spawner.ts`**: Removes `DEFAULT_REGISTRY`, `DOMAINS_DIR`, and the `createDefaultRegistry()` fallback. `createPiSpawner` already accepts a registry parameter; all callers will now be required to pass one (no more optional). The `resolveModel` helper stays in this file (it's the Pi SDK call) but the duplicated copy in `cli/main.ts` is deleted — main.ts will import it.

### 3. Domain Validation (`lib/domains/validator.ts`)

A validation pass that runs during `CosmonautsRuntime.create()` after domains are loaded but before registries are built. Checks:

| Invariant | How |
|-----------|-----|
| Every agent has a persona prompt | Agent id exists in `domain.prompts` set |
| Every capability exists in domain or shared | Each cap in `agent.capabilities` resolved via `DomainRegistry.resolveCapability` logic (domain-first, shared fallback) |
| Every extension exists in domain or shared | Each ext in `agent.extensions` resolved via same domain-first lookup against `domain.extensions` sets |
| Every `subagents` entry resolves | Each entry in `agent.subagents` must match an agent id in some loaded domain (qualified or unqualified) |
| Every domain lead resolves | `manifest.lead` (if set) must be an agent id in that domain's agents map |
| Workflows reference valid agents | Parse each workflow's chain expression and verify every stage name resolves to an agent |

Errors are collected into an array and thrown as `DomainValidationError` with all issues listed.

The validation function signature:
```
function validateDomains(domains: readonly LoadedDomain[]): DomainValidationDiagnostic[]
```

Each diagnostic has `{ domain: string; agent?: string; message: string; severity: 'error' | 'warning' }`. Errors halt startup. Warnings are logged.

Workflow validation is scoped: if a `domainContext` is set, only workflows from that domain (+ shared) are checked. If no context, all workflows are checked.

### 4. Remove `createDefaultRegistry()` and Static Imports

`lib/agents/resolver.ts` currently imports all 8 coding domain agent definition files statically to build a synchronous `createDefaultRegistry()`. This was a bridge before dynamic domain loading existed. With `CosmonautsRuntime` always providing a dynamically-built registry, `createDefaultRegistry()` and `resolveAgent()` are no longer needed.

**Migration path:**
- `chain-runner.ts:resolveRegistry()` falls back to `createDefaultRegistry()` — change `ChainConfig.registry` from optional to required, remove the fallback.
- `chain-parser.ts:parseChain()` has an optional `registry` parameter defaulting to `createDefaultRegistry()` — make it required.
- `agent-spawner.ts` uses `DEFAULT_REGISTRY` — remove it; `createPiSpawner` already takes `registry`.
- Remove the 8 static agent imports from `resolver.ts`.
- Delete `createDefaultRegistry()` and `resolveAgent()` from the public API.

## Files to Change

### New files
- `lib/agents/qualified-role.ts` — qualify, unqualify, split, roleToConfigKey utilities
- `lib/runtime.ts` — `CosmonautsRuntime` class with static `create()` factory
- `lib/domains/validator.ts` — `validateDomains()` function and `DomainValidationError`
- `tests/agents/qualified-role.test.ts` — tests for the role utility module
- `tests/runtime.test.ts` — tests for `CosmonautsRuntime.create()`
- `tests/domains/validator.test.ts` — tests for domain validation

### Modified files
- `lib/agents/runtime-identity.ts` — `qualifyAgentId` becomes re-export of `qualifyRole` from `qualified-role.ts`
- `lib/agents/resolver.ts` — remove static agent imports, `createDefaultRegistry()`, `resolveAgent()`; update resolver's internal `resolveId` to use `splitRole`
- `lib/agents/index.ts` — update re-exports: add `qualified-role.ts` exports, remove `createDefaultRegistry`/`resolveAgent`
- `lib/orchestration/agent-spawner.ts` — remove `DEFAULT_REGISTRY`, `DOMAINS_DIR`, `baseRoleName`, `roleToConfigKey`, `resolveModel` duplication; import from `qualified-role.ts`; make `registry` param required in `createPiSpawner`
- `lib/orchestration/chain-runner.ts` — remove `baseRoleName` duplicate, `resolveRegistry` helper, and `createDefaultRegistry` import; import `unqualifyRole` from `qualified-role.ts`; make `registry` required in `ChainConfig`
- `lib/orchestration/chain-parser.ts` — make `registry` parameter required in `parseChain`; remove `createDefaultRegistry` import
- `lib/orchestration/types.ts` — make `registry` required in `ChainConfig`
- `cli/main.ts` — replace bootstrap block with `CosmonautsRuntime.create()`; remove local `resolveModel` copy; import from `agent-spawner.ts`
- `cli/session.ts` — add `domainsDir` to `CreateSessionOptions`; remove module-level `DOMAINS_DIR` constant
- `domains/shared/extensions/orchestration/index.ts` — replace `loadRuntimeDomainContext` with cached `CosmonautsRuntime.create()` call; replace inline slash-splitting with `unqualifyRole`
- `tests/orchestration/chain-runner.test.ts` — provide registry explicitly in test configs
- `tests/orchestration/chain-parser.test.ts` — provide registry explicitly
- `tests/orchestration/agent-spawner.test.ts` — update for required registry param
- `tests/orchestration/agent-spawner.spawn.test.ts` — update for required registry param
- `tests/cli/main.test.ts` — update if bootstrap path changes
- `tests/extensions/orchestration.test.ts` — update for new runtime-based path

## Risks

1. **Breaking the synchronous `createDefaultRegistry()` bridge.** Several test files use it. Every call site must be migrated. Grep for `createDefaultRegistry` and `resolveAgent` to ensure none are missed.
2. **Cached runtime in the orchestration extension.** If the extension caches the runtime per-cwd, a domain change during a session won't be picked up. This is acceptable — domains don't change at runtime — but worth noting.
3. **Validation strictness.** Some existing agent definitions might fail validation (e.g., a subagent entry that doesn't exist yet). Start with errors only for things that would cause runtime failures (missing persona prompt, missing capability). Use warnings for softer issues (subagent entry that doesn't resolve — could be a future domain).
4. **Test isolation.** Domain loader tests use temp directories with minimal manifests. Validation running inside `CosmonautsRuntime.create()` could fail on incomplete test fixtures. The validator should be callable independently so tests can use `loadDomains` without triggering validation.

## Implementation Order

1. **`lib/agents/qualified-role.ts` + tests** — Pure utility with no dependencies. Can be written and verified independently. Unblocks all downstream steps.
2. **`lib/domains/validator.ts` + tests** — Depends only on `LoadedDomain` types and the role utilities. Tests use temp-dir fixtures like existing loader tests.
3. **`lib/runtime.ts` + tests** — Composes config loading, domain loading, validation, registry construction. Tests verify the full bootstrap sequence.
4. **Migrate `lib/orchestration/agent-spawner.ts`** — Remove duplicates, import utilities, make registry required. Update its tests.
5. **Migrate `lib/orchestration/chain-runner.ts` and `chain-parser.ts`** — Remove duplicates, make registry required. Update their tests.
6. **Migrate `cli/main.ts` and `cli/session.ts`** — Replace bootstrap block, remove `resolveModel` copy, pass `domainsDir` to session. Update CLI tests.
7. **Migrate `domains/shared/extensions/orchestration/index.ts`** — Replace `loadRuntimeDomainContext` with cached runtime. Update extension tests.
8. **Clean up `lib/agents/resolver.ts` and `lib/agents/index.ts`** — Remove `createDefaultRegistry`, `resolveAgent`, static imports. Final re-export audit.
