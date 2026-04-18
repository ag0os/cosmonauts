---
source: archive
plan: domain-config
distilledAt: 2026-04-17T00:00:00.000Z
---

# Domain Configuration Architecture

## What Was Built

Restructured the entire Cosmonauts project from a flat, centralized layout into a convention-based multi-domain architecture. All prompts, capabilities, skills, and extensions moved from root-level `prompts/`, `skills/`, and `extensions/` directories into `domains/shared/` and `domains/coding/`. A new `lib/domains/` module handles automatic discovery, loading, and resource resolution. Agent IDs are now domain-qualified (`coding/worker`), prompts are assembled by four-layer convention, and the CLI gained `--domain`/`-d` and `--list-domains` flags.

## Key Decisions

- **Three-layer architecture (Framework / Domain / Executive-Assistant)**: The framework in `lib/` is domain-agnostic — no coding knowledge lives there. Each domain in `domains/{id}/` is self-contained. The executive-assistant layer (Layer 3) was explicitly deferred and not implemented.
- **`capabilities` replaces `prompts` in AgentDefinition**: The old `prompts` array listed file paths manually. The new `capabilities` array lists unqualified capability names (e.g. `["core", "tasks"]`). Base and persona prompts are auto-injected by convention — never list them in capabilities.
- **Qualified agent IDs throughout**: All internal keys use `{domain}/{agent}` (e.g. `coding/worker`). Subagents allowlists in definitions must use qualified IDs. Display-only contexts strip the domain prefix.
- **Registry as parameter, not module-level singleton**: Five files had `DEFAULT_REGISTRY = createDefaultRegistry()` at module scope. These were all converted to accept registry as a parameter. `createDefaultRegistry()` is kept only as a test convenience; do not call it in production paths.

## Patterns Established

- **Four-layer prompt assembly**: `assemblePrompts()` in `lib/domains/prompt-assembly.ts` assembles: Layer 0 (`base.md`, always) → Layer 1 (capabilities, domain-first then shared fallback) → Layer 2 (persona, auto-loaded) → Layer 3 (sub-agent runtime template, conditional). Concatenated with `\n\n`. Never construct system prompts manually.
- **Domain-first then shared fallback**: All resource resolution (capabilities, skills, extensions) checks `domains/{agent-domain}/{type}/{name}` first, then `domains/shared/{type}/{name}`. Missing capabilities are errors; missing extensions are silently skipped. Use `DomainRegistry.resolveCapability()` rather than building paths manually.
- **Domain context priority chain**: `--domain` CLI flag → `projectConfig.domain` → scan-all with ambiguity error. Always accept domain context as an explicit parameter and propagate it.
- **`shared` loads first**: `loadDomains()` sorts so `shared` comes before all other domains alphabetically. Do not rely on filesystem ordering — the explicit sort is the guarantee.
- **`domain.ts` manifest required for discovery**: Directories under `domains/` without a `domain.ts` are silently skipped. The manifest supports both `export default` and `export const manifest`.

## Files Changed

- `lib/domains/` — New module: `loader.ts` (discovery), `registry.ts` (DomainRegistry class), `prompt-assembly.ts` (four-layer assembly), `types.ts` (DomainManifest, LoadedDomain interfaces), `index.ts`
- `lib/agents/types.ts` — Replaced `prompts` with `capabilities`, removed `namespace`, added runtime `domain?` field
- `lib/agents/resolver.ts` — Qualified ID support, domain-context resolution, `resolveInDomain()`, `createRegistryFromDomains()`
- `lib/agents/runtime-identity.ts` — Regex updated to `[a-z0-9/-]+` to capture qualified IDs
- `lib/orchestration/agent-spawner.ts`, `cli/session.ts` — Replaced `loadPrompts()` with `assemblePrompts()`; removed module-level registry singleton
- `lib/orchestration/chain-parser.ts`, `chain-runner.ts` — Registry threaded as parameter; removed module-level singletons
- `lib/workflows/loader.ts` — Merges domain `workflows.ts` exports with project config; project config takes precedence on collision
- `cli/main.ts`, `cli/types.ts` — Added `--domain`/`-d`, `--list-domains`; bootstraps domain loading at startup
- `domains/shared/extensions/orchestration/index.ts` — `isSubagentAllowed()` checks both qualified and unqualified IDs; `roleLabel()` strips domain prefix for display
- All `domains/shared/extensions/*/index.ts` — Relative imports updated for new directory depth

## Gotchas & Lessons

- **Extension import depth**: Moving `extensions/X/` to `domains/shared/extensions/X/` adds two directory levels. Every relative import `../../lib/` inside an extension must become `../../../../lib/`. This is not caught until runtime — always run `bun run typecheck` after moving extensions.
- **Never leave prompt paths and consumers out of sync**: After moving prompt files (TASK-055), all subsequent agent spawns immediately broke because the spawner still pointed to old paths. Migrate file paths and update all consumers in the same operation.
- **`isSubagentAllowed` accepts both ID forms during transition**: The orchestration extension checks both `targetDef.id` (unqualified) and `${targetDef.domain}/${targetDef.id}` (qualified) against the caller's subagents list. New definitions should use qualified IDs exclusively.
- **AC #4 deferred in TASK-062**: Domain-aware extension resolution (checking agent's own domain dir before shared) was not implemented. Extension paths still hardcode `domains/shared/extensions`. This is a known gap if a non-shared domain ever needs its own extensions.
- **Dynamic `import()` of `.ts` files works natively in Bun**: The domain loader uses `import()` for `domain.ts`, `agents/*.ts`, and `workflows.ts`. No compilation step needed. For tests, write fixture `.ts` files to temp directories and import via absolute `file://` URLs.
