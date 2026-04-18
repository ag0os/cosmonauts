---
title: Domain Configuration Architecture
status: completed
createdAt: '2026-03-09T15:58:49.434Z'
updatedAt: '2026-03-26T18:17:11.430Z'
---

## Summary

Restructure the Cosmonauts project from centralized agent/prompt/skill/extension organization into a convention-based, multi-domain directory layout. Each domain is a self-contained directory (`domains/{id}/`) with a fixed shape containing agents, prompts, capabilities, skills, extensions, and workflows. The framework discovers and wires everything automatically by scanning the `domains/` directory at startup.

## Scope

**Included:**
- New `domains/` directory tree with `shared/` and `coding/` domains
- Domain manifest type and per-domain `domain.ts` files
- Domain discovery/loader that scans `domains/` and registers everything
- Convention-based `AgentDefinition` type (replace `prompts` with `capabilities`, remove `namespace`)
- Agent definitions moved from `lib/agents/definitions.ts` to individual `domains/coding/agents/*.ts` files
- Prompt files moved from `prompts/` to `domains/shared/` and `domains/coding/` per spec
- Capabilities moved from `prompts/capabilities/` to `domains/shared/capabilities/` and `domains/coding/capabilities/`
- Skills moved from `skills/` to `domains/shared/skills/` and `domains/coding/skills/`
- Extensions moved from `extensions/` to `domains/shared/extensions/`
- Automatic prompt assembly (base → capabilities → persona → runtime) replacing manual `prompts` arrays
- Namespaced agent IDs (`coding/worker`, `shared/diagnostics`) with domain-qualified registry
- Domain-first-then-shared resolution for capabilities, skills, and extensions
- Workflow resolution from domain `workflows.ts` files merged with project config
- Chain parser support for qualified agent names (`coding/planner -> coding/worker`)
- CLI `--domain` / `-d` flag and `--list-domains` discovery command
- Project config `domain` field for default domain
- Updated `package.json` `pi.skills` and `pi.extensions` paths
- All affected tests updated or rewritten

**Excluded:**
- New domains beyond `shared` and `coding` (future work)
- Cross-domain workflow testing (deferred until a second domain exists)
- Executive assistant layer (Layer 3 from architecture doc)
- `shared/agents/` directory population (spec says "optional, future")

**Assumptions:**
- The `domains/` directory lives at the project root, sibling to `lib/`, `cli/`, etc.
- All existing prompt content is preserved verbatim — only file paths change
- `shared` is always loaded first during domain discovery
- The existing `prompts/`, `skills/`, and `extensions/` directories are deleted after migration
- The `pi.extensions` and `pi.skills` paths in `package.json` are updated to point to domains

## Approach

### Domain directory layout

Create `domains/shared/` and `domains/coding/` with the exact structure from the spec. Move existing files:

| Current path | New path |
|---|---|
| `prompts/cosmonauts.md` | `domains/shared/prompts/base.md` |
| `prompts/runtime/sub-agent.md` | `domains/shared/prompts/runtime/sub-agent.md` |
| `prompts/capabilities/core.md` | `domains/shared/capabilities/core.md` |
| `prompts/capabilities/tasks.md` | `domains/shared/capabilities/tasks.md` |
| `prompts/capabilities/spawning.md` | `domains/shared/capabilities/spawning.md` |
| `prompts/capabilities/todo.md` | `domains/shared/capabilities/todo.md` |
| `prompts/capabilities/coding-readwrite.md` | `domains/coding/capabilities/coding-readwrite.md` |
| `prompts/capabilities/coding-readonly.md` | `domains/coding/capabilities/coding-readonly.md` |
| `prompts/agents/coding/cosmo.md` | `domains/coding/prompts/cosmo.md` |
| `prompts/agents/coding/planner.md` | `domains/coding/prompts/planner.md` |
| `prompts/agents/coding/worker.md` | `domains/coding/prompts/worker.md` |
| `prompts/agents/coding/coordinator.md` | `domains/coding/prompts/coordinator.md` |
| `prompts/agents/coding/task-manager.md` | `domains/coding/prompts/task-manager.md` |
| `prompts/agents/coding/quality-manager.md` | `domains/coding/prompts/quality-manager.md` |
| `prompts/agents/coding/reviewer.md` | `domains/coding/prompts/reviewer.md` |
| `prompts/agents/coding/fixer.md` | `domains/coding/prompts/fixer.md` |
| `skills/domains/archive/` | `domains/shared/skills/archive/` |
| `skills/domains/plan/` | `domains/shared/skills/plan/` |
| `skills/domains/roadmap/` | `domains/shared/skills/roadmap/` |
| `skills/domains/task/` | `domains/shared/skills/task/` |
| `skills/languages/typescript/` | `domains/coding/skills/languages/typescript/` |
| `extensions/tasks/` | `domains/shared/extensions/tasks/` |
| `extensions/plans/` | `domains/shared/extensions/plans/` |
| `extensions/orchestration/` | `domains/shared/extensions/orchestration/` |
| `extensions/todo/` | `domains/shared/extensions/todo/` |
| `extensions/init/` | `domains/shared/extensions/init/` |

