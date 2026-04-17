---
title: Package System — Installable Domains for Framework Extraction
status: completed
createdAt: '2026-03-26T14:09:31.895Z'
updatedAt: '2026-04-01T03:32:49.716Z'
---

## Summary

Introduce a package system that allows domains, agents, skills, and capabilities to be distributed as installable packages via local paths or git repos. Packages can provide full domains or **portable domains** — domains whose resources are available to agents in any domain. This is the prerequisite for extracting the framework: the core ships with only a minimal `shared` domain plus a catalog of bundled domains (like `coding`) that users install via CLI.

## Scope

**Included:**
- Package manifest format (`cosmonauts.json`) and validation
- Portable domain concept (`portable: true` in domain manifest) — resources available to all domains
- Package store — installed packages in `~/.cosmonauts/packages/` (global) and `.cosmonauts/packages/` (local)
- Package installer — local directory install (copy or symlink) and git repo clone
- Multi-source domain loading — domain loader discovers domains from framework built-in + global packages + local packages with clear precedence
- Three-tier resource resolution: agent's domain → portable domains → shared
- Runtime integration — `CosmonautsRuntime.create()` discovers and loads packages during bootstrap
- Bundled domain catalog — official domains shipped with framework, installable by short name
- CLI commands: `cosmonauts install`, `cosmonauts uninstall`, `cosmonauts packages`
- Domain scaffolding: `cosmonauts create domain <name>`
- Domain merge handling when a package provides a domain that already exists
- `--plugin-dir` flag for development/testing

**Excluded:**
- Actually extracting the coding domain (separate follow-up work)
- npm registry support (git + local is sufficient)
- Package versioning/dependency resolution between packages
- Package registry/marketplace
- Claude Code plugin compatibility (deferred; we already have skill export CLI)

**Assumptions:**
- The existing `domains/shared/` stays in the framework as the built-in baseline
- The existing `domains/coding/` stays in-repo for now, becomes the first bundled domain
- Packages are directories with a well-known structure — no compiled/bundled formats

## Design

### Module Structure

**New modules:**

- `lib/packages/types.ts` — Package manifest, installed package, package scope, domain source types. Single responsibility: type definitions.
- `lib/packages/manifest.ts` — Load and validate `cosmonauts.json`. Single responsibility: manifest I/O and validation.
- `lib/packages/store.ts` — Query installed packages, resolve store paths. Single responsibility: on-disk store management.
- `lib/packages/installer.ts` — Install from local paths (copy/symlink) and git repos (clone). Single responsibility: package acquisition and placement.
- `lib/packages/scanner.ts` — Scan all package sources (built-in, global, local, plugin-dir) and return ordered domain sources. Single responsibility: multi-source domain discovery.
- `lib/packages/catalog.ts` — Bundled domain catalog: map short names to sources. Single responsibility: official domain registry.
- `lib/packages/index.ts` — Barrel exports.
- `cli/packages/subcommand.ts` — `cosmonauts install`, `cosmonauts uninstall`, `cosmonauts packages list`.
- `cli/create/subcommand.ts` — `cosmonauts create domain`.

**Modified modules:**

- `lib/domains/types.ts` — Add `portable?: boolean` to `DomainManifest`. Add `portable` field to `LoadedDomain`.
- `lib/domains/loader.ts` — Add `loadDomainsFromSources()` for multi-directory loading with precedence. Add domain merge logic for same-ID domains from different sources.
- `lib/domains/registry.ts` — Extend `resolveCapability()` to check portable domains between agent's domain and shared. Add `listPortable()` method.
- `lib/domains/prompt-assembly.ts` — Change from single `domainsDir` to a resolver that searches agent domain → portable domains → shared. The `AssemblePromptsOptions` interface changes.
- `lib/domains/validator.ts` — Update capability/extension resolution rules to include portable domains.
- `lib/runtime.ts` — Use package scanner during bootstrap. Replace single `domainsDir` with multi-source loading. Introduce `DomainResolver` for downstream consumers.
- `lib/orchestration/definition-resolution.ts` — `resolveExtensionPaths()` searches agent domain → portable domains → shared across all source directories.
- `lib/orchestration/session-factory.ts` — Accept `DomainResolver` instead of single `domainsDir`.
- `lib/orchestration/agent-spawner.ts` — Thread `DomainResolver` instead of `domainsDir`.
- `lib/orchestration/types.ts` — Replace `domainsDir?: string` with resolver on `ChainConfig` and `SpawnConfig`.
- `cli/main.ts` — Register `packages` and `create` subcommands. Add `--plugin-dir` flag.
- `cli/session.ts` — Accept `DomainResolver` instead of single `domainsDir`.

