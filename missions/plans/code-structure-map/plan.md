---
title: Derived code-structure map + riders (architectural-memory W1)
status: active
createdAt: '2026-07-02T15:03:57.000Z'
updatedAt: '2026-07-02T22:55:00.000Z'
---

## Overview

This is the implementation plan for W1 of `missions/architecture/architectural-memory.md`: a derived TypeScript code-structure map, the early `analysis-tools` audit rider, and the `artifact-viewer` rider. The plan preserves the spec's ratified decisions:

- map files are tracked under `memory/architecture/`;
- map records use OKF v0.1-style markdown + YAML frontmatter with a Cosmonauts-defined type vocabulary;
- module sharding is directory-based, with `.cosmonauts/config.json` escape hatches; `index.ts`/`index.tsx` barrels define a module's public interface when present;
- the `analysis-tools` audit is implemented first and its substrate recommendation gates the map analyzer adapter;
- this slice builds toward, but does not extract, the shared memory interface from `missions/architecture/agent-memory.md`.

For traceability, the spec's Acceptance Criteria bullets are numbered in order for this plan:

| Source | Spec acceptance criterion summary |
|---|---|
| AC-001 | Generate `memory/architecture/index.md` plus module shards with OKF frontmatter and documented type vocabulary. |
| AC-002 | Module shards list public interface and dependencies/dependents; the index lists every module with a one-line narrative. |
| AC-003 | A no-source-change refresh produces no file changes. |
| AC-004 | Body-only edits do not regenerate narrative; public-interface edits do regenerate that module's narrative. |
| AC-005 | Stale maps are detectable by agents and humans. |
| AC-006 | Planner, plan-reviewer, coordinator, worker, and quality-manager get the index automatically and can pull shards on demand. |
| AC-007 | `cosmonauts serve` renders the architecture map and plans with honest empty states. |
| AC-008 | The `analysis-tools` audit findings document exists with recommendations. |
| AC-009 | A generation failure leaves any previous map intact and reports the error. |
| AC-010 | Project gates pass; map generation and freshness have fixture coverage; narrative generation is mocked in tests. |

No tasks are created by this plan. The next stage may turn this implementation order into plan-linked tasks after review/approval.

**Revised 2026-07-02** after two independent reviews: the chain plan-reviewer (`review.md` — shared contract completeness, fallow entries) and a multi-lens adversarial review (13 verified findings — pending-narrative/idempotence semantics, freshness tiering, tsconfig aliases, extension auto-load guard, crash recovery, viewer bounds, step-6 checkpoint). The resulting rules live in the Design sections and Decision Log entries marked *(Added 2026-07-02 after review)*.

## Architecture Context

Source-of-truth records:

- `missions/architecture/architectural-memory.md` defines W1 as a derived, actual-code map: mechanical dependency/public-interface spine, lazily regenerated narrative, OKF records, tracked `memory/architecture/`, TypeScript first, and audit-gated static-analysis substrate.
- `missions/architecture/agent-memory.md` defines the shared `write`/`retrieve`/`consolidate` memory-interface ancestor and the premature-abstraction guard. This plan must not introduce that shared interface or an embedding/SQLite retrieval layer.

Boundary rules this plan must preserve:

- `lib/architecture-map/*` is the stable core for map contracts, analysis, freshness, OKF rendering, and generated-map storage. It must not import from CLI, domains, Pi extensions, Pi runtime/session APIs, `lib/artifact-viewer`, plans, tasks, or orchestration.
- The concrete Pi-backed narrative provider lives at the CLI edge (`cli/architecture/narrative-provider.ts`) and is injected into the generator through the `NarrativeProvider` interface.
- CLI code and Pi extensions are edges. They may import `lib/architecture-map`, but the map core must not import them.
- `lib/artifact-viewer/*` is a presentation edge. It may import `lib/architecture-map`, `lib/plans`, and read-only task-listing APIs; none of those modules may import `lib/artifact-viewer`.
- `lib/config/*` may carry the optional project config shape, but it must not import architecture-map code.
- Freshness and narrative reuse are reconstructed from persisted map frontmatter, analyzer configuration, and current working-tree files. No correctness decision may rely on an in-memory cache that starts empty after a process restart.
- The generated map is derived state. Curated architecture-of-record, drift signals, reuse-scan, embeddings, and general agent memory remain out of scope.

## Behaviors

### B-001 - Audit records the analysis substrate decision before generator adapter work

- Source: AC-008
- Context: the W1 implementation starts with the bundled `analysis-tools` audit rider
- Action: the audit reviews current lint/typecheck/audit usage, agent-loop surfacing, candidate static-analysis substrates, and writes a recommendation
- Expected: `missions/plans/code-structure-map/analysis-tools-audit.md` contains findings plus a `Substrate recommendation` section that explicitly allows or blocks map analyzer adapter implementation
- Seam: `missions/plans/code-structure-map/analysis-tools-audit.md`
- Test: `missions/plans/code-structure-map/analysis-tools-audit.md` > `Substrate recommendation gates generator implementation`
- Marker: `@cosmo-behavior plan:code-structure-map#B-001`

### B-002 - TypeScript map generation writes OKF index and module shards

- Source: AC-001
- Context: a TypeScript project has source modules under discovered or configured module roots
- Action: the user runs `cosmonauts architecture generate`
- Expected: `memory/architecture/index.md` and one markdown shard per module are written with OKF-required frontmatter fields (`type`, `title`, `description`, `resource`, `tags`, `timestamp`) and project-specific freshness keys; the index body lists every discovered module with its one-line narrative and a dependency overview
- Seam: `lib/architecture-map/generator.ts`
- Test: `tests/architecture-map/generator.test.ts` > `writes OKF index and module shards for a TypeScript fixture`
- Marker: `@cosmo-behavior plan:code-structure-map#B-002`

### B-003 - The analysis pipeline records public interfaces and module dependency edges