### Domain manifest type and files

New file `lib/domains/types.ts` with the `DomainManifest` interface. Each domain gets a `domain.ts` exporting a manifest:

```typescript
interface DomainManifest {
  id: string;
  description: string;
  lead?: string;
  defaultModel?: string;
}
```

### AgentDefinition type changes

In `lib/agents/types.ts`:
- Remove `namespace?: string` field
- Replace `prompts: readonly string[]` with `capabilities: readonly string[]`
- Add `domain?: string` (set at runtime by the domain loader, not in definition files)

The `capabilities` array contains unqualified capability pack names (e.g. `["core", "tasks", "coding-readwrite"]`). The framework resolves them to file paths during prompt assembly.

### Convention-based agent definitions

Delete `lib/agents/definitions.ts`. Create individual files in `domains/coding/agents/`:
- `cosmo.ts`, `planner.ts`, `worker.ts`, `coordinator.ts`, `task-manager.ts`, `quality-manager.ts`, `reviewer.ts`, `fixer.ts`

Each exports a default `AgentDefinition` using `capabilities` instead of `prompts`, without `namespace`.

### Domain loader (new module: `lib/domains/`)

New files:
- `lib/domains/types.ts` — `DomainManifest`, `LoadedDomain`, `DomainRegistry` types
- `lib/domains/loader.ts` — `loadDomains()` function that scans `domains/`, reads manifests, walks `agents/`, indexes capabilities/prompts/skills/extensions
- `lib/domains/registry.ts` — `DomainRegistry` class holding all loaded domains, with lookup methods
- `lib/domains/index.ts` — re-exports

`loadDomains(domainsDir)` performs:
1. `readdir(domainsDir)` → filter to directories with `domain.ts`
2. For each, `import()` the `domain.ts` to get the manifest
3. Walk `agents/*.ts`, `import()` each, stamp with domain ID
4. Index `capabilities/`, `prompts/`, `skills/`, `extensions/` directories
5. `import()` `workflows.ts` if present
6. `shared` is always loaded first (sort order)

Returns a `DomainRegistry` with all domains loaded.

### AgentRegistry changes

`lib/agents/resolver.ts`:
- Keys become fully qualified `{domain}/{agent}` (e.g. `coding/worker`)
- New `resolve(id: string, domainContext?: string)` overload:
  - If `id` contains `/`, treat as qualified — direct lookup
  - If unqualified + `domainContext`, try `{domainContext}/{id}`
  - If unqualified + no context, scan all domains — error if ambiguous
- New `resolveInDomain(domain: string): AgentDefinition[]` method
- `createDefaultRegistry()` is replaced by `createRegistryFromDomains(domains: DomainRegistry): AgentRegistry`
- Backward compat: keep `get(id)` working with both qualified and unqualified IDs during transition

### Prompt assembly (new: `lib/domains/prompt-assembly.ts`)

New function `assemblePrompts(agent: AgentDefinition, domain: string, domainsDir: string, runtimeContext?: RuntimeTemplateContext): Promise<string>`:

1. **Layer 0**: Load `domains/shared/prompts/base.md`
2. **Layer 1**: For each capability in `agent.capabilities`:
   - Try `domains/{domain}/capabilities/{name}.md`
   - Fall back to `domains/shared/capabilities/{name}.md`
   - Error if not found in either