### Dependency Graph

```
cli/main.ts
  → cli/packages/subcommand.ts  → lib/packages/ (installer, store, manifest, catalog)
  → cli/create/subcommand.ts    → lib/packages/ (manifest)
  → lib/runtime.ts              → lib/packages/ (scanner, store, catalog)
                                → lib/domains/  (loader, registry, validator, resolver)

lib/packages/scanner.ts   → lib/packages/store.ts → lib/packages/manifest.ts → lib/packages/types.ts
lib/packages/installer.ts → lib/packages/store.ts, lib/packages/manifest.ts
lib/packages/catalog.ts   → lib/packages/types.ts

lib/domains/resolver.ts   → lib/domains/registry.ts → lib/domains/types.ts
lib/domains/loader.ts     (no dependency on lib/packages/ — receives DomainSource[], not packages)

lib/orchestration/session-factory.ts → lib/domains/resolver.ts (not lib/packages/)
lib/orchestration/definition-resolution.ts → lib/domains/resolver.ts
lib/domains/prompt-assembly.ts → lib/domains/resolver.ts
```

Domain logic (`lib/domains/`) does not depend on the package system. The package scanner provides `DomainSource[]`; the domain loader loads them. The `DomainResolver` provides path resolution for downstream consumers (prompt assembly, extension resolution) without knowing about packages.

### Key Contracts

#### Package Manifest (`lib/packages/types.ts`)

```typescript
/** Package manifest loaded from cosmonauts.json. */
export interface PackageManifest {
  /** Package name (e.g. "@cosmonauts/coding"). Must be unique per store scope. */
  readonly name: string;
  /** SemVer version string. */
  readonly version: string;
  /** Human-readable description. */
  readonly description: string;
  /** Domain IDs this package provides. Each must have a matching subdirectory with domain.ts. */
  readonly domains: readonly string[];
}

/** Where a package is installed. */
export type PackageScope = "local" | "global";

/** A resolved installed package with its location metadata. */
export interface InstalledPackage {
  readonly manifest: PackageManifest;
  readonly scope: PackageScope;
  readonly rootDir: string;
  /** Whether this is a symlink (--link install). */
  readonly linked: boolean;
}

/** A directory containing domain subdirectories, with origin tracking. */
export interface DomainSource {
  /** Absolute path to the directory containing domain subdirectories. */
  readonly domainsDir: string;
  /** Origin label for diagnostics (e.g. "built-in", "global:@cosmonauts/coding"). */
  readonly origin: string;
  /** Precedence tier: lower number = lower precedence. */
  readonly precedence: number;
}
```

#### Domain Manifest Extension (`lib/domains/types.ts`)

```typescript
export interface DomainManifest {
  readonly id: string;
  readonly description: string;
  readonly lead?: string;
  readonly defaultModel?: string;
  /** When true, this domain's resources (capabilities, skills, extensions)
   *  are available to agents in ALL domains during resolution. */
  readonly portable?: boolean;
}
```

#### Domain Resolver (`lib/domains/resolver.ts`)

```typescript
/**
 * Resolves domain resources across multiple sources.
 * Replaces the single `domainsDir: string` that was threaded everywhere.
 * Encapsulates the three-tier resolution: agent domain → portable → shared.
 */
export class DomainResolver {
  constructor(
    registry: DomainRegistry,
    domainSources: readonly DomainSource[],
  );

  /** Resolve a capability file path: agent domain → portable domains → shared. */
  resolveCapabilityPath(capName: string, agentDomain: string): string;

  /** Resolve a persona prompt path for an agent. */
  resolvePersonaPath(agentId: string, agentDomain: string): string;

  /** Resolve the base prompt path (always from shared). */
  resolveBasePath(): string;

  /** Resolve the runtime sub-agent template path (always from shared). */
  resolveRuntimeTemplatePath(): string;

  /** Resolve an extension directory path: agent domain → portable → shared. */
  resolveExtensionPath(extName: string, agentDomain: string): string;

  /** Get all skill directories across all loaded domains (for skill path composition). */
  allSkillDirs(): string[];

  /** Get the DomainRegistry (for agent resolution, validation, etc). */
  get registry(): DomainRegistry;
}
```