- Source: AC-002
- Context: a fixture project has a barrel-defined module, a non-barrel module, relative imports, tsconfig-aliased imports (`baseUrl`/`paths`), and external imports
- Action: the analyzer produces module skeletons and the generator derives module records
- Expected: barrel modules expose only barrel exports, non-barrel modules expose exported declarations in the module, internal dependencies and reverse dependents are stored on module records (including aliased imports that resolve to included files), and only bare imports that do not resolve to included files are listed as external
- Seam: `lib/architecture-map/generator.ts`
- Test: `tests/architecture-map/generator.test.ts` > `renders public interfaces dependencies and dependents from analyzed modules`
- Marker: `@cosmo-behavior plan:code-structure-map#B-003`

### B-004 - A no-change refresh leaves generated files untouched

- Source: AC-003
- Context: a map has already been generated, source/config inputs are unchanged, and no module narrative is `pending`
- Action: the user runs `cosmonauts architecture generate` again
- Expected: the generator returns `unchanged`, preserves existing file contents and modification times, and reports no changed generated files
- Seam: `lib/architecture-map/store.ts`
- Test: `tests/architecture-map/generator.test.ts` > `does not rewrite files when generated content is unchanged`
- Marker: `@cosmo-behavior plan:code-structure-map#B-004`

### B-005 - Body-only source edits do not regenerate module narrative

- Source: AC-004
- Context: an existing shard has generated narrative for a module, and only a function body changes without changing exports/imports/module files
- Action: the map is refreshed with a stub narrative provider that records calls
- Expected: the module source hash/freshness metadata may update, the skeleton hash remains the same, the prior narrative text is reused, and the narrative provider is not called for that module
- Seam: `lib/architecture-map/narrative.ts`
- Test: `tests/architecture-map/generator.test.ts` > `reuses narrative when only function bodies change`
- Marker: `@cosmo-behavior plan:code-structure-map#B-005`

### B-006 - Public-interface edits regenerate that module's narrative

- Source: AC-004
- Context: an existing shard has generated narrative for a module, and the module's exports or barrel surface changes
- Action: the map is refreshed
- Expected: that module receives a new skeleton hash, the narrative provider is called for that module, and unrelated modules keep their prior narrative
- Seam: `lib/architecture-map/generator.ts`
- Test: `tests/architecture-map/generator.test.ts` > `regenerates only the changed module narrative after public interface changes`
- Marker: `@cosmo-behavior plan:code-structure-map#B-006`

### B-007 - Freshness comparison detects stale generated maps, including analyzer config changes

- Source: AC-005
- Context: `memory/architecture/index.md` records a snapshot hash and the working tree, `.cosmonauts/config.json`, `tsconfig.json`, or audit-selected analyzer config changes afterward
- Action: freshness is checked without regenerating the map
- Expected: current maps return `current`; changed source or map-relevant config returns `stale` with old/new hashes; missing maps return `missing`
- Seam: `lib/architecture-map/freshness.ts`
- Test: `tests/architecture-map/freshness.test.ts` > `reports stale when source or analyzer configuration changes`
- Marker: `@cosmo-behavior plan:code-structure-map#B-007`

### B-008 - Generation failures do not leave partial generated maps

- Source: AC-009
- Context: a project may or may not already have a valid generated map, and generation later fails during analysis or bundle rendering
- Action: `cosmonauts architecture generate` encounters the failure
- Expected: the command reports the failure, preserves the previous `memory/architecture/` contents when they exist, and leaves no temp/partial replacement directory when no previous map exists
- Seam: `lib/architecture-map/store.ts`
- Test: `tests/architecture-map/generator.test.ts` > `keeps previous maps and removes partial output when generation fails`
- Marker: `@cosmo-behavior plan:code-structure-map#B-008`

### B-009 - Non-TypeScript projects fail clearly without writing a partial map

- Source: AC-010
- Context: a project has no TypeScript source files and no TypeScript project indicators
- Action: the user runs `cosmonauts architecture generate`
- Expected: the command exits with an unsupported-project result explaining that W1 supports TypeScript only, and `memory/architecture/` is not created or modified
- Seam: `cli/architecture/subcommand.ts`
- Test: `tests/cli/architecture/subcommand.test.ts` > `reports unsupported non TypeScript projects without writing a map`
- Marker: `@cosmo-behavior plan:code-structure-map#B-009`

### B-010 - Missing or skipped narrative is explicit, not ambiguous

- Source: AC-010
- Context: narrative generation is disabled or the narrative provider cannot produce text for a changed module
- Action: the generator writes the shard anyway
- Expected: the shard still contains the mechanical spine and marks narrative as `pending` with a reason; the index lists a pending one-line narrative instead of omitting it
- Seam: `lib/architecture-map/render.ts`
- Test: `tests/architecture-map/generator.test.ts` > `writes pending narrative shards when narrative generation is unavailable`
- Marker: `@cosmo-behavior plan:code-structure-map#B-010`

### B-011 - Empty TypeScript projects produce a valid empty map

- Source: AC-001
- Context: a project has TypeScript configuration but no source modules after default exclusions
- Action: the user runs `cosmonauts architecture generate`
- Expected: `memory/architecture/index.md` is written with OKF frontmatter, zero modules, and an honest empty module inventory; no shard files are required
- Seam: `lib/architecture-map/generator.ts`
- Test: `tests/architecture-map/generator.test.ts` > `writes a valid empty index for a tiny TypeScript project`
- Marker: `@cosmo-behavior plan:code-structure-map#B-011`

### B-012 - Consuming agents receive the map index with honest freshness status

- Source: AC-006
- Context: planner, plan-reviewer, coordinator, worker, or quality-manager starts in a project with a generated map
- Action: the architecture-memory extension prepares context for the agent turn
- Expected: the injected context contains the compact index and a current/stale/missing banner; stale maps are labeled as stale instead of presented as current
- Seam: `domains/shared/extensions/architecture-memory/index.ts`
- Test: `tests/extensions/architecture-memory.test.ts` > `injects architecture index with freshness status for mapped projects`
- Marker: `@cosmo-behavior plan:code-structure-map#B-012`