3. **Layer 2**: Load `domains/{domain}/prompts/{agent.id}.md`
4. **Layer 3**: If runtime context indicates sub-agent mode, load and render `domains/shared/prompts/runtime/sub-agent.md`

Concatenate all layers with `\n\n` separator.

This replaces the current pattern in `agent-spawner.ts:205` and `cli/session.ts:72` where `loadPrompts(def.prompts)` is called.

### Extension resolution (update `agent-spawner.ts`)

Replace the hardcoded `EXTENSIONS_DIR` and `KNOWN_EXTENSIONS` set with domain-aware resolution:

New function `resolveExtensionPaths(extensions: readonly string[], domain: string, domainsDir: string): string[]`:
1. For each extension name, check `domains/{domain}/extensions/{name}/`
2. Fall back to `domains/shared/extensions/{name}/`
3. Skip if not found in either (current behavior: silently skip unknowns)

### Skill resolution (update `lib/agents/skills.ts`)

The `buildSkillsOverride` function's filtering logic is unchanged. What changes is how Pi discovers skill files. Update `package.json` `pi.skills` to point to `["./domains/shared/skills", "./domains/coding/skills"]` or implement domain-aware skill path resolution that supplies `additionalSkillPaths` per agent session based on their domain.

### Workflow resolution (update `lib/workflows/`)

- Each domain's `workflows.ts` exports `WorkflowDefinition[]`
- `loadWorkflows()` merges: domain workflows (from all loaded domains) + project config workflows
- Project config workflows take precedence on name collision
- Unqualified agent names in domain workflows resolve against that domain
- Unqualified names in project config workflows resolve against the default domain

### Chain parser update

`parseChain()` in `lib/orchestration/chain-parser.ts`:
- Accept qualified names: `"coding/planner -> coding/worker"` splits on `->`, keeps `/` intact
- The lowercasing already handles this; just ensure qualified names aren't rejected
- The `loop` property lookup uses the registry which now needs domain-awareness
- Pass `DomainRegistry` or `AgentRegistry` to `parseChain` instead of using a module-level `DEFAULT_REGISTRY`

### Config loader update

`lib/config/types.ts`: Add `domain?: string` to `ProjectConfig`.
`lib/config/loader.ts`: Parse the new `domain` field from config JSON.

### CLI updates

`cli/types.ts`: Add `domain?: string` and `listDomains: boolean` to `CliOptions`.
`cli/main.ts`:
- Add `--domain` / `-d` flag, `--list-domains` flag
- Update `--list-agents` to optionally filter by domain (`--list-agents -d coding`)
- `--list-domains` prints all discovered domain IDs and descriptions
- Replace `createDefaultRegistry()` calls with domain-aware registry creation
- Agent resolution uses `registry.resolve(agentId, domainContext)` where context comes from `--domain` or project config default
- `--list-workflows` includes domain-sourced workflows

### Package.json updates

Update `pi.extensions` and `pi.skills` arrays to reference the new domain paths:
```json
{
  "pi": {
    "extensions": ["./domains/shared/extensions", "./domains/coding/extensions"],
    "skills": ["./domains/shared/skills", "./domains/coding/skills"]
  }
}
```

Note: This is for Pi's own discovery mechanism. The framework-level domain loader handles resolution independently.

### Runtime identity marker

`lib/agents/runtime-identity.ts`: The marker currently embeds unqualified IDs (e.g. `worker`). Update to embed qualified IDs (e.g. `coding/worker`). The regex `AGENT_ID_MARKER_REGEX` needs to accept `/` in the ID capture group: change `[a-z0-9-]+` to `[a-z0-9/-]+`.

The `extractAgentIdFromSystemPrompt` return value becomes a qualified ID. All consumers (e.g. `extensions/orchestration/index.ts:173` where it checks `callerDef.subagents`) need updating — `subagents` arrays in definitions will contain qualified IDs (`"coding/worker"` not `"worker"`).

### Initialization and bootstrap