This is the central abstraction that replaces `domainsDir: string` everywhere. Prompt assembly, extension resolution, and session factory all depend on `DomainResolver` instead of raw paths.

#### Installer (`lib/packages/installer.ts`)

```typescript
export interface InstallOptions {
  /** Package source: local path or git URL. */
  readonly source: string;
  /** Where to install. Default: "global". */
  readonly scope: PackageScope;
  /** Project root (needed for local scope and merge detection). */
  readonly projectRoot: string;
  /** Symlink instead of copy (for development). */
  readonly link?: boolean;
}

export interface InstallResult {
  readonly success: boolean;
  readonly manifest: PackageManifest;
  readonly installedTo: string;
  /** Domain merge decisions made during install. */
  readonly merges?: DomainMergeResult[];
  readonly error?: string;
}

export interface DomainMergeResult {
  readonly domainId: string;
  readonly action: "merged" | "replaced" | "skipped" | "new";
  readonly source: string;
}

export async function installPackage(options: InstallOptions): Promise<InstallResult>;
export async function uninstallPackage(name: string, scope: PackageScope, projectRoot: string): Promise<boolean>;
```

#### Bundled Domain Catalog (`lib/packages/catalog.ts`)

```typescript
export interface CatalogEntry {
  readonly name: string;
  readonly description: string;
  /** Path relative to framework root, or git URL. */
  readonly source: string;
}

/** Returns the built-in catalog of official domains. */
export function getBundledCatalog(): readonly CatalogEntry[];

/** Resolve a short name (e.g. "coding") to a CatalogEntry, or undefined. */
export function resolveCatalogEntry(name: string): CatalogEntry | undefined;
```

#### Domain Merge (`lib/domains/loader.ts`)

```typescript
export interface DomainMergeConflict {
  readonly domainId: string;
  readonly existingSource: string;
  readonly newSource: string;
  /** Resources that exist in both. */
  readonly overlapping: {
    agents: string[];
    capabilities: string[];
    skills: string[];
    extensions: string[];
    prompts: string[];
  };
}

/** Callback for resolving merge conflicts during multi-source loading. */
export type MergeStrategy = (conflict: DomainMergeConflict) =>
  "merge" | "replace" | "skip";

/**
 * Load domains from multiple source directories.
 * Same-ID domains from different sources are handled by the merge strategy.
 * Default strategy: merge (union of resources, later source wins on file conflicts).
 */
export async function loadDomainsFromSources(
  sources: readonly DomainSource[],
  mergeStrategy?: MergeStrategy,
): Promise<LoadedDomain[]>;
```

### Seams for Change

- **Install source resolution** — `installer.ts` resolves sources via a `resolveSource()` function. Adding new source types (HTTP archives, registries) means adding a resolver, not changing the installer.
- **Merge strategy** — `MergeStrategy` is a callback. CLI can prompt the user interactively; non-interactive mode uses a default (merge). Tests can inject deterministic strategies.
- **Catalog** — The bundled catalog is a pure function returning data. Switching from bundled-in-repo to a remote catalog means changing one data source.
- **`DomainResolver`** — Encapsulates all path resolution. If resolution rules change (new tiers, new fallback order), only the resolver changes. Consumers don't know about sources, packages, or precedence.

## Approach

### Portable Domains

A domain with `portable: true` in its manifest makes its resources available to agents in any domain. This is the mechanism for packages that provide skills, capabilities, or agents without binding them to a specific domain.

**Resolution order (three-tier):**
1. Agent's own domain
2. All portable domains (in discovery order)
3. `shared` (always last fallback)

This applies to: capability resolution, extension resolution, persona prompt resolution (an agent in `coding` could use a persona from a portable domain), and skill discovery.

`shared` is effectively a built-in portable domain, but it gets special treatment: it's always last, and it provides the base prompt (Layer 0) that all agents get.

**Example: a code-review skills package**