### B-013 - Consuming agents can load a named module shard on demand

- Source: AC-006
- Context: a mapped project has a shard with `resource: lib/agents`
- Action: a consuming agent calls the registered architecture-map tool with `module: "lib/agents"`
- Expected: the tool reads the shard from disk, returns its content with freshness status, rejects unknown modules with a helpful list, and does not allow path traversal
- Seam: `domains/shared/extensions/architecture-memory/index.ts`
- Test: `tests/extensions/architecture-memory.test.ts` > `reads module shards by resource and rejects path traversal`
- Marker: `@cosmo-behavior plan:code-structure-map#B-013`

### B-014 - The local viewer renders the architecture map and honest map empty states

- Source: AC-007
- Context: `cosmonauts serve` is pointed at a project with a generated map, or at a project without one
- Action: a browser requests the architecture routes
- Expected: the viewer renders the map index, module graph, module page links, freshness banner, and per-module pages from markdown; without a map it renders an empty state pointing to `cosmonauts architecture generate`
- Seam: `lib/artifact-viewer/server.ts`
- Test: `tests/artifact-viewer/server.test.ts` > `serves architecture map pages and missing map empty state`
- Marker: `@cosmo-behavior plan:code-structure-map#B-014`

### B-015 - The local viewer renders plans with review and read-only task status empty states

- Source: AC-007
- Context: a project has plans under `missions/plans/`, with optional `spec.md`, `review.md`, and plan-linked task markdown files
- Action: a browser requests the plan routes from `cosmonauts serve`
- Expected: the viewer renders a navigable plan list and plan pages with plan/spec/review/task status sections; when no plans or no task config exist it renders honest empty states and does not create or modify `missions/tasks/config.json` or scaffold directories
- Seam: `lib/artifact-viewer/loader.ts`
- Test: `tests/artifact-viewer/server.test.ts` > `serves plan pages with read only task status and empty states`
- Marker: `@cosmo-behavior plan:code-structure-map#B-015`

### B-016 - The viewer escapes rendered markdown content

- Source: AC-007
- Context: a plan, review, or map shard contains literal HTML or script-like text
- Action: the artifact viewer renders the markdown to HTML
- Expected: user-authored/source markdown is HTML-escaped and cannot inject executable markup into the local viewer page
- Seam: `lib/artifact-viewer/render.ts`
- Test: `tests/artifact-viewer/render.test.ts` > `escapes markdown before rendering viewer pages`
- Marker: `@cosmo-behavior plan:code-structure-map#B-016`

### B-017 - Viewer routes reject traversal before reading artifacts

- Source: AC-007
- Context: a browser requests `/plans/../x`, `/plans/%2e%2e%2fx`, or an architecture module route containing traversal-like segments
- Action: the artifact viewer resolves the route
- Expected: the request is rejected with a client error before `PlanManager`, direct `review.md` reads, or module shard reads build filesystem paths outside their artifact roots
- Seam: `lib/artifact-viewer/server.ts`
- Test: `tests/artifact-viewer/server.test.ts` > `rejects traversal routes before artifact reads`
- Marker: `@cosmo-behavior plan:code-structure-map#B-017`

### B-018 - Architecture-map config rejects roots outside the project

- Source: AC-001
- Context: `.cosmonauts/config.json` declares `architectureMap.sourceRoots` or `architectureMap.moduleRoots` values that are absolute, contain `..`, or otherwise resolve outside the project root
- Action: map config is resolved
- Expected: unsafe roots are ignored with warnings, safe roots remain, and generation never scans or writes based on escaped paths
- Seam: `lib/architecture-map/config.ts`
- Test: `tests/architecture-map/config.test.ts` > `ignores architecture map roots that escape the project root`
- Marker: `@cosmo-behavior plan:code-structure-map#B-018`

### B-019 - Oversized injected indexes are truncated with shard-tool guidance

- Source: AC-006
- Context: a generated `index.md` exceeds `architectureMap.injectionMaxBytes`
- Action: the architecture-memory extension prepares agent context
- Expected: the injected context includes freshness, a truncated index excerpt, and an explicit note to call `architecture_map_read` for the full index or module shards
- Seam: `domains/shared/extensions/architecture-memory/index.ts`
- Test: `tests/extensions/architecture-memory.test.ts` > `truncates oversized index injection with architecture map tool guidance`
- Marker: `@cosmo-behavior plan:code-structure-map#B-019`

### B-020 - Serve keeps running when browser opening fails

- Source: AC-007
- Context: the user starts `cosmonauts serve --open` and the platform opener command fails
- Action: the serve command handles the opener failure
- Expected: the HTTP server remains running, the URL is printed, and the opener failure is reported as a non-fatal warning
- Seam: `cli/serve/subcommand.ts`
- Test: `tests/cli/serve/subcommand.test.ts` > `keeps the server running when opening the browser fails`
- Marker: `@cosmo-behavior plan:code-structure-map#B-020`

### B-021 - Pending narratives complete on a later refresh without skeleton changes

- Source: AC-002
- Context: an existing map has modules with `pending` narrative (from `--no-narrative`, budget exhaustion, or provider failure), source/config inputs are unchanged, and a working narrative provider with remaining budget is available
- Action: the user runs `cosmonauts architecture generate`
- Expected: the provider is called for pending modules (up to `maxModulesPerRun`), their shards and index rows gain narratives, files for unaffected modules are untouched, and the run reports `written` (not `unchanged`)
- Seam: `lib/architecture-map/generator.ts`
- Test: `tests/architecture-map/generator.test.ts` > `completes pending narratives on refresh without skeleton changes`
- Marker: `@cosmo-behavior plan:code-structure-map#B-021`

## Design

### Core module contracts

Create a new `lib/architecture-map/` module with the following public contracts exported from `lib/architecture-map/index.ts`:

