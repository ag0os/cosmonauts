---
source: archive
plan: runtime-consolidation
distilledAt: 2026-04-17T00:00:00.000Z
---

# Runtime Consolidation: Unified Bootstrap, Domain Validation, and Qualified-Role Utilities

## What Was Built

Introduced `CosmonautsRuntime` (`lib/runtime.ts`) as a single immutable bootstrap container: one `create()` call loads config, discovers domains, validates them, and builds both registries. Extracted all scattered role-string manipulation into `lib/agents/qualified-role.ts`. Added `lib/domains/validator.ts` for load-time invariant checking. Migrated all four consumer sites — CLI, chain runner, agent spawner, and the orchestration extension — off their independent bootstrap sequences. Removed `createDefaultRegistry()` and `resolveAgent()` entirely.

## Key Decisions

- **Single runtime over per-consumer bootstrapping**: CLI, chain runner, spawner, and orchestration extension each independently loaded config and built registries. Any consumer that omitted an explicit registry silently fell back to a static registry built from 8 hardcoded coding-agent imports — diverging from the dynamically-loaded one. `CosmonautsRuntime.create()` is now the one bootstrap path.
- **`create()` factory + `Object.freeze()`**: Runtime is async (domain loading requires dynamic `import()`) and immutable after construction. No hot-reload. Domain changes mid-session are not reflected — accepted trade-off since domains don't change at runtime.
- **Validation errors aggregate, not fail-fast**: `DomainValidationError` collects all error-severity diagnostics before throwing, so operators see all problems at once rather than fixing one and re-starting to find the next.
- **Subagent resolution is a warning, not an error**: Agent definitions commonly reference agents in not-yet-loaded domains. Promoting this to an error would block legitimate cross-domain forward references.

## Patterns Established

- **Always inject registry/runtime — never build locally.** `createPiSpawner(registry, domainsDir)`, `parseChain(expression, registry, domainContext?)`, and `ChainConfig.registry` are all required. `AgentRegistry` constructor requires a `builtins` parameter with no default. Any new consumer must receive the runtime or registry from its caller.
- **Use `lib/agents/qualified-role.ts` for all `<domain>/<agent>` string operations.** Never inline `indexOf('/')` or `split('/')`. Use `qualifyRole`, `unqualifyRole`, `splitRole`, `roleToConfigKey`. `qualifyAgentId` in `runtime-identity.ts` is now a re-export alias for backward compat.
- **Cache runtime per-cwd inside the extension closure, not at module level.** The orchestration extension stores its `Map<string, Promise<CosmonautsRuntime>>` inside the closure returned by the extension factory function. Each extension instance gets its own cache — this is what makes tests that create fresh extension instances get fresh caches.
- **Widen function signatures to `readonly T[]` when accepting runtime properties.** `runtime.workflows` and similar fields are `readonly`. Functions that receive them must accept `readonly WorkflowDefinition[]`, not `WorkflowDefinition[]`.
- **Migration order for scattered-bootstrap consolidation**: utilities → validator → runtime → spawner → runner/parser → CLI → extension → cleanup. Doing utilities before consumers and runtime before CLI avoids circular migration issues.

## Files Changed

- `lib/runtime.ts` *(new)* — `CosmonautsRuntime` class with static `create()` factory; the single bootstrap entry point
- `lib/agents/qualified-role.ts` *(new)* — `qualifyRole`, `unqualifyRole`, `splitRole`, `roleToConfigKey`
- `lib/domains/validator.ts` *(new)* — `validateDomains()` pure function, `DomainValidationDiagnostic` type, `DomainValidationError` class
- `lib/agents/resolver.ts` — removed `createDefaultRegistry`, `resolveAgent`, 8 static coding-agent imports; `AgentRegistry` constructor now requires `builtins`
- `lib/agents/runtime-identity.ts` — `qualifyAgentId` is now a re-export of `qualifyRole`
- `lib/agents/index.ts` — added qualified-role exports; removed `createDefaultRegistry`/`resolveAgent`
- `lib/orchestration/agent-spawner.ts` — removed `DEFAULT_REGISTRY`, `DOMAINS_DIR`, `baseRoleName`, `roleToConfigKey`; `createPiSpawner` now requires both `registry` and `domainsDir`; `resolveModel` exported
- `lib/orchestration/chain-runner.ts` — removed `resolveRegistry` fallback, `baseRoleName`; `registry` required
- `lib/orchestration/chain-parser.ts` — `registry` required in `parseChain`
- `lib/orchestration/types.ts` — `ChainConfig.registry` required
- `cli/main.ts` — replaced 20-line bootstrap block with `CosmonautsRuntime.create()`; imports `resolveModel` from agent-spawner
- `cli/session.ts` — removed module-level `DOMAINS_DIR`; accepts `domainsDir` via `CreateSessionOptions`
- `domains/shared/extensions/orchestration/index.ts` — replaced `loadRuntimeDomainContext` + `DOMAINS_DIR` with per-cwd cached runtime; `unqualifyRole` replaces inline slash-split
- `lib/workflows/loader.ts` — widened signatures to accept `readonly WorkflowDefinition[]`

## Gotchas & Lessons

- **The dual-registry bug is silent.** Optional `registry` parameters with `createDefaultRegistry()` as default don't fail loudly — they just use stale definitions. The bug shows up as agents resolving correctly in CLI but not in spawned sub-agents (or vice versa). Grep for `createDefaultRegistry` and `resolveAgent` after any future refactor to confirm zero call sites remain.
- **`validateDomains` must stay independent of runtime construction.** Domain loader tests use minimal temp-dir fixtures that would fail validation (no persona prompts, etc.). The validator is a pure function callable without a runtime; `CosmonautsRuntime.create()` calls it internally but tests can call `loadDomains()` directly and skip it.
- **Frozen runtime properties reject mutable-typed functions.** `runtime.workflows` is `readonly WorkflowDefinition[]`. Passing it to any function typed `(workflows: WorkflowDefinition[])` is a TypeScript error. Widen the receiving signature; do not cast with `as`.
- **Extension-level runtime cache must live in the closure, not the module.** A module-level `Map` leaks state across test runs. The closure-scoped cache is reset whenever a new extension instance is created, which is what tests do.