The domain loader needs a clear bootstrap sequence:
1. CLI/chain-runner calls `loadDomains(domainsDir)` once at startup
2. `loadDomains` returns a `DomainRegistry`
3. `AgentRegistry` is created from the domain registry
4. Both are threaded through to the agent spawner, chain runner, orchestration extension, and CLI session creator

Currently, module-level `DEFAULT_REGISTRY = createDefaultRegistry()` is used in 5 places:
- `lib/orchestration/chain-parser.ts:16`
- `lib/orchestration/chain-runner.ts:29`
- `lib/orchestration/agent-spawner.ts:41`
- `extensions/orchestration/index.ts:15`
- `cli/main.ts:185,193`

These all need to receive the registry as a parameter instead of creating it at module scope.

## Files to Change

### New files
- `domains/shared/domain.ts` — shared domain manifest
- `domains/coding/domain.ts` — coding domain manifest
- `domains/coding/agents/cosmo.ts` — Cosmo agent definition
- `domains/coding/agents/planner.ts` — planner agent definition
- `domains/coding/agents/worker.ts` — worker agent definition
- `domains/coding/agents/coordinator.ts` — coordinator agent definition
- `domains/coding/agents/task-manager.ts` — task-manager agent definition
- `domains/coding/agents/quality-manager.ts` — quality-manager agent definition
- `domains/coding/agents/reviewer.ts` — reviewer agent definition
- `domains/coding/agents/fixer.ts` — fixer agent definition
- `domains/coding/workflows.ts` — coding domain default workflows
- `domains/shared/workflows.ts` — empty/minimal shared workflows
- `lib/domains/types.ts` — DomainManifest, LoadedDomain, DomainRegistry types
- `lib/domains/loader.ts` — domain discovery and loading
- `lib/domains/registry.ts` — DomainRegistry class
- `lib/domains/prompt-assembly.ts` — convention-based four-layer prompt assembly
- `lib/domains/index.ts` — re-exports
- `tests/domains/loader.test.ts` — domain loader tests
- `tests/domains/registry.test.ts` — domain registry tests
- `tests/domains/prompt-assembly.test.ts` — prompt assembly tests

### Moved files (content preserved, path changes)
- `prompts/cosmonauts.md` → `domains/shared/prompts/base.md`
- `prompts/runtime/sub-agent.md` → `domains/shared/prompts/runtime/sub-agent.md`
- `prompts/capabilities/core.md` → `domains/shared/capabilities/core.md`
- `prompts/capabilities/tasks.md` → `domains/shared/capabilities/tasks.md`
- `prompts/capabilities/spawning.md` → `domains/shared/capabilities/spawning.md`
- `prompts/capabilities/todo.md` → `domains/shared/capabilities/todo.md`
- `prompts/capabilities/coding-readwrite.md` → `domains/coding/capabilities/coding-readwrite.md`
- `prompts/capabilities/coding-readonly.md` → `domains/coding/capabilities/coding-readonly.md`
- `prompts/agents/coding/*.md` → `domains/coding/prompts/*.md` (8 files)
- `skills/domains/*` → `domains/shared/skills/*` (4 directories)
- `skills/languages/*` → `domains/coding/skills/languages/*` (1 directory)
- `extensions/tasks/` → `domains/shared/extensions/tasks/`
- `extensions/plans/` → `domains/shared/extensions/plans/`
- `extensions/orchestration/` → `domains/shared/extensions/orchestration/`
- `extensions/todo/` → `domains/shared/extensions/todo/`
- `extensions/init/` → `domains/shared/extensions/init/`