```ts
export interface ArchitectureMapConfig {
  outputDir: "memory/architecture";
  sourceRoots: readonly string[];
  moduleRoots?: readonly string[];
  exclude: readonly string[];
  injectionMaxBytes: number;
  narrative: {
    enabled: boolean;
    maxModulesPerRun: number;
  };
}

export interface ProjectSnapshot {
  hash: string; // sha256 over .cosmonauts map config, analyzer config, relative TS file paths, and file contents
  files: readonly SourceFileSnapshot[];
  analyzerConfigFiles: readonly string[];
}

export interface SourceAnalyzer {
  getConfigInputs(projectRoot: string, config: ArchitectureMapConfig): Promise<readonly string[]>;
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}

export interface ModuleSkeleton {
  resource: string; // repo-relative module root, e.g. "lib/agents"
  rootDir: string;
  files: readonly string[];
  hasBarrel: boolean;
  publicInterface: readonly PublicExport[];
  dependencies: readonly ModuleDependency[];
  externalDependencies: readonly string[];
  sourceHash: string;
  skeletonHash: string;
}

export interface ModuleRecord extends ModuleSkeleton {
  dependents: readonly ModuleDependent[];
  narrative: ModuleNarrative;
  shardPath: string; // repo-relative to memory/architecture, e.g. "modules/lib/agents.md"
}

export interface ArchitectureMapIndex {
  generatedAt: string;
  projectHash: string;
  modules: readonly ModuleRecord[];
}

export interface NarrativeProvider {
  generate(input: NarrativeInput, signal?: AbortSignal): Promise<GeneratedNarrative>;
}

// Shared cross-task data shapes — analyzer, generator, store, CLI, extension,
// and viewer must all agree on these; workers must not invent alternates.
export interface SourceFileSnapshot {
  path: string; // repo-relative
  size: number;
  mtimeMs: number;
  hash: string; // sha256 of contents
}

export interface AnalysisInput {
  projectRoot: string;
  config: ArchitectureMapConfig;
  snapshot: ProjectSnapshot;
}

export interface AnalysisResult {
  modules: readonly ModuleSkeleton[];
  diagnostics: readonly string[];
}

export interface PublicExport {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "const" | "enum" | "other";
  signature: string;
  sourceFile: string; // repo-relative
}

export interface ModuleDependency {
  resource: string; // target module resource
  importedBy: readonly string[]; // repo-relative importing files
}

export interface ModuleDependent {
  resource: string;
}

export type NarrativeStatus = "generated" | "reused" | "pending";

export interface ModuleNarrative {
  status: NarrativeStatus;
  oneLiner?: string;
  text?: string;
  pendingReason?: string; // required when status is "pending"
}

export interface NarrativeInput {
  skeleton: ModuleSkeleton;
  priorNarrative?: ModuleNarrative;
}

export interface GeneratedNarrative {
  oneLiner: string;
  text: string;
}

export type GenerateArchitectureMapResult =
  | { kind: "written"; changedFiles: readonly string[]; pendingModules: readonly string[] }
  | { kind: "unchanged" }
  | { kind: "unsupported"; reason: string }
  | { kind: "failed"; error: string; previousMapIntact: boolean };

export function generateArchitectureMap(options: {
  projectRoot: string;
  analyzer: SourceAnalyzer;
  narrativeProvider?: NarrativeProvider; // absent = --no-narrative semantics
  configOverrides?: Partial<ArchitectureMapConfig>;
}): Promise<GenerateArchitectureMapResult>;
```

The CLI, tests, and store consume `GenerateArchitectureMapResult` as the single result union behind the printed `written`/`unchanged`/`unsupported`/`failure` statuses.

`ModuleSkeleton` is analyzer output. `ModuleRecord` is generator output: `lib/architecture-map/generator.ts` derives `dependents` by reversing internal `dependencies`, attaches narrative state, and passes records to render/store. Shards and index rows are rendered from `ModuleRecord`, not from skeletons directly.

`ArchitectureMapConfig` is resolved by `lib/architecture-map/config.ts` from `.cosmonauts/config.json` plus defaults. Extend `ProjectConfig` in `lib/config/types.ts` with an optional `architectureMap` object, and extend `lib/config/loader.ts` to parse only safe primitives:

```ts
architectureMap?: {
  sourceRoots?: readonly string[];
  moduleRoots?: readonly string[];
  exclude?: readonly string[];
  injectionMaxBytes?: number;
  narrative?: { enabled?: boolean; maxModulesPerRun?: number };
}
```

Malformed config entries are ignored with warnings, matching existing config-loader conventions for malformed `domainBindings`. `lib/architecture-map/config.ts` then validates `sourceRoots`, `moduleRoots`, and exclude prefixes against the project root; absolute paths or `..` escapes are ignored with warnings.

### Module discovery and analysis

The audit gates the concrete analyzer adapter. The planned adapter contract is `SourceAnalyzer` in `lib/architecture-map/analyzer.ts`; the provisional expected implementation is a TypeScript compiler-API adapter because TypeScript is already in this repo and it can parse imports/exports deterministically. If the audit selects a different substrate (for example `ts-morph` or `dependency-cruiser`), only the adapter file changes; the generator, tests, CLI, extension, and viewer remain on the same `ModuleSkeleton`/`ModuleRecord` contracts.

Default discovery rules:

- A project is TypeScript-supported when it has a `tsconfig.json` or at least one included `.ts`/`.tsx` source file after exclusions. A `tsconfig.json` with zero modules is a supported empty TypeScript project.
- Default source roots are existing `src/`, `lib/`, `cli/`, `domains/`, `bundled/`, and `packages/`; if none exist, use the project root.
- Default exclusions are `node_modules/`, `.git/`, `dist/`, `build/`, `coverage/`, `missions/`, `memory/`, and `.cosmonauts/`, plus configured exclude prefixes.
- If `architectureMap.moduleRoots` is set, use those repo-relative directories exactly after validating they stay inside the project root.
- Without explicit module roots, each direct child directory under a source root that contains included TS files is a module. Root-level TS files under a source root form a root module for that source root.
- For public interfaces, `index.ts` or `index.tsx` at a module root is authoritative. Without a barrel, collect exported declarations from included non-test TS files under the module root.
- Parse imports/exports and resolve them to included source files: relative specifiers directly, and tsconfig `baseUrl`/`paths` aliases through the substrate's module resolution when the project defines them; map resolved files to module roots for internal dependencies. Only bare imports that do not resolve to included files are recorded as external dependencies — aliased internal imports must never be misclassified as external. Dependents are derived by the generator and stored on each `ModuleRecord`.