```
code-review-pack/
  cosmonauts.json         # { name: "code-review-pack", domains: ["review-tools"] }
  review-tools/
    domain.ts             # { id: "review-tools", portable: true }
    skills/
      code-review/
        SKILL.md
      security-audit/
        SKILL.md
    capabilities/
      review-discipline.md
```

After install, any agent in any domain can reference capability `"review-discipline"` and load skill `code-review`. No domain configuration needed.

### Domain Merge on Install

When a package provides domain `coding` and `coding` already exists (from another package or built-in):

**Non-interactive (default):** merge — union of resources, new package's files win on filename conflicts within a resource type (e.g., two `worker.ts` agent definitions → new one wins).

**Interactive CLI:** prompt the user:
```
Domain "coding" already exists (source: built-in).
Package "my-coding-extras" also provides "coding".

  Overlapping resources:
    agents: worker, reviewer
    capabilities: (none)
    skills: testing

  (m) Merge — combine resources, package wins on conflicts
  (r) Replace — remove existing domain, use package's
  (s) Skip — keep existing, ignore package's "coding" domain
  (c) Cancel install

>
```

**Implementation:** The domain loader's `loadDomainsFromSources()` detects same-ID domains and calls the `MergeStrategy` callback. For merged domains, the `LoadedDomain` combines resources from both sources. The resulting `LoadedDomain.rootDir` becomes an array internally (or the resolver knows to check multiple paths).

### Bundled Domain Catalog

The framework ships with a `catalog.json` mapping short names to bundled domain packages:

```json
{
  "coding": {
    "description": "Full coding domain — 14 agents, 8 skills, 5 workflows for software development",
    "source": "./bundled/coding"
  },
  "coding-minimal": {
    "description": "Minimal coding domain — cosmo, planner, worker, coordinator",
    "source": "./bundled/coding-minimal"
  }
}
```

When the framework is extracted, `domains/coding/` moves to `bundled/coding/` (or a separate repo). Users run:

```bash
cosmonauts install coding          # Resolves via catalog → copies bundled/coding to store
cosmonauts install coding-minimal  # Lighter starter
cosmonauts install github:user/my-domain  # Community package from git
cosmonauts install ./local-path    # Local directory
```

The catalog is checked first: if the name matches a catalog entry, use that source. Otherwise, treat it as a path or git URL.

### Package Directory Structure

```
my-package/
  cosmonauts.json           # Required: package manifest
  my-domain/                # Domain directory (matches domains[] in manifest)
    domain.ts               # Required: domain manifest (may have portable: true)
    agents/                 # Agent definitions (.ts files)
    prompts/                # Agent persona prompts (.md files)
    capabilities/           # Capability pack files (.md files)
    skills/                 # Skill directories (each with SKILL.md)
    extensions/             # Extension directories
    workflows.ts            # Workflow definitions
```

### Install Mechanics

**Local path (copy):**
```bash
cosmonauts install ./my-package
```
1. Validate `cosmonauts.json` exists and is valid
2. Validate each declared domain has `domain.ts`
3. Copy to `~/.cosmonauts/packages/<name>/`
4. Check for domain conflicts, apply merge strategy if needed

**Local path (symlink for dev):**
```bash
cosmonauts install --link ./my-package
```
Same validation, but creates a symlink instead of copying. Edits to the source directory are reflected immediately.

**Git repo:**
```bash
cosmonauts install github:user/my-domain
cosmonauts install https://github.com/user/my-domain.git
```
1. Clone to a temp directory (shallow clone, default branch)
2. Validate manifest
3. Copy to store (or symlink with `--link`)

**`--plugin-dir` (one-off, no install):**
```bash
cosmonauts --plugin-dir ./my-package
```
Adds the package's domain directories to the scanner for this session only. No copy, no store entry. Good for testing.

### DomainResolver — Replacing `domainsDir`

Currently, a single `domainsDir: string` is threaded through the entire system (runtime → chain config → spawn config → session factory → prompt assembly → extension resolution). This assumes all domains live under one directory.

With multi-source packages, domains live in different directories. The `DomainResolver` replaces `domainsDir`:

**Before:**
```typescript
// prompt-assembly.ts
const capPath = join(domainsDir, domain, "capabilities", `${cap}.md`);
const sharedPath = join(domainsDir, "shared", "capabilities", `${cap}.md`);
```