### Modified files
- `lib/agents/types.ts` — remove `namespace`, replace `prompts` with `capabilities`, add runtime `domain`
- `lib/agents/resolver.ts` — qualified ID support, domain-context resolution, `resolveInDomain()`, remove `createDefaultRegistry`
- `lib/agents/index.ts` — update re-exports (remove definitions, add domain-related exports)
- `lib/agents/runtime-identity.ts` — qualified ID in marker regex
- `lib/agents/skills.ts` — no logic changes, but imported types may change
- `lib/orchestration/agent-spawner.ts` — replace `loadPrompts` call with `assemblePrompts`, use domain-aware extension resolution, accept registry as parameter instead of module-level constant
- `lib/orchestration/chain-parser.ts` — accept registry parameter, handle qualified names in `parseChain`
- `lib/orchestration/chain-runner.ts` — thread registry through, update default stage prompts to use qualified names if needed
- `lib/orchestration/types.ts` — `AgentRole` type may need to become a string (qualified IDs are unbounded)
- `lib/prompts/loader.ts` — keep `loadPrompt`/`loadPrompts` as low-level utilities, but `PROMPTS_DIR` becomes less central; potentially keep for backward compat
- `lib/config/types.ts` — add `domain?: string` field
- `lib/config/loader.ts` — parse `domain` field from config
- `lib/workflows/types.ts` — no changes needed
- `lib/workflows/loader.ts` — merge domain workflows with project config workflows
- `cli/types.ts` — add `domain?: string` and `listDomains: boolean`
- `cli/main.ts` — add `--domain` / `-d`, `--list-domains`, domain-aware agent/workflow resolution, bootstrap domain loading
- `cli/session.ts` — use `assemblePrompts` instead of `loadPrompts`, domain-aware extension resolution
- `extensions/orchestration/index.ts` — receive registry as param or from context, qualified ID handling in spawn permission checks
- `package.json` — update `pi.extensions` and `pi.skills` paths

### Deleted files
- `lib/agents/definitions.ts` — agents move to `domains/coding/agents/*.ts`
- `prompts/` directory — all content moved to `domains/`
- `skills/` directory — all content moved to `domains/`
- `extensions/` directory — all content moved to `domains/`

### Updated tests
- `tests/agents/definitions.test.ts` — rewrite to test domain-loaded definitions
- `tests/agents/resolver.test.ts` — qualified ID tests, domain-context resolution
- `tests/agents/runtime-identity.test.ts` — qualified ID marker patterns
- `tests/orchestration/chain-parser.test.ts` — qualified names in chain DSL
- `tests/orchestration/agent-spawner.test.ts` — domain-aware resolution
- `tests/orchestration/agent-spawner.spawn.test.ts` — domain-aware spawning
- `tests/orchestration/chain-runner.test.ts` — registry threading
- `tests/prompts/loader.test.ts` — update integration tests for new paths
- `tests/workflows/workflow-loader.test.ts` — domain workflow merging
- `tests/cli/main.test.ts` — new CLI flags
- `tests/config/loader.test.ts` — `domain` field parsing
- `tests/extensions/orchestration.test.ts` — qualified ID checks

## Risks

1. **Import path cascading**: Moving extensions from `extensions/` to `domains/shared/extensions/` changes every relative import within those extension files (e.g. `../../lib/agents/index.ts` paths break). Every extension's `index.ts` will need import path updates.

2. **Pi framework skill/extension discovery**: `package.json` `pi.skills` and `pi.extensions` control what Pi discovers automatically. If Pi doesn't support multiple paths or glob patterns, we may need to adjust the approach — potentially a single `domains` entry with Pi configured to recurse, or a build step that generates symlinks.

3. **Module-level registry singletons**: Five files currently create a registry at module scope (`const DEFAULT_REGISTRY = createDefaultRegistry()`). Converting these to accept a registry parameter requires threading it through the call chain — this is a significant refactor that touches the agent spawner, chain parser, chain runner, and orchestration extension simultaneously.

4. **Backward compatibility of agent IDs**: Switching from unqualified (`worker`) to qualified (`coding/worker`) IDs affects the runtime identity marker, subagent allowlists, chain DSL strings in project configs, and any persisted session data. All existing `.cosmonauts/config.json` files with workflow chains using unqualified names must still work (resolved via the default domain).

5. **Dynamic `import()` of domain files**: The domain loader uses dynamic `import()` for `domain.ts`, `agents/*.ts`, and `workflows.ts`. These are TypeScript files — Bun handles `.ts` imports natively, but the paths must be absolute or properly resolved. Tests need a temp directory with valid `.ts` files, which is more complex than the current fixture pattern.

6. **Test fixture complexity**: Domain loader tests need actual directory trees with valid TypeScript files. Unlike current tests that use plain JSON or markdown fixtures, these need importable `.ts` modules. May need to write fixtures to temp dirs and use `file://` URLs for dynamic import.