### Freshness and narrative invalidation

Use two hashes with different responsibilities:

- `sourceHash`: full content hash for all included files in a module. This drives stale-map detection and updates when a function body changes.
- `skeletonHash`: hash of the module resource, file list, public interface, internal dependencies, and external dependencies. This drives narrative reuse/regeneration and intentionally ignores function bodies.

`ProjectSnapshot.hash` also includes map-relevant configuration: the canonicalized resolved `architectureMap` config section only (never the whole `.cosmonauts/config.json`, so unrelated project-config edits such as `domainBindings` cannot flip the map to stale), `tsconfig.json` when present, and every existing analyzer config file returned by `SourceAnalyzer.getConfigInputs()` (for example dependency-cruiser config if the audit selects that substrate). This prevents changes in file inclusion or import resolution from being reported as current.

Freshness is **two-tier**, because the extension runs on every agent turn:

- **Generate-time truth:** `lib/architecture-map/freshness.ts` recomputes the current `ProjectSnapshot.hash` (full content hashes) from disk and compares it to `memory/architecture/index.md` frontmatter. The CLI uses this tier.
- **Turn-time check:** generate also records a cheap **stat fingerprint** (sha256 over repo-relative path + size + mtimeMs for every included source and config file) in the index frontmatter. The extension and viewer recompute and compare only the stat fingerprint — never full content hashes — on `before_agent_start` and per HTTP request. A fingerprint mismatch reports `stale`.

Both tiers read from disk on demand; neither trusts process-local state. The stat tier can report a false `stale` on touch-without-change (acceptable: it errs toward honesty), never a false `current` for real content changes that update mtime.

`lib/architecture-map/narrative.ts` defines only the provider seam, narrative result types, and pending-status helpers. The concrete Pi-backed provider lives in `cli/architecture/narrative-provider.ts` and is injected by `cli/architecture/subcommand.ts`. Tests always inject a fake provider so the suite never makes model calls. If narrative is disabled, budget is exhausted, or the provider fails for a module, the generator writes a `pending` narrative status and the full mechanical spine.

**Narrative completion and idempotence rules** (these resolve the interaction between B-004, B-005, B-010, and B-021):

- The provider is called for a module when its `skeletonHash` changed **or** its narrative status is `pending` (with a provider present and budget remaining). `pending` is a transient state by design — a later refresh completes it; it is never permanent unless narrative stays disabled.
- `unchanged` therefore means: source and config inputs unchanged **and** no pending narratives were completable this run. Completing pending narratives on an otherwise-unchanged tree is a legitimate `written` result that touches only the affected shards and index rows.
- **Timestamp stability:** rendered output inherits the prior record's `timestamp`/`generatedAt` whenever that record's rendered content (excluding volatile frontmatter keys) is unchanged; timestamps advance only for records whose content actually changed. This is what makes the store's byte-level "unchanged" comparison non-circular — without it, fresh timestamps would make every refresh look changed and B-004/AC-003 would be unimplementable as written.

### OKF record format and generated files

Document the Cosmonauts OKF vocabulary in `docs/architecture-map.md` and include a short vocabulary note in generated `index.md`:

- `type: code-structure-index` for `memory/architecture/index.md`
- `type: code-structure-module` for module shards

Generated files:

- `memory/architecture/index.md`
- `memory/architecture/modules/<resource>.md`, preserving module directory shape where possible, e.g. `modules/lib/agents.md`

Every generated markdown file has YAML frontmatter with OKF fields (`type`, `title`, `description`, `resource`, `tags`, `timestamp`) plus custom keys: `generatorVersion`, `projectHash` or `sourceHash`, `skeletonHash` where applicable, `narrativeStatus`, and `moduleCount` where applicable.

Do not add OKF `log.md` in W1. A generated-map log would churn tracked derived files without serving the W1 behavior; curated history belongs to W2+ records.

### Atomic storage and idempotence

`lib/architecture-map/store.ts` owns generated-map writes. It should reuse `lib/fs/atomic-file.ts` for single-file writes where useful, but directory replacement needs a bundle-level safety protocol:

1. Analyze and render the complete new map in memory/temp space first.
2. Compare target generated file contents to existing files. If there are no content differences and no stale generated files to remove, return `unchanged` without rewriting.
3. Write the complete replacement bundle under a temporary sibling directory inside `memory/`.
4. Validate that the temp bundle has `index.md` and all expected shard files.
5. Rename existing `memory/architecture/` to a backup sibling, rename the temp bundle into place, then remove the backup. If any rename fails, restore the backup and report the original error.
6. Use fixed sibling names (e.g. `memory/.architecture.tmp/`, `memory/.architecture.bak/`). At the start of every generate, detect leftovers from a crashed prior run and recover before doing any work: a leftover backup alongside a missing or incomplete canonical directory is restored; leftover temp directories are deleted. W1 assumes a single writer — there is no lock; concurrent generates are documented as unsupported.

The map directory is generated-owned. User-authored architecture records remain adjacent (for example future `memory/architecture.md`), not inside this generated directory.

### CLI surfaces

Add `cli/architecture/subcommand.ts` and register top-level `cosmonauts architecture` plus alias `cosmonauts arch` in `cli/main.ts`.

Primary command:

```text
cosmonauts architecture generate [--no-narrative] [--json] [--plain]
```

Behavior:

- loads project config from the current working directory;
- runs the audit-selected analyzer adapter through `generateArchitectureMap`;
- creates the concrete Pi narrative provider in `cli/architecture/narrative-provider.ts` unless `--no-narrative` is passed;
- prints written/unchanged/unsupported/failure status;
- exits non-zero for unsupported projects and generation failures, but unsupported projects must not write partial maps.

Add `cli/serve/subcommand.ts` and register top-level `cosmonauts serve` in `cli/main.ts`.

```text
cosmonauts serve [--host 127.0.0.1] [--port 0] [--open | --no-open]
```

W1 is a live local server only: no static export and no file watching. `--open` attempts to open the browser through a platform command. If browser opening fails, the server remains running, the URL is printed, and the failure is only a warning.

### Agent consumption

Create `domains/shared/extensions/architecture-memory/index.ts`.

Responsibilities:

- On `before_agent_start`, read `memory/architecture/index.md`, compute freshness via `lib/architecture-map/freshness.ts`, and inject one non-accumulating custom context message containing the compact index plus a freshness banner. A `context` hook removes older architecture-map context messages so each turn has at most one current map context.
- Respect `architectureMap.injectionMaxBytes` from config. If the compact index exceeds the cap, inject the freshness banner, the first capped bytes, and an explicit truncation note telling the agent to call `architecture_map_read` for the full index or module shards.
- Register `architecture_map_read` with parameters `{ module?: string }`. Without `module`, return the current index and freshness. With `module`, resolve by `resource` frontmatter from known shards, reject path traversal, and return the shard plus freshness.

**Auto-load guard.** `package.json` advertises `./domains/shared/extensions` as a pi-package extension directory, so external Pi hosts can auto-load this extension for every agent even though cosmonauts' own sessions load only per-agent-declared extensions. The extension must therefore gate itself at runtime: injection and tool registration activate only when the session's runtime agent identity is one of the five consuming agents (or an agent definition explicitly enables it); for any other agent the extension is inert. Cover this with an explicit inert-for-other-agents test.

Add the `architecture-memory` extension to these existing agent definitions:

- `bundled/coding/agents/planner.ts`
- `bundled/coding/agents/plan-reviewer.ts`
- `bundled/coding/agents/coordinator.ts`
- `bundled/coding/agents/worker.ts`
- `bundled/coding/agents/quality-manager.ts`

Do not add it to every agent by default in W1. The spec's AC-006 list is the automatic-consumption scope.

### Artifact viewer

Create `lib/artifact-viewer/` as a presentation module:

- `loader.ts`: reads map markdown from `memory/architecture/`, freshness via architecture-map, plans via `PlanManager` only after validating slugs with `validateSlug`, optional `review.md` files through the same validated slug, and task status through a new non-mutating `TaskManager.listTasksReadOnly()` method.
- `render.ts`: pure HTML renderers for shell, navigation, architecture index, module pages, plan pages, and empty states. Render markdown source through a small escaped-markdown renderer; do not add a client build pipeline. The markdown renderer is an intentionally minimal, dependency-free subset — headings, paragraphs, lists, links, inline/fenced code, and best-effort tables; content outside the subset renders as escaped preformatted text rather than growing the renderer. No markdown or HTML library is added in W1.
- `server.ts`: Node `http` server with routes `/`, `/architecture/`, `/architecture/modules/...`, `/plans/`, and `/plans/<slug>`. Route decoding must validate plan slugs and architecture module resources before any filesystem path is built.

The module graph diagram should be a deterministic server-rendered SVG (or equivalent static HTML diagram) derived from internal dependency edges in the map index. It must link module nodes to their shard pages. Layout is a simple deterministic layered/grid placement computed from dependency depth — no graph-layout library and no new runtime dependencies for the viewer in W1; crude-but-correct is acceptable. Health metrics, graph editing, and live watch refresh are out of scope.

`TaskManager.listTasksReadOnly()` mirrors `listTasks()`'s parameters and return type exactly (same filter argument, same task record shape) but must call the existing task-file readers/parsers without `ensureInitialized()`, so a viewer request cannot create `missions/tasks/config.json` or scaffold missing directories. Existing task-management commands continue to use `listTasks()` and keep their current initialization behavior.

### Decision Log

- **Analysis substrate remains gated.** The design fixes the analyzer output contract but not the concrete adapter until `analysis-tools-audit.md` records the recommendation. Provisional path is TypeScript compiler API; if used in the published CLI, move `typescript` from `devDependencies` to `dependencies` and update `bun.lock`.
- **No shared memory interface extraction in W1.** Map read/write APIs stay in `lib/architecture-map`; the `agent-memory` shared interface lands when the second implementation exists.
- **Markdown remains source of truth.** The viewer renders generated/planned markdown; it stores no parallel state and has no edit capability.
- **Viewer reads must be non-mutating.** Plan/task status rendering uses slug validation and read-only task listing; `cosmonauts serve` must never scaffold project artifacts as a side effect of viewing.
- **No OKF `log.md` for generated maps.** Logs are reserved for curated records to avoid derived-file churn.
- **Freshness is hash-on-demand.** Session extension and viewer compute current hashes from persisted files, analyzer config, and the working tree rather than caching correctness state in memory.
- **Injection is automatic but capped.** The compact index is injected for the five consuming agents; very large indexes are honestly truncated with tool guidance rather than silently overfilling context.
- **Narrative generation is optional per run and edge-owned.** Default generation uses the CLI-owned Pi provider; `--no-narrative` and provider failures produce explicit pending narratives while preserving the mechanical map.
- **Pending narrative is transient.** A refresh completes pending narratives even when skeletons are unchanged (budget permitting); `unchanged` requires no completable pendings outstanding. Rendered records inherit prior timestamps when their content is unchanged, keeping the byte-level idempotence comparison non-circular. *(Added 2026-07-02 after review.)*
- **Freshness is two-tier.** Content hashes are generate-time truth; agent-turn and viewer checks compare a recorded stat fingerprint (path/size/mtime) — full-tree content hashing never runs on agent turns. Only the resolved `architectureMap` config section is hashed, not the whole project config. *(Added 2026-07-02 after review.)*
- **The extension gates on agent identity.** Because `domains/shared/extensions` is pi-package-advertised, architecture-memory must be inert for agents outside the five consumers even when a Pi host auto-loads it. *(Added 2026-07-02 after review.)*
- **The viewer stays dependency-free and bounded.** Minimal escaped-markdown subset with preformatted fallback, deterministic layered/grid SVG, no markdown/HTML/graph libraries in W1. *(Added 2026-07-02 after review.)*