**After:**
```typescript
// prompt-assembly.ts
const capPath = resolver.resolveCapabilityPath(cap, domain);
// Internally: checks domain's source dir → each portable domain's source dir → shared's source dir
```

**Before:**
```typescript
// definition-resolution.ts
const domainPath = join(domainsDir, domain, "extensions", name);
const sharedPath = join(domainsDir, "shared", "extensions", name);
```

**After:**
```typescript
// definition-resolution.ts
const extPath = resolver.resolveExtensionPath(name, domain);
// Same three-tier resolution
```

The resolver is constructed once during `CosmonautsRuntime.create()` and threaded to all consumers. It encapsulates: which domains exist, where their files live, which are portable, and the resolution order.

### Runtime Bootstrap Changes

```
CosmonautsRuntime.create({ builtinDomainsDir, projectRoot, pluginDirs? })
  1. scanDomainSources({ builtinDomainsDir, projectRoot, pluginDirs })
     → [built-in source, ...global package sources, ...local package sources, ...plugin-dir sources]
  2. loadDomainsFromSources(sources, mergeStrategy)
     → LoadedDomain[] with merged same-ID domains
  3. validateDomains(domains)  // updated for portable domain resolution
  4. DomainRegistry(domains)
  5. DomainResolver(registry, sources)  // new: replaces domainsDir
  6. AgentRegistry(domains)
  7. selectDomainWorkflows(domains, domainContext)
  8. Compose skill paths from all domain sources
```

## Files to Change

**New files:**
- `lib/packages/types.ts` — PackageManifest, InstalledPackage, PackageScope, DomainSource
- `lib/packages/manifest.ts` — loadManifest(), validateManifest()
- `lib/packages/store.ts` — createPackageStore(), store dir resolution
- `lib/packages/installer.ts` — installPackage(), uninstallPackage(), local + git support
- `lib/packages/scanner.ts` — scanDomainSources()
- `lib/packages/catalog.ts` — getBundledCatalog(), resolveCatalogEntry()
- `lib/packages/index.ts` — barrel exports
- `lib/domains/resolver.ts` — DomainResolver class (replaces domainsDir threading)
- `cli/packages/subcommand.ts` — install, uninstall, list commands
- `cli/create/subcommand.ts` — cosmonauts create domain
- `tests/packages/manifest.test.ts`
- `tests/packages/store.test.ts`
- `tests/packages/installer.test.ts`
- `tests/packages/scanner.test.ts`
- `tests/packages/catalog.test.ts`
- `tests/domains/resolver.test.ts`
- `tests/cli/packages/subcommand.test.ts`
- `tests/cli/create/subcommand.test.ts`

**Modified files:**
- `lib/domains/types.ts` — Add `portable?: boolean` to DomainManifest
- `lib/domains/loader.ts` — Add `loadDomainsFromSources()` with merge strategy
- `lib/domains/registry.ts` — Add portable domain resolution tier to `resolveCapability()`, add `listPortable()`
- `lib/domains/validator.ts` — Update rules to check portable domains in resolution
- `lib/domains/prompt-assembly.ts` — Accept DomainResolver instead of domainsDir. Three-tier capability resolution.
- `lib/domains/index.ts` — Export new types and functions
- `lib/runtime.ts` — Use scanner + multi-source loader + DomainResolver. Replace domainsDir with resolver.
- `lib/orchestration/definition-resolution.ts` — resolveExtensionPaths() uses DomainResolver
- `lib/orchestration/session-factory.ts` — Accept DomainResolver instead of domainsDir
- `lib/orchestration/agent-spawner.ts` — Thread DomainResolver instead of domainsDir
- `lib/orchestration/types.ts` — Replace `domainsDir?: string` with DomainResolver on ChainConfig/SpawnConfig
- `cli/main.ts` — Register packages/create subcommands, add --plugin-dir flag
- `cli/session.ts` — Accept DomainResolver instead of domainsDir
- `tests/domains/loader.test.ts` — Multi-source loading, merge tests
- `tests/domains/registry.test.ts` — Portable domain resolution tests
- `tests/domains/prompt-assembly.test.ts` — Update for DomainResolver
- `tests/domains/validator.test.ts` — Portable domain validation tests
- `tests/runtime.test.ts` — Update for multi-source bootstrap