7. **Circular dependency risk**: `lib/domains/` imports from `lib/agents/types.ts`, while `lib/agents/resolver.ts` will be populated by `lib/domains/loader.ts`. The dependency direction must be: domains → agents (types only), agents (resolver) ← domains (loader populates it). No circular runtime dependency, but needs care.

## Implementation Order

1. **Domain types and manifest files** — Create `lib/domains/types.ts` with `DomainManifest`, `LoadedDomain` interfaces. Create `domains/shared/domain.ts` and `domains/coding/domain.ts` manifest files. No existing code depends on these yet, so this is safe to land independently. Add basic tests.

2. **AgentDefinition type change** — Modify `lib/agents/types.ts`: remove `namespace`, replace `prompts` with `capabilities`, add optional `domain` field. Update `lib/agents/index.ts` re-exports. This intentionally breaks `lib/agents/definitions.ts` and all test files that reference the old shape — those are fixed in the next step.

3. **Domain agent definitions** — Create `domains/coding/agents/*.ts` (8 files) with the new convention-based shape. Delete `lib/agents/definitions.ts`. Update `lib/agents/index.ts` to remove definition exports. Fix `tests/agents/definitions.test.ts`.

4. **Move prompt files** — Move all files from `prompts/` to `domains/shared/` and `domains/coding/` per the mapping table. Delete the old `prompts/` directory. Update `tests/prompts/loader.test.ts` integration tests that reference real paths.

5. **Move skills** — Move `skills/domains/*` → `domains/shared/skills/*` and `skills/languages/*` → `domains/coding/skills/languages/*`. Delete old `skills/` directory. Update `package.json` `pi.skills`.

6. **Move extensions** — Move `extensions/*` → `domains/shared/extensions/*`. Fix all relative import paths inside the moved extension files. Update `package.json` `pi.extensions`. Delete old `extensions/` directory.

7. **Prompt assembly module** — Create `lib/domains/prompt-assembly.ts` implementing the four-layer convention-based prompt resolution. Tests use temp directories with mock `.md` files. This is the core of the new system.

8. **Domain loader** — Create `lib/domains/loader.ts` and `lib/domains/registry.ts`. Implement `loadDomains()` that scans directories, imports manifests and agent definitions, indexes resources. Create `lib/domains/index.ts`. Add comprehensive tests.

9. **AgentRegistry refactor** — Update `lib/agents/resolver.ts` for qualified IDs (`domain/agent`), domain-context resolution, `resolveInDomain()`. Replace `createDefaultRegistry()` with `createRegistryFromDomains()`. Update tests.

10. **Runtime identity marker update** — Update `lib/agents/runtime-identity.ts` regex to support qualified IDs (`coding/worker`). Update `tests/agents/runtime-identity.test.ts`.

11. **Agent spawner refactor** — Update `lib/orchestration/agent-spawner.ts`: replace `loadPrompts()` with `assemblePrompts()`, domain-aware extension resolution, accept registry as parameter. Update `cli/session.ts` similarly. Update all spawner tests.

12. **Chain parser and runner updates** — Update `lib/orchestration/chain-parser.ts` to accept registry parameter, handle qualified names. Update `lib/orchestration/chain-runner.ts` to thread registry. Update `lib/orchestration/types.ts` if `AgentRole` type needs widening. Update tests.

13. **Workflow loader update** — Update `lib/workflows/loader.ts` to merge domain-sourced workflows with project config. Update tests.

14. **Config loader update** — Add `domain` field to `ProjectConfig`, update parser. Update tests.

15. **CLI updates** — Add `--domain`/`-d`, `--list-domains` flags to `cli/main.ts` and `cli/types.ts`. Update agent/workflow resolution to be domain-aware. Bootstrap domain loading at CLI entry point. Update tests.

16. **Orchestration extension update** — Update `extensions/orchestration/index.ts` (now at `domains/shared/extensions/orchestration/index.ts`) for qualified IDs in spawn permission checks, registry threading. Update tests.

17. **Documentation and cleanup** — Update `AGENTS.md` to reflect domain architecture. Update any memory files or docs that reference old paths. Final verification: `bun run test`, `bun run lint`, `bun run typecheck`.