## Files to Change

- `missions/plans/code-structure-map/analysis-tools-audit.md` (new) — plan-local audit rider artifact with findings and substrate recommendation.
- `docs/architecture-map.md` (new) — OKF type vocabulary, generated file layout, and `cosmonauts architecture generate` usage.
- `package.json` — promote/add the audit-selected runtime analyzer dependency if needed; provisional TypeScript compiler API path moves `typescript` to `dependencies`.
- `bun.lock` — update only if package dependency placement changes.
- `fallow.toml` — add `lib/architecture-map/index.ts` and `lib/artifact-viewer/index.ts` to the public entry list (both are stable public entry points, not internal composition files).
- `lib/config/types.ts` — add optional `architectureMap` project config shape.
- `lib/config/loader.ts` — parse and validate primitive `architectureMap` config fields.
- `tests/config/loader.test.ts` — cover valid and malformed `architectureMap` config parsing.
- `lib/tasks/task-manager.ts` — add non-mutating `listTasksReadOnly()` for viewer consumption.
- `tests/tasks/task-manager.test.ts` — prove read-only listing does not scaffold missing task config.
- `lib/architecture-map/types.ts` (new) — core contracts and OKF vocabulary constants.
- `lib/architecture-map/config.ts` (new) — resolve defaults, validate safe roots, and reject root escapes.
- `lib/architecture-map/freshness.ts` (new) — project snapshot hashing over source plus analyzer config and current/stale/missing comparison.
- `lib/architecture-map/analyzer.ts` (new) — audit-selected `SourceAnalyzer` adapter behind the stable skeleton contract.
- `lib/architecture-map/narrative.ts` (new) — narrative provider interface and pending narrative helpers only; no Pi imports.
- `lib/architecture-map/okf.ts` (new) — frontmatter serialization/parsing helpers using existing `gray-matter`.
- `lib/architecture-map/render.ts` (new) — markdown rendering for index and shard content from module records.
- `lib/architecture-map/store.ts` (new) — generated-map read/compare/atomic bundle replacement.
- `lib/architecture-map/generator.ts` (new) — orchestration of config, analysis, dependents derivation, narrative reuse, rendering, and storage.
- `lib/architecture-map/index.ts` (new) — public exports for CLI, extension, and viewer.
- `tests/architecture-map/analyzer.test.ts` (new) — analyzer fixture behavior for exports/imports.
- `tests/architecture-map/config.test.ts` (new) — root escape and config-default behavior.
- `tests/architecture-map/freshness.test.ts` (new) — freshness state including analyzer config changes.
- `tests/architecture-map/generator.test.ts` (new) — generator idempotence, dependents, narrative invalidation, failure safety, non-model tests.
- `cli/architecture/narrative-provider.ts` (new) — CLI-edge Pi narrative provider factory.
- `cli/architecture/subcommand.ts` (new) — `cosmonauts architecture generate` / `arch generate` command.
- `tests/cli/architecture/subcommand.test.ts` (new) — architecture CLI behavior.
- `cli/serve/subcommand.ts` (new) — `cosmonauts serve` command.
- `tests/cli/serve/subcommand.test.ts` (new) — serve CLI behavior including opener failure.
- `cli/main.ts` — dispatch `architecture`, `arch`, and `serve` subcommands.
- `tests/cli/main.test.ts` — top-level dispatch coverage for new subcommands, including the `arch` alias (alias dispatch is owned here, outside the behavior spine).
- `lib/artifact-viewer/types.ts` (new) — view model types.
- `lib/artifact-viewer/loader.ts` (new) — validated map/plan/task/review artifact loading with read-only task status.
- `lib/artifact-viewer/render.ts` (new) — escaped HTML and graph rendering.
- `lib/artifact-viewer/server.ts` (new) — local HTTP server and route handling with traversal rejection.
- `lib/artifact-viewer/index.ts` (new) — public viewer exports.
- `tests/artifact-viewer/render.test.ts` (new) — markdown escaping and pure rendering.
- `tests/artifact-viewer/server.test.ts` (new) — HTTP route behavior, empty states, and traversal rejection.
- `domains/shared/extensions/architecture-memory/index.ts` (new) — agent map injection and shard-reading tool.
- `tests/extensions/architecture-memory.test.ts` (new) — extension injection/tool/truncation behavior.
- `bundled/coding/agents/planner.ts` — add `architecture-memory` extension.
- `bundled/coding/agents/plan-reviewer.ts` — add `architecture-memory` extension.
- `bundled/coding/agents/coordinator.ts` — add `architecture-memory` extension.
- `bundled/coding/agents/worker.ts` — add `architecture-memory` extension.
- `bundled/coding/agents/quality-manager.ts` — add `architecture-memory` extension.
- `tests/domains/coding-agents.test.ts` — invariant that the five consuming agents load `architecture-memory`.

## Risks