## Risks

1. **`domainsDir` replacement is a wide refactor.** The single `domainsDir: string` is threaded through ~15 call sites across runtime, orchestration, session factory, prompt assembly, and CLI. Replacing it with `DomainResolver` touches many files. Mitigation: do this as a dedicated step, keep `DomainResolver` API minimal, and run the full test suite after each file change.

2. **Domain merge complexity.** Merging two `LoadedDomain` objects means combining Maps and Sets, handling file-level conflicts, and tracking which source each resource came from. The `LoadedDomain.rootDir` field becomes ambiguous when a domain spans multiple directories. Mitigation: `LoadedDomain` gets a `rootDirs: string[]` (ordered by precedence), and the resolver checks each when resolving paths.

3. **Portable domain ordering.** If two portable domains provide the same capability name, which wins? Resolution is by discovery order (built-in → global → local), which is deterministic but may surprise users. Mitigation: warn during validation when portable domains overlap on capability names.

4. **Git clone edge cases.** Auth, private repos, SSH vs HTTPS, branch/tag selection, shallow clone failures. Mitigation: start with HTTPS public repos and `--branch` flag. Private repos and SSH can be added incrementally.

5. **Symlink portability.** `--link` mode creates symlinks. Windows has limited symlink support. Mitigation: document as Unix-first, fall back to copy on Windows.

6. **Test surface area.** The DomainResolver change affects many existing tests that construct `domainsDir` directly. Mitigation: provide a `DomainResolver.fromSingleDir(dir)` convenience for tests that don't need multi-source behavior.

## Implementation Order

1. **Domain manifest: add `portable` field** — Add `portable?: boolean` to `DomainManifest` in `lib/domains/types.ts`. Update domain loader to read it. No behavior change yet — just the type. Zero risk, foundation for everything.

2. **DomainResolver** — `lib/domains/resolver.ts`. Build the three-tier resolution abstraction (agent domain → portable → shared). Include `DomainResolver.fromSingleDir()` for backward compatibility. Test thoroughly in isolation. This is the core new abstraction.

3. **Thread DomainResolver through the system** — Replace `domainsDir: string` with `DomainResolver` in prompt assembly, extension resolution, session factory, agent spawner, chain config, spawn config, CLI session. Wide refactor but mechanically straightforward — each callsite changes from `join(domainsDir, ...)` to `resolver.resolveXxx(...)`. Run full test suite.

4. **Update DomainRegistry for portable domains** — Extend `resolveCapability()` with the portable tier. Update validator to check portable domains. Update prompt assembly to use resolver's three-tier lookup.

5. **Package types and manifest** — `lib/packages/types.ts` and `lib/packages/manifest.ts`. Define the package format, write loader/validator. Pure types and I/O.

6. **Package store** — `lib/packages/store.ts`. Query installed packages from `~/.cosmonauts/packages/` and `.cosmonauts/packages/`. Depends on manifest module.

7. **Package scanner** — `lib/packages/scanner.ts`. Scan built-in + store directories + plugin-dir to produce `DomainSource[]`. Depends on store.

8. **Multi-source domain loading** — Add `loadDomainsFromSources()` to `lib/domains/loader.ts`. Takes `DomainSource[]`, loads each, merges same-ID domains via `MergeStrategy` callback. Returns unified `LoadedDomain[]`.

9. **Runtime integration** — Update `CosmonautsRuntime.create()` to use scanner → multi-source loader → DomainResolver. After this, installed packages are automatically discovered and loaded.

10. **Package installer** — `lib/packages/installer.ts`. Local path copy, symlink mode, git clone. Depends on store and manifest. Includes merge conflict detection.

11. **Bundled catalog** — `lib/packages/catalog.ts`. Maps short names to bundled domain sources. Used by the installer to resolve `cosmonauts install coding`.

12. **CLI: install/uninstall/list** — `cli/packages/subcommand.ts`. Interactive merge prompts for domain conflicts. Depends on installer, store, catalog.

13. **CLI: --plugin-dir flag** — Add to `cli/main.ts` arg parsing. Passes extra `DomainSource[]` to runtime bootstrap.

14. **CLI: create domain** — `cli/create/subcommand.ts`. Scaffolds a new package with domain directory structure.