- **Audit substrate mismatch.** The audit may recommend a substrate that cannot provide public-interface extraction and internal dependency edges without excessive dependency weight. Pivot: stop after B-001 and revise the analyzer adapter plan instead of forcing a weak parser through.
- **Runtime dependency packaging.** The provisional TypeScript compiler API path requires `typescript` at CLI runtime, not just test/typecheck time. Mitigation: if chosen, promote it to `dependencies`; otherwise document the chosen package's runtime implications in the audit.
- **Tracked derived-file churn.** Timestamps and freshness metadata can create noisy diffs. Mitigation: content-compare before writing, preserve prior narrative/timestamps when hashes do not require changes, and avoid OKF `log.md`.
- **Atomic replacement portability.** Directory renames can fail on permissions or platform-specific filesystem behavior. Mitigation: use same-parent temp/backup directories, restore backup on failure, and test failure injection.
- **Read-only viewer side effects.** Existing task listing initializes/scaffolds when config is absent. Mitigation: add and require `TaskManager.listTasksReadOnly()` for viewer paths and test that serving does not create task config.
- **Prompt budget pressure.** Large repos can make even a compact index too large. Mitigation: configurable injection cap plus explicit truncation and shard tool guidance; revisit retrieval in W4.
- **Narrative cost or model failure.** Model calls may be expensive or unavailable. Mitigation: lazy skeleton-hash invalidation, CLI-owned provider injection, `--no-narrative`, per-run module cap, and explicit pending narrative state.
- **Viewer XSS or path traversal.** Plans/reviews are local files but may contain arbitrary text, and HTTP routes decode user-provided path segments. Mitigation: escaped markdown rendering, slug/resource validation before path construction, no raw HTML passthrough, and B-016/B-017 coverage.
- **Scope creep into W2/W3/W4.** Curated records, drift detection, reuse-scan, health metrics, embeddings, and memory-interface extraction are tempting adjacent work. Mitigation: keep them out of files/tasks for this plan and record any findings as follow-up only.

## Quality Contract

Plan-specific assertions the implementation must satisfy:

1. Generated-map writes are atomic and idempotent: no-change refreshes do not rewrite files, and failed refreshes leave prior map content intact or no partial map.
2. Freshness status is reconstructed from persisted frontmatter and the current working tree in CLI, extension, and viewer paths — full content hashes at generate time, the recorded stat fingerprint on agent-turn/viewer checks; no correctness-critical cache is process-local only.
3. Narrative invalidation is based on `skeletonHash`, not `sourceHash`, and all tests use injected narrative fakes rather than live model calls.
4. The five specified consuming agents load the `architecture-memory` extension; other agents are not silently widened into scope, and the extension is inert for non-consuming agents even when auto-loaded by a Pi host.
5. The viewer renders from markdown source only, escapes source content, validates route inputs, uses read-only task listing, and keeps map/plans empty states non-crashing.
6. The analysis audit artifact exists before analyzer adapter implementation and names the selected substrate plus follow-up recommendations.

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | project-native correctness evidence passes, including architecture-map fixtures, extension behavior, CLI behavior, read-only viewer behavior, and route validation | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | behavior-spine mechanical checks pass for B-001 through B-021 and audit evidence carries its marker | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | generator tests fail if sourceHash and skeletonHash are conflated, if narrative provider is called on body-only edits, if analyzer config changes are ignored, or if failure replacement is non-atomic | pending | unbound, not enforced; reviewer judgment required |
| 4 | `duplication` | bindable | unbound | no parallel map/config/markdown parsing path duplicates existing `gray-matter`, `PlanManager`, read-only task parsing, or `writeFileAtomically` responsibilities | pending | unbound, not enforced; reviewer judgment required |
| 5 | `boundary-conformance` | universal | bound | dependency direction holds: architecture-map core has no imports from CLI/domains/extensions/viewer/plans/tasks/orchestration/Pi runtime APIs; viewer remains presentation-only and non-mutating | reviewer evidence | hard fail |
| 6 | `dead-code` | bindable | unbound | new public exports and extension paths are reachable through CLI, agent definitions, or tests | pending | unbound, not enforced; reviewer judgment required |

## Implementation Order

1. **Audit gate first (B-001).** Write `missions/plans/code-structure-map/analysis-tools-audit.md` with current-state evidence from `package.json`, `biome.json`, `tsconfig.json`, `vitest.config.ts`, `fallow.toml`, `domains/shared/extensions/project-tools/index.ts`, and the quality-manager prompt. The document must end with the selected analyzer substrate and identify analyzer config files that freshness must hash. If it does not select a viable substrate, stop and revise this plan.
2. **Define contracts, config, and OKF vocabulary (B-002, B-007, B-011, B-018).** Add architecture-map types, safe config parsing, OKF helpers, docs, and freshness hashing tests before generator code.
3. **Implement the analyzer adapter behind the contract (B-003).** Use the audit-selected substrate only. Keep import/export analysis deterministic and covered by fixture tests.
4. **Build generator, dependents derivation, narrative seam, rendering, and storage (B-002, B-003, B-004, B-005, B-006, B-008, B-010, B-011, B-021).** Work test-first with a fake narrative provider. Add atomic replacement, crash-leftover recovery, timestamp inheritance, and no-op write behavior before wiring the CLI.
5. **Add `cosmonauts architecture generate` and the CLI-owned narrative provider (B-002, B-009).** Wire CLI output modes and unsupported/failure exit behavior. Do not add serve behavior in this step.
6. **Wire agent consumption (B-012, B-013, B-019).** Add the shared extension, tests for injection/tool/truncation behavior plus the inert-for-other-agents guard, and update exactly the five consuming agent definitions. **Checkpoint:** at the end of this step the memory half (AC-001 through AC-006, AC-008 through AC-010) is complete and independently verifiable — run the Quality Contract gates here before starting viewer work, so the viewer rider cannot stall map delivery.
7. **Add read-only task listing and artifact viewer (B-014, B-015, B-016, B-017).** Implement non-mutating task status first, then pure loader/render tests, then HTTP route tests.
8. **Add `cosmonauts serve` CLI behavior (B-014, B-015, B-017, B-020).** Wire top-level dispatch, server startup, and non-fatal opener handling.
9. **Documentation and final verification (AC-010).** Ensure docs name the command, generated layout, OKF vocabulary, config escape hatch, narrative pending state, viewer limitations, and W1 exclusions. Run the project-native checks through the Quality Contract ladder.

If any stage discovers that the stable contracts need to change, update the behavior entries and downstream tests before continuing; do not let later implementation tasks invent incompatible file formats or tool signatures.
