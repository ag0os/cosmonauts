Reading additional input from stdin...
OpenAI Codex v0.142.5
--------
workdir: /Users/cosmos/Projects/cosmonauts
model: gpt-5.5
provider: openai
approval: never
sandbox: danger-full-access
reasoning effort: high
reasoning summaries: none
session id: 019f2927-5491-77b0-9c09-1833dfd32cb1
--------
user
Read-only independent code review. Do NOT modify files. Working dir is the cosmonauts repo on branch feature/code-structure-map.

Scope: review ONLY the diff of local `main`..HEAD, i.e. run `git diff main...HEAD` (merge-base 13488310). IMPORTANT: origin/main lags local `main` by 8 commits; any commit already on local `main` is out of scope — do not flag it. Review the code as it exists at HEAD (the tip already includes quality-manager REVIEW-FIX commits and two later fixes).

This implements plan `code-structure-map` (architectural-memory W1): a derived TypeScript code-structure map. Read these for the contract:
- missions/plans/code-structure-map/plan.md (behaviors B-001..B-021, Decision Log, Quality Contract)
- missions/plans/code-structure-map/spec.md (acceptance criteria)

Verify at HEAD:
1. Each behavior B-001..B-021 is implemented and has test coverage (markers present).
2. Key guarantees hold:
   - Two-tier freshness: full content hash at generate time; a cheap stat fingerprint (path/size/mtime + canonicalized architectureMap config) on agent-turn/viewer checks — NEVER full-tree content hashing on turns. (lib/architecture-map/freshness.ts)
   - Narrative invalidation keyed on skeletonHash, not sourceHash; body-only edits reuse narrative; interface changes regenerate. Tests use injected fake providers (no live model calls).
   - Atomic bundle storage: no-change refresh rewrites nothing (byte + mtime stable via timestamp inheritance); failed generation leaves prior map intact or no partial; crash-leftover recovery. (lib/architecture-map/store.ts)
   - generate honors .cosmonauts/config.json architectureMap settings (sourceRoots/moduleRoots/exclude). NOTE: this was just fixed in commit 1dd8b08 — resolveArchitectureMapConfig now loads project config from disk when not supplied. Confirm the fix is correct and complete (all of sourceRoots/moduleRoots/exclude/injectionMaxBytes/narrative honored during generation, consistent with the viewer/extension paths), and that it did not break the escape-root validation (B-018).
   - Boundary direction: lib/architecture-map core imports nothing from cli/domains/extensions/artifact-viewer/plans/tasks/orchestration/Pi runtime.
   - architecture-memory extension is wired to EXACTLY five agents (planner, plan-reviewer, coordinator, worker, quality-manager) and is INERT for any other agent even if a Pi host auto-loads it.
   - Viewer: escapes source markdown, validates route slugs/module resources BEFORE building filesystem paths (traversal rejected), uses read-only task listing that must NOT scaffold missions/tasks/config.json, dependency-free.
3. No out-of-scope W2+ work crept in: architecture-of-record/drift signal, reuse-scan, embeddings/SQLite/vector retrieval, shared memory-interface (write/retrieve/consolidate) extraction, health metrics, polyglot/non-TS analyzers, map editing via viewer. FLAG any.
4. Correctness, concurrency (single-writer assumption for storage is documented/acceptable), and dead code (new exports reachable via CLI/agents/tests).

Ground truth already established by the operator: typecheck clean, lint clean, full suite 2512 tests pass, all 21 markers present, and idempotence/OKF/non-TS-unsupported/config-honoring verified end-to-end via the real CLI. Focus on what those gates cannot catch.

Output: severity-ranked findings (P1/P2/P3) with file:line and concrete failure scenarios, then a single explicit verdict line: SHIP or DO-NOT-SHIP.

codex
I’ll review only `main...HEAD` and keep this read-only. I’m starting with the plan/spec contract and the scoped diff so findings stay tied to what this branch actually changed.
exec
/bin/zsh -lc "sed -n '1,260p' missions/plans/code-structure-map/spec.md" in /Users/cosmos/Projects/cosmonauts
exec
/bin/zsh -lc "sed -n '1,260p' missions/plans/code-structure-map/plan.md" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
## Purpose

Every Cosmonauts agent session that touches a codebase starts blind: planners,
reviewers, and workers re-scan the repository from scratch to learn its
structure, burning context and time on knowledge the previous session already
derived. Humans have the mirror problem — as agents write more of the code,
the human's mental map of the codebase decays, and there is nothing to read
that keeps it current.

This slice ships the first facet of architectural memory: a **derived
code-structure map** — the dependency tree and public interfaces as a
mechanical, always-fresh spine, with a short "what this module does" narrative
per module — sharded as markdown so an agent loads a compact index by default
and pulls per-module detail only when needed. Agents stop re-scanning; humans
get a rendered, navigable view of the same map.

Two riders ship with it (bundled per the 2026-06-18 ordering session):

- **`analysis-tools` audit** — a spike reviewing how Cosmonauts currently
  leverages static analysis in its quality gates and agent loop, and where to
  take it; it shares the map's static-analysis substrate.
- **`artifact-viewer`** — humans get an HTML companion view (`cosmonauts
  serve`) rendering the map and existing plans; markdown remains the agent-
  and version-control source of truth.

This is **W1** of the `architectural-memory` track. Source of truth:
`missions/architecture/architectural-memory.md`.

## Users

- **Planner and plan-reviewer** — design against the codebase's *actual*
  structure (real modules, real dependency edges, real public surfaces)
  without spending half a session rediscovering it; later waves
  (architecture-of-record, reuse-scan) build on this same map.
- **Worker, coordinator, quality-manager** — orient in an unfamiliar repo by
  reading the index and pulling only the shards for modules they touch.
- **`cosmo` / any agent answering "how is this codebase put together?"** —
  answers from the map instead of a fresh scan.
- **The human supervising agent work** — reads the rendered HTML map (module
  graph + per-module pages) and plan views to keep their mental model current
  while agents write the code.
- **The Cosmonauts maintainer** (audit rider) — gets an evidenced assessment
  of the current static-analysis story and a recommendation for where to
  invest.

The map targets **the user's project** — any TypeScript codebase Cosmonauts
runs in — with this repo as the first dogfooding target.

## User Experience

### Generating and refreshing the map

A CLI command generates the map for the current project under
`memory/architecture/` (tracked): a compact `index.md` (module inventory,
one-line narratives, dependency overview) plus one shard per module (public
interface, dependencies/dependents, narrative).
Re-running it refreshes only what changed: the mechanical spine is recomputed
cheaply and compared by content hash, and a module's **narrative is
regenerated only when that module's skeleton (public interface / structure)
changed** — editing a function body does not churn prose or spend model
calls. Running it twice with no changes in between changes nothing (no diff
noise).

### Agents consuming the map

When a mapped project has a session start, the map-consuming agents (planner,
plan-reviewer, coordinator, worker, quality-manager) get the compact index
without asking for it, and can pull a named module's shard on demand. The
agent-visible contract is honest about freshness: an agent can tell whether
the map is current with the working tree or stale, and a stale map says so
rather than silently misleading.

### Record format (OKF)

Shards and the index are markdown with YAML frontmatter conforming to the
**OKF v0.1 conventions**: `type` (from a small controlled vocabulary this
project defines), `title`, `description`, `resource` (the module path),
`tags`, `timestamp`, plus project-specific keys OKF explicitly tolerates
(e.g., the source hash that drives freshness). `index.md` is the OKF
progressive-disclosure index. Files are readable with `cat`, diffable in git,
and portable as a bundle.

### Humans viewing the map and plans

`cosmonauts serve` opens a local, no-build-step HTML view rendering (a) the
architecture map — module graph diagram, per-module pages — and (b) the
plans under `missions/plans/` (plan, spec, review, task status) as navigable
pages. It renders the markdown source; it never becomes a second source of
truth. Agents keep reading the markdown.

### The analysis-tools audit (spike rider)

The audit produces a findings document: how lint/typecheck are used in the
gates and agent loop today, whether agents actually leverage them, what
richer signals (complexity, dead code, type-aware rules) are available on the
substrate the map already uses, and a recommendation for next steps. It is an
investigation with a written artifact, not a build.

### Failure, empty, and edge flows

- **Non-TypeScript project** — the generate command says clearly that only
  TypeScript is supported in this slice and exits without writing a broken
  map; it does not half-generate.
- **Generation fails mid-run** (tooling error, unparseable file) — the
  previous map is left intact and the failure is reported; a broken partial
  map never replaces a good one.
- **Narrative not yet generated** for a module (first run interrupted, model
  unavailable) — the shard still carries the mechanical spine, with the
  narrative explicitly marked as pending rather than absent-and-ambiguous.
- **Empty or tiny project** — a valid, small map (index with few or no
  modules), not an error.
- **`cosmonauts serve` on a project with no map or no plans** — renders an
  honest empty state pointing at the generate command, not a crash.
- **Stale map** (code changed since last generate) — consumers can see it is
  stale; the map does not present itself as current.

## Acceptance Criteria

- Running the map-generation command on a TypeScript project produces
  `index.md` plus one shard per module; each file carries OKF-conformant
  frontmatter (`type`, `title`, `description`, `resource`, `tags`,
  `timestamp`) with type values from a documented vocabulary.
- Each module shard lists that module's public interface and its
  dependencies/dependents; the index lists every module with a one-line
  narrative.
- Re-running the command with no source changes produces no file changes.
- After editing only a function body (public interface unchanged), a refresh
  updates freshness metadata at most — the module's narrative is not
  regenerated. After changing a module's public interface, that module's
  shard (including narrative) is regenerated.
- A stale map is detectable as stale by both agents and humans (the map
  carries enough freshness information to check against the working tree).
- Planner, plan-reviewer, coordinator, worker, and quality-manager sessions
  in a mapped project have the index available without manually loading it,
  and can pull a named module's shard on demand.
- `cosmonauts serve` renders the architecture map (module graph + per-module
  pages) and the project's plans as navigable HTML from the markdown source,
  with honest empty states when either is missing.
- The `analysis-tools` audit document exists with findings on current
  static-analysis usage in the gates/agent loop and concrete recommendations.
- Generation failure on a project with an existing map leaves the previous
  map intact and reports the error.
- Full project gates pass; map generation and freshness behavior have direct
  test coverage against fixture projects (no model calls in the suite —
  narrative generation mocked).

## Scope

Included:
- The derived map generator (mechanical spine: dependency tree + public
  interfaces; lazy per-module narrative) with hash-based freshness, for
  TypeScript projects.
- Sharded markdown output (`index.md` + per-module shards) conforming to OKF
  v0.1 conventions, with this project's type vocabulary documented.
- CLI surface to generate/refresh the map.
- Wiring the index into the consuming agents (planner, plan-reviewer,
  coordinator, worker, quality-manager) with on-demand shard loading.
- `artifact-viewer` rider: `cosmonauts serve` rendering the map + plans as
  HTML (single local surface, no build step, humans-only).
- `analysis-tools` rider: the audit spike and its findings document.
- Tests with fixture projects; narrative generation mocked.

Excluded:
- Architecture-of-record / curated-intended structure and the drift signal
  (W2).
- Reuse-scan planning discipline (W3).
- Embedding/semantic retrieval (W4) and any SQLite/vector storage.
- Extraction of the shared memory interface (`write`/`retrieve`/
  `consolidate`) — that lands with `agent-memory` W1 per the
  premature-abstraction guard; this slice may be shaped *toward* it but does
  not build it.
- Polyglot support (tree-sitter, non-TS analyzers) — TypeScript only.
- Health metrics (cycles, god-modules, churn hotspots) and any editing of
  the map through the HTML view.
- Acting on the audit's recommendations (that is follow-up work the audit
  proposes).
- General agent memory (profile, playbooks, episodic log).

## Assumptions

- **OKF v0.1 is adopted as the record-format convention** for the memory
  substrate (frontmatter vocabulary, `index.md`/`log.md` conventions,
  linking), with a project-defined type vocabulary and custom keys on top.
  Ratified by the human 2026-07-02; recorded in
  `missions/architecture/architectural-memory.md` and `agent-memory.md`.
- **The riders are bundled** into this slice per the roadmap's 2026-06-18
  agreement (`analysis-tools` audit + `artifact-viewer`), not split into
  separate plans. Ratified 2026-07-02.
- **The audit gates tooling** (decided 2026-07-02): the `analysis-tools`
  audit is sequenced first (or early, in parallel), and its substrate
  recommendation gates the map generator's static-analysis tooling choice.
- **Sharding granularity is module-level, directory-based** (decided
  2026-07-02): module roots follow directory convention, with a config
  escape hatch for a project to declare them explicitly. Where a module has
  a barrel (`index.ts`), its exports define the public interface; otherwise
  all exports at the module boundary do. Not file- or class-level.
- **TypeScript-first**, building on existing TS tooling per the track doc
  (dependency-cruiser / ts-morph / typedoc class of tools); the model is only
  used for narrative.
- The map lives **in the target repo as tracked files** under
  `memory/architecture/` (decided 2026-07-02) — beside distilled knowledge,
  where W2's architecture-of-record will land adjacent, keeping the
  drift-signal pair together; same dogfooding stance as `missions/` and
  `memory/`. The file format must keep refreshes quiet: a no-change refresh
  touches nothing (see Acceptance Criteria), so tracked-derived churn stays
  near zero.
- "Index available without manually loading it" is achievable through the
  existing four-layer prompt assembly / capability mechanism; the exact
  injection point is design work, not new product scope.
- `cosmonauts serve` generalizes the deferred `cosmonauts arch serve` idea —
  one viewing surface for plans + architecture, per the `artifact-viewer`
  roadmap entry.

## Open Questions

- **Injection mechanics and budget** — always-inject the full index vs. a
  trimmed index vs. a capability that teaches agents to pull it; what happens
  in very large repos where even the index is big?
- **Narrative generation cost controls** — which model, what cap per
  refresh, and is narrative generation skippable (`--no-narrative`) for
  CI-ish contexts?
- **Freshness check depth** — is hash comparison done against the working
  tree on every session start (cost), on demand, or only at generate time
  with a recorded snapshot?
- **`serve` delivery shape** — live local server only, or also a static
  export; does it need file-watching refresh in this slice?
- **OKF `log.md`** — do we adopt the per-bundle `log.md` history convention
  now (the map is regenerated, so a log may be noise) or reserve it for
  curated records in W2+?

 succeeded in 0ms:
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

exec
/bin/zsh -lc 'git diff --name-only main...HEAD' in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
bun.lock
bundled/coding/agents/coordinator.ts
bundled/coding/agents/plan-reviewer.ts
bundled/coding/agents/planner.ts
bundled/coding/agents/quality-manager.ts
bundled/coding/agents/worker.ts
cli/architecture/narrative-provider.ts
cli/architecture/subcommand.ts
cli/main.ts
cli/serve/subcommand.ts
docs/architecture-map.md
domains/shared/extensions/architecture-memory/index.ts
fallow.toml
lib/architecture-map/analyzer.ts
lib/architecture-map/config.ts
lib/architecture-map/freshness.ts
lib/architecture-map/generator.ts
lib/architecture-map/index.ts
lib/architecture-map/store.ts
lib/architecture-map/types.ts
lib/artifact-viewer/index.ts
lib/artifact-viewer/loaders.ts
lib/artifact-viewer/renderer.ts
lib/artifact-viewer/server.ts
lib/config/loader.ts
lib/config/types.ts
lib/tasks/task-manager.ts
missions/archive/plans/coding-agnostic-framework/test-decoupling-ledger.md
missions/plans/code-structure-map/analysis-tools-audit.md
missions/plans/code-structure-map/integration-report.md
missions/plans/code-structure-map/qm.md
missions/reviews/review-round-2.md
missions/tasks/TASK-439 - Write analysis-tools audit substrate recommendation.md
missions/tasks/TASK-440 - Define architecture-map contracts, safe config, OKF vocabulary, and freshness foundation.md
missions/tasks/TASK-441 - Implement audit-selected TypeScript analyzer adapter behind map contracts.md
missions/tasks/TASK-442 - Build generator rendering and atomic map storage.md
missions/tasks/TASK-443 - Implement narrative reuse, pending status, and completion lifecycle.md
missions/tasks/TASK-444 - Add architecture generate CLI and CLI-owned narrative provider.md
missions/tasks/TASK-445 - Wire architecture-memory agent extension and shard-reading tool.md
missions/tasks/TASK-446 - Verify memory-half checkpoint before viewer work.md
missions/tasks/TASK-447 - Add read-only artifact loading and escaped viewer rendering foundation.md
missions/tasks/TASK-448 - Serve architecture map and plan viewer routes safely.md
missions/tasks/TASK-449 - Add cosmonauts serve CLI startup and non-fatal browser opening.md
missions/tasks/TASK-450 - Complete documentation and final Quality Contract verification.md
package.json
tests/architecture-map/analyzer.test.ts
tests/architecture-map/config.test.ts
tests/architecture-map/freshness.test.ts
tests/architecture-map/generator.test.ts
tests/artifact-viewer/loaders.test.ts
tests/artifact-viewer/render.test.ts
tests/artifact-viewer/server.test.ts
tests/cli/architecture/main-dispatch.test.ts
tests/cli/architecture/subcommand.test.ts
tests/cli/serve/main-dispatch.test.ts
tests/cli/serve/subcommand.test.ts
tests/config/loader.test.ts
tests/extensions/architecture-memory.test.ts
tests/tasks/task-manager.test.ts

exec
/bin/zsh -lc 'git diff --stat main...HEAD' in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
 bun.lock                                           |   2 +-
 bundled/coding/agents/coordinator.ts               |   7 +-
 bundled/coding/agents/plan-reviewer.ts             |   2 +-
 bundled/coding/agents/planner.ts                   |   2 +-
 bundled/coding/agents/quality-manager.ts           |   7 +-
 bundled/coding/agents/worker.ts                    |   2 +-
 cli/architecture/narrative-provider.ts             | 190 ++++++
 cli/architecture/subcommand.ts                     | 251 ++++++++
 cli/main.ts                                        |  11 +-
 cli/serve/subcommand.ts                            | 172 +++++
 docs/architecture-map.md                           | 129 ++++
 .../shared/extensions/architecture-memory/index.ts | 449 +++++++++++++
 fallow.toml                                        |   2 +
 lib/architecture-map/analyzer.ts                   | 611 ++++++++++++++++++
 lib/architecture-map/config.ts                     | 299 +++++++++
 lib/architecture-map/freshness.ts                  | 327 ++++++++++
 lib/architecture-map/generator.ts                  | 684 ++++++++++++++++++++
 lib/architecture-map/index.ts                      |  49 ++
 lib/architecture-map/store.ts                      | 283 +++++++++
 lib/architecture-map/types.ts                      | 198 ++++++
 lib/artifact-viewer/index.ts                       |  26 +
 lib/artifact-viewer/loaders.ts                     | 290 +++++++++
 lib/artifact-viewer/renderer.ts                    | 188 ++++++
 lib/artifact-viewer/server.ts                      | 703 +++++++++++++++++++++
 lib/config/loader.ts                               | 158 +++++
 lib/config/types.ts                                |  14 +
 lib/tasks/task-manager.ts                          |  64 +-
 .../test-decoupling-ledger.md                      |   1 +
 .../code-structure-map/analysis-tools-audit.md     |  80 +++
 .../plans/code-structure-map/integration-report.md |  12 +
 missions/plans/code-structure-map/qm.md            |  99 +++
 missions/reviews/review-round-2.md                 |  54 ++
 ...nalysis-tools audit substrate recommendation.md |  14 +-
 ...ig, OKF vocabulary, and freshness foundation.md |  22 +-
 ...Script analyzer adapter behind map contracts.md |  18 +-
 ...d generator rendering and atomic map storage.md |  20 +-
 ...se, pending status, and completion lifecycle.md |  18 +-
 ...enerate CLI and CLI-owned narrative provider.md |  16 +-
 ...emory agent extension and shard-reading tool.md |   4 +-
 ...fy memory-half checkpoint before viewer work.md |  37 +-
 ...ding and escaped viewer rendering foundation.md |  18 +-
 ...chitecture map and plan viewer routes safely.md |  20 +-
 ...ve CLI startup and non-fatal browser opening.md |  14 +-
 ...tion and final Quality Contract verification.md |  16 +-
 package.json                                       |   6 +-
 tests/architecture-map/analyzer.test.ts            | 157 +++++
 tests/architecture-map/config.test.ts              |  63 ++
 tests/architecture-map/freshness.test.ts           | 227 +++++++
 tests/architecture-map/generator.test.ts           | 678 ++++++++++++++++++++
 tests/artifact-viewer/loaders.test.ts              | 244 +++++++
 tests/artifact-viewer/render.test.ts               |  24 +
 tests/artifact-viewer/server.test.ts               | 167 +++++
 tests/cli/architecture/main-dispatch.test.ts       |  95 +++
 tests/cli/architecture/subcommand.test.ts          | 221 +++++++
 tests/cli/serve/main-dispatch.test.ts              |  84 +++
 tests/cli/serve/subcommand.test.ts                 | 111 ++++
 tests/config/loader.test.ts                        |  64 ++
 tests/extensions/architecture-memory.test.ts       | 300 +++++++++
 tests/tasks/task-manager.test.ts                   |  78 +++
 59 files changed, 7985 insertions(+), 117 deletions(-)

codex
The scoped diff is substantial but concentrated in the new architecture map, viewer, CLI, and extension surfaces. I’m going straight at the guarantees that passing tests often miss: config consistency, path validation order, stale checks, and edge/core boundaries.
exec
/bin/zsh -lc "sed -n '260,620p' missions/plans/code-structure-map/plan.md" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
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

exec
/bin/zsh -lc "nl -ba lib/architecture-map/config.ts | sed -n '1,360p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import { access, realpath } from "node:fs/promises";
     2	import {
     3		isAbsolute,
     4		join,
     5		normalize,
     6		relative,
     7		resolve,
     8		sep,
     9		win32,
    10	} from "node:path";
    11	import { loadProjectConfig } from "../config/index.ts";
    12	import type { ProjectConfig } from "../config/types.ts";
    13	import type { ArchitectureMapConfig } from "./types.ts";
    14	import { ARCHITECTURE_MAP_OUTPUT_DIR } from "./types.ts";
    15	
    16	interface Logger {
    17		error(message?: unknown, ...optionalParams: unknown[]): void;
    18	}
    19	
    20	interface ResolveArchitectureMapConfigOptions {
    21		readonly projectRoot: string;
    22		readonly projectConfig?: ProjectConfig;
    23		readonly overrides?: Partial<ArchitectureMapConfig>;
    24		readonly logger?: Logger;
    25	}
    26	
    27	type MutableArchitectureMapConfig = {
    28		-readonly [K in keyof ArchitectureMapConfig]: ArchitectureMapConfig[K];
    29	};
    30	
    31	const DEFAULT_SOURCE_ROOTS = [
    32		"src",
    33		"lib",
    34		"cli",
    35		"domains",
    36		"bundled",
    37		"packages",
    38	] as const;
    39	
    40	const DEFAULT_EXCLUDE = [
    41		"node_modules",
    42		".git",
    43		"dist",
    44		"build",
    45		"coverage",
    46		"missions",
    47		"memory",
    48		".cosmonauts",
    49	] as const;
    50	
    51	const DEFAULT_INJECTION_MAX_BYTES = 24_000;
    52	const DEFAULT_MAX_MODULES_PER_RUN = 20;
    53	
    54	export async function loadArchitectureMapConfig(
    55		projectRoot: string,
    56	): Promise<ArchitectureMapConfig> {
    57		const projectConfig = await loadProjectConfig(projectRoot);
    58		return resolveArchitectureMapConfig({ projectRoot, projectConfig });
    59	}
    60	
    61	export async function resolveArchitectureMapConfig(
    62		options: ResolveArchitectureMapConfigOptions,
    63	): Promise<ArchitectureMapConfig> {
    64		const logger = options.logger ?? console;
    65		// Load the project config from disk when a caller does not supply one, so
    66		// generation honors `.cosmonauts/config.json` architectureMap settings the
    67		// same way the viewer/extension freshness paths (via loadArchitectureMapConfig)
    68		// already do. Without this, generateArchitectureMap silently used defaults.
    69		const resolvedProjectConfig =
    70			options.projectConfig ?? (await loadProjectConfig(options.projectRoot));
    71		const projectConfig = resolvedProjectConfig?.architectureMap;
    72		const overrideConfig = options.overrides;
    73	
    74		const defaultSourceRoots = await existingDefaultSourceRoots(
    75			options.projectRoot,
    76		);
    77		const sourceRoots = await resolveConfiguredPaths({
    78			projectRoot: options.projectRoot,
    79			values: overrideConfig?.sourceRoots ?? projectConfig?.sourceRoots,
    80			fallback: defaultSourceRoots,
    81			fieldName: "architectureMap.sourceRoots",
    82			logger,
    83		});
    84		const moduleRoots = await resolveConfiguredPaths({
    85			projectRoot: options.projectRoot,
    86			values: overrideConfig?.moduleRoots ?? projectConfig?.moduleRoots,
    87			fieldName: "architectureMap.moduleRoots",
    88			logger,
    89		});
    90		const exclude = await resolveConfiguredPaths({
    91			projectRoot: options.projectRoot,
    92			values: [
    93				...DEFAULT_EXCLUDE,
    94				...(projectConfig?.exclude ?? []),
    95				...(overrideConfig?.exclude ?? []),
    96			],
    97			fieldName: "architectureMap.exclude",
    98			logger,
    99			allowMissing: true,
   100		});
   101	
   102		const config = buildArchitectureMapConfig({
   103			projectConfig,
   104			overrideConfig,
   105			defaultSourceRoots,
   106			sourceRoots,
   107			exclude,
   108			logger,
   109		});
   110	
   111		if (moduleRoots && moduleRoots.length > 0) {
   112			config.moduleRoots = moduleRoots;
   113		}
   114	
   115		return config;
   116	}
   117	
   118	export function canonicalizeArchitectureMapConfig(
   119		config: ArchitectureMapConfig,
   120	): string {
   121		const canonical = {
   122			outputDir: config.outputDir,
   123			sourceRoots: [...config.sourceRoots].sort(),
   124			moduleRoots: config.moduleRoots
   125				? [...config.moduleRoots].sort()
   126				: undefined,
   127			exclude: [...config.exclude].sort(),
   128			injectionMaxBytes: config.injectionMaxBytes,
   129			narrative: {
   130				enabled: config.narrative.enabled,
   131				maxModulesPerRun: config.narrative.maxModulesPerRun,
   132			},
   133		};
   134		return JSON.stringify(canonical);
   135	}
   136	
   137	function buildArchitectureMapConfig(options: {
   138		readonly projectConfig?: ProjectConfig["architectureMap"];
   139		readonly overrideConfig?: Partial<ArchitectureMapConfig>;
   140		readonly defaultSourceRoots: readonly string[];
   141		readonly sourceRoots?: readonly string[];
   142		readonly exclude?: readonly string[];
   143		readonly logger: Logger;
   144	}): MutableArchitectureMapConfig {
   145		return {
   146			outputDir: ARCHITECTURE_MAP_OUTPUT_DIR,
   147			sourceRoots:
   148				(options.sourceRoots?.length ?? 0) > 0
   149					? (options.sourceRoots ?? [])
   150					: options.defaultSourceRoots,
   151			exclude: options.exclude ?? [],
   152			injectionMaxBytes: resolvePositiveIntegerConfig(
   153				options.overrideConfig?.injectionMaxBytes,
   154				options.projectConfig?.injectionMaxBytes,
   155				DEFAULT_INJECTION_MAX_BYTES,
   156				"architectureMap.injectionMaxBytes",
   157				options.logger,
   158			),
   159			narrative: {
   160				enabled:
   161					options.overrideConfig?.narrative?.enabled ??
   162					options.projectConfig?.narrative?.enabled ??
   163					true,
   164				maxModulesPerRun: resolvePositiveIntegerConfig(
   165					options.overrideConfig?.narrative?.maxModulesPerRun,
   166					options.projectConfig?.narrative?.maxModulesPerRun,
   167					DEFAULT_MAX_MODULES_PER_RUN,
   168					"architectureMap.narrative.maxModulesPerRun",
   169					options.logger,
   170				),
   171			},
   172		};
   173	}
   174	
   175	async function resolveConfiguredPaths(options: {
   176		readonly projectRoot: string;
   177		readonly values?: readonly string[];
   178		readonly fallback?: readonly string[];
   179		readonly fieldName: string;
   180		readonly logger: Logger;
   181		readonly allowMissing?: boolean;
   182	}): Promise<readonly string[] | undefined> {
   183		if (!options.values) return options.fallback;
   184		return validateSafeRelativePaths({
   185			projectRoot: options.projectRoot,
   186			values: options.values,
   187			fieldName: options.fieldName,
   188			logger: options.logger,
   189			allowMissing: options.allowMissing,
   190		});
   191	}
   192	
   193	function resolvePositiveIntegerConfig(
   194		overrideValue: number | undefined,
   195		projectValue: number | undefined,
   196		fallback: number,
   197		fieldName: string,
   198		logger: Logger,
   199	): number {
   200		return coercePositiveInteger(
   201			overrideValue ?? projectValue ?? fallback,
   202			fallback,
   203			fieldName,
   204			logger,
   205		);
   206	}
   207	
   208	async function existingDefaultSourceRoots(
   209		projectRoot: string,
   210	): Promise<readonly string[]> {
   211		const existing: string[] = [];
   212		for (const root of DEFAULT_SOURCE_ROOTS) {
   213			try {
   214				await access(join(projectRoot, root));
   215				existing.push(root);
   216			} catch {
   217				// Missing default roots are normal.
   218			}
   219		}
   220		return existing.length > 0 ? existing : ["."];
   221	}
   222	
   223	async function validateSafeRelativePaths(options: {
   224		readonly projectRoot: string;
   225		readonly values: readonly string[];
   226		readonly fieldName: string;
   227		readonly logger: Logger;
   228		readonly allowMissing?: boolean;
   229	}): Promise<readonly string[]> {
   230		const safe: string[] = [];
   231		const realProjectRoot = await realpath(options.projectRoot).catch(() =>
   232			resolve(options.projectRoot),
   233		);
   234	
   235		for (const rawValue of options.values) {
   236			const normalized = normalizeRelativePath(rawValue);
   237			if (!normalized) {
   238				options.logger.error(
   239					`[warning] Skipping unsafe ${options.fieldName} entry ${JSON.stringify(rawValue)}: expected a non-empty relative path inside the project root.`,
   240				);
   241				continue;
   242			}
   243			if (isUnsafeRelativePath(rawValue)) {
   244				options.logger.error(
   245					`[warning] Skipping unsafe ${options.fieldName} entry ${JSON.stringify(rawValue)}: absolute paths and traversal are not allowed.`,
   246				);
   247				continue;
   248			}
   249	
   250			const resolved = resolve(realProjectRoot, normalized);
   251			const realResolved = await realpath(resolved).catch(() =>
   252				options.allowMissing ? resolved : resolved,
   253			);
   254			if (!isInsideOrEqual(realProjectRoot, realResolved)) {
   255				options.logger.error(
   256					`[warning] Skipping unsafe ${options.fieldName} entry ${JSON.stringify(rawValue)}: resolved path is outside the project root.`,
   257				);
   258				continue;
   259			}
   260	
   261			if (!safe.includes(normalized)) {
   262				safe.push(normalized);
   263			}
   264		}
   265	
   266		return safe;
   267	}
   268	
   269	function normalizeRelativePath(value: string): string | undefined {
   270		const trimmed = value.trim();
   271		if (trimmed.length === 0) return undefined;
   272		const normalized = normalize(trimmed).split(sep).join("/");
   273		if (normalized === ".") return ".";
   274		return normalized.replace(/\/+$/u, "");
   275	}
   276	
   277	function isUnsafeRelativePath(value: string): boolean {
   278		if (isAbsolute(value) || win32.isAbsolute(value)) return true;
   279		const parts = value.split(/[\\/]+/u);
   280		return parts.includes("..");
   281	}
   282	
   283	function isInsideOrEqual(root: string, candidate: string): boolean {
   284		const rel = relative(root, candidate);
   285		return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
   286	}
   287	
   288	function coercePositiveInteger(
   289		value: number,
   290		fallback: number,
   291		fieldName: string,
   292		logger: Logger,
   293	): number {
   294		if (Number.isInteger(value) && value > 0) return value;
   295		logger.error(
   296			`[warning] Skipping unsafe ${fieldName}: expected a positive integer, got ${JSON.stringify(value)}.`,
   297		);
   298		return fallback;
   299	}

exec
/bin/zsh -lc "nl -ba lib/architecture-map/freshness.ts | sed -n '1,380p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import { createHash } from "node:crypto";
     2	import type { Dirent } from "node:fs";
     3	import { readdir, readFile, stat } from "node:fs/promises";
     4	import { extname, isAbsolute, join, relative, resolve } from "node:path";
     5	import matter from "gray-matter";
     6	import { canonicalizeArchitectureMapConfig } from "./config.ts";
     7	import type {
     8		ArchitectureMapConfig,
     9		ArchitectureMapFreshness,
    10		ProjectSnapshot,
    11		SourceAnalyzer,
    12		SourceFileSnapshot,
    13		StatFingerprint,
    14		StatFingerprintFile,
    15	} from "./types.ts";
    16	
    17	interface ProjectSnapshotOptions {
    18		readonly projectRoot: string;
    19		readonly config: ArchitectureMapConfig;
    20		readonly analyzer: Pick<SourceAnalyzer, "getConfigInputs">;
    21	}
    22	
    23	interface ArchitectureMapFreshnessOptions extends ProjectSnapshotOptions {
    24		readonly indexPath?: string;
    25	}
    26	
    27	interface ArchitectureMapIndexFrontmatter {
    28		readonly projectHash?: string;
    29		readonly statFingerprint?: string;
    30	}
    31	
    32	const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
    33	const INDEX_PATH = "memory/architecture/index.md";
    34	
    35	export async function checkArchitectureMapFreshness(
    36		options: ArchitectureMapFreshnessOptions,
    37	): Promise<ArchitectureMapFreshness> {
    38		const frontmatter = await readArchitectureMapIndexFrontmatter(options);
    39		if (!frontmatter?.projectHash) return { kind: "missing" };
    40	
    41		const snapshot = await createProjectSnapshot(options);
    42		return compareFreshnessHashes(frontmatter.projectHash, snapshot.hash);
    43	}
    44	
    45	export async function checkArchitectureMapStatFreshness(
    46		options: ArchitectureMapFreshnessOptions,
    47	): Promise<ArchitectureMapFreshness> {
    48		const frontmatter = await readArchitectureMapIndexFrontmatter(options);
    49		if (!frontmatter?.statFingerprint) return { kind: "missing" };
    50	
    51		const fingerprint = await computeArchitectureMapStatFingerprint(options);
    52		return compareFreshnessHashes(frontmatter.statFingerprint, fingerprint.hash);
    53	}
    54	
    55	export function compareFreshnessHashes(
    56		oldHash: string | undefined,
    57		newHash: string,
    58	): ArchitectureMapFreshness {
    59		if (!oldHash) return { kind: "missing" };
    60		if (oldHash === newHash) return { kind: "current", hash: newHash };
    61		return { kind: "stale", oldHash, newHash };
    62	}
    63	
    64	export async function readArchitectureMapIndexFrontmatter(options: {
    65		readonly projectRoot: string;
    66		readonly indexPath?: string;
    67	}): Promise<ArchitectureMapIndexFrontmatter | undefined> {
    68		const indexPath = options.indexPath ?? join(options.projectRoot, INDEX_PATH);
    69		let raw: string;
    70		try {
    71			raw = await readFile(indexPath, "utf-8");
    72		} catch (error: unknown) {
    73			if (
    74				error &&
    75				typeof error === "object" &&
    76				"code" in error &&
    77				(error as NodeJS.ErrnoException).code === "ENOENT"
    78			) {
    79				return undefined;
    80			}
    81			throw error;
    82		}
    83	
    84		const parsed = matter(raw);
    85		const data = parsed.data as Record<string, unknown>;
    86		return {
    87			projectHash:
    88				typeof data.projectHash === "string" ? data.projectHash : undefined,
    89			statFingerprint:
    90				typeof data.statFingerprint === "string"
    91					? data.statFingerprint
    92					: undefined,
    93		};
    94	}
    95	
    96	export async function createProjectSnapshot(
    97		options: ProjectSnapshotOptions,
    98	): Promise<ProjectSnapshot> {
    99		const sourceFiles = await collectSourceFileSnapshots(
   100			options.projectRoot,
   101			options.config,
   102		);
   103		const analyzerConfigFiles = await collectAnalyzerConfigFiles(options);
   104		const hash = createHash("sha256");
   105	
   106		hash.update("architectureMapConfig\0");
   107		hash.update(canonicalizeArchitectureMapConfig(options.config));
   108		hash.update("\0");
   109	
   110		for (const configPath of analyzerConfigFiles) {
   111			const contents = await readFile(join(options.projectRoot, configPath));
   112			hash.update("analyzerConfig\0");
   113			hash.update(configPath);
   114			hash.update("\0");
   115			hash.update(sha256(contents));
   116			hash.update("\0");
   117		}
   118	
   119		for (const file of sourceFiles) {
   120			hash.update("source\0");
   121			hash.update(file.path);
   122			hash.update("\0");
   123			hash.update(file.hash);
   124			hash.update("\0");
   125		}
   126	
   127		return {
   128			hash: hash.digest("hex"),
   129			files: sourceFiles,
   130			analyzerConfigFiles,
   131		};
   132	}
   133	
   134	export async function computeArchitectureMapStatFingerprint(
   135		options: ProjectSnapshotOptions,
   136	): Promise<StatFingerprint> {
   137		const sourceFiles = await collectSourceFileStats(
   138			options.projectRoot,
   139			options.config,
   140		);
   141		const analyzerConfigFiles = await collectAnalyzerConfigFiles(options);
   142		const files: StatFingerprintFile[] = [...sourceFiles];
   143	
   144		for (const configPath of analyzerConfigFiles) {
   145			const configStat = await stat(join(options.projectRoot, configPath));
   146			files.push({
   147				path: configPath,
   148				size: configStat.size,
   149				mtimeMs: configStat.mtimeMs,
   150			});
   151		}
   152	
   153		files.sort((a, b) => a.path.localeCompare(b.path));
   154	
   155		const hash = createHash("sha256");
   156		hash.update("architectureMapConfig\0");
   157		hash.update(canonicalizeArchitectureMapConfig(options.config));
   158		hash.update("\0");
   159	
   160		for (const file of files) {
   161			hash.update(file.path);
   162			hash.update("\0");
   163			hash.update(String(file.size));
   164			hash.update("\0");
   165			hash.update(String(file.mtimeMs));
   166			hash.update("\0");
   167		}
   168	
   169		return { hash: hash.digest("hex"), files };
   170	}
   171	
   172	async function collectSourceFileSnapshots(
   173		projectRoot: string,
   174		config: ArchitectureMapConfig,
   175	): Promise<readonly SourceFileSnapshot[]> {
   176		const paths = await collectSourceFilePaths(projectRoot, config);
   177		const files: SourceFileSnapshot[] = [];
   178		for (const path of paths) {
   179			const absolute = join(projectRoot, path);
   180			const [fileStat, contents] = await Promise.all([
   181				stat(absolute),
   182				readFile(absolute),
   183			]);
   184			files.push({
   185				path,
   186				size: fileStat.size,
   187				mtimeMs: fileStat.mtimeMs,
   188				hash: sha256(contents),
   189			});
   190		}
   191		return files;
   192	}
   193	
   194	async function collectSourceFileStats(
   195		projectRoot: string,
   196		config: ArchitectureMapConfig,
   197	): Promise<readonly StatFingerprintFile[]> {
   198		const paths = await collectSourceFilePaths(projectRoot, config);
   199		const files: StatFingerprintFile[] = [];
   200		for (const path of paths) {
   201			const absolute = join(projectRoot, path);
   202			const fileStat = await stat(absolute);
   203			files.push({
   204				path,
   205				size: fileStat.size,
   206				mtimeMs: fileStat.mtimeMs,
   207			});
   208		}
   209		return files;
   210	}
   211	
   212	async function collectSourceFilePaths(
   213		projectRoot: string,
   214		config: ArchitectureMapConfig,
   215	): Promise<readonly string[]> {
   216		const paths = new Set<string>();
   217		for (const sourceRoot of config.sourceRoots) {
   218			const absoluteRoot = resolve(projectRoot, sourceRoot);
   219			await collectSourceFiles({
   220				projectRoot,
   221				root: absoluteRoot,
   222				exclude: config.exclude,
   223				paths,
   224			});
   225		}
   226		return [...paths].sort();
   227	}
   228	
   229	async function collectSourceFiles(options: {
   230		readonly projectRoot: string;
   231		readonly root: string;
   232		readonly exclude: readonly string[];
   233		readonly paths: Set<string>;
   234	}): Promise<void> {
   235		let entries: Dirent[];
   236		try {
   237			entries = await readdir(options.root, { withFileTypes: true });
   238		} catch (error: unknown) {
   239			if (
   240				error &&
   241				typeof error === "object" &&
   242				"code" in error &&
   243				(error as NodeJS.ErrnoException).code === "ENOENT"
   244			) {
   245				return;
   246			}
   247			throw error;
   248		}
   249	
   250		for (const entry of entries) {
   251			if (entry.isSymbolicLink()) continue;
   252			const absolute = join(options.root, entry.name);
   253			const repoPath = toRepoRelativePath(options.projectRoot, absolute);
   254			if (isExcluded(repoPath, options.exclude)) continue;
   255	
   256			if (entry.isDirectory()) {
   257				await collectSourceFiles({
   258					...options,
   259					root: absolute,
   260				});
   261				continue;
   262			}
   263	
   264			if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
   265				options.paths.add(repoPath);
   266			}
   267		}
   268	}
   269	
   270	async function collectAnalyzerConfigFiles(
   271		options: ProjectSnapshotOptions,
   272	): Promise<readonly string[]> {
   273		const rawInputs = await options.analyzer.getConfigInputs(
   274			options.projectRoot,
   275			options.config,
   276		);
   277		const configFiles = new Set<string>();
   278	
   279		for (const input of rawInputs) {
   280			const repoPath = normalizeAnalyzerConfigPath(options.projectRoot, input);
   281			if (!repoPath) continue;
   282			const absolute = join(options.projectRoot, repoPath);
   283			try {
   284				const inputStat = await stat(absolute);
   285				if (inputStat.isFile()) configFiles.add(repoPath);
   286			} catch (error: unknown) {
   287				if (
   288					error &&
   289					typeof error === "object" &&
   290					"code" in error &&
   291					(error as NodeJS.ErrnoException).code === "ENOENT"
   292				) {
   293					continue;
   294				}
   295				throw error;
   296			}
   297		}
   298	
   299		return [...configFiles].sort();
   300	}
   301	
   302	function normalizeAnalyzerConfigPath(
   303		projectRoot: string,
   304		input: string,
   305	): string | undefined {
   306		const absolute = isAbsolute(input) ? input : resolve(projectRoot, input);
   307		const rel = relative(projectRoot, absolute);
   308		if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return undefined;
   309		if (rel.split(/[\\/]+/u).includes("..")) return undefined;
   310		return rel.split(/[\\/]+/u).join("/");
   311	}
   312	
   313	function toRepoRelativePath(projectRoot: string, absolute: string): string {
   314		return relative(projectRoot, absolute)
   315			.split(/[\\/]+/u)
   316			.join("/");
   317	}
   318	
   319	function isExcluded(path: string, exclude: readonly string[]): boolean {
   320		return exclude.some(
   321			(prefix) => path === prefix || path.startsWith(`${prefix}/`),
   322		);
   323	}
   324	
   325	function sha256(contents: Buffer | string): string {
   326		return createHash("sha256").update(contents).digest("hex");
   327	}

exec
/bin/zsh -lc "nl -ba lib/architecture-map/store.ts | sed -n '1,360p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import {
     2		copyFile,
     3		mkdir,
     4		readdir,
     5		readFile,
     6		rename,
     7		rm,
     8		stat,
     9		utimes,
    10		writeFile,
    11	} from "node:fs/promises";
    12	import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
    13	import { ARCHITECTURE_MAP_OUTPUT_DIR } from "./types.ts";
    14	
    15	export interface ArchitectureMapBundleFile {
    16		/** Path relative to memory/architecture. */
    17		readonly path: string;
    18		readonly content: string;
    19	}
    20	
    21	type StoreArchitectureMapBundleResult =
    22		| { readonly kind: "written"; readonly changedFiles: readonly string[] }
    23		| { readonly kind: "unchanged" };
    24	
    25	interface ExistingGeneratedFile {
    26		readonly content: string;
    27		readonly atime: Date;
    28		readonly mtime: Date;
    29	}
    30	
    31	export async function hasArchitectureMap(
    32		projectRoot: string,
    33	): Promise<boolean> {
    34		try {
    35			const indexStat = await stat(
    36				join(projectRoot, ARCHITECTURE_MAP_OUTPUT_DIR, "index.md"),
    37			);
    38			return indexStat.isFile();
    39		} catch (error: unknown) {
    40			if (isNotFoundError(error)) return false;
    41			throw error;
    42		}
    43	}
    44	
    45	export async function recoverArchitectureMapStorage(
    46		projectRoot: string,
    47	): Promise<void> {
    48		const paths = architectureStoragePaths(projectRoot);
    49		const backupExists = await pathExists(paths.backupDir);
    50		if (backupExists) {
    51			if (!(await hasArchitectureMap(projectRoot))) {
    52				await rm(paths.targetDir, { recursive: true, force: true });
    53				await mkdir(paths.memoryDir, { recursive: true });
    54				await rename(paths.backupDir, paths.targetDir);
    55			} else {
    56				await rm(paths.backupDir, { recursive: true, force: true });
    57			}
    58		}
    59	
    60		await rm(paths.tempDir, { recursive: true, force: true });
    61	}
    62	
    63	export async function storeArchitectureMapBundle(options: {
    64		readonly projectRoot: string;
    65		readonly files: readonly ArchitectureMapBundleFile[];
    66	}): Promise<StoreArchitectureMapBundleResult> {
    67		const paths = architectureStoragePaths(options.projectRoot);
    68		const files = validateBundleFiles(paths.targetDir, options.files);
    69		const existingFiles = await readExistingGeneratedFiles(paths.targetDir);
    70		const changedFiles = changedGeneratedFiles(files, existingFiles);
    71	
    72		if (changedFiles.length === 0) {
    73			return { kind: "unchanged" };
    74		}
    75	
    76		await writeReplacementTempBundle({
    77			tempDir: paths.tempDir,
    78			targetDir: paths.targetDir,
    79			files,
    80			existingFiles,
    81		});
    82		try {
    83			await validateTempBundle(paths.tempDir, files);
    84			await rm(paths.backupDir, { recursive: true, force: true });
    85			await mkdir(paths.memoryDir, { recursive: true });
    86	
    87			const hadTarget = await pathExists(paths.targetDir);
    88			if (hadTarget) {
    89				await rename(paths.targetDir, paths.backupDir);
    90			}
    91	
    92			try {
    93				await rename(paths.tempDir, paths.targetDir);
    94			} catch (error) {
    95				if (hadTarget) {
    96					await rm(paths.targetDir, { recursive: true, force: true });
    97					await rename(paths.backupDir, paths.targetDir);
    98				}
    99				throw error;
   100			}
   101	
   102			await rm(paths.backupDir, { recursive: true, force: true });
   103			return { kind: "written", changedFiles };
   104		} catch (error) {
   105			await rm(paths.tempDir, { recursive: true, force: true });
   106			throw error;
   107		}
   108	}
   109	
   110	function architectureStoragePaths(projectRoot: string): {
   111		readonly memoryDir: string;
   112		readonly targetDir: string;
   113		readonly tempDir: string;
   114		readonly backupDir: string;
   115	} {
   116		const memoryDir = join(projectRoot, "memory");
   117		return {
   118			memoryDir,
   119			targetDir: join(projectRoot, ARCHITECTURE_MAP_OUTPUT_DIR),
   120			tempDir: join(memoryDir, ".architecture.tmp"),
   121			backupDir: join(memoryDir, ".architecture.bak"),
   122		};
   123	}
   124	
   125	function validateBundleFiles(
   126		targetDir: string,
   127		files: readonly ArchitectureMapBundleFile[],
   128	): readonly ArchitectureMapBundleFile[] {
   129		if (!files.some((file) => file.path === "index.md")) {
   130			throw new Error("Architecture map bundle is missing index.md.");
   131		}
   132	
   133		const seen = new Set<string>();
   134		const validated: ArchitectureMapBundleFile[] = [];
   135		for (const file of files) {
   136			validateBundlePath(targetDir, file.path);
   137			if (seen.has(file.path)) {
   138				throw new Error(`Duplicate architecture map bundle path: ${file.path}`);
   139			}
   140			seen.add(file.path);
   141			validated.push(file);
   142		}
   143	
   144		return validated.sort((left, right) => left.path.localeCompare(right.path));
   145	}
   146	
   147	function validateBundlePath(targetDir: string, path: string): void {
   148		if (
   149			path.length === 0 ||
   150			path.includes("\\") ||
   151			path.startsWith("/") ||
   152			path === "." ||
   153			path.split("/").includes("..") ||
   154			posix.normalize(path) !== path
   155		) {
   156			throw new Error(`Unsafe architecture map bundle path: ${path}`);
   157		}
   158	
   159		const absolute = resolve(targetDir, ...path.split("/"));
   160		const rel = relative(targetDir, absolute);
   161		if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
   162			throw new Error(`Unsafe architecture map bundle path: ${path}`);
   163		}
   164	}
   165	
   166	async function readExistingGeneratedFiles(
   167		targetDir: string,
   168	): Promise<ReadonlyMap<string, ExistingGeneratedFile>> {
   169		if (!(await pathExists(targetDir))) return new Map();
   170		const files = new Map<string, ExistingGeneratedFile>();
   171		await collectExistingFiles(targetDir, targetDir, files);
   172		return files;
   173	}
   174	
   175	async function collectExistingFiles(
   176		rootDir: string,
   177		dir: string,
   178		files: Map<string, ExistingGeneratedFile>,
   179	): Promise<void> {
   180		const entries = await readdir(dir, { withFileTypes: true });
   181		for (const entry of entries) {
   182			const absolute = join(dir, entry.name);
   183			if (entry.isDirectory()) {
   184				await collectExistingFiles(rootDir, absolute, files);
   185				continue;
   186			}
   187			if (!entry.isFile()) continue;
   188			const rel = relative(rootDir, absolute)
   189				.split(/[\\/]+/u)
   190				.join("/");
   191			const [fileStat, content] = await Promise.all([
   192				stat(absolute),
   193				readFile(absolute, "utf-8"),
   194			]);
   195			files.set(rel, {
   196				content,
   197				atime: fileStat.atime,
   198				mtime: fileStat.mtime,
   199			});
   200		}
   201	}
   202	
   203	function changedGeneratedFiles(
   204		files: readonly ArchitectureMapBundleFile[],
   205		existingFiles: ReadonlyMap<string, ExistingGeneratedFile>,
   206	): readonly string[] {
   207		const changed = new Set<string>();
   208		const expectedPaths = new Set(files.map((file) => file.path));
   209		for (const file of files) {
   210			if (existingFiles.get(file.path)?.content !== file.content) {
   211				changed.add(toProjectMapPath(file.path));
   212			}
   213		}
   214		for (const existingPath of existingFiles.keys()) {
   215			if (!expectedPaths.has(existingPath)) {
   216				changed.add(toProjectMapPath(existingPath));
   217			}
   218		}
   219		return [...changed].sort();
   220	}
   221	
   222	async function writeReplacementTempBundle(options: {
   223		readonly tempDir: string;
   224		readonly targetDir: string;
   225		readonly files: readonly ArchitectureMapBundleFile[];
   226		readonly existingFiles: ReadonlyMap<string, ExistingGeneratedFile>;
   227	}): Promise<void> {
   228		await rm(options.tempDir, { recursive: true, force: true });
   229		await mkdir(options.tempDir, { recursive: true });
   230		for (const file of options.files) {
   231			const absolute = join(options.tempDir, ...file.path.split("/"));
   232			await mkdir(dirname(absolute), { recursive: true });
   233			const existing = options.existingFiles.get(file.path);
   234			if (existing?.content === file.content) {
   235				await copyFile(
   236					join(options.targetDir, ...file.path.split("/")),
   237					absolute,
   238				);
   239				await utimes(absolute, existing.atime, existing.mtime);
   240				continue;
   241			}
   242			await writeFile(absolute, file.content, "utf-8");
   243		}
   244	}
   245	
   246	async function validateTempBundle(
   247		tempDir: string,
   248		files: readonly ArchitectureMapBundleFile[],
   249	): Promise<void> {
   250		for (const file of files) {
   251			const fileStat = await stat(join(tempDir, ...file.path.split("/")));
   252			if (!fileStat.isFile()) {
   253				throw new Error(`Missing architecture map bundle file: ${file.path}`);
   254			}
   255		}
   256		const indexStat = await stat(join(tempDir, "index.md"));
   257		if (!indexStat.isFile()) {
   258			throw new Error("Architecture map bundle is missing index.md.");
   259		}
   260	}
   261	
   262	function toProjectMapPath(path: string): string {
   263		return `${ARCHITECTURE_MAP_OUTPUT_DIR}/${path}`;
   264	}
   265	
   266	async function pathExists(path: string): Promise<boolean> {
   267		try {
   268			await stat(path);
   269			return true;
   270		} catch (error: unknown) {
   271			if (isNotFoundError(error)) return false;
   272			throw error;
   273		}
   274	}
   275	
   276	function isNotFoundError(error: unknown): boolean {
   277		return (
   278			error !== null &&
   279			typeof error === "object" &&
   280			"code" in error &&
   281			(error as NodeJS.ErrnoException).code === "ENOENT"
   282		);
   283	}

codex
I’ve confirmed the plan’s late review additions require a stat-only freshness path for turns/viewer, runtime gating for exactly five agents, and generation-time config loading from disk. Next I’m reading those implementations with line numbers and then I’ll cross-check tests/markers only where it helps isolate risk.
exec
/bin/zsh -lc "nl -ba lib/architecture-map/analyzer.ts | sed -n '1,720p'" in /Users/cosmos/Projects/cosmonauts
exec
/bin/zsh -lc "nl -ba lib/architecture-map/generator.ts | sed -n '1,760p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import { createHash } from "node:crypto";
     2	import { readFile, stat } from "node:fs/promises";
     3	import {
     4		basename,
     5		dirname,
     6		extname,
     7		isAbsolute,
     8		relative,
     9		resolve,
    10	} from "node:path";
    11	import * as ts from "typescript";
    12	import type {
    13		AnalysisInput,
    14		AnalysisResult,
    15		ArchitectureMapConfig,
    16		ModuleDependency,
    17		ModuleSkeleton,
    18		PublicExport,
    19		SourceAnalyzer,
    20		SourceFileSnapshot,
    21	} from "./types.ts";
    22	
    23	const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
    24	const BARREL_FILENAMES = new Set(["index.ts", "index.tsx"]);
    25	
    26	export function createTypeScriptSourceAnalyzer(): SourceAnalyzer {
    27		return {
    28			getConfigInputs: getTypeScriptConfigInputs,
    29			analyze: analyzeTypeScriptSources,
    30		};
    31	}
    32	
    33	export const typescriptSourceAnalyzer = createTypeScriptSourceAnalyzer();
    34	
    35	async function getTypeScriptConfigInputs(
    36		projectRoot: string,
    37		_config: ArchitectureMapConfig,
    38	): Promise<readonly string[]> {
    39		const inputs = new Set<string>();
    40		await addIfFile(projectRoot, "package.json", inputs);
    41		await collectTsconfigInputs(projectRoot, "tsconfig.json", inputs, new Set());
    42		return [...inputs].sort();
    43	}
    44	
    45	async function analyzeTypeScriptSources(
    46		input: AnalysisInput,
    47	): Promise<AnalysisResult> {
    48		const sourceFiles = input.snapshot.files.filter((file) =>
    49			SOURCE_EXTENSIONS.has(extname(file.path)),
    50		);
    51		if (sourceFiles.length === 0) {
    52			return { modules: [], diagnostics: [] };
    53		}
    54	
    55		const compilerOptions = loadCompilerOptions(input.projectRoot);
    56		const compilerHost = ts.createCompilerHost(compilerOptions, true);
    57		const program = ts.createProgram({
    58			rootNames: sourceFiles.map((file) => resolve(input.projectRoot, file.path)),
    59			options: compilerOptions,
    60			host: compilerHost,
    61		});
    62		const checker = program.getTypeChecker();
    63		const sourceLookup = createSourceLookup(input.projectRoot, sourceFiles);
    64		const moduleRoots = discoverModuleRoots(input.config, sourceFiles);
    65		const moduleFiles = assignFilesToModules(moduleRoots, sourceFiles);
    66		const fileToModule = mapFilesToModules(moduleFiles);
    67	
    68		const modules: ModuleSkeleton[] = [];
    69		for (const rootDir of moduleRoots) {
    70			const files = moduleFiles.get(rootDir) ?? [];
    71			if (files.length === 0) continue;
    72	
    73			const hasBarrel = files.some((file) =>
    74				BARREL_FILENAMES.has(basename(file)),
    75			);
    76			const publicFiles = hasBarrel
    77				? files.filter((file) => BARREL_FILENAMES.has(basename(file)))
    78				: files.filter((file) => !isTestSource(file));
    79			const publicInterface = collectPublicInterface({
    80				checker,
    81				program,
    82				projectRoot: input.projectRoot,
    83				files: publicFiles,
    84				sourceLookup,
    85			});
    86			const { dependencies, externalDependencies } = collectDependencies({
    87				compilerHost,
    88				compilerOptions,
    89				fileToModule,
    90				files,
    91				program,
    92				projectRoot: input.projectRoot,
    93				sourceLookup,
    94				sourceModule: rootDir,
    95			});
    96			const moduleSourceFiles = sourceFiles.filter((file) =>
    97				files.includes(file.path),
    98			);
    99			const sourceHash = hashSourceFiles(moduleSourceFiles);
   100			const skeletonCore = {
   101				resource: rootDir,
   102				rootDir,
   103				files,
   104				hasBarrel,
   105				publicInterface,
   106				dependencies,
   107				externalDependencies,
   108			};
   109	
   110			modules.push({
   111				...skeletonCore,
   112				sourceHash,
   113				skeletonHash: hashJson(skeletonCore),
   114			});
   115		}
   116	
   117		return { modules: modules.sort(compareByResource), diagnostics: [] };
   118	}
   119	
   120	function loadCompilerOptions(projectRoot: string): ts.CompilerOptions {
   121		const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists);
   122		const defaults = defaultCompilerOptions(projectRoot);
   123		if (!configPath) return defaults;
   124	
   125		const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
   126		if (configFile.error) return defaults;
   127	
   128		const parsed = ts.parseJsonConfigFileContent(
   129			configFile.config,
   130			ts.sys,
   131			dirname(configPath),
   132			defaults,
   133			configPath,
   134		);
   135		return {
   136			...defaults,
   137			...parsed.options,
   138			noEmit: true,
   139		};
   140	}
   141	
   142	function defaultCompilerOptions(projectRoot: string): ts.CompilerOptions {
   143		return {
   144			allowImportingTsExtensions: true,
   145			baseUrl: projectRoot,
   146			module: ts.ModuleKind.NodeNext,
   147			moduleResolution: ts.ModuleResolutionKind.NodeNext,
   148			noEmit: true,
   149			skipLibCheck: true,
   150			strict: true,
   151			target: ts.ScriptTarget.ES2023,
   152		};
   153	}
   154	
   155	function discoverModuleRoots(
   156		config: ArchitectureMapConfig,
   157		sourceFiles: readonly SourceFileSnapshot[],
   158	): readonly string[] {
   159		if (config.moduleRoots && config.moduleRoots.length > 0) {
   160			return [...config.moduleRoots]
   161				.filter((root) =>
   162					sourceFiles.some((file) => isInsideOrEqualRepoPath(root, file.path)),
   163				)
   164				.sort();
   165		}
   166	
   167		const roots = new Set<string>();
   168		for (const sourceRoot of config.sourceRoots) {
   169			const filesUnderRoot = sourceFiles.filter((file) =>
   170				isInsideOrEqualRepoPath(sourceRoot, file.path),
   171			);
   172			for (const file of filesUnderRoot) {
   173				const rest = relativeRepoPath(sourceRoot, file.path);
   174				const firstSegment = rest.split("/")[0];
   175				if (!firstSegment || !rest.includes("/")) {
   176					roots.add(sourceRoot);
   177					continue;
   178				}
   179				roots.add(joinRepoPath(sourceRoot, firstSegment));
   180			}
   181		}
   182		return [...roots].sort();
   183	}
   184	
   185	function assignFilesToModules(
   186		moduleRoots: readonly string[],
   187		sourceFiles: readonly SourceFileSnapshot[],
   188	): Map<string, readonly string[]> {
   189		const moduleFiles = new Map<string, readonly string[]>();
   190		for (const root of moduleRoots) {
   191			moduleFiles.set(
   192				root,
   193				sourceFiles
   194					.filter((file) => isInsideOrEqualRepoPath(root, file.path))
   195					.map((file) => file.path)
   196					.sort(),
   197			);
   198		}
   199		return moduleFiles;
   200	}
   201	
   202	function mapFilesToModules(
   203		moduleFiles: Map<string, readonly string[]>,
   204	): Map<string, string> {
   205		const fileToModule = new Map<string, string>();
   206		const entries = [...moduleFiles.entries()].sort(
   207			([left], [right]) => right.length - left.length,
   208		);
   209		for (const [resource, files] of entries) {
   210			for (const file of files) {
   211				if (!fileToModule.has(file)) fileToModule.set(file, resource);
   212			}
   213		}
   214		return fileToModule;
   215	}
   216	
   217	function collectPublicInterface(options: {
   218		readonly checker: ts.TypeChecker;
   219		readonly program: ts.Program;
   220		readonly projectRoot: string;
   221		readonly files: readonly string[];
   222		readonly sourceLookup: Map<string, string>;
   223	}): readonly PublicExport[] {
   224		const exports = new Map<string, PublicExport>();
   225		for (const file of options.files) {
   226			const sourceFile = options.program.getSourceFile(
   227				resolve(options.projectRoot, file),
   228			);
   229			if (!sourceFile) continue;
   230			const moduleSymbol = options.checker.getSymbolAtLocation(sourceFile);
   231			if (!moduleSymbol) continue;
   232	
   233			for (const exportSymbol of options.checker.getExportsOfModule(
   234				moduleSymbol,
   235			)) {
   236				const publicExport = toPublicExport(exportSymbol, sourceFile, options);
   237				if (!publicExport) continue;
   238				exports.set(
   239					`${publicExport.name}\0${publicExport.sourceFile}`,
   240					publicExport,
   241				);
   242			}
   243		}
   244	
   245		return [...exports.values()].sort(comparePublicExports);
   246	}
   247	
   248	function toPublicExport(
   249		exportSymbol: ts.Symbol,
   250		fallbackSourceFile: ts.SourceFile,
   251		options: {
   252			readonly checker: ts.TypeChecker;
   253			readonly projectRoot: string;
   254			readonly sourceLookup: Map<string, string>;
   255		},
   256	): PublicExport | undefined {
   257		const symbol =
   258			exportSymbol.flags & ts.SymbolFlags.Alias
   259				? options.checker.getAliasedSymbol(exportSymbol)
   260				: exportSymbol;
   261		const declaration = selectPublicDeclaration(symbol, exportSymbol);
   262		if (!declaration) return undefined;
   263	
   264		const sourceFile = declaration.getSourceFile() ?? fallbackSourceFile;
   265		return {
   266			name: exportSymbol.getName(),
   267			kind: publicExportKind(declaration),
   268			signature: declarationSignature(
   269				declaration,
   270				exportSymbol.getName(),
   271				options.checker,
   272			),
   273			sourceFile:
   274				options.sourceLookup.get(normalizeAbsolutePath(sourceFile.fileName)) ??
   275				toRepoRelativePath(options.projectRoot, sourceFile.fileName),
   276		};
   277	}
   278	
   279	function selectPublicDeclaration(
   280		symbol: ts.Symbol,
   281		fallbackSymbol: ts.Symbol,
   282	): ts.Declaration | undefined {
   283		const declarations =
   284			symbol.getDeclarations() ?? fallbackSymbol.getDeclarations();
   285		return declarations?.find(
   286			(declaration) => !ts.isExportSpecifier(declaration),
   287		);
   288	}
   289	
   290	function publicExportKind(declaration: ts.Declaration): PublicExport["kind"] {
   291		if (ts.isFunctionDeclaration(declaration)) return "function";
   292		if (ts.isClassDeclaration(declaration)) return "class";
   293		if (ts.isInterfaceDeclaration(declaration)) return "interface";
   294		if (ts.isTypeAliasDeclaration(declaration)) return "type";
   295		if (ts.isVariableDeclaration(declaration)) return "const";
   296		if (ts.isEnumDeclaration(declaration)) return "enum";
   297		return "other";
   298	}
   299	
   300	function declarationSignature(
   301		declaration: ts.Declaration,
   302		name: string,
   303		checker: ts.TypeChecker,
   304	): string {
   305		if (ts.isFunctionDeclaration(declaration)) {
   306			const signature = checker.getSignatureFromDeclaration(declaration);
   307			const rendered = signature
   308				? checker.signatureToString(signature)
   309				: "() => unknown";
   310			return `export function ${name}${rendered};`;
   311		}
   312		if (ts.isVariableDeclaration(declaration)) {
   313			const type = declaration.type
   314				? declaration.type.getText(declaration.getSourceFile())
   315				: checker.typeToString(checker.getTypeAtLocation(declaration.name));
   316			return `export const ${name}: ${type};`;
   317		}
   318		if (ts.isClassDeclaration(declaration)) {
   319			return collapseWhitespace(`export class ${name}`);
   320		}
   321		return collapseWhitespace(declaration.getText(declaration.getSourceFile()));
   322	}
   323	
   324	function collectDependencies(options: {
   325		readonly compilerHost: ts.CompilerHost;
   326		readonly compilerOptions: ts.CompilerOptions;
   327		readonly fileToModule: Map<string, string>;
   328		readonly files: readonly string[];
   329		readonly program: ts.Program;
   330		readonly projectRoot: string;
   331		readonly sourceLookup: Map<string, string>;
   332		readonly sourceModule: string;
   333	}): {
   334		readonly dependencies: readonly ModuleDependency[];
   335		readonly externalDependencies: readonly string[];
   336	} {
   337		const internal = new Map<string, Set<string>>();
   338		const external = new Set<string>();
   339	
   340		for (const file of options.files) {
   341			const sourceFile = options.program.getSourceFile(
   342				resolve(options.projectRoot, file),
   343			);
   344			if (!sourceFile) continue;
   345	
   346			for (const specifier of collectModuleSpecifiers(sourceFile)) {
   347				recordDependencySpecifier({
   348					...options,
   349					file,
   350					sourceFile,
   351					specifier,
   352					internal,
   353					external,
   354				});
   355			}
   356		}
   357	
   358		return {
   359			dependencies: [...internal.entries()]
   360				.map(([resource, importedBy]) => ({
   361					resource,
   362					importedBy: [...importedBy].sort(),
   363				}))
   364				.sort(compareModuleDependencies),
   365			externalDependencies: [...external].sort(),
   366		};
   367	}
   368	
   369	function recordDependencySpecifier(options: {
   370		readonly compilerHost: ts.CompilerHost;
   371		readonly compilerOptions: ts.CompilerOptions;
   372		readonly external: Set<string>;
   373		readonly file: string;
   374		readonly fileToModule: Map<string, string>;
   375		readonly internal: Map<string, Set<string>>;
   376		readonly sourceFile: ts.SourceFile;
   377		readonly sourceLookup: Map<string, string>;
   378		readonly sourceModule: string;
   379		readonly specifier: string;
   380	}): void {
   381		const resolved = ts.resolveModuleName(
   382			options.specifier,
   383			options.sourceFile.fileName,
   384			options.compilerOptions,
   385			options.compilerHost,
   386		).resolvedModule;
   387		const resolvedRepoPath = resolved
   388			? options.sourceLookup.get(normalizeAbsolutePath(resolved.resolvedFileName))
   389			: undefined;
   390		const targetModule = resolvedRepoPath
   391			? options.fileToModule.get(resolvedRepoPath)
   392			: undefined;
   393	
   394		if (targetModule && targetModule !== options.sourceModule) {
   395			const importedBy = options.internal.get(targetModule) ?? new Set<string>();
   396			importedBy.add(options.file);
   397			options.internal.set(targetModule, importedBy);
   398			return;
   399		}
   400	
   401		if (!isRelativeModuleSpecifier(options.specifier)) {
   402			options.external.add(externalDependencyName(options.specifier));
   403		}
   404	}
   405	
   406	function collectModuleSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
   407		const specifiers: string[] = [];
   408		for (const statement of sourceFile.statements) {
   409			if (
   410				ts.isImportDeclaration(statement) &&
   411				ts.isStringLiteral(statement.moduleSpecifier)
   412			) {
   413				specifiers.push(statement.moduleSpecifier.text);
   414			}
   415			if (
   416				ts.isExportDeclaration(statement) &&
   417				statement.moduleSpecifier &&
   418				ts.isStringLiteral(statement.moduleSpecifier)
   419			) {
   420				specifiers.push(statement.moduleSpecifier.text);
   421			}
   422		}
   423		return specifiers.sort();
   424	}
   425	
   426	function createSourceLookup(
   427		projectRoot: string,
   428		sourceFiles: readonly SourceFileSnapshot[],
   429	): Map<string, string> {
   430		return new Map(
   431			sourceFiles.map((file) => [
   432				normalizeAbsolutePath(resolve(projectRoot, file.path)),
   433				file.path,
   434			]),
   435		);
   436	}
   437	
   438	async function collectTsconfigInputs(
   439		projectRoot: string,
   440		repoPath: string,
   441		inputs: Set<string>,
   442		seen: Set<string>,
   443	): Promise<void> {
   444		const normalized = normalizeRepoPath(repoPath);
   445		if (seen.has(normalized)) return;
   446		seen.add(normalized);
   447		const added = await addIfFile(projectRoot, normalized, inputs);
   448		if (!added) return;
   449	
   450		const absolute = resolve(projectRoot, normalized);
   451		const raw = await readFile(absolute, "utf-8");
   452		let parsed: unknown;
   453		try {
   454			parsed = JSON.parse(raw);
   455		} catch {
   456			return;
   457		}
   458		const extensions = tsconfigExtends(parsed);
   459		for (const extension of extensions) {
   460			const extendedPath = resolveTsconfigExtends(
   461				projectRoot,
   462				absolute,
   463				extension,
   464			);
   465			if (extendedPath) {
   466				await collectTsconfigInputs(projectRoot, extendedPath, inputs, seen);
   467			}
   468		}
   469	}
   470	
   471	async function addIfFile(
   472		projectRoot: string,
   473		repoPath: string,
   474		inputs: Set<string>,
   475	): Promise<boolean> {
   476		try {
   477			const fileStat = await stat(resolve(projectRoot, repoPath));
   478			if (!fileStat.isFile()) return false;
   479			inputs.add(normalizeRepoPath(repoPath));
   480			return true;
   481		} catch (error: unknown) {
   482			if (
   483				error &&
   484				typeof error === "object" &&
   485				"code" in error &&
   486				(error as NodeJS.ErrnoException).code === "ENOENT"
   487			) {
   488				return false;
   489			}
   490			throw error;
   491		}
   492	}
   493	
   494	function tsconfigExtends(parsed: unknown): readonly string[] {
   495		if (!parsed || typeof parsed !== "object" || !("extends" in parsed)) {
   496			return [];
   497		}
   498		const value = (parsed as { extends?: unknown }).extends;
   499		if (typeof value === "string") return [value];
   500		if (Array.isArray(value)) {
   501			return value.filter((item): item is string => typeof item === "string");
   502		}
   503		return [];
   504	}
   505	
   506	function resolveTsconfigExtends(
   507		projectRoot: string,
   508		configPath: string,
   509		extension: string,
   510	): string | undefined {
   511		if (!extension.startsWith(".") && !isAbsolute(extension)) return undefined;
   512		const candidate = isAbsolute(extension)
   513			? extension
   514			: resolve(dirname(configPath), extension);
   515		const withJson = extname(candidate) ? candidate : `${candidate}.json`;
   516		const rel = relative(projectRoot, withJson);
   517		if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return undefined;
   518		return normalizeRepoPath(rel);
   519	}
   520	
   521	function hashSourceFiles(files: readonly SourceFileSnapshot[]): string {
   522		const hash = createHash("sha256");
   523		for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
   524			hash.update(file.path);
   525			hash.update("\0");
   526			hash.update(file.hash);
   527			hash.update("\0");
   528		}
   529		return hash.digest("hex");
   530	}
   531	
   532	function hashJson(value: unknown): string {
   533		return createHash("sha256").update(JSON.stringify(value)).digest("hex");
   534	}
   535	
   536	function compareByResource(
   537		left: ModuleSkeleton,
   538		right: ModuleSkeleton,
   539	): number {
   540		return left.resource.localeCompare(right.resource);
   541	}
   542	
   543	function comparePublicExports(left: PublicExport, right: PublicExport): number {
   544		return (
   545			left.name.localeCompare(right.name) ||
   546			left.sourceFile.localeCompare(right.sourceFile)
   547		);
   548	}
   549	
   550	function compareModuleDependencies(
   551		left: ModuleDependency,
   552		right: ModuleDependency,
   553	): number {
   554		return left.resource.localeCompare(right.resource);
   555	}
   556	
   557	function collapseWhitespace(value: string): string {
   558		return value.replace(/\s+/gu, " ").trim();
   559	}
   560	
   561	function isTestSource(path: string): boolean {
   562		const segments = path.split("/");
   563		const file = segments.at(-1) ?? "";
   564		return (
   565			segments.includes("__tests__") ||
   566			file.endsWith(".test.ts") ||
   567			file.endsWith(".test.tsx") ||
   568			file.endsWith(".spec.ts") ||
   569			file.endsWith(".spec.tsx")
   570		);
   571	}
   572	
   573	function isRelativeModuleSpecifier(specifier: string): boolean {
   574		return specifier.startsWith(".") || specifier.startsWith("/");
   575	}
   576	
   577	function externalDependencyName(specifier: string): string {
   578		const parts = specifier.split("/");
   579		if (specifier.startsWith("@") && parts.length >= 2) {
   580			return `${parts[0]}/${parts[1]}`;
   581		}
   582		return parts[0] ?? specifier;
   583	}
   584	
   585	function isInsideOrEqualRepoPath(root: string, path: string): boolean {
   586		if (root === ".") return true;
   587		return path === root || path.startsWith(`${root}/`);
   588	}
   589	
   590	function relativeRepoPath(root: string, path: string): string {
   591		if (root === ".") return path;
   592		return path.slice(root.length + 1);
   593	}
   594	
   595	function joinRepoPath(...parts: readonly string[]): string {
   596		return parts.filter((part) => part.length > 0 && part !== ".").join("/");
   597	}
   598	
   599	function normalizeRepoPath(path: string): string {
   600		return path.split(/[\\/]+/u).join("/");
   601	}
   602	
   603	function normalizeAbsolutePath(path: string): string {
   604		return resolve(path)
   605			.split(/[\\/]+/u)
   606			.join("/");
   607	}
   608	
   609	function toRepoRelativePath(projectRoot: string, absolute: string): string {
   610		return normalizeRepoPath(relative(projectRoot, absolute));
   611	}

 succeeded in 0ms:
     1	import { access, readdir, readFile } from "node:fs/promises";
     2	import { join, relative, resolve } from "node:path";
     3	import matter from "gray-matter";
     4	import { resolveArchitectureMapConfig } from "./config.ts";
     5	import {
     6		computeArchitectureMapStatFingerprint,
     7		createProjectSnapshot,
     8	} from "./freshness.ts";
     9	import {
    10		type ArchitectureMapBundleFile,
    11		hasArchitectureMap,
    12		recoverArchitectureMapStorage,
    13		storeArchitectureMapBundle,
    14	} from "./store.ts";
    15	import {
    16		ARCHITECTURE_MAP_GENERATOR_VERSION,
    17		ARCHITECTURE_MAP_OUTPUT_DIR,
    18		type GenerateArchitectureMapOptions,
    19		type GenerateArchitectureMapResult,
    20		type ModuleDependent,
    21		type ModuleNarrative,
    22		type ModuleRecord,
    23		type ModuleSkeleton,
    24		type NarrativeProvider,
    25		type NarrativeStatus,
    26		OKF_RECORD_TYPES,
    27		type PublicExport,
    28	} from "./types.ts";
    29	
    30	interface PriorRecord {
    31		readonly raw: string;
    32		readonly timestamp?: string;
    33		readonly generatedAt?: string;
    34		readonly sourceHash?: string;
    35		readonly skeletonHash?: string;
    36		readonly narrative?: ModuleNarrative;
    37	}
    38	
    39	interface RecordRenderInput {
    40		readonly path: string;
    41		readonly frontmatter: Record<string, unknown>;
    42		readonly body: string;
    43		readonly includeGeneratedAt?: boolean;
    44	}
    45	
    46	export async function generateArchitectureMap(
    47		options: GenerateArchitectureMapOptions,
    48	): Promise<GenerateArchitectureMapResult> {
    49		await recoverArchitectureMapStorage(options.projectRoot);
    50		const hadPreviousMap = await hasArchitectureMap(options.projectRoot);
    51	
    52		try {
    53			const config = await resolveArchitectureMapConfig({
    54				projectRoot: options.projectRoot,
    55				overrides: options.configOverrides,
    56			});
    57			const snapshot = await createProjectSnapshot({
    58				projectRoot: options.projectRoot,
    59				config,
    60				analyzer: options.analyzer,
    61			});
    62	
    63			if (!(await isSupportedTypeScriptProject(options.projectRoot, snapshot))) {
    64				return {
    65					kind: "unsupported",
    66					reason:
    67						"Architecture map generation supports TypeScript projects with tsconfig.json or included .ts/.tsx source files.",
    68				};
    69			}
    70	
    71			const [statFingerprint, analysis] = await Promise.all([
    72				computeArchitectureMapStatFingerprint({
    73					projectRoot: options.projectRoot,
    74					config,
    75					analyzer: options.analyzer,
    76				}),
    77				options.analyzer.analyze({
    78					projectRoot: options.projectRoot,
    79					config,
    80					snapshot,
    81				}),
    82			]);
    83			const priorRecords = await readPriorRecords(options.projectRoot);
    84			const records = await buildModuleRecords({
    85				skeletons: analysis.modules,
    86				priorRecords,
    87				narrativeEnabled: config.narrative.enabled,
    88				maxNarratives: config.narrative.maxModulesPerRun,
    89				narrativeProvider: options.narrativeProvider,
    90			});
    91			const bundle = renderArchitectureMapBundle({
    92				projectHash: snapshot.hash,
    93				statFingerprint: statFingerprint.hash,
    94				records,
    95				priorRecords,
    96				now: new Date().toISOString(),
    97			});
    98			const stored = await storeArchitectureMapBundle({
    99				projectRoot: options.projectRoot,
   100				files: bundle.files,
   101			});
   102	
   103			if (stored.kind === "unchanged") return { kind: "unchanged" };
   104			return {
   105				kind: "written",
   106				changedFiles: stored.changedFiles,
   107				pendingModules: records
   108					.filter((record) => record.narrative.status === "pending")
   109					.map((record) => record.resource),
   110			};
   111		} catch (error: unknown) {
   112			return {
   113				kind: "failed",
   114				error: errorMessage(error),
   115				previousMapIntact:
   116					hadPreviousMap && (await hasArchitectureMap(options.projectRoot)),
   117			};
   118		}
   119	}
   120	
   121	async function buildModuleRecords(options: {
   122		readonly skeletons: readonly ModuleSkeleton[];
   123		readonly priorRecords: ReadonlyMap<string, PriorRecord>;
   124		readonly narrativeEnabled: boolean;
   125		readonly maxNarratives: number;
   126		readonly narrativeProvider?: NarrativeProvider;
   127	}): Promise<readonly ModuleRecord[]> {
   128		const { skeletons } = options;
   129		const sorted = [...skeletons].sort((left, right) =>
   130			left.resource.localeCompare(right.resource),
   131		);
   132		const dependents = deriveDependents(sorted);
   133		let narrativeAttempts = 0;
   134	
   135		const records: ModuleRecord[] = [];
   136		for (const skeleton of sorted) {
   137			const shardPath = shardPathForResource(skeleton.resource);
   138			const prior = options.priorRecords.get(shardPath);
   139			const narrative = await resolveModuleNarrative({
   140				skeleton,
   141				prior,
   142				narrativeEnabled: options.narrativeEnabled,
   143				narrativeProvider: options.narrativeProvider,
   144				canAttemptNarrative: narrativeAttempts < options.maxNarratives,
   145				onNarrativeAttempt: () => {
   146					narrativeAttempts += 1;
   147				},
   148			});
   149	
   150			records.push({
   151				...skeleton,
   152				dependents: dependents.get(skeleton.resource) ?? [],
   153				narrative,
   154				shardPath,
   155			});
   156		}
   157	
   158		return records;
   159	}
   160	
   161	async function resolveModuleNarrative(options: {
   162		readonly skeleton: ModuleSkeleton;
   163		readonly prior?: PriorRecord;
   164		readonly narrativeEnabled: boolean;
   165		readonly narrativeProvider?: NarrativeProvider;
   166		readonly canAttemptNarrative: boolean;
   167		readonly onNarrativeAttempt: () => void;
   168	}): Promise<ModuleNarrative> {
   169		const priorNarrative = options.prior?.narrative;
   170		if (
   171			options.prior?.skeletonHash === options.skeleton.skeletonHash &&
   172			priorNarrative
   173		) {
   174			if (priorNarrative.status !== "pending") {
   175				if (options.prior.sourceHash === options.skeleton.sourceHash) {
   176					return priorNarrative;
   177				}
   178				return {
   179					...priorNarrative,
   180					status: "reused",
   181				};
   182			}
   183	
   184			if (!shouldAttemptNarrative(options)) {
   185				return priorNarrative;
   186			}
   187		}
   188	
   189		if (!options.narrativeEnabled) {
   190			return pendingNarrative(
   191				options.skeleton.resource,
   192				"Narrative generation is disabled for this run.",
   193			);
   194		}
   195		if (!options.narrativeProvider) {
   196			return pendingNarrative(
   197				options.skeleton.resource,
   198				"Narrative generation has no provider for this run.",
   199			);
   200		}
   201		if (!options.canAttemptNarrative) {
   202			return pendingNarrative(
   203				options.skeleton.resource,
   204				"Narrative generation budget was exhausted for this run.",
   205			);
   206		}
   207	
   208		options.onNarrativeAttempt();
   209		try {
   210			const generated = await options.narrativeProvider.generate({
   211				skeleton: options.skeleton,
   212				priorNarrative,
   213			});
   214			return {
   215				status: "generated",
   216				oneLiner: generated.oneLiner,
   217				text: generated.text,
   218			};
   219		} catch (error: unknown) {
   220			return pendingNarrative(
   221				options.skeleton.resource,
   222				`Narrative generation failed: ${errorMessage(error)}`,
   223			);
   224		}
   225	}
   226	
   227	function shouldAttemptNarrative(options: {
   228		readonly narrativeEnabled: boolean;
   229		readonly narrativeProvider?: NarrativeProvider;
   230		readonly canAttemptNarrative: boolean;
   231	}): boolean {
   232		return (
   233			options.narrativeEnabled &&
   234			!!options.narrativeProvider &&
   235			options.canAttemptNarrative
   236		);
   237	}
   238	
   239	function deriveDependents(
   240		skeletons: readonly ModuleSkeleton[],
   241	): ReadonlyMap<string, readonly ModuleDependent[]> {
   242		const knownModules = new Set(skeletons.map((skeleton) => skeleton.resource));
   243		const dependents = new Map<string, Set<string>>();
   244	
   245		for (const skeleton of skeletons) {
   246			for (const dependency of skeleton.dependencies) {
   247				if (!knownModules.has(dependency.resource)) continue;
   248				const moduleDependents =
   249					dependents.get(dependency.resource) ?? new Set<string>();
   250				moduleDependents.add(skeleton.resource);
   251				dependents.set(dependency.resource, moduleDependents);
   252			}
   253		}
   254	
   255		return new Map(
   256			[...dependents.entries()].map(([resource, resources]) => [
   257				resource,
   258				[...resources]
   259					.sort()
   260					.map((dependentResource) => ({ resource: dependentResource })),
   261			]),
   262		);
   263	}
   264	
   265	function pendingNarrative(resource: string, reason: string): ModuleNarrative {
   266		return {
   267			status: "pending",
   268			oneLiner: `Narrative pending for \`${resource}\`.`,
   269			pendingReason: reason,
   270		};
   271	}
   272	
   273	function renderArchitectureMapBundle(options: {
   274		readonly projectHash: string;
   275		readonly statFingerprint: string;
   276		readonly records: readonly ModuleRecord[];
   277		readonly priorRecords: ReadonlyMap<string, PriorRecord>;
   278		readonly now: string;
   279	}): { readonly files: readonly ArchitectureMapBundleFile[] } {
   280		const narrativeStatus = combinedNarrativeStatus(options.records);
   281		const inputs: RecordRenderInput[] = [
   282			{
   283				path: "index.md",
   284				includeGeneratedAt: true,
   285				frontmatter: {
   286					type: OKF_RECORD_TYPES.index,
   287					title: "Architecture Map",
   288					description: "Generated TypeScript code structure map.",
   289					resource: `${ARCHITECTURE_MAP_OUTPUT_DIR}/index.md`,
   290					tags: ["architecture-map", "generated", "typescript"],
   291					generatorVersion: ARCHITECTURE_MAP_GENERATOR_VERSION,
   292					projectHash: options.projectHash,
   293					statFingerprint: options.statFingerprint,
   294					moduleCount: options.records.length,
   295					narrativeStatus,
   296				},
   297				body: renderIndexBody(options.records),
   298			},
   299			...options.records.map((record) => ({
   300				path: record.shardPath,
   301				frontmatter: {
   302					type: OKF_RECORD_TYPES.module,
   303					title: record.resource,
   304					description: `Generated TypeScript code structure shard for ${record.resource}.`,
   305					resource: record.resource,
   306					tags: ["architecture-map", "generated", "typescript", "module"],
   307					generatorVersion: ARCHITECTURE_MAP_GENERATOR_VERSION,
   308					sourceHash: record.sourceHash,
   309					skeletonHash: record.skeletonHash,
   310					narrativeStatus: record.narrative.status,
   311				},
   312				body: renderModuleBody(record),
   313			})),
   314		];
   315	
   316		return {
   317			files: inputs.map((input) => ({
   318				path: input.path,
   319				content: renderStableRecord(input, options.priorRecords, options.now),
   320			})),
   321		};
   322	}
   323	
   324	function renderStableRecord(
   325		input: RecordRenderInput,
   326		priorRecords: ReadonlyMap<string, PriorRecord>,
   327		now: string,
   328	): string {
   329		validateRenderedPath(input.path);
   330		const prior = priorRecords.get(input.path);
   331		const previousTimestamp = prior?.timestamp;
   332		const previousGeneratedAt = prior?.generatedAt;
   333		const firstPass = renderMarkdownRecord({
   334			...input,
   335			timestamp: previousTimestamp ?? now,
   336			generatedAt: input.includeGeneratedAt
   337				? (previousGeneratedAt ?? previousTimestamp ?? now)
   338				: undefined,
   339		});
   340	
   341		if (prior && stableComparable(prior.raw) === stableComparable(firstPass)) {
   342			return firstPass;
   343		}
   344	
   345		return renderMarkdownRecord({
   346			...input,
   347			timestamp: now,
   348			generatedAt: input.includeGeneratedAt ? now : undefined,
   349		});
   350	}
   351	
   352	function renderMarkdownRecord(
   353		input: RecordRenderInput & {
   354			readonly timestamp: string;
   355			readonly generatedAt?: string;
   356		},
   357	): string {
   358		const frontmatter = {
   359			...input.frontmatter,
   360			timestamp: input.timestamp,
   361			...(input.generatedAt ? { generatedAt: input.generatedAt } : {}),
   362		};
   363		const rendered = matter.stringify(
   364			ensureTrailingNewline(input.body),
   365			frontmatter,
   366		);
   367		return ensureTrailingNewline(rendered);
   368	}
   369	
   370	function renderIndexBody(records: readonly ModuleRecord[]): string {
   371		const lines = [
   372			"# Architecture Map",
   373			"",
   374			"Generated TypeScript code structure map.",
   375			"",
   376			"## OKF Vocabulary",
   377			"- `code-structure-index`: project-wide architecture map index.",
   378			"- `code-structure-module`: per-module code structure shard.",
   379			"",
   380			"## Module Inventory",
   381			`- Modules discovered: ${records.length}`,
   382		];
   383	
   384		if (records.length === 0) {
   385			lines.push("No modules discovered.");
   386		} else {
   387			for (const record of records) {
   388				lines.push(`- \`${record.resource}\` - ${oneLineNarrative(record)}`);
   389			}
   390		}
   391	
   392		lines.push("", "## Dependency Overview");
   393		if (records.length === 0) {
   394			lines.push("No module dependencies discovered.");
   395		} else {
   396			for (const record of records) {
   397				const dependencies = record.dependencies.map(
   398					(dependency) => `\`${dependency.resource}\``,
   399				);
   400				lines.push(
   401					`- \`${record.resource}\` -> ${
   402						dependencies.length > 0 ? dependencies.join(", ") : "none"
   403					}`,
   404				);
   405			}
   406		}
   407	
   408		return lines.join("\n");
   409	}
   410	
   411	function renderModuleBody(record: ModuleRecord): string {
   412		const lines = [
   413			`# ${record.resource}`,
   414			"",
   415			oneLineNarrative(record),
   416			"",
   417			"## Narrative",
   418		];
   419	
   420		if (record.narrative.text) {
   421			lines.push(record.narrative.text);
   422		} else {
   423			lines.push(record.narrative.pendingReason ?? "Narrative pending.");
   424		}
   425	
   426		lines.push("", "## Files");
   427		pushList(
   428			lines,
   429			record.files.map((file) => `\`${file}\``),
   430		);
   431	
   432		lines.push("", "## Public Interface");
   433		pushList(lines, record.publicInterface.map(renderPublicExport));
   434	
   435		lines.push("", "## Dependencies");
   436		pushList(
   437			lines,
   438			record.dependencies.map((dependency) => {
   439				const importedBy = dependency.importedBy
   440					.map((file) => `\`${file}\``)
   441					.join(", ");
   442				return `\`${dependency.resource}\` (imported by: ${importedBy})`;
   443			}),
   444		);
   445	
   446		lines.push("", "## Dependents");
   447		pushList(
   448			lines,
   449			record.dependents.map((dependent) => `\`${dependent.resource}\``),
   450		);
   451	
   452		lines.push("", "## External Dependencies");
   453		pushList(
   454			lines,
   455			record.externalDependencies.map((dependency) => `\`${dependency}\``),
   456		);
   457	
   458		return lines.join("\n");
   459	}
   460	
   461	function renderPublicExport(publicExport: PublicExport): string {
   462		return `\`${publicExport.kind}\` \`${publicExport.name}\` - \`${publicExport.signature}\``;
   463	}
   464	
   465	function pushList(lines: string[], values: readonly string[]): void {
   466		if (values.length === 0) {
   467			lines.push("- none");
   468			return;
   469		}
   470		for (const value of values) {
   471			lines.push(`- ${value}`);
   472		}
   473	}
   474	
   475	function oneLineNarrative(record: ModuleRecord): string {
   476		return (
   477			record.narrative.oneLiner ?? `Narrative pending for \`${record.resource}\`.`
   478		);
   479	}
   480	
   481	function combinedNarrativeStatus(
   482		records: readonly ModuleRecord[],
   483	): NarrativeStatus {
   484		if (records.some((record) => record.narrative.status === "pending")) {
   485			return "pending";
   486		}
   487		if (records.some((record) => record.narrative.status === "reused")) {
   488			return "reused";
   489		}
   490		return "generated";
   491	}
   492	
   493	async function readPriorRecords(
   494		projectRoot: string,
   495	): Promise<ReadonlyMap<string, PriorRecord>> {
   496		const root = join(projectRoot, ARCHITECTURE_MAP_OUTPUT_DIR);
   497		const records = new Map<string, PriorRecord>();
   498		try {
   499			await readPriorRecordsFromDir(root, root, records);
   500		} catch (error: unknown) {
   501			if (isNotFoundError(error)) return records;
   502			throw error;
   503		}
   504		return records;
   505	}
   506	
   507	async function readPriorRecordsFromDir(
   508		root: string,
   509		dir: string,
   510		records: Map<string, PriorRecord>,
   511	): Promise<void> {
   512		const entries = await readdir(dir, { withFileTypes: true });
   513		for (const entry of entries) {
   514			const absolute = join(dir, entry.name);
   515			if (!entry.isDirectory()) {
   516				if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
   517				records.set(
   518					relative(root, absolute).replaceAll("\\", "/"),
   519					await readPriorRecord(absolute),
   520				);
   521				continue;
   522			}
   523			await readPriorRecordsFromDir(root, absolute, records);
   524		}
   525	}
   526	
   527	async function readPriorRecord(absolute: string): Promise<PriorRecord> {
   528		const raw = await readFile(absolute, "utf-8");
   529		const parsed = matter(raw);
   530		return {
   531			raw,
   532			timestamp: frontmatterString(parsed.data, "timestamp"),
   533			generatedAt: frontmatterString(parsed.data, "generatedAt"),
   534			sourceHash: frontmatterString(parsed.data, "sourceHash"),
   535			skeletonHash: frontmatterString(parsed.data, "skeletonHash"),
   536			narrative: parsePriorNarrative(parsed.data, parsed.content),
   537		};
   538	}
   539	
   540	function frontmatterString(
   541		data: Record<string, unknown>,
   542		key: string,
   543	): string | undefined {
   544		const value = data[key];
   545		return typeof value === "string" ? value : undefined;
   546	}
   547	
   548	function parsePriorNarrative(
   549		frontmatter: Record<string, unknown>,
   550		content: string,
   551	): ModuleNarrative | undefined {
   552		const status = parseNarrativeStatus(frontmatter.narrativeStatus);
   553		if (!status) return undefined;
   554	
   555		const oneLiner = extractOneLineNarrative(content);
   556		const narrativeBody = extractSection(content, "## Narrative", "## Files");
   557		if (status === "pending") {
   558			return {
   559				status,
   560				...(oneLiner ? { oneLiner } : {}),
   561				...(narrativeBody ? { pendingReason: narrativeBody } : {}),
   562			};
   563		}
   564	
   565		return {
   566			status,
   567			...(oneLiner ? { oneLiner } : {}),
   568			...(narrativeBody ? { text: narrativeBody } : {}),
   569		};
   570	}
   571	
   572	function parseNarrativeStatus(value: unknown): NarrativeStatus | undefined {
   573		if (value === "generated" || value === "reused" || value === "pending") {
   574			return value;
   575		}
   576		return undefined;
   577	}
   578	
   579	function extractOneLineNarrative(content: string): string | undefined {
   580		const lines = content.split(/\r?\n/u);
   581		const narrativeHeading = lines.indexOf("## Narrative");
   582		const searchEnd = narrativeHeading === -1 ? lines.length : narrativeHeading;
   583		for (let index = 1; index < searchEnd; index += 1) {
   584			const line = lines[index]?.trim();
   585			if (line) return line;
   586		}
   587		return undefined;
   588	}
   589	
   590	function extractSection(
   591		content: string,
   592		startHeading: string,
   593		endHeading: string,
   594	): string | undefined {
   595		const lines = content.split(/\r?\n/u);
   596		const start = lines.indexOf(startHeading);
   597		if (start === -1) return undefined;
   598		const end = lines.findIndex(
   599			(line, index) => index > start && line === endHeading,
   600		);
   601		const body = lines
   602			.slice(start + 1, end === -1 ? lines.length : end)
   603			.join("\n")
   604			.trim();
   605		return body.length > 0 ? body : undefined;
   606	}
   607	
   608	function stableComparable(raw: string): string {
   609		const parsed = matter(raw);
   610		const data = { ...parsed.data };
   611		delete data.timestamp;
   612		delete data.generatedAt;
   613		return `${JSON.stringify(sortObject(data))}\n${parsed.content}`;
   614	}
   615	
   616	function sortObject(value: unknown): unknown {
   617		if (Array.isArray(value)) return value.map(sortObject);
   618		if (!value || typeof value !== "object") return value;
   619		return Object.fromEntries(
   620			Object.entries(value as Record<string, unknown>)
   621				.sort(([left], [right]) => left.localeCompare(right))
   622				.map(([key, entry]) => [key, sortObject(entry)]),
   623		);
   624	}
   625	
   626	function shardPathForResource(resource: string): string {
   627		const normalizedResource = resource === "." ? "root" : resource;
   628		return `modules/${normalizedResource}.md`;
   629	}
   630	
   631	function validateRenderedPath(path: string): void {
   632		if (
   633			path.length === 0 ||
   634			path.includes("\\") ||
   635			path.startsWith("/") ||
   636			path.split("/").includes("..")
   637		) {
   638			throw new Error(`Unsafe architecture map render path: ${path}`);
   639		}
   640	
   641		const targetRoot = resolve("/", ARCHITECTURE_MAP_OUTPUT_DIR);
   642		const absolute = resolve(targetRoot, ...path.split("/"));
   643		const rel = relative(targetRoot, absolute);
   644		if (rel === "" || rel.startsWith("..")) {
   645			throw new Error(`Unsafe architecture map render path: ${path}`);
   646		}
   647	}
   648	
   649	async function isSupportedTypeScriptProject(
   650		projectRoot: string,
   651		snapshot: { readonly files: readonly { readonly path: string }[] },
   652	): Promise<boolean> {
   653		if (
   654			snapshot.files.some(
   655				(file) => file.path.endsWith(".ts") || file.path.endsWith(".tsx"),
   656			)
   657		) {
   658			return true;
   659		}
   660		try {
   661			await access(join(projectRoot, "tsconfig.json"));
   662			return true;
   663		} catch (error: unknown) {
   664			if (isNotFoundError(error)) return false;
   665			throw error;
   666		}
   667	}
   668	
   669	function ensureTrailingNewline(value: string): string {
   670		return value.endsWith("\n") ? value : `${value}\n`;
   671	}
   672	
   673	function errorMessage(error: unknown): string {
   674		return error instanceof Error ? error.message : String(error);
   675	}
   676	
   677	function isNotFoundError(error: unknown): boolean {
   678		return (
   679			error !== null &&
   680			typeof error === "object" &&
   681			"code" in error &&
   682			(error as NodeJS.ErrnoException).code === "ENOENT"
   683		);
   684	}

exec
/bin/zsh -lc "nl -ba domains/shared/extensions/architecture-memory/index.ts | sed -n '1,560p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import type { Dirent } from "node:fs";
     2	import { access, readdir, readFile } from "node:fs/promises";
     3	import { isAbsolute, join, relative, resolve } from "node:path";
     4	import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
     5	import matter from "gray-matter";
     6	import { Type } from "typebox";
     7	import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
     8	import {
     9		type ArchitectureMapConfig,
    10		type ArchitectureMapFreshness,
    11		checkArchitectureMapStatFreshness,
    12		loadArchitectureMapConfig,
    13		type SourceAnalyzer,
    14		typescriptSourceAnalyzer,
    15	} from "../../../../lib/architecture-map/index.ts";
    16	
    17	const ARCHITECTURE_CONTEXT_TYPE = "architecture-map-context";
    18	const ARCHITECTURE_DIR = "memory/architecture";
    19	const INDEX_PATH = "index.md";
    20	const CONSUMING_AGENT_IDS = new Set([
    21		"coding/planner",
    22		"coding/plan-reviewer",
    23		"coding/coordinator",
    24		"coding/worker",
    25		"coding/quality-manager",
    26	]);
    27	
    28	interface ArchitectureMemoryDeps {
    29		readonly loadConfig: (projectRoot: string) => Promise<ArchitectureMapConfig>;
    30		readonly analyzer: Pick<SourceAnalyzer, "getConfigInputs">;
    31		readonly checkFreshness: (options: {
    32			readonly projectRoot: string;
    33			readonly config: ArchitectureMapConfig;
    34			readonly analyzer: Pick<SourceAnalyzer, "getConfigInputs">;
    35		}) => Promise<ArchitectureMapFreshness>;
    36	}
    37	
    38	function textResult(
    39		text: string,
    40		details: unknown,
    41	): {
    42		content: { type: "text"; text: string }[];
    43		details: unknown;
    44	} {
    45		return {
    46			content: [{ type: "text", text }],
    47			details,
    48		};
    49	}
    50	
    51	export function createArchitectureMemoryExtension(
    52		deps: ArchitectureMemoryDeps = {
    53			loadConfig: loadArchitectureMapConfig,
    54			analyzer: typescriptSourceAnalyzer,
    55			checkFreshness: checkArchitectureMapStatFreshness,
    56		},
    57	): (pi: ExtensionAPI) => void {
    58		return function architectureMemoryExtension(pi: ExtensionAPI): void {
    59			let toolRegistered = false;
    60	
    61			function ensureToolRegistered(): void {
    62				if (toolRegistered) return;
    63				toolRegistered = true;
    64				pi.registerTool({
    65					name: "architecture_map_read",
    66					label: "Read Architecture Map",
    67					description:
    68						"Read the generated architecture-map index or a module shard by module resource.",
    69					promptSnippet:
    70						"Read `memory/architecture/index.md` or module shards from the generated architecture map.",
    71					parameters: Type.Object({
    72						module: Type.Optional(
    73							Type.String({
    74								description:
    75									"Module resource from the architecture-map module shard frontmatter, for example `lib/agents`. Omit to read the full index.",
    76							}),
    77						),
    78						resource: Type.Optional(
    79							Type.String({
    80								description:
    81									"Deprecated alias for `module`. Module resource from the architecture-map module shard frontmatter, for example `lib/agents`.",
    82							}),
    83						),
    84					}),
    85					execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
    86						const cwd = getCwd(ctx);
    87						const config = await deps.loadConfig(cwd);
    88						const freshness = await deps.checkFreshness({
    89							projectRoot: cwd,
    90							config,
    91							analyzer: deps.analyzer,
    92						});
    93						return readArchitectureMap({
    94							projectRoot: cwd,
    95							resource: normalizeRequestedModule(params),
    96							freshness,
    97						});
    98					},
    99				});
   100			}
   101	
   102			pi.on("before_agent_start", async (event, ctx) => {
   103				const systemPrompt = getSystemPrompt(event);
   104				if (!isConsumingAgent(systemPrompt)) return;
   105	
   106				const cwd = getCwd(ctx);
   107				if (!(await architectureDirExists(cwd))) return;
   108	
   109				ensureToolRegistered();
   110				const config = await deps.loadConfig(cwd);
   111				const freshness = await deps.checkFreshness({
   112					projectRoot: cwd,
   113					config,
   114					analyzer: deps.analyzer,
   115				});
   116				const indexRead = await readArchitectureMap({
   117					projectRoot: cwd,
   118					resource: undefined,
   119					freshness,
   120				});
   121				const text = buildContextMessage({
   122					index: contentText(indexRead),
   123					freshness,
   124					injectionMaxBytes: config.injectionMaxBytes,
   125				});
   126	
   127				return {
   128					message: {
   129						customType: ARCHITECTURE_CONTEXT_TYPE,
   130						content: text,
   131						display: false,
   132					},
   133				};
   134			});
   135	
   136			const onContext = pi.on as unknown as (
   137				event: "context",
   138				handler: (event: unknown) => Promise<unknown>,
   139			) => void;
   140			onContext("context", async (event) => {
   141				return {
   142					messages: getMessages(event).filter((message) => {
   143						const msg = message as { customType?: string };
   144						return msg.customType !== ARCHITECTURE_CONTEXT_TYPE;
   145					}),
   146				};
   147			});
   148		};
   149	}
   150	
   151	export default function architectureMemoryExtension(pi: ExtensionAPI): void {
   152		createArchitectureMemoryExtension()(pi);
   153	}
   154	
   155	async function readArchitectureMap(options: {
   156		readonly projectRoot: string;
   157		readonly resource: string | undefined;
   158		readonly freshness: ArchitectureMapFreshness;
   159	}): Promise<ReturnType<typeof textResult>> {
   160		const indexPath = architecturePath(options.projectRoot, INDEX_PATH);
   161		if (!options.resource) {
   162			const index = await readMapFile(indexPath);
   163			if (index === undefined) {
   164				return textResult(
   165					[
   166						formatFreshnessBanner(options.freshness),
   167						"`memory/architecture/index.md` is missing.",
   168					].join("\n"),
   169					{ freshness: options.freshness, resource: undefined },
   170				);
   171			}
   172			return textResult(
   173				[formatFreshnessBanner(options.freshness), index].join("\n\n"),
   174				{
   175					freshness: options.freshness,
   176					resource: "memory/architecture/index.md",
   177				},
   178			);
   179		}
   180	
   181		const resource = options.resource;
   182		const safety = validateResource(resource);
   183		if (!safety.ok) {
   184			return textResult(
   185				`Rejected unsafe architecture map resource: ${resource}. Module resources must be relative names inside \`memory/architecture/modules/\`.`,
   186				{ freshness: options.freshness, resource },
   187			);
   188		}
   189	
   190		const shardPath = resourceToShardPath(resource);
   191		const absoluteShardPath = safeArchitecturePath(
   192			options.projectRoot,
   193			shardPath,
   194		);
   195		if (!absoluteShardPath) {
   196			return textResult(
   197				`Rejected unsafe architecture map resource: ${resource}.`,
   198				{ freshness: options.freshness, resource },
   199			);
   200		}
   201	
   202		const shard = await readMapFile(absoluteShardPath);
   203		if (shard === undefined) {
   204			return unknownModuleResult({ ...options, resource });
   205		}
   206	
   207		const shardResource = matter(shard).data.resource;
   208		if (shardResource !== resource) {
   209			return unknownModuleResult({ ...options, resource });
   210		}
   211	
   212		return textResult(
   213			[formatFreshnessBanner(options.freshness), shard].join("\n\n"),
   214			{
   215				freshness: options.freshness,
   216				resource,
   217				path: `${ARCHITECTURE_DIR}/${shardPath}`,
   218			},
   219		);
   220	}
   221	
   222	function buildContextMessage(options: {
   223		readonly index: string;
   224		readonly freshness: ArchitectureMapFreshness;
   225		readonly injectionMaxBytes: number;
   226	}): string {
   227		const header = [
   228			"Architecture map index context",
   229			formatFreshnessBanner(options.freshness),
   230			"Call `architecture_map_read` with no `module` for the full index, or with a module resource for a shard.",
   231			"",
   232		].join("\n");
   233		const complete = `${header}${options.index}`;
   234		if (byteLength(complete) <= options.injectionMaxBytes) return complete;
   235	
   236		const originalBytes = byteLength(options.index);
   237		let budget = Math.max(0, options.injectionMaxBytes - byteLength(header));
   238		let excerpt = "";
   239		let footer = "";
   240		for (let attempt = 0; attempt < 3; attempt += 1) {
   241			excerpt = truncateBytes(options.index, budget);
   242			footer = `\n\n[Truncated from ${originalBytes} bytes to ${byteLength(
   243				excerpt,
   244			)} bytes. Use \`architecture_map_read\` for the full index or module shards.]`;
   245			const nextBudget = Math.max(
   246				0,
   247				options.injectionMaxBytes - byteLength(header) - byteLength(footer),
   248			);
   249			if (nextBudget === budget) break;
   250			budget = nextBudget;
   251		}
   252		return `${header}${excerpt}${footer}`;
   253	}
   254	
   255	function formatFreshnessBanner(freshness: ArchitectureMapFreshness): string {
   256		switch (freshness.kind) {
   257			case "current":
   258				return `Architecture map freshness: current (${freshness.hash})`;
   259			case "stale":
   260				return `Architecture map freshness: stale (recorded ${freshness.oldHash}, current ${freshness.newHash})`;
   261			case "missing":
   262				return "Architecture map freshness: missing";
   263		}
   264	}
   265	
   266	async function unknownModuleResult(options: {
   267		readonly projectRoot: string;
   268		readonly resource: string;
   269		readonly freshness: ArchitectureMapFreshness;
   270	}): Promise<ReturnType<typeof textResult>> {
   271		const availableModules = await readAvailableModules(options.projectRoot);
   272		return textResult(
   273			[
   274				`Unknown architecture map module: ${options.resource}`,
   275				availableModules.length > 0
   276					? `Available modules: ${availableModules.join(", ")}`
   277					: "Available modules: none",
   278			].join("\n"),
   279			{
   280				freshness: options.freshness,
   281				resource: options.resource,
   282				availableModules,
   283			},
   284		);
   285	}
   286	
   287	async function readAvailableModules(projectRoot: string): Promise<string[]> {
   288		const modulesRoot = safeArchitecturePath(projectRoot, "modules");
   289		if (!modulesRoot) return [];
   290		const modules = new Set<string>();
   291		await collectModuleResources(modulesRoot, modules);
   292		return [...modules].sort();
   293	}
   294	
   295	async function collectModuleResources(
   296		directory: string,
   297		modules: Set<string>,
   298	): Promise<void> {
   299		let entries: Dirent[];
   300		try {
   301			entries = await readdir(directory, { withFileTypes: true });
   302		} catch (error: unknown) {
   303			if (isMissingFile(error)) return;
   304			throw error;
   305		}
   306	
   307		for (const entry of entries) {
   308			const path = join(directory, entry.name);
   309			if (entry.isDirectory()) {
   310				await collectModuleResources(path, modules);
   311				continue;
   312			}
   313			if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
   314			const file = await readMapFile(path);
   315			if (!file) continue;
   316			const resource = matter(file).data.resource;
   317			if (typeof resource === "string" && validateResource(resource).ok) {
   318				modules.add(resource);
   319			}
   320		}
   321	}
   322	
   323	function resourceToShardPath(resource: string): string {
   324		const normalizedResource = resource === "." ? "root" : resource;
   325		return `modules/${normalizedResource}.md`;
   326	}
   327	
   328	function validateResource(
   329		resource: string,
   330	): { readonly ok: true } | { readonly ok: false } {
   331		if (
   332			resource.length === 0 ||
   333			resource.includes("\\") ||
   334			isAbsolute(resource)
   335		) {
   336			return { ok: false };
   337		}
   338		const segments = resource.split("/");
   339		if (segments.some((segment) => segment === "" || segment === "..")) {
   340			return { ok: false };
   341		}
   342		return { ok: true };
   343	}
   344	
   345	function safeArchitecturePath(
   346		projectRoot: string,
   347		pathInArchitectureDir: string,
   348	): string | undefined {
   349		const root = resolve(projectRoot, ARCHITECTURE_DIR);
   350		const absolute = resolve(root, pathInArchitectureDir);
   351		const rel = relative(root, absolute);
   352		if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return undefined;
   353		return absolute;
   354	}
   355	
   356	function architecturePath(
   357		projectRoot: string,
   358		pathInArchitectureDir: string,
   359	): string {
   360		return join(projectRoot, ARCHITECTURE_DIR, pathInArchitectureDir);
   361	}
   362	
   363	async function architectureDirExists(projectRoot: string): Promise<boolean> {
   364		try {
   365			await access(join(projectRoot, ARCHITECTURE_DIR));
   366			return true;
   367		} catch {
   368			return false;
   369		}
   370	}
   371	
   372	async function readMapFile(path: string): Promise<string | undefined> {
   373		try {
   374			return await readFile(path, "utf-8");
   375		} catch (error: unknown) {
   376			if (isMissingFile(error)) return undefined;
   377			throw error;
   378		}
   379	}
   380	
   381	function isMissingFile(error: unknown): boolean {
   382		return (
   383			error !== null &&
   384			typeof error === "object" &&
   385			"code" in error &&
   386			(error as NodeJS.ErrnoException).code === "ENOENT"
   387		);
   388	}
   389	
   390	function isConsumingAgent(systemPrompt: string): boolean {
   391		const agentId = extractAgentIdFromSystemPrompt(systemPrompt);
   392		return agentId !== undefined && CONSUMING_AGENT_IDS.has(agentId);
   393	}
   394	
   395	function getSystemPrompt(event: unknown): string {
   396		return valueFromObject(event, "systemPrompt") ?? "";
   397	}
   398	
   399	function getCwd(ctx: unknown): string {
   400		const cwd = valueFromObject(ctx, "cwd");
   401		if (!cwd) throw new Error("Architecture memory extension requires ctx.cwd.");
   402		return cwd;
   403	}
   404	
   405	function getMessages(event: unknown): unknown[] {
   406		if (event && typeof event === "object" && "messages" in event) {
   407			const messages = (event as { messages?: unknown }).messages;
   408			if (Array.isArray(messages)) return messages;
   409		}
   410		return [];
   411	}
   412	
   413	function normalizeRequestedModule(params: unknown): string | undefined {
   414		return (
   415			normalizeRequestedResource(valueFromObject(params, "module")) ??
   416			normalizeRequestedResource(valueFromObject(params, "resource"))
   417		);
   418	}
   419	
   420	function normalizeRequestedResource(value: unknown): string | undefined {
   421		return typeof value === "string" && value.trim().length > 0
   422			? value.trim()
   423			: undefined;
   424	}
   425	
   426	function contentText(
   427		result: Awaited<ReturnType<typeof readArchitectureMap>>,
   428	): string {
   429		return result.content.map((entry) => entry.text).join("\n");
   430	}
   431	
   432	function valueFromObject(value: unknown, key: string): string | undefined {
   433		if (value && typeof value === "object" && key in value) {
   434			const field = (value as Record<string, unknown>)[key];
   435			return typeof field === "string" ? field : undefined;
   436		}
   437		return undefined;
   438	}
   439	
   440	function byteLength(value: string): number {
   441		return Buffer.byteLength(value, "utf-8");
   442	}
   443	
   444	function truncateBytes(value: string, maxBytes: number): string {
   445		if (maxBytes <= 0) return "";
   446		const bytes = Buffer.from(value, "utf-8");
   447		if (bytes.byteLength <= maxBytes) return value;
   448		return bytes.subarray(0, maxBytes).toString("utf-8");
   449	}

exec
/bin/zsh -lc "nl -ba lib/artifact-viewer/server.ts | sed -n '1,780p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import {
     2		createServer,
     3		type IncomingMessage,
     4		type Server,
     5		type ServerResponse,
     6	} from "node:http";
     7	import {
     8		type ArchitectureMapFreshness,
     9		checkArchitectureMapStatFreshness,
    10		loadArchitectureMapConfig,
    11		typescriptSourceAnalyzer,
    12	} from "../architecture-map/index.ts";
    13	import { type Plan, PlanManager, validateSlug } from "../plans/index.ts";
    14	import {
    15		type ArtifactDocument,
    16		loadArchitectureIndexArtifact,
    17		loadArchitectureModuleArtifact,
    18		loadPlanPageData,
    19		type PlanViewerData,
    20		validateArchitectureResource,
    21	} from "./loaders.ts";
    22	import { escapeHtml } from "./renderer.ts";
    23	
    24	export interface ArtifactViewerResponse {
    25		readonly statusCode: number;
    26		readonly headers: Readonly<Record<string, string>>;
    27		readonly body: string;
    28	}
    29	
    30	export interface ArtifactViewerServerOptions {
    31		readonly projectRoot: string;
    32		readonly dependencies?: Partial<ArtifactViewerDependencies>;
    33	}
    34	
    35	export interface ArtifactViewerDependencies {
    36		readonly loadArchitectureIndex: (options: {
    37			readonly projectRoot: string;
    38		}) => Promise<ArtifactDocument | null>;
    39		readonly loadArchitectureModule: (options: {
    40			readonly projectRoot: string;
    41			readonly resource: string;
    42		}) => Promise<ArtifactDocument | null>;
    43		readonly listPlans: (options: {
    44			readonly projectRoot: string;
    45		}) => Promise<readonly Plan[]>;
    46		readonly loadPlanPage: (options: {
    47			readonly projectRoot: string;
    48			readonly slug: string;
    49		}) => Promise<PlanViewerData | null>;
    50		readonly checkArchitectureFreshness: (options: {
    51			readonly projectRoot: string;
    52		}) => Promise<ArchitectureMapFreshness>;
    53	}
    54	
    55	interface RoutePath {
    56		readonly rawPath: string;
    57		readonly decodedPath: string;
    58	}
    59	
    60	interface GraphModule {
    61		readonly resource: string;
    62		readonly dependencies: readonly string[];
    63	}
    64	
    65	const TEXT_HTML = { "content-type": "text/html; charset=utf-8" } as const;
    66	const PROTECTED_ROUTE_PREFIXES = ["/plans/", "/architecture/modules/"] as const;
    67	
    68	export function createArtifactViewerServer(
    69		options: ArtifactViewerServerOptions,
    70	): Server {
    71		return createServer((request, response) => {
    72			void writeResponse(
    73				response,
    74				handleArtifactViewerRequest({
    75					projectRoot: options.projectRoot,
    76					url: request.url ?? "/",
    77					method: request.method ?? "GET",
    78					dependencies: options.dependencies,
    79				}),
    80				request.method === "HEAD",
    81			);
    82		});
    83	}
    84	
    85	export async function handleArtifactViewerRequest(options: {
    86		readonly projectRoot: string;
    87		readonly url: string;
    88		readonly method?: string;
    89		readonly dependencies?: Partial<ArtifactViewerDependencies>;
    90	}): Promise<ArtifactViewerResponse> {
    91		const method = options.method ?? "GET";
    92		if (method !== "GET" && method !== "HEAD") {
    93			return htmlResponse(
    94				405,
    95				"Method Not Allowed",
    96				"<p>Method not allowed.</p>",
    97			);
    98		}
    99	
   100		const routePath = decodeRoutePath(options.url);
   101		if (!routePath) {
   102			return htmlResponse(400, "Bad Request", "<p>Invalid request path.</p>");
   103		}
   104		if (hasProtectedTraversal(routePath)) {
   105			return htmlResponse(400, "Bad Request", "<p>Invalid route path.</p>");
   106		}
   107	
   108		const dependencies = artifactViewerDependencies(options.dependencies);
   109		const path = withoutTrailingSlash(routePath.decodedPath);
   110	
   111		try {
   112			if (path === "" || path === "/") {
   113				return htmlResponse(200, "Cosmonauts Viewer", renderHome());
   114			}
   115			if (path === "/architecture") {
   116				return await renderArchitectureIndexRoute(
   117					options.projectRoot,
   118					dependencies,
   119				);
   120			}
   121			if (path.startsWith("/architecture/modules/")) {
   122				const resource = path.slice("/architecture/modules/".length);
   123				validateArchitectureResource(resource);
   124				return await renderArchitectureModuleRoute({
   125					projectRoot: options.projectRoot,
   126					resource,
   127					dependencies,
   128				});
   129			}
   130			if (path === "/plans") {
   131				return await renderPlanListRoute(options.projectRoot, dependencies);
   132			}
   133			if (path.startsWith("/plans/")) {
   134				const slug = path.slice("/plans/".length);
   135				validateSlug(slug);
   136				return await renderPlanPageRoute({
   137					projectRoot: options.projectRoot,
   138					slug,
   139					dependencies,
   140				});
   141			}
   142		} catch (error) {
   143			if (error instanceof Error && isClientRouteError(error)) {
   144				return htmlResponse(400, "Bad Request", "<p>Invalid route path.</p>");
   145			}
   146			throw error;
   147		}
   148	
   149		return htmlResponse(404, "Not Found", "<p>Route not found.</p>");
   150	}
   151	
   152	function artifactViewerDependencies(
   153		overrides: Partial<ArtifactViewerDependencies> | undefined,
   154	): ArtifactViewerDependencies {
   155		return {
   156			loadArchitectureIndex: loadArchitectureIndexArtifact,
   157			loadArchitectureModule: loadArchitectureModuleArtifact,
   158			listPlans: async ({ projectRoot }) =>
   159				await new PlanManager(projectRoot).listPlans(),
   160			loadPlanPage: loadPlanPageData,
   161			checkArchitectureFreshness: async ({ projectRoot }) => {
   162				const config = await loadArchitectureMapConfig(projectRoot);
   163				return await checkArchitectureMapStatFreshness({
   164					projectRoot,
   165					config,
   166					analyzer: typescriptSourceAnalyzer,
   167				});
   168			},
   169			...overrides,
   170		};
   171	}
   172	
   173	async function renderArchitectureIndexRoute(
   174		projectRoot: string,
   175		dependencies: ArtifactViewerDependencies,
   176	): Promise<ArtifactViewerResponse> {
   177		const document = await dependencies.loadArchitectureIndex({ projectRoot });
   178		if (!document) {
   179			return htmlResponse(
   180				200,
   181				"Architecture Map",
   182				[
   183					renderNav("architecture"),
   184					'<section class="empty-state">',
   185					"<h1>No architecture map found</h1>",
   186					"<p>Generate one with <code>cosmonauts architecture generate</code>.</p>",
   187					"</section>",
   188				].join("\n"),
   189			);
   190		}
   191	
   192		const freshness = await dependencies.checkArchitectureFreshness({
   193			projectRoot,
   194		});
   195		const modules = parseModuleGraph(document.markdown);
   196	
   197		return htmlResponse(
   198			200,
   199			"Architecture Map",
   200			[
   201				renderNav("architecture"),
   202				renderFreshnessBanner(freshness),
   203				"<section>",
   204				"<h2>Module Graph</h2>",
   205				renderModuleGraph(modules),
   206				"</section>",
   207				"<section>",
   208				"<h2>Modules</h2>",
   209				renderModuleLinks(modules),
   210				"</section>",
   211				'<section class="markdown">',
   212				document.html,
   213				"</section>",
   214			].join("\n"),
   215		);
   216	}
   217	
   218	async function renderArchitectureModuleRoute(options: {
   219		readonly projectRoot: string;
   220		readonly resource: string;
   221		readonly dependencies: ArtifactViewerDependencies;
   222	}): Promise<ArtifactViewerResponse> {
   223		const document = await options.dependencies.loadArchitectureModule({
   224			projectRoot: options.projectRoot,
   225			resource: options.resource,
   226		});
   227		if (!document) {
   228			return htmlResponse(404, "Architecture Module", "<p>Module not found.</p>");
   229		}
   230	
   231		const freshness = await options.dependencies.checkArchitectureFreshness({
   232			projectRoot: options.projectRoot,
   233		});
   234	
   235		return htmlResponse(
   236			200,
   237			document.title,
   238			[
   239				renderNav("architecture"),
   240				renderFreshnessBanner(freshness),
   241				`<p><a href="/architecture/">Back to architecture map</a></p>`,
   242				`<section class="markdown">${document.html}</section>`,
   243			].join("\n"),
   244		);
   245	}
   246	
   247	async function renderPlanListRoute(
   248		projectRoot: string,
   249		dependencies: ArtifactViewerDependencies,
   250	): Promise<ArtifactViewerResponse> {
   251		const plans = await dependencies.listPlans({ projectRoot });
   252		const body =
   253			plans.length === 0
   254				? [
   255						renderNav("plans"),
   256						'<section class="empty-state">',
   257						"<h1>No plans found</h1>",
   258						"<p>No markdown plans exist under <code>missions/plans/</code>.</p>",
   259						"</section>",
   260					].join("\n")
   261				: [
   262						renderNav("plans"),
   263						"<h1>Plans</h1>",
   264						'<ul class="item-list">',
   265						...plans.map(
   266							(plan) =>
   267								`<li><a href="/plans/${encodeURIComponent(plan.slug)}">${escapeHtml(plan.title || plan.slug)}</a> <span>${escapeHtml(plan.status)}</span></li>`,
   268						),
   269						"</ul>",
   270					].join("\n");
   271	
   272		return htmlResponse(200, "Plans", body);
   273	}
   274	
   275	async function renderPlanPageRoute(options: {
   276		readonly projectRoot: string;
   277		readonly slug: string;
   278		readonly dependencies: ArtifactViewerDependencies;
   279	}): Promise<ArtifactViewerResponse> {
   280		const data = await options.dependencies.loadPlanPage({
   281			projectRoot: options.projectRoot,
   282			slug: options.slug,
   283		});
   284		if (!data) {
   285			return htmlResponse(404, "Plan Not Found", "<p>Plan not found.</p>");
   286		}
   287	
   288		return htmlResponse(
   289			200,
   290			data.plan.title || data.plan.slug,
   291			[
   292				renderNav("plans"),
   293				`<p><a href="/plans/">Back to plans</a></p>`,
   294				`<h1>${escapeHtml(data.plan.title || data.plan.slug)}</h1>`,
   295				`<p class="meta">${escapeHtml(data.plan.status)} plan - ${escapeHtml(data.plan.slug)}</p>`,
   296				renderDocumentSection("Plan", data.planDocument),
   297				renderDocumentSection("Spec", data.specDocument),
   298				renderDocumentSection("Review", data.reviewDocument),
   299				renderTaskStatusSection(data),
   300			].join("\n"),
   301		);
   302	}
   303	
   304	function renderHome(): string {
   305		return [
   306			renderNav(),
   307			"<h1>Cosmonauts Viewer</h1>",
   308			'<ul class="item-list">',
   309			'<li><a href="/architecture/">Architecture map</a></li>',
   310			'<li><a href="/plans/">Plans</a></li>',
   311			"</ul>",
   312		].join("\n");
   313	}
   314	
   315	function renderNav(active?: "architecture" | "plans"): string {
   316		return [
   317			"<nav>",
   318			`<a${active === "architecture" ? ' aria-current="page"' : ""} href="/architecture/">Architecture</a>`,
   319			`<a${active === "plans" ? ' aria-current="page"' : ""} href="/plans/">Plans</a>`,
   320			"</nav>",
   321		].join("\n");
   322	}
   323	
   324	function renderFreshnessBanner(freshness: ArchitectureMapFreshness): string {
   325		if (freshness.kind === "current") {
   326			return `<p class="banner current">Freshness: current (${escapeHtml(shortHash(freshness.hash))})</p>`;
   327		}
   328		if (freshness.kind === "stale") {
   329			return `<p class="banner stale">Freshness: stale (${escapeHtml(shortHash(freshness.oldHash))} to ${escapeHtml(shortHash(freshness.newHash))})</p>`;
   330		}
   331		return '<p class="banner missing">Freshness: missing stat fingerprint. Run <code>cosmonauts architecture generate</code>.</p>';
   332	}
   333	
   334	function renderModuleLinks(modules: readonly GraphModule[]): string {
   335		if (modules.length === 0) return "<p>No modules discovered.</p>";
   336		return [
   337			'<ul class="item-list">',
   338			...modules.map(
   339				(module) =>
   340					`<li><a href="${escapeHtml(moduleHref(module.resource))}"><code>${escapeHtml(module.resource)}</code></a></li>`,
   341			),
   342			"</ul>",
   343		].join("\n");
   344	}
   345	
   346	function renderModuleGraph(modules: readonly GraphModule[]): string {
   347		if (modules.length === 0) return "<p>No module dependencies discovered.</p>";
   348	
   349		const depths = moduleDepths(modules);
   350		const columns = groupModulesByDepth(modules, depths);
   351		const maxRows = Math.max(
   352			...[...columns.values()].map((items) => items.length),
   353			1,
   354		);
   355		const width = Math.max((columns.size || 1) * 220 + 40, 420);
   356		const height = Math.max(maxRows * 96 + 40, 140);
   357		const positions = new Map<string, { x: number; y: number }>();
   358		for (const [depth, depthModules] of columns) {
   359			depthModules.forEach((module, index) => {
   360				positions.set(module.resource, {
   361					x: 20 + depth * 220,
   362					y: 20 + index * 96,
   363				});
   364			});
   365		}
   366	
   367		const edges = modules.flatMap((module) =>
   368			module.dependencies
   369				.filter((dependency) => positions.has(dependency))
   370				.map((dependency) => ({ from: module.resource, to: dependency })),
   371		);
   372	
   373		return [
   374			`<svg class="module-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="Module dependency graph">`,
   375			'<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z"></path></marker></defs>',
   376			...edges.map((edge) => renderGraphEdge(edge, positions)),
   377			...modules.map((module) => renderGraphNode(module, positions)),
   378			"</svg>",
   379		].join("\n");
   380	}
   381	
   382	function renderGraphEdge(
   383		edge: { readonly from: string; readonly to: string },
   384		positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
   385	): string {
   386		const from = positions.get(edge.from);
   387		const to = positions.get(edge.to);
   388		if (!from || !to) return "";
   389		const x1 = from.x + 170;
   390		const y1 = from.y + 24;
   391		const x2 = to.x;
   392		const y2 = to.y + 24;
   393		return `<line class="edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#arrow)"></line>`;
   394	}
   395	
   396	function renderGraphNode(
   397		module: GraphModule,
   398		positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
   399	): string {
   400		const position = positions.get(module.resource);
   401		if (!position) return "";
   402		return [
   403			`<a href="${escapeHtml(moduleHref(module.resource))}">`,
   404			`<rect class="node" x="${position.x}" y="${position.y}" width="170" height="48" rx="6"></rect>`,
   405			`<text x="${position.x + 12}" y="${position.y + 29}">${escapeHtml(truncateMiddle(module.resource, 24))}</text>`,
   406			"</a>",
   407		].join("\n");
   408	}
   409	
   410	function renderDocumentSection(
   411		title: string,
   412		document: ArtifactDocument | undefined,
   413	): string {
   414		if (!document) {
   415			return [
   416				'<section class="empty-state">',
   417				`<h2>${escapeHtml(title)}</h2>`,
   418				`<p>No ${escapeHtml(title.toLowerCase())} markdown found.</p>`,
   419				"</section>",
   420			].join("\n");
   421		}
   422	
   423		return [
   424			'<section class="markdown">',
   425			`<h2>${escapeHtml(title)}</h2>`,
   426			document.html,
   427			"</section>",
   428		].join("\n");
   429	}
   430	
   431	function renderTaskStatusSection(data: PlanViewerData): string {
   432		const tasks = data.taskStatus.tasks;
   433		if (tasks.length === 0) {
   434			const message = data.taskConfigExists
   435				? "No tasks are labeled for this plan."
   436				: "No tasks are labeled for this plan, and missions/tasks/config.json was not found. The viewer did not create task scaffolding.";
   437			return [
   438				'<section class="empty-state">',
   439				"<h2>Read-only Task Status</h2>",
   440				`<p>${escapeHtml(message)}</p>`,
   441				"</section>",
   442			].join("\n");
   443		}
   444	
   445		return [
   446			"<section>",
   447			"<h2>Read-only Task Status</h2>",
   448			'<dl class="counts">',
   449			...Object.entries(data.taskStatus.counts).map(
   450				([status, count]) =>
   451					`<dt>${escapeHtml(status)}</dt><dd>${escapeHtml(String(count))}</dd>`,
   452			),
   453			"</dl>",
   454			"<table>",
   455			"<thead><tr><th>ID</th><th>Title</th><th>Status</th></tr></thead>",
   456			"<tbody>",
   457			...tasks.map(
   458				(task) =>
   459					`<tr><td>${escapeHtml(task.id)}</td><td>${escapeHtml(task.title)}</td><td>${escapeHtml(task.status)}</td></tr>`,
   460			),
   461			"</tbody>",
   462			"</table>",
   463			"</section>",
   464		].join("\n");
   465	}
   466	
   467	function parseModuleGraph(markdown: string): readonly GraphModule[] {
   468		const dependencyLines = markdownSection(markdown, "## Dependency Overview");
   469		const modules = new Map<string, string[]>();
   470	
   471		if (dependencyLines) {
   472			for (const line of dependencyLines.split("\n")) {
   473				const parsed = parseDependencyLine(line);
   474				if (parsed) modules.set(parsed.resource, parsed.dependencies);
   475			}
   476		}
   477	
   478		if (modules.size === 0) {
   479			for (const match of markdown.matchAll(/^- `([^`]+)`(?: - .*)?$/gmu)) {
   480				if (match[1]) modules.set(match[1], []);
   481			}
   482		}
   483	
   484		return [...modules.entries()]
   485			.map(([resource, dependencies]) => ({ resource, dependencies }))
   486			.sort((left, right) => left.resource.localeCompare(right.resource));
   487	}
   488	
   489	function parseDependencyLine(
   490		line: string,
   491	): { readonly resource: string; readonly dependencies: string[] } | undefined {
   492		const match = line.match(/^- `([^`]+)` -> (.+)$/u);
   493		if (!match?.[1] || !match[2]) return undefined;
   494		const dependencies =
   495			match[2] === "none"
   496				? []
   497				: [...match[2].matchAll(/`([^`]+)`/gu)].map((m) => m[1] ?? "");
   498		return {
   499			resource: match[1],
   500			dependencies: dependencies.filter(Boolean).sort(),
   501		};
   502	}
   503	
   504	function markdownSection(
   505		markdown: string,
   506		heading: string,
   507	): string | undefined {
   508		const lines = markdown.replace(/\r\n/g, "\n").split("\n");
   509		const start = lines.findIndex((line) => line.trim() === heading);
   510		if (start === -1) return undefined;
   511		const body: string[] = [];
   512		for (const line of lines.slice(start + 1)) {
   513			if (line.startsWith("## ")) break;
   514			body.push(line);
   515		}
   516		return body.join("\n").trim();
   517	}
   518	
   519	function moduleDepths(
   520		modules: readonly GraphModule[],
   521	): ReadonlyMap<string, number> {
   522		const moduleMap = new Map(modules.map((module) => [module.resource, module]));
   523		const depths = new Map<string, number>();
   524		const visiting = new Set<string>();
   525	
   526		const depthFor = (resource: string): number => {
   527			const existing = depths.get(resource);
   528			if (existing !== undefined) return existing;
   529			if (visiting.has(resource)) return 0;
   530			visiting.add(resource);
   531			const module = moduleMap.get(resource);
   532			const depth = module
   533				? Math.max(
   534						0,
   535						...module.dependencies
   536							.filter((dependency) => moduleMap.has(dependency))
   537							.map((dependency) => depthFor(dependency) + 1),
   538					)
   539				: 0;
   540			visiting.delete(resource);
   541			depths.set(resource, depth);
   542			return depth;
   543		};
   544	
   545		for (const module of modules) {
   546			depthFor(module.resource);
   547		}
   548		return depths;
   549	}
   550	
   551	function groupModulesByDepth(
   552		modules: readonly GraphModule[],
   553		depths: ReadonlyMap<string, number>,
   554	): ReadonlyMap<number, readonly GraphModule[]> {
   555		const groups = new Map<number, GraphModule[]>();
   556		for (const module of modules) {
   557			const depth = depths.get(module.resource) ?? 0;
   558			groups.set(depth, [...(groups.get(depth) ?? []), module]);
   559		}
   560		return new Map(
   561			[...groups.entries()]
   562				.sort(([left], [right]) => left - right)
   563				.map(([depth, depthModules]) => [
   564					depth,
   565					depthModules.sort((left, right) =>
   566						left.resource.localeCompare(right.resource),
   567					),
   568				]),
   569		);
   570	}
   571	
   572	function moduleHref(resource: string): string {
   573		return `/architecture/modules/${resource
   574			.split("/")
   575			.map((segment) => encodeURIComponent(segment))
   576			.join("/")}`;
   577	}
   578	
   579	function htmlResponse(
   580		statusCode: number,
   581		title: string,
   582		body: string,
   583	): ArtifactViewerResponse {
   584		return {
   585			statusCode,
   586			headers: TEXT_HTML,
   587			body: renderShell(title, body),
   588		};
   589	}
   590	
   591	function renderShell(title: string, body: string): string {
   592		return [
   593			"<!doctype html>",
   594			'<html lang="en">',
   595			"<head>",
   596			'<meta charset="utf-8">',
   597			'<meta name="viewport" content="width=device-width, initial-scale=1">',
   598			`<title>${escapeHtml(title)}</title>`,
   599			"<style>",
   600			'body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;margin:0;color:#202124;background:#fafafa}',
   601			"main{max-width:1040px;margin:0 auto;padding:24px}",
   602			"nav{display:flex;gap:16px;border-bottom:1px solid #d9dee3;padding:14px 24px;background:white}",
   603			"a{color:#0b57d0;text-decoration:none}a:hover{text-decoration:underline}",
   604			"h1,h2,h3{line-height:1.2}code,pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}",
   605			"pre{overflow:auto;background:#f1f3f4;padding:12px;border-radius:6px}",
   606			".banner{border:1px solid #d9dee3;border-radius:6px;padding:10px 12px;background:white}.current{border-color:#188038}.stale{border-color:#b06000}.missing{border-color:#b3261e}",
   607			".empty-state{border:1px solid #d9dee3;border-radius:6px;background:white;padding:16px;margin:16px 0}",
   608			".item-list{display:grid;gap:8px;padding-left:20px}.meta{color:#5f6368}",
   609			".module-graph{width:100%;max-height:560px;background:white;border:1px solid #d9dee3;border-radius:6px}.node{fill:#eef4ff;stroke:#8ab4f8}.edge{stroke:#5f6368;stroke-width:1.5}marker path{fill:#5f6368}text{font-size:13px;fill:#202124}",
   610			"table{width:100%;border-collapse:collapse;background:white}th,td{border:1px solid #d9dee3;padding:8px;text-align:left}.counts{display:grid;grid-template-columns:max-content max-content;gap:4px 12px}",
   611			"</style>",
   612			"</head>",
   613			"<body>",
   614			"<main>",
   615			body,
   616			"</main>",
   617			"</body>",
   618			"</html>",
   619		].join("\n");
   620	}
   621	
   622	function decodeRoutePath(url: string): RoutePath | undefined {
   623		const rawPath = rawPathFromUrl(url);
   624		try {
   625			return {
   626				rawPath,
   627				decodedPath: decodeURIComponent(rawPath),
   628			};
   629		} catch {
   630			return undefined;
   631		}
   632	}
   633	
   634	function rawPathFromUrl(url: string): string {
   635		const originForm = url.match(
   636			/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(?<path>[^?#]*)/iu,
   637		)?.groups?.path;
   638		const path = originForm ?? url.split(/[?#]/u, 1)[0] ?? "/";
   639		return path === "" ? "/" : path;
   640	}
   641	
   642	function hasProtectedTraversal(routePath: RoutePath): boolean {
   643		return PROTECTED_ROUTE_PREFIXES.some(
   644			(prefix) =>
   645				(routePath.rawPath.startsWith(prefix) ||
   646					routePath.decodedPath.startsWith(prefix)) &&
   647				(hasTraversalSegment(routePath.rawPath) ||
   648					hasTraversalSegment(routePath.decodedPath)),
   649		);
   650	}
   651	
   652	function hasTraversalSegment(path: string): boolean {
   653		return path.split("/").some((segment) => segment === "..");
   654	}
   655	
   656	function withoutTrailingSlash(path: string): string {
   657		return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
   658	}
   659	
   660	function isClientRouteError(error: Error): boolean {
   661		return (
   662			error.message.startsWith("Invalid plan slug") ||
   663			error.message.startsWith("Plan slug cannot be empty") ||
   664			error.message.startsWith("Invalid architecture resource") ||
   665			error.message.startsWith("Architecture resource cannot be empty")
   666		);
   667	}
   668	
   669	function shortHash(hash: string): string {
   670		return hash.slice(0, 12);
   671	}
   672	
   673	function truncateMiddle(value: string, maxLength: number): string {
   674		if (value.length <= maxLength) return value;
   675		const prefixLength = Math.ceil((maxLength - 3) / 2);
   676		const suffixLength = Math.floor((maxLength - 3) / 2);
   677		return `${value.slice(0, prefixLength)}...${value.slice(-suffixLength)}`;
   678	}
   679	
   680	async function writeResponse(
   681		response: ServerResponse<IncomingMessage>,
   682		pending: Promise<ArtifactViewerResponse>,
   683		headOnly: boolean,
   684	): Promise<void> {
   685		try {
   686			const result = await pending;
   687			response.writeHead(result.statusCode, {
   688				...result.headers,
   689				"content-length": Buffer.byteLength(headOnly ? "" : result.body),
   690			});
   691			response.end(headOnly ? "" : result.body);
   692		} catch (error) {
   693			const body = renderShell(
   694				"Internal Server Error",
   695				`<p>${escapeHtml(error instanceof Error ? error.message : "Unknown error")}</p>`,
   696			);
   697			response.writeHead(500, {
   698				...TEXT_HTML,
   699				"content-length": Buffer.byteLength(body),
   700			});
   701			response.end(body);
   702		}
   703	}

codex
The generator now loads `.cosmonauts/config.json` when no config is supplied, and the freshness code uses the stat tier in both extension and viewer. I’m checking the less obvious edge cases now: how custom module resources become shard paths, whether stale generated shards are safely removed, and whether viewer route validation matches loader validation.
exec
/bin/zsh -lc "nl -ba lib/artifact-viewer/renderer.ts | sed -n '1,300p'" in /Users/cosmos/Projects/cosmonauts
exec
/bin/zsh -lc "nl -ba lib/tasks/task-manager.ts | sed -n '1,260p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	export interface RenderMarkdownOptions {
     2		readonly title?: string;
     3	}
     4	
     5	type BlockKind = "paragraph" | "unsupported";
     6	
     7	interface PendingBlock {
     8		readonly kind: BlockKind;
     9		readonly lines: string[];
    10	}
    11	
    12	const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/u;
    13	const UNORDERED_LIST_PATTERN = /^-\s+(.+)$/u;
    14	const ORDERED_LIST_PATTERN = /^\d+\.\s+/u;
    15	
    16	export function renderArtifactMarkdown(
    17		markdown: string,
    18		options: RenderMarkdownOptions = {},
    19	): string {
    20		const body = renderMarkdownBlocks(markdown);
    21		const title = options.title ? `<h1>${escapeHtml(options.title)}</h1>` : "";
    22		return title ? `${title}\n${body}` : body;
    23	}
    24	
    25	export function escapeHtml(value: string): string {
    26		return value
    27			.replace(/&/g, "&amp;")
    28			.replace(/</g, "&lt;")
    29			.replace(/>/g, "&gt;")
    30			.replace(/"/g, "&quot;")
    31			.replace(/'/g, "&#39;");
    32	}
    33	
    34	function renderMarkdownBlocks(markdown: string): string {
    35		const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    36		const html: string[] = [];
    37		let pending: PendingBlock | undefined;
    38		let index = 0;
    39	
    40		while (index < lines.length) {
    41			const line = lines[index] ?? "";
    42	
    43			const specialBlock = renderSpecialMarkdownBlock({
    44				lines,
    45				index,
    46				line,
    47				html,
    48				pending,
    49			});
    50			if (specialBlock) {
    51				pending = undefined;
    52				index = specialBlock.nextIndex;
    53				continue;
    54			}
    55	
    56			const kind = isUnsupportedMarkdownLine(line) ? "unsupported" : "paragraph";
    57			if (pending && pending.kind !== kind) {
    58				flushPending(html, pending);
    59				pending = undefined;
    60			}
    61			pending = {
    62				kind,
    63				lines: [...(pending?.lines ?? []), line],
    64			};
    65			index += 1;
    66		}
    67	
    68		flushPending(html, pending);
    69		return html.join("\n");
    70	}
    71	
    72	function renderSpecialMarkdownBlock(options: {
    73		readonly lines: readonly string[];
    74		readonly index: number;
    75		readonly line: string;
    76		readonly html: string[];
    77		readonly pending: PendingBlock | undefined;
    78	}): { readonly nextIndex: number } | undefined {
    79		if (options.line.startsWith("```")) {
    80			flushPending(options.html, options.pending);
    81			return {
    82				nextIndex: renderFencedCodeBlock(
    83					options.lines,
    84					options.index,
    85					options.html,
    86				),
    87			};
    88		}
    89	
    90		if (options.line.trim() === "") {
    91			flushPending(options.html, options.pending);
    92			return { nextIndex: options.index + 1 };
    93		}
    94	
    95		const heading = options.line.match(HEADING_PATTERN);
    96		if (heading?.[1] && heading[2]) {
    97			flushPending(options.html, options.pending);
    98			renderHeading(heading, options.html);
    99			return { nextIndex: options.index + 1 };
   100		}
   101	
   102		if (UNORDERED_LIST_PATTERN.test(options.line)) {
   103			flushPending(options.html, options.pending);
   104			return {
   105				nextIndex: renderUnorderedList(
   106					options.lines,
   107					options.index,
   108					options.html,
   109				),
   110			};
   111		}
   112	
   113		return undefined;
   114	}
   115	
   116	function renderFencedCodeBlock(
   117		lines: readonly string[],
   118		start: number,
   119		html: string[],
   120	): number {
   121		const codeLines: string[] = [];
   122		let index = start + 1;
   123		while (index < lines.length && !lines[index]?.startsWith("```")) {
   124			codeLines.push(lines[index] ?? "");
   125			index += 1;
   126		}
   127		if (index < lines.length) index += 1;
   128		html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
   129		return index;
   130	}
   131	
   132	function renderHeading(heading: RegExpMatchArray, html: string[]): void {
   133		const marker = heading[1] ?? "#";
   134		const text = heading[2] ?? "";
   135		const level = marker.length;
   136		html.push(`<h${level}>${renderInline(text.trim())}</h${level}>`);
   137	}
   138	
   139	function renderUnorderedList(
   140		lines: readonly string[],
   141		start: number,
   142		html: string[],
   143	): number {
   144		const items: string[] = [];
   145		let index = start;
   146		while (index < lines.length) {
   147			const match = lines[index]?.match(UNORDERED_LIST_PATTERN);
   148			if (!match?.[1]) break;
   149			items.push(`<li>${renderInline(match[1])}</li>`);
   150			index += 1;
   151		}
   152		html.push(`<ul>\n${items.join("\n")}\n</ul>`);
   153		return index;
   154	}
   155	
   156	function flushPending(html: string[], pending: PendingBlock | undefined): void {
   157		if (!pending || pending.lines.length === 0) return;
   158	
   159		if (pending.kind === "unsupported") {
   160			html.push(
   161				`<pre><code>${escapeHtml(pending.lines.join("\n"))}</code></pre>`,
   162			);
   163			return;
   164		}
   165	
   166		html.push(`<p>${renderInline(pending.lines.join("\n"))}</p>`);
   167	}
   168	
   169	function isUnsupportedMarkdownLine(line: string): boolean {
   170		const trimmed = line.trimStart();
   171		return (
   172			trimmed.startsWith(">") ||
   173			trimmed.startsWith("|") ||
   174			trimmed.startsWith("<") ||
   175			trimmed.startsWith("\t") ||
   176			ORDERED_LIST_PATTERN.test(trimmed)
   177		);
   178	}
   179	
   180	function renderInline(value: string): string {
   181		const parts = value.split("`");
   182		return parts
   183			.map((part, index) => {
   184				const escaped = escapeHtml(part);
   185				return index % 2 === 1 ? `<code>${escaped}</code>` : escaped;
   186			})
   187			.join("");
   188	}

 succeeded in 0ms:
     1	/**
     2	 * Task Manager for tasks
     3	 * Orchestrates all core modules for task CRUD operations, search, and filtering
     4	 */
     5	
     6	import {
     7		deleteTaskFile,
     8		ensureForgeDirectory,
     9		getTaskFilename,
    10		listArchivedTaskFiles,
    11		listTaskFiles,
    12		loadConfig,
    13		parseTaskIdFromFilename,
    14		readTaskFile,
    15		saveConfig,
    16		saveTaskFile,
    17	} from "./file-system.ts";
    18	import { generateNextId } from "./id-generator.ts";
    19	import { withTaskCreateLock } from "./lock.ts";
    20	import { parseTask } from "./task-parser.ts";
    21	import { serializeTask } from "./task-serializer.ts";
    22	import type {
    23		AcceptanceCriterion,
    24		ForgeTasksConfig,
    25		Task,
    26		TaskCreateInput,
    27		TaskListFilter,
    28		TaskStatus,
    29		TaskUpdateInput,
    30	} from "./task-types.ts";
    31	import { DEFAULT_CONFIG } from "./task-types.ts";
    32	
    33	type TaskFilterPredicate = (task: Task, filter: TaskListFilter) => boolean;
    34	
    35	const TASK_FILTER_PREDICATES: readonly TaskFilterPredicate[] = [
    36		matchesStatusFilter,
    37		matchesPriorityFilter,
    38		matchesAssigneeFilter,
    39		matchesLabelFilter,
    40		matchesDependencyFilter,
    41	];
    42	
    43	/**
    44	 * TaskManager orchestrates all core modules for task management
    45	 */
    46	export class TaskManager {
    47		private projectRoot: string;
    48		private config: ForgeTasksConfig | null = null;
    49	
    50		private assertValidDate(value: Date, fieldName: string): void {
    51			if (Number.isNaN(value.getTime())) {
    52				throw new Error(`Invalid ${fieldName}: expected a valid Date instance`);
    53			}
    54		}
    55	
    56		/**
    57		 * Create a new TaskManager instance
    58		 * @param projectRoot - The root directory of the project
    59		 */
    60		constructor(projectRoot: string) {
    61			this.projectRoot = projectRoot;
    62		}
    63	
    64		/**
    65		 * Initialize the task system
    66		 * Creates directories and config file if they don't exist
    67		 * @param config - Optional partial configuration to merge with defaults
    68		 * @returns The final configuration
    69		 */
    70		async init(config?: Partial<ForgeTasksConfig>): Promise<ForgeTasksConfig> {
    71			// Ensure directories exist
    72			await ensureForgeDirectory(this.projectRoot);
    73	
    74			// Load existing config or use defaults
    75			const existingConfig = await loadConfig(this.projectRoot);
    76			const baseConfig = existingConfig ?? { ...DEFAULT_CONFIG };
    77	
    78			// Merge provided config with base config
    79			const finalConfig = sanitizeConfig({
    80				...baseConfig,
    81				...config,
    82			});
    83	
    84			// Save the config
    85			await saveConfig(this.projectRoot, finalConfig);
    86	
    87			// Cache the config
    88			this.config = finalConfig;
    89	
    90			return finalConfig;
    91		}
    92	
    93		/**
    94		 * Create a new task
    95		 * @param input - Task creation input
    96		 * @returns The created task
    97		 */
    98		async createTask(input: TaskCreateInput): Promise<Task> {
    99			if (input.dueDate) {
   100				this.assertValidDate(input.dueDate, "dueDate");
   101			}
   102	
   103			// Serialize ID allocation + file write behind a process+filesystem lock
   104			// so concurrent creates don't collide on IDs.
   105			return await withTaskCreateLock(this.projectRoot, () =>
   106				this.createTaskLocked(input),
   107			);
   108		}
   109	
   110		private async createTaskLocked(input: TaskCreateInput): Promise<Task> {
   111			const config = await this.ensureCreateConfig();
   112	
   113			// Re-read allocated IDs inside the lock so allocation accounts for any
   114			// task a concurrent writer just created or archived.
   115			const existingIds = await this.loadCreateAllocatedTaskIds();
   116	
   117			// Generate new ID
   118			const id = generateNextId(config, existingIds);
   119	
   120			// Create timestamp
   121			const now = new Date();
   122	
   123			// Convert acceptance criteria strings to AcceptanceCriterion objects
   124			const acceptanceCriteria: AcceptanceCriterion[] = (
   125				input.acceptanceCriteria ?? []
   126			).map((text, index) => ({
   127				index: index + 1,
   128				text,
   129				checked: false,
   130			}));
   131	
   132			// Build the task object
   133			const task: Task = {
   134				id,
   135				title: input.title,
   136				status: "To Do" as TaskStatus,
   137				priority: input.priority ?? config.defaultPriority,
   138				assignee: input.assignee,
   139				createdAt: now,
   140				updatedAt: now,
   141				dueDate: input.dueDate,
   142				labels: [...(config.defaultLabels ?? []), ...(input.labels ?? [])],
   143				dependencies: input.dependencies ?? [],
   144				description: input.description,
   145				acceptanceCriteria,
   146			};
   147	
   148			// Serialize and save
   149			const content = serializeTask(task);
   150			const filename = getTaskFilename(task);
   151			await saveTaskFile(this.projectRoot, filename, content);
   152	
   153			return task;
   154		}
   155	
   156		/**
   157		 * Update an existing task
   158		 * @param id - Task ID to update
   159		 * @param input - Fields to update
   160		 * @returns The updated task
   161		 * @throws Error if task not found
   162		 */
   163		async updateTask(id: string, input: TaskUpdateInput): Promise<Task> {
   164			await this.ensureInitialized();
   165	
   166			if (input.dueDate) {
   167				this.assertValidDate(input.dueDate, "dueDate");
   168			}
   169	
   170			// Load existing task
   171			const existingTask = await this.getTask(id);
   172			if (!existingTask) {
   173				throw new Error(`Task not found: ${id}`);
   174			}
   175	
   176			// Find the old filename before updating
   177			const oldFilename = getTaskFilename(existingTask);
   178	
   179			// Merge updates into task
   180			const updatedTask: Task = {
   181				...existingTask,
   182				...input,
   183				updatedAt: new Date(),
   184				// Keep the original ID and createdAt
   185				id: existingTask.id,
   186				createdAt: existingTask.createdAt,
   187				// Ensure arrays are properly handled
   188				labels: input.labels ?? existingTask.labels,
   189				dependencies: input.dependencies ?? existingTask.dependencies,
   190				acceptanceCriteria:
   191					input.acceptanceCriteria ?? existingTask.acceptanceCriteria,
   192			};
   193	
   194			// Serialize and save
   195			const content = serializeTask(updatedTask);
   196			const newFilename = getTaskFilename(updatedTask);
   197	
   198			if (oldFilename !== newFilename) {
   199				// Write new file first to avoid data loss if write fails.
   200				await saveTaskFile(this.projectRoot, newFilename, content);
   201				await deleteTaskFile(this.projectRoot, oldFilename);
   202			} else {
   203				await saveTaskFile(this.projectRoot, newFilename, content);
   204			}
   205	
   206			return updatedTask;
   207		}
   208	
   209		/**
   210		 * Delete a task
   211		 * @param id - Task ID to delete
   212		 * @throws Error if task not found
   213		 */
   214		async deleteTask(id: string): Promise<void> {
   215			await this.ensureInitialized();
   216	
   217			const targetFile = await this.findTaskFilenameById(id);
   218			if (!targetFile) {
   219				throw new Error(`Task not found: ${id}`);
   220			}
   221	
   222			await deleteTaskFile(this.projectRoot, targetFile);
   223		}
   224	
   225		/**
   226		 * Get a task by ID
   227		 * @param id - Task ID
   228		 * @returns The task or null if not found
   229		 */
   230		async getTask(id: string): Promise<Task | null> {
   231			await this.ensureInitialized();
   232	
   233			const targetFile = await this.findTaskFilenameById(id);
   234			if (!targetFile) {
   235				return null;
   236			}
   237	
   238			const content = await readTaskFile(this.projectRoot, targetFile);
   239			if (!content) {
   240				return null;
   241			}
   242	
   243			return parseTask(content);
   244		}
   245	
   246		private async findTaskFilenameById(id: string): Promise<string | undefined> {
   247			const normalizedId = id.toUpperCase();
   248			const files = await listTaskFiles(this.projectRoot);
   249			return files.find((file) => {
   250				const fileId = parseTaskIdFromFilename(file);
   251				return fileId?.toUpperCase() === normalizedId;
   252			});
   253		}
   254	
   255		/**
   256		 * List all tasks, optionally filtered
   257		 * @param filter - Optional filter criteria
   258		 * @returns Array of tasks matching the filter
   259		 */
   260		async listTasks(filter?: TaskListFilter): Promise<Task[]> {

exec
/bin/zsh -lc "nl -ba lib/artifact-viewer/loaders.ts | sed -n '1,360p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import { access, readFile } from "node:fs/promises";
     2	import { isAbsolute, posix, relative, resolve } from "node:path";
     3	import matter from "gray-matter";
     4	import { ARCHITECTURE_MAP_OUTPUT_DIR } from "../architecture-map/types.ts";
     5	import type { Plan } from "../plans/index.ts";
     6	import { PlanManager, validateSlug } from "../plans/index.ts";
     7	import { TaskManager } from "../tasks/task-manager.ts";
     8	import type { Task, TaskListFilter, TaskStatus } from "../tasks/task-types.ts";
     9	import { renderArtifactMarkdown } from "./renderer.ts";
    10	
    11	export type ArtifactKind =
    12		| "plan"
    13		| "review"
    14		| "architecture-index"
    15		| "architecture-module";
    16	
    17	export interface ArtifactDocument {
    18		readonly kind: ArtifactKind;
    19		readonly sourcePath: string;
    20		readonly title: string;
    21		readonly markdown: string;
    22		readonly html: string;
    23	}
    24	
    25	export interface PlanTaskStatus {
    26		readonly slug: string;
    27		readonly tasks: readonly Task[];
    28		readonly counts: Readonly<Record<TaskStatus, number>>;
    29	}
    30	
    31	export interface PlanViewerData {
    32		readonly plan: Plan;
    33		readonly planDocument: ArtifactDocument;
    34		readonly specDocument?: ArtifactDocument;
    35		readonly reviewDocument?: ArtifactDocument;
    36		readonly taskStatus: PlanTaskStatus;
    37		readonly taskConfigExists: boolean;
    38	}
    39	
    40	export async function loadPlanArtifact(options: {
    41		readonly projectRoot: string;
    42		readonly slug: string;
    43	}): Promise<ArtifactDocument | null> {
    44		validateSlug(options.slug);
    45	
    46		const manager = new PlanManager(options.projectRoot);
    47		const plan = await manager.getPlan(options.slug);
    48		if (!plan) return null;
    49	
    50		const markdown = plan.spec
    51			? `${plan.body}\n\n## Spec\n\n${plan.spec}`.trim()
    52			: plan.body;
    53		return artifactDocument({
    54			kind: "plan",
    55			sourcePath: `missions/plans/${options.slug}/plan.md`,
    56			title: plan.title,
    57			markdown,
    58		});
    59	}
    60	
    61	export async function loadPlanPageData(options: {
    62		readonly projectRoot: string;
    63		readonly slug: string;
    64	}): Promise<PlanViewerData | null> {
    65		validateSlug(options.slug);
    66	
    67		const manager = new PlanManager(options.projectRoot);
    68		const plan = await manager.getPlan(options.slug);
    69		if (!plan) return null;
    70	
    71		const reviewDocument = await loadPlanReviewArtifact(options);
    72		const taskStatus = await loadPlanTaskStatus(options);
    73		const taskConfigExists = await projectFileExists(
    74			options.projectRoot,
    75			"missions/tasks/config.json",
    76		);
    77	
    78		return {
    79			plan,
    80			planDocument: artifactDocument({
    81				kind: "plan",
    82				sourcePath: `missions/plans/${options.slug}/plan.md`,
    83				title: plan.title,
    84				markdown: plan.body,
    85			}),
    86			...(plan.spec
    87				? {
    88						specDocument: artifactDocument({
    89							kind: "plan",
    90							sourcePath: `missions/plans/${options.slug}/spec.md`,
    91							title: "Spec",
    92							markdown: plan.spec,
    93						}),
    94					}
    95				: {}),
    96			...(reviewDocument ? { reviewDocument } : {}),
    97			taskStatus,
    98			taskConfigExists,
    99		};
   100	}
   101	
   102	export async function loadPlanReviewArtifact(options: {
   103		readonly projectRoot: string;
   104		readonly slug: string;
   105	}): Promise<ArtifactDocument | null> {
   106		validateSlug(options.slug);
   107	
   108		const sourcePath = `missions/plans/${options.slug}/review.md`;
   109		const markdown = await readProjectFile(options.projectRoot, sourcePath);
   110		if (markdown === null) return null;
   111	
   112		return artifactDocument({
   113			kind: "review",
   114			sourcePath,
   115			title: "Review",
   116			markdown,
   117		});
   118	}
   119	
   120	export async function loadReviewArtifact(options: {
   121		readonly projectRoot: string;
   122		readonly filename: string;
   123	}): Promise<ArtifactDocument | null> {
   124		validateMarkdownFilename(options.filename, "review filename");
   125	
   126		const sourcePath = `missions/reviews/${options.filename}`;
   127		const markdown = await readProjectFile(options.projectRoot, sourcePath);
   128		if (markdown === null) return null;
   129	
   130		return artifactDocument({
   131			kind: "review",
   132			sourcePath,
   133			title: options.filename.replace(/\.md$/u, ""),
   134			markdown,
   135		});
   136	}
   137	
   138	export async function loadArchitectureIndexArtifact(options: {
   139		readonly projectRoot: string;
   140	}): Promise<ArtifactDocument | null> {
   141		const sourcePath = `${ARCHITECTURE_MAP_OUTPUT_DIR}/index.md`;
   142		const markdown = await readProjectFile(options.projectRoot, sourcePath);
   143		if (markdown === null) return null;
   144	
   145		return artifactDocument({
   146			kind: "architecture-index",
   147			sourcePath,
   148			title: "Architecture Map",
   149			markdown,
   150		});
   151	}
   152	
   153	export async function loadArchitectureModuleArtifact(options: {
   154		readonly projectRoot: string;
   155		readonly resource: string;
   156	}): Promise<ArtifactDocument | null> {
   157		validateArchitectureResource(options.resource);
   158	
   159		const shardPath = architectureModuleShardPath(options.resource);
   160		const sourcePath = `${ARCHITECTURE_MAP_OUTPUT_DIR}/${shardPath}`;
   161		const markdown = await readProjectFile(options.projectRoot, sourcePath);
   162		if (markdown === null) return null;
   163	
   164		return artifactDocument({
   165			kind: "architecture-module",
   166			sourcePath,
   167			title: options.resource,
   168			markdown,
   169		});
   170	}
   171	
   172	export async function loadPlanTaskStatus(options: {
   173		readonly projectRoot: string;
   174		readonly slug: string;
   175		readonly filter?: Omit<TaskListFilter, "label">;
   176	}): Promise<PlanTaskStatus> {
   177		validateSlug(options.slug);
   178	
   179		const tasks = await new TaskManager(options.projectRoot).listTasksReadOnly({
   180			...options.filter,
   181			label: `plan:${options.slug}`,
   182		});
   183		return {
   184			slug: options.slug,
   185			tasks,
   186			counts: countTasksByStatus(tasks),
   187		};
   188	}
   189	
   190	export function validateArchitectureResource(resource: string): void {
   191		if (!resource) {
   192			throw new Error("Architecture resource cannot be empty");
   193		}
   194		if (resource === ".") return;
   195		if (
   196			resource.includes("\\") ||
   197			resource.startsWith("/") ||
   198			resource.split("/").includes("..") ||
   199			posix.normalize(resource) !== resource
   200		) {
   201			throw new Error(`Invalid architecture resource: ${resource}`);
   202		}
   203	
   204		const targetRoot = resolve("/", ARCHITECTURE_MAP_OUTPUT_DIR, "modules");
   205		const absolute = resolve(targetRoot, ...resource.split("/"));
   206		const rel = relative(targetRoot, absolute);
   207		if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
   208			throw new Error(`Invalid architecture resource: ${resource}`);
   209		}
   210	}
   211	
   212	function architectureModuleShardPath(resource: string): string {
   213		const normalizedResource = resource === "." ? "root" : resource;
   214		return `modules/${normalizedResource}.md`;
   215	}
   216	
   217	function artifactDocument(input: {
   218		readonly kind: ArtifactKind;
   219		readonly sourcePath: string;
   220		readonly title: string;
   221		readonly markdown: string;
   222	}): ArtifactDocument {
   223		const markdown = stripFrontmatter(input.markdown);
   224		return {
   225			...input,
   226			markdown,
   227			html: renderArtifactMarkdown(markdown),
   228		};
   229	}
   230	
   231	function stripFrontmatter(markdown: string): string {
   232		return matter(markdown).content.trim();
   233	}
   234	
   235	async function readProjectFile(
   236		projectRoot: string,
   237		projectPath: string,
   238	): Promise<string | null> {
   239		const absolute = safeProjectFilePath(projectRoot, projectPath);
   240	
   241		try {
   242			return await readFile(absolute, "utf-8");
   243		} catch (error) {
   244			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
   245			throw error;
   246		}
   247	}
   248	
   249	function validateMarkdownFilename(filename: string, fieldName: string): void {
   250		if (
   251			!filename.endsWith(".md") ||
   252			filename.includes("/") ||
   253			filename.includes("\\") ||
   254			filename.includes("..")
   255		) {
   256			throw new Error(`Invalid ${fieldName}: ${filename}`);
   257		}
   258	}
   259	
   260	async function projectFileExists(
   261		projectRoot: string,
   262		projectPath: string,
   263	): Promise<boolean> {
   264		const absolute = safeProjectFilePath(projectRoot, projectPath);
   265	
   266		return await access(absolute)
   267			.then(() => true)
   268			.catch(() => false);
   269	}
   270	
   271	function safeProjectFilePath(projectRoot: string, projectPath: string): string {
   272		const root = resolve(projectRoot);
   273		const absolute = resolve(root, ...projectPath.split("/"));
   274		const rel = relative(root, absolute);
   275		if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
   276			throw new Error(`Unsafe artifact path: ${projectPath}`);
   277		}
   278		return absolute;
   279	}
   280	
   281	function countTasksByStatus(
   282		tasks: readonly Task[],
   283	): Readonly<Record<TaskStatus, number>> {
   284		return {
   285			"To Do": tasks.filter((task) => task.status === "To Do").length,
   286			"In Progress": tasks.filter((task) => task.status === "In Progress").length,
   287			Done: tasks.filter((task) => task.status === "Done").length,
   288			Blocked: tasks.filter((task) => task.status === "Blocked").length,
   289		};
   290	}

exec
/bin/zsh -lc "nl -ba cli/architecture/subcommand.ts | sed -n '1,360p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import { Command } from "commander";
     2	import {
     3		generateArchitectureMap as defaultGenerateArchitectureMap,
     4		type GenerateArchitectureMapOptions,
     5		type GenerateArchitectureMapResult,
     6		type NarrativeProvider,
     7		typescriptSourceAnalyzer,
     8	} from "../../lib/architecture-map/index.ts";
     9	import {
    10		type CliOutputMode,
    11		getOutputMode,
    12		printJson,
    13		printLines,
    14	} from "../shared/output.ts";
    15	import { createPiArchitectureNarrativeProvider } from "./narrative-provider.ts";
    16	
    17	type GenerateArchitectureMapFn = (
    18		options: GenerateArchitectureMapOptions,
    19	) => Promise<GenerateArchitectureMapResult>;
    20	
    21	type CreateNarrativeProviderFn = (options: {
    22		readonly projectRoot: string;
    23	}) => NarrativeProvider;
    24	
    25	interface ArchitectureProgramOptions {
    26		readonly projectRoot?: string;
    27		readonly generateArchitectureMap?: GenerateArchitectureMapFn;
    28		readonly createNarrativeProvider?: CreateNarrativeProviderFn;
    29	}
    30	
    31	interface ArchitectureGenerateOptions {
    32		readonly noNarrative?: boolean;
    33		readonly narrative?: boolean;
    34		readonly json?: boolean;
    35		readonly plain?: boolean;
    36	}
    37	
    38	interface ExecuteArchitectureGenerateOptions
    39		extends ArchitectureProgramOptions {
    40		readonly projectRoot: string;
    41		readonly noNarrative: boolean;
    42		readonly outputMode: CliOutputMode;
    43		readonly progress?: (message: string) => void;
    44	}
    45	
    46	interface ArchitectureGenerateCommandResult {
    47		readonly result: GenerateArchitectureMapResult;
    48		readonly rendered:
    49			| { readonly kind: "json"; readonly value: GenerateArchitectureMapResult }
    50			| { readonly kind: "lines"; readonly lines: readonly string[] };
    51		readonly exitCode: number;
    52	}
    53	
    54	export function createArchitectureProgram(
    55		options: ArchitectureProgramOptions = {},
    56	): Command {
    57		const program = new Command();
    58	
    59		program
    60			.name("cosmonauts architecture")
    61			.alias("arch")
    62			.description("Generate and inspect architecture map artifacts")
    63			.version("1.0.0");
    64	
    65		program
    66			.command("generate")
    67			.description(
    68				"Generate memory/architecture from TypeScript source structure",
    69			)
    70			.option(
    71				"--no-narrative",
    72				"Skip model-backed prose and write pending narrative entries",
    73			)
    74			.option("--json", "Output the generator result as JSON")
    75			.option("--plain", "Output in plain text format")
    76			.action(async (commandOptions: ArchitectureGenerateOptions) => {
    77				await runArchitectureGenerateCommand({
    78					...options,
    79					projectRoot: options.projectRoot ?? process.cwd(),
    80					noNarrative:
    81						commandOptions.noNarrative === true ||
    82						commandOptions.narrative === false,
    83					outputMode: getOutputMode(commandOptions),
    84				});
    85			});
    86	
    87		return program;
    88	}
    89	
    90	async function runArchitectureGenerateCommand(
    91		options: ExecuteArchitectureGenerateOptions,
    92	): Promise<void> {
    93		const progress =
    94			options.outputMode === "json"
    95				? undefined
    96				: (message: string) => printLines([message], "stderr");
    97		const commandResult = await executeArchitectureGenerate({
    98			...options,
    99			...(progress ? { progress } : {}),
   100		});
   101		emitArchitectureGenerateResult(commandResult.rendered);
   102		if (commandResult.exitCode !== 0) {
   103			process.exitCode = commandResult.exitCode;
   104		}
   105	}
   106	
   107	export async function executeArchitectureGenerate(
   108		options: ExecuteArchitectureGenerateOptions,
   109	): Promise<ArchitectureGenerateCommandResult> {
   110		const generateArchitectureMap =
   111			options.generateArchitectureMap ?? defaultGenerateArchitectureMap;
   112		const createNarrativeProvider =
   113			options.createNarrativeProvider ?? createPiArchitectureNarrativeProvider;
   114		const narrativeProvider = options.noNarrative
   115			? undefined
   116			: createNarrativeProvider({ projectRoot: options.projectRoot });
   117		const progressNarrativeProvider = narrativeProvider
   118			? withNarrativeProgress(narrativeProvider, options.progress)
   119			: undefined;
   120	
   121		options.progress?.("Generating architecture map...");
   122		const result = await generateArchitectureMap({
   123			projectRoot: options.projectRoot,
   124			analyzer: typescriptSourceAnalyzer,
   125			...(progressNarrativeProvider
   126				? { narrativeProvider: progressNarrativeProvider }
   127				: {}),
   128		});
   129	
   130		return {
   131			result,
   132			...renderArchitectureGenerateResult(result, options.outputMode),
   133		};
   134	}
   135	
   136	function withNarrativeProgress(
   137		provider: NarrativeProvider,
   138		progress: ((message: string) => void) | undefined,
   139	): NarrativeProvider {
   140		if (!progress) return provider;
   141	
   142		let reported = false;
   143		return {
   144			async generate(input, signal) {
   145				if (!reported) {
   146					reported = true;
   147					progress("Generating architecture narratives...");
   148				}
   149				return provider.generate(input, signal);
   150			},
   151		};
   152	}
   153	
   154	export function renderArchitectureGenerateResult(
   155		result: GenerateArchitectureMapResult,
   156		mode: CliOutputMode,
   157	): Pick<ArchitectureGenerateCommandResult, "rendered" | "exitCode"> {
   158		if (mode === "json") {
   159			return {
   160				exitCode: architectureGenerateExitCode(result),
   161				rendered: { kind: "json", value: result },
   162			};
   163		}
   164	
   165		return {
   166			exitCode: architectureGenerateExitCode(result),
   167			rendered: {
   168				kind: "lines",
   169				lines:
   170					mode === "plain"
   171						? renderPlainArchitectureGenerateResult(result)
   172						: renderHumanArchitectureGenerateResult(result),
   173			},
   174		};
   175	}
   176	
   177	function architectureGenerateExitCode(
   178		result: GenerateArchitectureMapResult,
   179	): number {
   180		switch (result.kind) {
   181			case "written":
   182			case "unchanged":
   183				return 0;
   184			case "unsupported":
   185			case "failed":
   186				return 1;
   187		}
   188	}
   189	
   190	function renderHumanArchitectureGenerateResult(
   191		result: GenerateArchitectureMapResult,
   192	): readonly string[] {
   193		switch (result.kind) {
   194			case "written":
   195				return [
   196					"Architecture map written.",
   197					...(result.changedFiles.length > 0
   198						? ["Changed files:", ...indent(result.changedFiles)]
   199						: []),
   200					...(result.pendingModules.length > 0
   201						? ["Pending narratives:", ...indent(result.pendingModules)]
   202						: []),
   203				];
   204			case "unchanged":
   205				return ["Architecture map unchanged."];
   206			case "unsupported":
   207				return [`Architecture map unsupported-project: ${result.reason}`];
   208			case "failed":
   209				return [
   210					`Architecture map failed: ${result.error}`,
   211					`Previous map intact: ${result.previousMapIntact ? "yes" : "no"}`,
   212				];
   213		}
   214	}
   215	
   216	function renderPlainArchitectureGenerateResult(
   217		result: GenerateArchitectureMapResult,
   218	): readonly string[] {
   219		switch (result.kind) {
   220			case "written":
   221				return [
   222					"kind=written",
   223					`changedFiles=${result.changedFiles.join(",")}`,
   224					`pendingModules=${result.pendingModules.join(",")}`,
   225				];
   226			case "unchanged":
   227				return ["kind=unchanged"];
   228			case "unsupported":
   229				return ["kind=unsupported", `reason=${result.reason}`];
   230			case "failed":
   231				return [
   232					"kind=failed",
   233					`error=${result.error}`,
   234					`previousMapIntact=${String(result.previousMapIntact)}`,
   235				];
   236		}
   237	}
   238	
   239	function indent(lines: readonly string[]): readonly string[] {
   240		return lines.map((line) => `  ${line}`);
   241	}
   242	
   243	function emitArchitectureGenerateResult(
   244		rendered: ArchitectureGenerateCommandResult["rendered"],
   245	): void {
   246		if (rendered.kind === "json") {
   247			printJson(rendered.value);
   248			return;
   249		}
   250		printLines(rendered.lines);
   251	}

codex
One risky area is that generated shard paths are derived directly from module resources, so a malformed resource would be dangerous if it escaped earlier validation. The current config validation blocks absolute/traversal roots and the store revalidates bundle paths, so I’m looking for cases where a safe-looking resource still breaks lookup or creates stale artifacts.
exec
/bin/zsh -lc "nl -ba lib/config/loader.ts | sed -n '1,260p'" in /Users/cosmos/Projects/cosmonauts
exec
/bin/zsh -lc "nl -ba lib/tasks/task-manager.ts | sed -n '260,620p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	/**
     2	 * Project config loader — reads `.cosmonauts/config.json`.
     3	 *
     4	 * Missing file → empty config (no error).
     5	 * Invalid JSON → throws with descriptive message.
     6	 */
     7	
     8	import { access, mkdir, readFile, writeFile } from "node:fs/promises";
     9	import { homedir } from "node:os";
    10	import { join, resolve } from "node:path";
    11	import { createDefaultProjectConfig } from "./defaults.ts";
    12	import type { ProjectConfig } from "./types.ts";
    13	
    14	type MutableArchitectureMapConfig = {
    15		sourceRoots?: string[];
    16		moduleRoots?: string[];
    17		exclude?: string[];
    18		injectionMaxBytes?: number;
    19		narrative?: {
    20			enabled?: boolean;
    21			maxModulesPerRun?: number;
    22		};
    23	};
    24	
    25	/** Expand leading `~` or `~/` to the user's home directory. */
    26	function expandTilde(p: string): string {
    27		if (p === "~") return homedir();
    28		if (p.startsWith("~/") || p.startsWith("~\\")) {
    29			return join(homedir(), p.slice(2));
    30		}
    31		return p;
    32	}
    33	
    34	const CONFIG_DIR = ".cosmonauts";
    35	const CONFIG_FILE = "config.json";
    36	
    37	/**
    38	 * Load project configuration from `.cosmonauts/config.json`.
    39	 * Returns an empty config if the file does not exist.
    40	 * Throws if the file exists but contains invalid JSON.
    41	 */
    42	// fallow-ignore-next-line complexity
    43	export async function loadProjectConfig(
    44		projectRoot: string,
    45	): Promise<ProjectConfig> {
    46		const configPath = join(projectRoot, CONFIG_DIR, CONFIG_FILE);
    47	
    48		let raw: string;
    49		try {
    50			raw = await readFile(configPath, "utf-8");
    51		} catch (error: unknown) {
    52			// Missing config file is expected; other read failures should surface.
    53			if (
    54				error &&
    55				typeof error === "object" &&
    56				"code" in error &&
    57				(error as NodeJS.ErrnoException).code === "ENOENT"
    58			) {
    59				return {};
    60			}
    61			throw error;
    62		}
    63	
    64		let parsed: unknown;
    65		try {
    66			parsed = JSON.parse(raw);
    67		} catch {
    68			throw new Error(
    69				`Invalid JSON in ${configPath}. Expected a valid JSON object.`,
    70			);
    71		}
    72	
    73		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    74			throw new Error(`Invalid config in ${configPath}. Expected a JSON object.`);
    75		}
    76	
    77		const obj = parsed as Record<string, unknown>;
    78		const config: {
    79			domain?: string;
    80			activeDomains?: readonly string[];
    81			domainBindings?: Readonly<Record<string, string>>;
    82			skills?: readonly string[];
    83			skillPaths?: readonly string[];
    84			chains?: ProjectConfig["chains"];
    85			architectureMap?: ProjectConfig["architectureMap"];
    86		} = {};
    87	
    88		if (typeof obj.domain === "string") {
    89			config.domain = obj.domain;
    90		}
    91	
    92		if (Array.isArray(obj.activeDomains)) {
    93			config.activeDomains = obj.activeDomains.filter(
    94				(s: unknown): s is string => typeof s === "string",
    95			);
    96		}
    97	
    98		if ("domainBindings" in obj) {
    99			if (
   100				typeof obj.domainBindings === "object" &&
   101				obj.domainBindings !== null &&
   102				!Array.isArray(obj.domainBindings)
   103			) {
   104				const domainBindings: Record<string, string> = {};
   105				for (const [role, target] of Object.entries(obj.domainBindings)) {
   106					if (
   107						role.length > 0 &&
   108						typeof target === "string" &&
   109						target.length > 0
   110					) {
   111						domainBindings[role] = target;
   112					} else {
   113						console.error(
   114							`[warning] Skipping malformed domainBindings entry ${JSON.stringify(role)}: expected a non-empty role and non-empty string target domain, got ${formatConfigValue(target)}.`,
   115						);
   116					}
   117				}
   118				config.domainBindings = domainBindings;
   119			} else {
   120				console.error(
   121					`[warning] Skipping malformed domainBindings: expected an object map like { "coding": "ruby-coding" }, got ${formatConfigValue(obj.domainBindings)}.`,
   122				);
   123			}
   124		}
   125	
   126		if (Array.isArray(obj.skills)) {
   127			config.skills = obj.skills.filter(
   128				(s: unknown): s is string => typeof s === "string",
   129			);
   130		}
   131	
   132		if (Array.isArray(obj.skillPaths)) {
   133			config.skillPaths = obj.skillPaths
   134				.filter((s: unknown): s is string => typeof s === "string")
   135				.map((p) => resolve(projectRoot, expandTilde(p)));
   136		}
   137	
   138		if (
   139			obj.chains &&
   140			typeof obj.chains === "object" &&
   141			!Array.isArray(obj.chains)
   142		) {
   143			config.chains = obj.chains as ProjectConfig["chains"];
   144		}
   145	
   146		if ("architectureMap" in obj) {
   147			config.architectureMap = parseArchitectureMapConfig(obj.architectureMap);
   148		}
   149	
   150		return config;
   151	}
   152	
   153	function parseArchitectureMapConfig(
   154		value: unknown,
   155	): ProjectConfig["architectureMap"] | undefined {
   156		if (value === undefined) return undefined;
   157		if (typeof value !== "object" || value === null || Array.isArray(value)) {
   158			console.error(
   159				`[warning] Skipping malformed architectureMap: expected an object, got ${formatConfigValue(value)}.`,
   160			);
   161			return undefined;
   162		}
   163	
   164		const obj = value as Record<string, unknown>;
   165		const architectureMap: MutableArchitectureMapConfig = {};
   166	
   167		const sourceRoots = parseStringArrayField(
   168			"architectureMap.sourceRoots",
   169			obj.sourceRoots,
   170		);
   171		if (sourceRoots) architectureMap.sourceRoots = sourceRoots;
   172	
   173		const moduleRoots = parseStringArrayField(
   174			"architectureMap.moduleRoots",
   175			obj.moduleRoots,
   176		);
   177		if (moduleRoots) architectureMap.moduleRoots = moduleRoots;
   178	
   179		const exclude = parseStringArrayField("architectureMap.exclude", obj.exclude);
   180		if (exclude) architectureMap.exclude = exclude;
   181	
   182		const injectionMaxBytes = parseOptionalFiniteNumberField(
   183			"architectureMap.injectionMaxBytes",
   184			obj,
   185			"injectionMaxBytes",
   186		);
   187		if (injectionMaxBytes !== undefined) {
   188			architectureMap.injectionMaxBytes = injectionMaxBytes;
   189		}
   190	
   191		const narrative = parseOptionalObjectField(
   192			"architectureMap.narrative",
   193			obj,
   194			"narrative",
   195		);
   196		if (narrative) {
   197			const parsedNarrative = parseArchitectureMapNarrative(narrative);
   198			if (parsedNarrative) architectureMap.narrative = parsedNarrative;
   199		}
   200	
   201		return architectureMap;
   202	}
   203	
   204	function parseOptionalFiniteNumberField(
   205		fieldName: string,
   206		obj: Record<string, unknown>,
   207		key: string,
   208	): number | undefined {
   209		if (!(key in obj)) return undefined;
   210		const value = obj[key];
   211		if (typeof value === "number" && Number.isFinite(value)) return value;
   212		console.error(
   213			`[warning] Skipping malformed ${fieldName}: expected a finite number, got ${formatConfigValue(value)}.`,
   214		);
   215		return undefined;
   216	}
   217	
   218	function parseOptionalObjectField(
   219		fieldName: string,
   220		obj: Record<string, unknown>,
   221		key: string,
   222	): object | undefined {
   223		if (!(key in obj)) return undefined;
   224		const value = obj[key];
   225		if (typeof value === "object" && value !== null && !Array.isArray(value)) {
   226			return value;
   227		}
   228		console.error(
   229			`[warning] Skipping malformed ${fieldName}: expected an object, got ${formatConfigValue(value)}.`,
   230		);
   231		return undefined;
   232	}
   233	
   234	function parseArchitectureMapNarrative(
   235		value: object,
   236	): MutableArchitectureMapConfig["narrative"] | undefined {
   237		const obj = value as Record<string, unknown>;
   238		const narrative: NonNullable<MutableArchitectureMapConfig["narrative"]> = {};
   239	
   240		if ("enabled" in obj) {
   241			if (typeof obj.enabled === "boolean") {
   242				narrative.enabled = obj.enabled;
   243			} else {
   244				console.error(
   245					`[warning] Skipping malformed architectureMap.narrative.enabled: expected a boolean, got ${formatConfigValue(obj.enabled)}.`,
   246				);
   247			}
   248		}
   249	
   250		if ("maxModulesPerRun" in obj) {
   251			if (
   252				typeof obj.maxModulesPerRun === "number" &&
   253				Number.isFinite(obj.maxModulesPerRun)
   254			) {
   255				narrative.maxModulesPerRun = obj.maxModulesPerRun;
   256			} else {
   257				console.error(
   258					`[warning] Skipping malformed architectureMap.narrative.maxModulesPerRun: expected a finite number, got ${formatConfigValue(obj.maxModulesPerRun)}.`,
   259				);
   260			}

 succeeded in 0ms:
   260		async listTasks(filter?: TaskListFilter): Promise<Task[]> {
   261			await this.ensureInitialized();
   262	
   263			const tasks = await this.loadAllTasks();
   264	
   265			if (!filter) {
   266				return tasks;
   267			}
   268	
   269			return tasks.filter((task) => this.matchesFilter(task, filter));
   270		}
   271	
   272		/**
   273		 * List task files without initializing task scaffolding or writing config.
   274		 * Intended for read-only presentation surfaces that must tolerate projects
   275		 * without an initialized missions/tasks directory.
   276		 *
   277		 * @param filter - Optional filter criteria
   278		 * @returns Array of tasks matching the filter
   279		 */
   280		async listTasksReadOnly(filter?: TaskListFilter): Promise<Task[]> {
   281			const tasks = filter?.label
   282				? await this.loadTasksMatchingLabelReadOnly(filter.label)
   283				: await this.loadAllTasks();
   284	
   285			if (!filter) {
   286				return tasks;
   287			}
   288	
   289			return tasks.filter((task) => this.matchesFilter(task, filter));
   290		}
   291	
   292		/**
   293		 * Search tasks by query string
   294		 * Searches title, description, implementationPlan, and implementationNotes
   295		 * @param query - Search query
   296		 * @param filter - Optional additional filter
   297		 * @returns Array of matching tasks
   298		 */
   299		async search(query: string, filter?: TaskListFilter): Promise<Task[]> {
   300			await this.ensureInitialized();
   301	
   302			const tasks = await this.loadAllTasks();
   303			const queryLower = query.toLowerCase();
   304	
   305			// Filter by search query
   306			const matchingTasks = tasks.filter((task) => {
   307				const searchableFields = [
   308					task.title,
   309					task.description,
   310					task.implementationPlan,
   311					task.implementationNotes,
   312				];
   313	
   314				return searchableFields.some((field) =>
   315					field?.toLowerCase().includes(queryLower),
   316				);
   317			});
   318	
   319			// Apply additional filter if provided
   320			if (!filter) {
   321				return matchingTasks;
   322			}
   323	
   324			return matchingTasks.filter((task) => this.matchesFilter(task, filter));
   325		}
   326	
   327		/**
   328		 * Ensure the system is initialized
   329		 * Loads config from disk if not already cached
   330		 * @returns The configuration
   331		 */
   332		private async ensureInitialized(): Promise<ForgeTasksConfig> {
   333			if (this.config) {
   334				return this.config;
   335			}
   336	
   337			// Try to load existing config
   338			const existingConfig = await loadConfig(this.projectRoot);
   339			if (existingConfig) {
   340				this.config = sanitizeConfig(existingConfig);
   341				return this.config;
   342			}
   343	
   344			// Initialize with defaults if no config exists
   345			return await this.init();
   346		}
   347	
   348		private async ensureCreateConfig(): Promise<ForgeTasksConfig> {
   349			if (this.config) {
   350				return this.config;
   351			}
   352	
   353			const existingConfig = await loadConfig(this.projectRoot);
   354			this.config = sanitizeConfig(existingConfig ?? DEFAULT_CONFIG);
   355			return this.config;
   356		}
   357	
   358		/**
   359		 * Load all tasks from disk
   360		 * @returns Array of all tasks
   361		 */
   362		private async loadAllTasks(): Promise<Task[]> {
   363			const files = await listTaskFiles(this.projectRoot);
   364			return await this.loadTaskFiles(files);
   365		}
   366	
   367		private async loadTasksMatchingLabelReadOnly(label: string): Promise<Task[]> {
   368			const files = await listTaskFiles(this.projectRoot);
   369			const tasks: Task[] = [];
   370	
   371			for (const file of files) {
   372				const content = await readTaskFile(this.projectRoot, file);
   373				if (content && taskFileMayContainLabel(content, label)) {
   374					this.tryParseTaskFile(file, content, tasks);
   375				}
   376			}
   377	
   378			return tasks;
   379		}
   380	
   381		private async loadTaskFiles(files: readonly string[]): Promise<Task[]> {
   382			const tasks: Task[] = [];
   383	
   384			for (const file of files) {
   385				const content = await readTaskFile(this.projectRoot, file);
   386				if (content) {
   387					this.tryParseTaskFile(file, content, tasks);
   388				}
   389			}
   390	
   391			return tasks;
   392		}
   393	
   394		private tryParseTaskFile(file: string, content: string, tasks: Task[]): void {
   395			try {
   396				const task = parseTask(content);
   397				tasks.push(task);
   398			} catch (error) {
   399				// Skip files that fail to parse
   400				if (process.env.DEBUG) {
   401					console.error(`Failed to parse task file ${file}:`, error);
   402				}
   403			}
   404		}
   405	
   406		private async loadCreateAllocatedTaskIds(): Promise<string[]> {
   407			const activeTasks = await this.loadAllTasks();
   408			const archivedFiles = await listArchivedTaskFiles(this.projectRoot);
   409			const archivedIds = archivedFiles
   410				.map((file) => parseTaskIdFromFilename(file))
   411				.filter((id): id is string => id !== null);
   412	
   413			return [
   414				...new Set([...activeTasks.map((task) => task.id), ...archivedIds]),
   415			];
   416		}
   417	
   418		/**
   419		 * Check if a task matches the given filter
   420		 * @param task - Task to check
   421		 * @param filter - Filter criteria
   422		 * @returns True if task matches all filter criteria
   423		 */
   424		private matchesFilter(task: Task, filter: TaskListFilter): boolean {
   425			return TASK_FILTER_PREDICATES.every((predicate) => predicate(task, filter));
   426		}
   427	}
   428	
   429	function taskFileMayContainLabel(content: string, label: string): boolean {
   430		return content.toLowerCase().includes(label.toLowerCase());
   431	}
   432	
   433	function matchesStatusFilter(task: Task, filter: TaskListFilter): boolean {
   434		if (!filter.status) {
   435			return true;
   436		}
   437	
   438		const statuses = Array.isArray(filter.status)
   439			? filter.status
   440			: [filter.status];
   441		return statuses.includes(task.status);
   442	}
   443	
   444	function matchesPriorityFilter(task: Task, filter: TaskListFilter): boolean {
   445		if (!filter.priority) {
   446			return true;
   447		}
   448	
   449		const priorities = Array.isArray(filter.priority)
   450			? filter.priority
   451			: [filter.priority];
   452		return task.priority ? priorities.includes(task.priority) : false;
   453	}
   454	
   455	function matchesAssigneeFilter(task: Task, filter: TaskListFilter): boolean {
   456		if (!filter.assignee) {
   457			return true;
   458		}
   459	
   460		return task.assignee?.toLowerCase() === filter.assignee.toLowerCase();
   461	}
   462	
   463	function matchesLabelFilter(task: Task, filter: TaskListFilter): boolean {
   464		if (!filter.label) {
   465			return true;
   466		}
   467	
   468		const labelLower = filter.label.toLowerCase();
   469		return task.labels.some((label) => label.toLowerCase() === labelLower);
   470	}
   471	
   472	function matchesDependencyFilter(task: Task, filter: TaskListFilter): boolean {
   473		if (!filter.hasNoDependencies) {
   474			return true;
   475		}
   476	
   477		return task.dependencies.length === 0;
   478	}
   479	
   480	function sanitizeConfig(config: ForgeTasksConfig): ForgeTasksConfig {
   481		const { lastIdNumber: _lastIdNumber, ...currentConfig } =
   482			config as ForgeTasksConfig & { lastIdNumber?: unknown };
   483		return { ...currentConfig };
   484	}

exec
/bin/zsh -lc "nl -ba lib/config/types.ts | sed -n '1,180p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	/**
     2	 * Type definitions for project-level configuration.
     3	 *
     4	 * Projects declare their configuration in `.cosmonauts/config.json`.
     5	 */
     6	
     7	/** Named-chain entry in project config. */
     8	export interface ProjectChainConfig {
     9		readonly description?: string;
    10		readonly chain: string;
    11	}
    12	
    13	/** Optional architecture-map configuration from `.cosmonauts/config.json`. */
    14	interface ProjectArchitectureMapConfig {
    15		readonly sourceRoots?: readonly string[];
    16		readonly moduleRoots?: readonly string[];
    17		readonly exclude?: readonly string[];
    18		readonly injectionMaxBytes?: number;
    19		readonly narrative?: {
    20			readonly enabled?: boolean;
    21			readonly maxModulesPerRun?: number;
    22		};
    23	}
    24	
    25	/** Project-level configuration loaded from `.cosmonauts/config.json`. */
    26	export interface ProjectConfig {
    27		/** Default domain for this project (e.g. "coding"). */
    28		readonly domain?: string;
    29		/** Active non-shared domain IDs for this project. Shared is always active. */
    30		readonly activeDomains?: readonly string[];
    31		/** Domain role → target domain overrides. */
    32		readonly domainBindings?: Readonly<Record<string, string>>;
    33		/** Skills relevant to this project. Filters agent skill indices to this set. */
    34		readonly skills?: readonly string[];
    35		/** Additional skill directories (e.g. "~/.claude/skills", ".codex/skills"). */
    36		readonly skillPaths?: readonly string[];
    37		/** Custom named-chain definitions (name → config). */
    38		readonly chains?: Readonly<Record<string, ProjectChainConfig>>;
    39		/** Optional generated architecture-map settings. */
    40		readonly architectureMap?: ProjectArchitectureMapConfig;
    41	}

exec
/bin/zsh -lc "nl -ba cli/serve/subcommand.ts | sed -n '1,320p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import { spawn } from "node:child_process";
     2	import type { Server } from "node:http";
     3	import type { AddressInfo } from "node:net";
     4	import { Command, InvalidArgumentError } from "commander";
     5	import { createArtifactViewerServer } from "../../lib/artifact-viewer/index.ts";
     6	import { printLines } from "../shared/output.ts";
     7	
     8	interface ServeCommandOptions {
     9		readonly projectRoot?: string;
    10		readonly host?: string;
    11		readonly port?: number;
    12		readonly open?: boolean;
    13	}
    14	
    15	export interface ServeStartupResult {
    16		readonly server: Server;
    17		readonly url: string;
    18		readonly openWarning?: string;
    19	}
    20	
    21	type BrowserOpener = (url: string) => Promise<void>;
    22	
    23	interface ServeCommandDependencies {
    24		readonly createServer?: typeof createArtifactViewerServer;
    25		readonly openBrowser?: BrowserOpener;
    26		readonly writeOutput?: (line: string) => void;
    27		readonly writeWarning?: (line: string) => void;
    28	}
    29	
    30	interface ServeProgramOptions extends ServeCommandDependencies {
    31		readonly projectRoot?: string;
    32		readonly onStarted?: (result: ServeStartupResult) => void;
    33	}
    34	
    35	const DEFAULT_HOST = "127.0.0.1";
    36	const DEFAULT_PORT = 0;
    37	
    38	export function createServeProgram(options: ServeProgramOptions = {}): Command {
    39		const program = new Command();
    40	
    41		program
    42			.name("cosmonauts serve")
    43			.description("Serve local read-only Cosmonauts artifact views")
    44			.option("--host <host>", "Host to bind", DEFAULT_HOST)
    45			.option("--port <port>", "Port to bind", parsePort, DEFAULT_PORT)
    46			.option("--open", "Open the served URL in the platform browser")
    47			.option("--no-open", "Do not open the platform browser")
    48			.action(
    49				async (commandOptions: {
    50					readonly host: string;
    51					readonly port: number;
    52					readonly open?: boolean;
    53				}) => {
    54					const result = await runServeCommand(
    55						{
    56							projectRoot: options.projectRoot ?? process.cwd(),
    57							host: commandOptions.host,
    58							port: commandOptions.port,
    59							open: commandOptions.open === true,
    60						},
    61						options,
    62					);
    63					options.onStarted?.(result);
    64				},
    65			);
    66	
    67		return program;
    68	}
    69	
    70	export async function runServeCommand(
    71		options: ServeCommandOptions = {},
    72		dependencies: ServeCommandDependencies = {},
    73	): Promise<ServeStartupResult> {
    74		const projectRoot = options.projectRoot ?? process.cwd();
    75		const host = options.host ?? DEFAULT_HOST;
    76		const port = options.port ?? DEFAULT_PORT;
    77		const createServer = dependencies.createServer ?? createArtifactViewerServer;
    78		const writeOutput =
    79			dependencies.writeOutput ?? ((line: string) => printLines([line]));
    80		const writeWarning =
    81			dependencies.writeWarning ??
    82			((line: string) => printLines([line], "stderr"));
    83	
    84		const server = createServer({ projectRoot });
    85		const address = await listen(server, { host, port });
    86		const url = formatServerUrl(host, address.port);
    87		writeOutput(`Serving Cosmonauts artifacts at ${url}`);
    88	
    89		let openWarning: string | undefined;
    90		if (options.open) {
    91			try {
    92				await (dependencies.openBrowser ?? openBrowser)(url);
    93			} catch (error) {
    94				openWarning = `Warning: failed to open browser: ${errorMessage(error)}`;
    95				writeWarning(openWarning);
    96			}
    97		}
    98	
    99		return { server, url, openWarning };
   100	}
   101	
   102	function listen(
   103		server: Server,
   104		options: { readonly host: string; readonly port: number },
   105	): Promise<AddressInfo> {
   106		return new Promise((resolve, reject) => {
   107			const onError = (error: Error) => {
   108				server.off("listening", onListening);
   109				reject(error);
   110			};
   111			const onListening = () => {
   112				server.off("error", onError);
   113				const address = server.address();
   114				if (!address || typeof address === "string") {
   115					reject(new Error("HTTP server did not report a TCP address"));
   116					return;
   117				}
   118				resolve(address);
   119			};
   120			server.once("error", onError);
   121			server.once("listening", onListening);
   122			server.listen(options.port, options.host);
   123		});
   124	}
   125	
   126	function parsePort(value: string): number {
   127		const port = Number(value);
   128		if (!Number.isInteger(port) || port < 0 || port > 65535) {
   129			throw new InvalidArgumentError("port must be an integer from 0 to 65535");
   130		}
   131		return port;
   132	}
   133	
   134	function formatServerUrl(host: string, port: number): string {
   135		const urlHost =
   136			host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
   137		return `http://${urlHost}:${port}/`;
   138	}
   139	
   140	async function openBrowser(url: string): Promise<void> {
   141		const command = platformOpenCommand(url);
   142		await new Promise<void>((resolve, reject) => {
   143			const child = spawn(command.command, command.args, {
   144				stdio: "ignore",
   145				windowsHide: true,
   146			});
   147			child.once("error", reject);
   148			child.once("close", (code) => {
   149				if (code === 0) {
   150					resolve();
   151					return;
   152				}
   153				reject(
   154					new Error(`${command.command} exited with code ${code ?? "null"}`),
   155				);
   156			});
   157		});
   158	}
   159	
   160	function platformOpenCommand(url: string): { command: string; args: string[] } {
   161		if (process.platform === "darwin") {
   162			return { command: "open", args: [url] };
   163		}
   164		if (process.platform === "win32") {
   165			return { command: "cmd", args: ["/c", "start", "", url] };
   166		}
   167		return { command: "xdg-open", args: [url] };
   168	}
   169	
   170	function errorMessage(error: unknown): string {
   171		return error instanceof Error ? error.message : String(error);
   172	}

codex
So far the core boundary rule holds: `lib/architecture-map` imports only config/types/store/freshness and TypeScript/gray-matter, not CLI/domains/viewer/Pi. I’m now checking wiring and public reachability, plus scanning the branch for W2+ terms that would indicate scope creep.
exec
/bin/zsh -lc 'for f in bundled/coding/agents/planner.ts bundled/coding/agents/plan-reviewer.ts bundled/coding/agents/coordinator.ts bundled/coding/agents/worker.ts bundled/coding/agents/quality-manager.ts; do nl -ba "$f" | sed -n '"'1,160p'; done" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import type { AgentDefinition } from "../../../lib/agents/types.ts";
     2	
     3	const definition: AgentDefinition = {
     4		id: "planner",
     5		description:
     6			"Designs the technical architecture and testable behaviors for a feature — module structure, contracts, integration seams, behavior specs, implementation order. Test-first by default; adaptation mode studies a reference codebase. Never writes code or creates tasks.",
     7		capabilities: [
     8			"healthy-codebase-harness",
     9			"engineering-discipline",
    10			"architectural-design",
    11			"coding-readonly",
    12			"spawning",
    13		],
    14		model: "openai-codex/gpt-5.5",
    15		tools: "readonly",
    16		extensions: ["plans", "orchestration", "architecture-memory"],
    17		skills: [
    18			"pi",
    19			"plan",
    20			"work-artifacts",
    21			"architecture",
    22			"engineering-principles",
    23			"design-dialogue",
    24			"tdd",
    25			"reference-adaptation",
    26		],
    27		subagents: [
    28			"task-manager",
    29			"plan-reviewer",
    30			"explorer",
    31			"verifier",
    32			"worker",
    33			"spec-writer",
    34		],
    35		projectContext: true,
    36		session: "ephemeral",
    37		loop: false,
    38		thinkingLevel: "xhigh",
    39	};
    40	
    41	export default definition;
     1	import type { AgentDefinition } from "../../../lib/agents/types.ts";
     2	
     3	const definition: AgentDefinition = {
     4		id: "plan-reviewer",
     5		description:
     6			"Adversarial review of implementation plans. Verifies claims against the codebase and produces structured findings for the planner to address.",
     7		capabilities: [
     8			"healthy-codebase-harness",
     9			"engineering-discipline",
    10			"architectural-design",
    11			"coding-readonly",
    12		],
    13		model: "openai-codex/gpt-5.5",
    14		tools: "coding",
    15		extensions: ["plans", "architecture-memory"],
    16		skills: [
    17			"pi",
    18			"plan",
    19			"work-artifacts",
    20			"architecture",
    21			"engineering-principles",
    22		],
    23		subagents: [],
    24		projectContext: true,
    25		session: "ephemeral",
    26		loop: false,
    27		thinkingLevel: "xhigh",
    28	};
    29	
    30	export default definition;
     1	import type { AgentDefinition } from "../../../lib/agents/types.ts";
     2	
     3	const definition: AgentDefinition = {
     4		id: "coordinator",
     5		description:
     6			"Delegates tasks to workers, monitors progress, and verifies completion. Loops until all tasks are done.",
     7		capabilities: ["healthy-codebase-harness", "tasks", "spawning"],
     8		model: "openai-codex/gpt-5.5",
     9		tools: "none",
    10		extensions: [
    11			"tasks",
    12			"orchestration",
    13			"observability",
    14			"architecture-memory",
    15		],
    16		skills: [],
    17		subagents: ["worker"],
    18		projectContext: false,
    19		session: "ephemeral",
    20		loop: true,
    21		thinkingLevel: "medium",
    22	};
    23	
    24	export default definition;
     1	import type { AgentDefinition } from "../../../lib/agents/types.ts";
     2	
     3	const definition: AgentDefinition = {
     4		id: "worker",
     5		description:
     6			"Implements a single task test-first. Loads relevant skills, writes code, checks off acceptance criteria.",
     7		capabilities: [
     8			"healthy-codebase-harness",
     9			"engineering-discipline",
    10			"coding-readwrite",
    11			"tasks",
    12		],
    13		model: "openai-codex/gpt-5.5",
    14		tools: "coding",
    15		extensions: ["tasks", "architecture-memory"],
    16		skills: ["*"],
    17		subagents: [],
    18		projectContext: true,
    19		session: "ephemeral",
    20		loop: false,
    21		thinkingLevel: "high",
    22	};
    23	
    24	export default definition;
     1	import type { AgentDefinition } from "../../../lib/agents/types.ts";
     2	
     3	const definition: AgentDefinition = {
     4		id: "quality-manager",
     5		description:
     6			"Runs quality gates and clean-context review, then orchestrates fixes until changes are merge-ready.",
     7		capabilities: [
     8			"healthy-codebase-harness",
     9			"engineering-discipline",
    10			"coding-readwrite",
    11			"tasks",
    12			"spawning",
    13		],
    14		model: "openai-codex/gpt-5.5",
    15		tools: "coding",
    16		extensions: [
    17			"tasks",
    18			"orchestration",
    19			"project-tools",
    20			"architecture-memory",
    21		],
    22		skills: ["*"],
    23		subagents: [
    24			"reviewer",
    25			"security-reviewer",
    26			"performance-reviewer",
    27			"ux-reviewer",
    28			"fixer",
    29			"coordinator",
    30			"verifier",
    31			"integration-verifier",
    32		],
    33		projectContext: true,
    34		session: "ephemeral",
    35		loop: false,
    36		thinkingLevel: "high",
    37	};
    38	
    39	export default definition;

exec
/bin/zsh -lc 'rg -n "architecture-memory|architecture_map_read|architectureMap|code-structure|architecture-of-record|drift|reuse-scan|embedding|sqlite|vector|health metrics|polyglot|tree-sitter|edit" bundled domains lib cli tests package.json docs missions/plans/code-structure-map missions/tasks' in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
missions/plans/code-structure-map/review.md:1:# Plan Review: code-structure-map
missions/plans/code-structure-map/review.md:9:  plan_refs: missions/plans/code-structure-map/plan.md:279-310, missions/plans/code-structure-map/plan.md:313-331, missions/plans/code-structure-map/plan.md:396-400
missions/plans/code-structure-map/review.md:20:  plan_refs: missions/plans/code-structure-map/plan.md:473, missions/plans/code-structure-map/plan.md:489, missions/plans/code-structure-map/plan.md:529, missions/plans/code-structure-map/plan.md:535
lib/architecture-map/freshness.ts:106:	hash.update("architectureMapConfig\0");
lib/architecture-map/freshness.ts:156:	hash.update("architectureMapConfig\0");
docs/prompts.md:71:- **Persona-level changes** (rules unique to one agent) → edit Layer 2 `.md`. Same name as the agent ID, no other wiring.
docs/prompts.md:72:- **Cross-agent norms** (e.g., comment policy, bash rules) → edit a Layer 1 capability. Touches every agent that lists it.
missions/plans/code-structure-map/qm.md:3:plan: code-structure-map
missions/plans/code-structure-map/qm.md:5:branch: feature/code-structure-map
missions/plans/code-structure-map/qm.md:19:- B-001 audit marker in `missions/plans/code-structure-map/analysis-tools-audit.md`: present.
missions/plans/code-structure-map/qm.md:36:Latest integration report: `missions/plans/code-structure-map/integration-report.md`.
missions/plans/code-structure-map/qm.md:41:The final integration pass verified that `architecture_map_read` accepts the planned `module` parameter, rejects traversal before path construction, validates shard frontmatter resources, only enumerates all shards for unknown-module responses, and that generated module OKF frontmatter uses module resources.
missions/plans/code-structure-map/qm.md:50:4. Exactly five consuming agents load architecture-memory and extension is inert for others: satisfied by tests and final wiring check.
missions/tasks/TASK-447 - Add read-only artifact loading and escaped viewer rendering foundation.md:10:  - 'plan:code-structure-map'
missions/tasks/TASK-447 - Add read-only artifact loading and escaped viewer rendering foundation.md:19:Implementation order step 7, viewer foundation. Behavior ownership: owns B-016 only. Add the non-mutating task listing seam and dependency-free artifact-viewer loading/rendering foundation that later HTTP routes will use for plans, reviews, task status, and architecture markdown. Viewer work must not begin until the memory-half checkpoint is complete. Planned-behavior tests must carry `@cosmo-behavior plan:code-structure-map#B-016`.
missions/tasks/TASK-447 - Add read-only artifact loading and escaped viewer rendering foundation.md:27:- [x] #6 Tests for B-016 carry the required `@cosmo-behavior plan:code-structure-map#B-016` marker and prove read-only listing does not create task scaffolding.
tests/architecture-map/generator.test.ts:21:	test("writes OKF index and module shards for a TypeScript fixture @cosmo-behavior plan:code-structure-map#B-002", async () => {
tests/architecture-map/generator.test.ts:53:			type: "code-structure-index",
tests/architecture-map/generator.test.ts:57:			generatorVersion: "code-structure-map-w1",
tests/architecture-map/generator.test.ts:70:			type: "code-structure-module",
tests/architecture-map/generator.test.ts:73:			generatorVersion: "code-structure-map-w1",
tests/architecture-map/generator.test.ts:79:		expect(parsedIndex.content).toContain("`code-structure-index`");
tests/architecture-map/generator.test.ts:80:		expect(parsedIndex.content).toContain("`code-structure-module`");
tests/architecture-map/generator.test.ts:87:		// @cosmo-behavior plan:code-structure-map#B-003
tests/architecture-map/generator.test.ts:98:	test("returns unchanged without touching generated files when sources are unchanged @cosmo-behavior plan:code-structure-map#B-004", async () => {
tests/architecture-map/generator.test.ts:140:	test("reuses narrative for body-only edits without provider calls @cosmo-behavior plan:code-structure-map#B-005", async () => {
tests/architecture-map/generator.test.ts:203:	test("regenerates only the affected public-interface module narrative @cosmo-behavior plan:code-structure-map#B-006", async () => {
tests/architecture-map/generator.test.ts:282:	test("writes pending narratives for disabled budget-exhausted and failed generation @cosmo-behavior plan:code-structure-map#B-010", async () => {
tests/architecture-map/generator.test.ts:356:	test("completes pending narratives later without touching unaffected module files @cosmo-behavior plan:code-structure-map#B-021", async () => {
tests/architecture-map/generator.test.ts:419:	test("preserves previous content and leaves no partial map on analysis or render failure @cosmo-behavior plan:code-structure-map#B-008", async () => {
tests/architecture-map/generator.test.ts:497:	test("writes a valid empty OKF index for an empty TypeScript project @cosmo-behavior plan:code-structure-map#B-011", async () => {
tests/architecture-map/generator.test.ts:513:			type: "code-structure-index",
missions/tasks/TASK-446 - Verify memory-half checkpoint before viewer work.md:9:  - 'plan:code-structure-map'
missions/tasks/TASK-446 - Verify memory-half checkpoint before viewer work.md:22:- [x] #2 Artifact-conformance evidence shows all implemented planned-behavior tests/evidence carry their expected `@cosmo-behavior plan:code-structure-map#...` markers without changing behavior ownership.
missions/tasks/TASK-446 - Verify memory-half checkpoint before viewer work.md:34:- PASS: `bun run test tests/architecture-map/analyzer.test.ts tests/architecture-map/config.test.ts tests/architecture-map/generator.test.ts tests/architecture-map/freshness.test.ts tests/cli/architecture/subcommand.test.ts tests/cli/architecture/main-dispatch.test.ts tests/extensions/architecture-memory.test.ts tests/extensions/project-tools.test.ts` passed: 8 files, 43 tests.
missions/tasks/TASK-446 - Verify memory-half checkpoint before viewer work.md:37:- NOTE: full `bun run test` was attempted and failed in `tests/coding-agnostic-fixtures.test.ts` because `tests/extensions/architecture-memory.test.ts` is missing from the archived coding-agnostic fixture ledger. The targeted memory-half suite above passes.
missions/tasks/TASK-446 - Verify memory-half checkpoint before viewer work.md:40:- `cosmonauts plan --json check-artifacts code-structure-map` shows no issues for implemented memory-half behaviors B-001 through B-013, B-018, B-019, and B-021 after adding the missing B-003 marker comment in `tests/architecture-map/generator.test.ts`.
missions/plans/code-structure-map/spec.md:11:code-structure map** — the dependency tree and public interfaces as a
missions/plans/code-structure-map/spec.md:34:  (architecture-of-record, reuse-scan) build on this same map.
missions/plans/code-structure-map/spec.md:60:changed** — editing a function body does not churn prose or spend model
missions/plans/code-structure-map/spec.md:127:- After editing only a function body (public interface unchanged), a refresh
missions/plans/code-structure-map/spec.md:164:- Architecture-of-record / curated-intended structure and the drift signal
missions/plans/code-structure-map/spec.md:167:- Embedding/semantic retrieval (W4) and any SQLite/vector storage.
missions/plans/code-structure-map/spec.md:172:- Polyglot support (tree-sitter, non-TS analyzers) — TypeScript only.
missions/plans/code-structure-map/spec.md:173:- Health metrics (cycles, god-modules, churn hotspots) and any editing of
missions/plans/code-structure-map/spec.md:202:  where W2's architecture-of-record will land adjacent, keeping the
missions/plans/code-structure-map/spec.md:203:  drift-signal pair together; same dogfooding stance as `missions/` and
docs/architecture-map.md:3:Cosmonauts W1 architecture maps are generated TypeScript code-structure records
docs/architecture-map.md:58:- `code-structure-index` for `memory/architecture/index.md`
docs/architecture-map.md:59:- `code-structure-module` for module shard files
docs/architecture-map.md:74:Projects can add an optional `architectureMap` object to
docs/architecture-map.md:79:  "architectureMap": {
docs/architecture-map.md:98:freshness. Only the resolved `architectureMap` section and analyzer inputs that
docs/architecture-map.md:122:task files or make plans, reviews, or map shards editable.
docs/architecture-map.md:126:W1 does not include curated architecture-of-record, drift signals, reuse-scan,
docs/architecture-map.md:127:embeddings or vector storage, general agent memory, health metrics, viewer
docs/architecture-map.md:128:editing, static viewer export, file watching, polyglot analyzers, or generated
missions/tasks/TASK-444 - Add architecture generate CLI and CLI-owned narrative provider.md:10:  - 'plan:code-structure-map'
missions/tasks/TASK-444 - Add architecture generate CLI and CLI-owned narrative provider.md:19:Implementation order step 5. Behavior ownership: owns B-009 only. Wire `cosmonauts architecture generate` and alias dispatch through the CLI edge, instantiate the concrete Pi narrative provider only at that edge, and preserve the generator result union as the command's source of truth for printed statuses and exit behavior. Planned-behavior tests must carry `@cosmo-behavior plan:code-structure-map#B-009`.
missions/tasks/TASK-444 - Add architecture generate CLI and CLI-owned narrative provider.md:26:- [x] #5 Tests for B-009 carry the required `@cosmo-behavior plan:code-structure-map#B-009` marker and cover unsupported-project no-write behavior.
tests/extensions/orchestration-watch-events-normalized-compat.test.ts:153:					toolName: "edit_file",
tests/extensions/orchestration-watch-events-normalized-compat.test.ts:227:		expect(text).toContain("driver_activity: TASK-1 tool_start edit_file");
lib/architecture-map/config.ts:66:	// generation honors `.cosmonauts/config.json` architectureMap settings the
lib/architecture-map/config.ts:71:	const projectConfig = resolvedProjectConfig?.architectureMap;
lib/architecture-map/config.ts:81:		fieldName: "architectureMap.sourceRoots",
lib/architecture-map/config.ts:87:		fieldName: "architectureMap.moduleRoots",
lib/architecture-map/config.ts:97:		fieldName: "architectureMap.exclude",
lib/architecture-map/config.ts:138:	readonly projectConfig?: ProjectConfig["architectureMap"];
lib/architecture-map/config.ts:156:			"architectureMap.injectionMaxBytes",
lib/architecture-map/config.ts:168:				"architectureMap.narrative.maxModulesPerRun",
tests/architecture-map/config.test.ts:10:	test("ignores architecture map roots that escape the project root @cosmo-behavior plan:code-structure-map#B-018", async () => {
tests/architecture-map/config.test.ts:22:				architectureMap: {
tests/architecture-map/config.test.ts:38:		expect(warnings).toContain("architectureMap.sourceRoots");
tests/architecture-map/config.test.ts:39:		expect(warnings).toContain("architectureMap.moduleRoots");
tests/architecture-map/config.test.ts:45:	test("loads architectureMap settings from .cosmonauts/config.json when no projectConfig is supplied (generate path)", async () => {
tests/architecture-map/config.test.ts:52:			JSON.stringify({ architectureMap: { sourceRoots: ["src/keep"] } }),
missions/tasks/TASK-443 - Implement narrative reuse, pending status, and completion lifecycle.md:9:  - 'plan:code-structure-map'
missions/tasks/TASK-443 - Implement narrative reuse, pending status, and completion lifecycle.md:21:- [x] #1 B-005: body-only source edits may update source freshness metadata but reuse prior module narrative, keep the skeleton hash stable, and do not call the narrative provider for that module.
missions/tasks/TASK-443 - Implement narrative reuse, pending status, and completion lifecycle.md:22:- [x] #2 B-006: public-interface or barrel-surface edits change only the affected module's skeleton hash, call the narrative provider for that module, and preserve unrelated module narratives.
missions/tasks/TASK-443 - Implement narrative reuse, pending status, and completion lifecycle.md:26:- [x] #6 Tests for B-005, B-006, B-010, and B-021 carry the required `@cosmo-behavior plan:code-structure-map#...` markers and never make live model calls.
missions/tasks/TASK-445 - Wire architecture-memory agent extension and shard-reading tool.md:3:title: Wire architecture-memory agent extension and shard-reading tool
missions/tasks/TASK-445 - Wire architecture-memory agent extension and shard-reading tool.md:9:  - 'plan:code-structure-map'
missions/tasks/TASK-445 - Wire architecture-memory agent extension and shard-reading tool.md:18:Implementation order step 6. Behavior ownership: owns B-012, B-013, and B-019 only. Add the shared architecture-memory extension, register it only for the five consuming coding agents, and enforce the runtime auto-load guard so pi-package auto-loading leaves all other agents inert. Planned-behavior tests must carry markers for the owned behavior IDs.
missions/tasks/TASK-445 - Wire architecture-memory agent extension and shard-reading tool.md:22:- [ ] #2 B-013: the `architecture_map_read` tool returns the current index when no module is requested and reads named module shards by `resource` with freshness status when a valid module is requested.
missions/tasks/TASK-445 - Wire architecture-memory agent extension and shard-reading tool.md:24:- [ ] #4 B-019: oversized index injection respects `architectureMap.injectionMaxBytes`, includes freshness, truncates honestly, and tells the agent to call `architecture_map_read` for the full index or module shards.
missions/tasks/TASK-445 - Wire architecture-memory agent extension and shard-reading tool.md:25:- [ ] #5 Exactly the five specified agent definitions load `architecture-memory`; no other bundled agents are silently widened into scope.
missions/tasks/TASK-445 - Wire architecture-memory agent extension and shard-reading tool.md:27:- [ ] #7 Tests for B-012, B-013, and B-019 carry the required `@cosmo-behavior plan:code-structure-map#...` markers.
missions/tasks/TASK-449 - Add cosmonauts serve CLI startup and non-fatal browser opening.md:11:  - 'plan:code-structure-map'
missions/tasks/TASK-449 - Add cosmonauts serve CLI startup and non-fatal browser opening.md:20:Implementation order step 8. Behavior ownership: owns B-020 only. Wire the artifact-viewer server to the top-level `cosmonauts serve` command with host/port/open options while keeping viewer behavior read-only and bounded. Planned-behavior tests must carry `@cosmo-behavior plan:code-structure-map#B-020`.
missions/tasks/TASK-449 - Add cosmonauts serve CLI startup and non-fatal browser opening.md:27:- [x] #5 Tests for B-020 carry the required `@cosmo-behavior plan:code-structure-map#B-020` marker.
bundled/coding/skills/refactoring/SKILL.md:18:- **Leave alone**: One-off long parameter lists, single naming nitpicks, style inconsistencies in stable code nobody edits.
bundled/coding/skills/refactoring/SKILL.md:59:Apply to: variables, functions, parameters, types, files, directories. Rename everywhere the symbol is used — use your editor or search tools to find all references.
bundled/coding/skills/refactoring/SKILL.md:129:3. **Apply the change.** Make the smallest edit that achieves the improvement.
missions/tasks/TASK-441 - Implement audit-selected TypeScript analyzer adapter behind map contracts.md:9:  - 'plan:code-structure-map'
missions/tasks/TASK-441 - Implement audit-selected TypeScript analyzer adapter behind map contracts.md:18:Implementation order step 3. Behavior ownership: owns B-003 only. Implement the concrete `SourceAnalyzer` adapter using only the substrate allowed by the audit, keeping import/export analysis deterministic and behind the stable `ModuleSkeleton` contract. If the audit selected a runtime dependency, package metadata and lockfile changes belong here. Planned-behavior tests must carry `@cosmo-behavior plan:code-structure-map#B-003`.
missions/tasks/TASK-441 - Implement audit-selected TypeScript analyzer adapter behind map contracts.md:26:- [x] #6 Tests for B-003 carry the required `@cosmo-behavior plan:code-structure-map#B-003` marker.
docs/designs/spec-plan-quality-gates.md:48:- `plan_create` / `plan_edit` / `plan_view` tools (`lib/plans/`).
missions/tasks/TASK-448 - Serve architecture map and plan viewer routes safely.md:11:  - 'plan:code-structure-map'
missions/tasks/TASK-448 - Serve architecture map and plan viewer routes safely.md:28:- [x] #6 The viewer remains a markdown-rendering presentation edge only: no edit capability, no static export, no file watching, no markdown/HTML/graph runtime dependencies.
missions/tasks/TASK-448 - Serve architecture map and plan viewer routes safely.md:29:- [x] #7 Tests for B-014, B-015, and B-017 carry the required `@cosmo-behavior plan:code-structure-map#...` markers.
tests/architecture-map/analyzer.test.ts:14:	test("records public interfaces internal dependencies and external imports @cosmo-behavior plan:code-structure-map#B-003", async () => {
tests/architecture-map/analyzer.test.ts:19:				architectureMap: {
missions/tasks/TASK-440 - Define architecture-map contracts, safe config, OKF vocabulary, and freshness foundation.md:11:  - 'plan:code-structure-map'
missions/tasks/TASK-440 - Define architecture-map contracts, safe config, OKF vocabulary, and freshness foundation.md:20:Implementation order step 2. Behavior ownership: owns B-007 and B-018 only. Establish the stable architecture-map core contracts, safe project-config shape, OKF vocabulary/documentation, and freshness primitives that downstream analyzer, generator, CLI, extension, and viewer work must consume without inventing alternate types or formats. Planned-behavior tests must carry `@cosmo-behavior plan:code-structure-map#B-007` and `@cosmo-behavior plan:code-structure-map#B-018` near their executable tests.
missions/tasks/TASK-440 - Define architecture-map contracts, safe config, OKF vocabulary, and freshness foundation.md:24:- [x] #2 Project configuration accepts only the planned `architectureMap` primitives, ignores malformed entries with warnings, and preserves existing config-loader behavior for unrelated config.
missions/tasks/TASK-440 - Define architecture-map contracts, safe config, OKF vocabulary, and freshness foundation.md:28:- [x] #6 Tests for B-007 and B-018 carry the required `@cosmo-behavior plan:code-structure-map#...` markers and use fixture inputs rather than model calls.
missions/tasks/TASK-442 - Build generator rendering and atomic map storage.md:9:  - 'plan:code-structure-map'
missions/tasks/TASK-442 - Build generator rendering and atomic map storage.md:27:- [x] #7 Tests for B-002, B-004, B-008, and B-011 carry the required `@cosmo-behavior plan:code-structure-map#...` markers and use injected fakes/fixtures rather than model calls.
missions/tasks/TASK-450 - Complete documentation and final Quality Contract verification.md:9:  - 'plan:code-structure-map'
missions/tasks/TASK-450 - Complete documentation and final Quality Contract verification.md:26:- [x] #6 No out-of-scope W2+ functionality is introduced: curated architecture-of-record, drift signals, reuse-scan, embeddings, general agent memory, health metrics, viewer editing, and generated-map OKF `log.md` files remain absent.
bundled/coding/skills/design-dialogue/SKILL.md:78:Decisions captured in the Decision Log are approved at the moment the human directs them. Once logged, you do not re-ask about them — but the human can reopen any entry at any later pass by saying so. When they do, update the entry to record the revision (see plan_edit note below). In autonomous mode you still record decisions in the Decision Log, but mark each one `Decided by: planner-proposed` — that flags it for human review rather than treating it as approved.
bundled/coding/skills/design-dialogue/SKILL.md:80:If the human reopens a prior decision, re-emit the full plan body via `plan_edit` with the Decision Log entry updated (preserve history: "initially chose A; revised to B after learning X"). `plan_edit` replaces the entire body — there is no partial section patch — so include every other section unchanged.
tests/architecture-map/freshness.test.ts:21:	test("reports missing current and stale from persisted frontmatter and disk state @cosmo-behavior plan:code-structure-map#B-007", async () => {
tests/architecture-map/freshness.test.ts:25:			projectConfig: { architectureMap: { sourceRoots: ["lib"] } },
tests/architecture-map/freshness.test.ts:78:	test("reports stale when analyzer configuration changes but unrelated project config changes stay current @cosmo-behavior plan:code-structure-map#B-007", async () => {
tests/architecture-map/freshness.test.ts:85:				architectureMap: { sourceRoots: ["lib"] },
tests/architecture-map/freshness.test.ts:105:				architectureMap: { sourceRoots: ["lib"] },
tests/architecture-map/freshness.test.ts:142:			projectConfig: { architectureMap: { sourceRoots: ["lib"] } },
tests/architecture-map/freshness.test.ts:170:				architectureMap: { sourceRoots: ["lib"], moduleRoots: ["lib"] },
missions/tasks/TASK-439 - Write analysis-tools audit substrate recommendation.md:9:  - 'plan:code-structure-map'
missions/tasks/TASK-439 - Write analysis-tools audit substrate recommendation.md:17:Implementation order step 1. Behavior ownership: owns B-001 only. Create the plan-local analysis-tools audit rider before any analyzer adapter implementation. The audit must use the current-state evidence named in the plan and end with an explicit substrate recommendation that either allows map analyzer adapter work to proceed or blocks it for plan revision. Planned-behavior evidence must carry `@cosmo-behavior plan:code-structure-map#B-001` near the audit assertion.
missions/tasks/TASK-439 - Write analysis-tools audit substrate recommendation.md:20:- [x] #1 B-001: `missions/plans/code-structure-map/analysis-tools-audit.md` exists with findings covering current lint/typecheck/audit usage, agent-loop surfacing, and candidate static-analysis substrates.
missions/tasks/TASK-439 - Write analysis-tools audit substrate recommendation.md:23:- [x] #4 B-001: the audit evidence includes the required `@cosmo-behavior plan:code-structure-map#B-001` marker.
missions/plans/code-structure-map/plan.md:2:title: Derived code-structure map + riders (architectural-memory W1)
missions/plans/code-structure-map/plan.md:10:This is the implementation plan for W1 of `missions/architecture/architectural-memory.md`: a derived TypeScript code-structure map, the early `analysis-tools` audit rider, and the `artifact-viewer` rider. The plan preserves the spec's ratified decisions:
missions/plans/code-structure-map/plan.md:25:| AC-004 | Body-only edits do not regenerate narrative; public-interface edits do regenerate that module's narrative. |
missions/plans/code-structure-map/plan.md:42:- `missions/architecture/agent-memory.md` defines the shared `write`/`retrieve`/`consolidate` memory-interface ancestor and the premature-abstraction guard. This plan must not introduce that shared interface or an embedding/SQLite retrieval layer.
missions/plans/code-structure-map/plan.md:52:- The generated map is derived state. Curated architecture-of-record, drift signals, reuse-scan, embeddings, and general agent memory remain out of scope.
missions/plans/code-structure-map/plan.md:61:- Expected: `missions/plans/code-structure-map/analysis-tools-audit.md` contains findings plus a `Substrate recommendation` section that explicitly allows or blocks map analyzer adapter implementation
missions/plans/code-structure-map/plan.md:62:- Seam: `missions/plans/code-structure-map/analysis-tools-audit.md`
missions/plans/code-structure-map/plan.md:63:- Test: `missions/plans/code-structure-map/analysis-tools-audit.md` > `Substrate recommendation gates generator implementation`
missions/plans/code-structure-map/plan.md:64:- Marker: `@cosmo-behavior plan:code-structure-map#B-001`
missions/plans/code-structure-map/plan.md:74:- Marker: `@cosmo-behavior plan:code-structure-map#B-002`
missions/plans/code-structure-map/plan.md:84:- Marker: `@cosmo-behavior plan:code-structure-map#B-003`
missions/plans/code-structure-map/plan.md:94:- Marker: `@cosmo-behavior plan:code-structure-map#B-004`
missions/plans/code-structure-map/plan.md:96:### B-005 - Body-only source edits do not regenerate module narrative
missions/plans/code-structure-map/plan.md:104:- Marker: `@cosmo-behavior plan:code-structure-map#B-005`
missions/plans/code-structure-map/plan.md:106:### B-006 - Public-interface edits regenerate that module's narrative
missions/plans/code-structure-map/plan.md:114:- Marker: `@cosmo-behavior plan:code-structure-map#B-006`
missions/plans/code-structure-map/plan.md:124:- Marker: `@cosmo-behavior plan:code-structure-map#B-007`
missions/plans/code-structure-map/plan.md:134:- Marker: `@cosmo-behavior plan:code-structure-map#B-008`
missions/plans/code-structure-map/plan.md:144:- Marker: `@cosmo-behavior plan:code-structure-map#B-009`
missions/plans/code-structure-map/plan.md:154:- Marker: `@cosmo-behavior plan:code-structure-map#B-010`
missions/plans/code-structure-map/plan.md:164:- Marker: `@cosmo-behavior plan:code-structure-map#B-011`
missions/plans/code-structure-map/plan.md:170:- Action: the architecture-memory extension prepares context for the agent turn
missions/plans/code-structure-map/plan.md:172:- Seam: `domains/shared/extensions/architecture-memory/index.ts`
missions/plans/code-structure-map/plan.md:173:- Test: `tests/extensions/architecture-memory.test.ts` > `injects architecture index with freshness status for mapped projects`
missions/plans/code-structure-map/plan.md:174:- Marker: `@cosmo-behavior plan:code-structure-map#B-012`
missions/plans/code-structure-map/plan.md:182:- Seam: `domains/shared/extensions/architecture-memory/index.ts`
missions/plans/code-structure-map/plan.md:183:- Test: `tests/extensions/architecture-memory.test.ts` > `reads module shards by resource and rejects path traversal`
missions/plans/code-structure-map/plan.md:184:- Marker: `@cosmo-behavior plan:code-structure-map#B-013`
missions/plans/code-structure-map/plan.md:194:- Marker: `@cosmo-behavior plan:code-structure-map#B-014`
missions/plans/code-structure-map/plan.md:204:- Marker: `@cosmo-behavior plan:code-structure-map#B-015`
missions/plans/code-structure-map/plan.md:214:- Marker: `@cosmo-behavior plan:code-structure-map#B-016`
missions/plans/code-structure-map/plan.md:224:- Marker: `@cosmo-behavior plan:code-structure-map#B-017`
missions/plans/code-structure-map/plan.md:229:- Context: `.cosmonauts/config.json` declares `architectureMap.sourceRoots` or `architectureMap.moduleRoots` values that are absolute, contain `..`, or otherwise resolve outside the project root
missions/plans/code-structure-map/plan.md:234:- Marker: `@cosmo-behavior plan:code-structure-map#B-018`
missions/plans/code-structure-map/plan.md:239:- Context: a generated `index.md` exceeds `architectureMap.injectionMaxBytes`
missions/plans/code-structure-map/plan.md:240:- Action: the architecture-memory extension prepares agent context
missions/plans/code-structure-map/plan.md:241:- Expected: the injected context includes freshness, a truncated index excerpt, and an explicit note to call `architecture_map_read` for the full index or module shards
missions/plans/code-structure-map/plan.md:242:- Seam: `domains/shared/extensions/architecture-memory/index.ts`
missions/plans/code-structure-map/plan.md:243:- Test: `tests/extensions/architecture-memory.test.ts` > `truncates oversized index injection with architecture map tool guidance`
missions/plans/code-structure-map/plan.md:244:- Marker: `@cosmo-behavior plan:code-structure-map#B-019`
missions/plans/code-structure-map/plan.md:254:- Marker: `@cosmo-behavior plan:code-structure-map#B-020`
missions/plans/code-structure-map/plan.md:264:- Marker: `@cosmo-behavior plan:code-structure-map#B-021`
missions/plans/code-structure-map/plan.md:397:`ArchitectureMapConfig` is resolved by `lib/architecture-map/config.ts` from `.cosmonauts/config.json` plus defaults. Extend `ProjectConfig` in `lib/config/types.ts` with an optional `architectureMap` object, and extend `lib/config/loader.ts` to parse only safe primitives:
missions/plans/code-structure-map/plan.md:400:architectureMap?: {
missions/plans/code-structure-map/plan.md:420:- If `architectureMap.moduleRoots` is set, use those repo-relative directories exactly after validating they stay inside the project root.
missions/plans/code-structure-map/plan.md:432:`ProjectSnapshot.hash` also includes map-relevant configuration: the canonicalized resolved `architectureMap` config section only (never the whole `.cosmonauts/config.json`, so unrelated project-config edits such as `domainBindings` cannot flip the map to stale), `tsconfig.json` when present, and every existing analyzer config file returned by `SourceAnalyzer.getConfigInputs()` (for example dependency-cruiser config if the audit selects that substrate). This prevents changes in file inclusion or import resolution from being reported as current.
missions/plans/code-structure-map/plan.md:453:- `type: code-structure-index` for `memory/architecture/index.md`
missions/plans/code-structure-map/plan.md:454:- `type: code-structure-module` for module shards
missions/plans/code-structure-map/plan.md:506:Create `domains/shared/extensions/architecture-memory/index.ts`.
missions/plans/code-structure-map/plan.md:511:- Respect `architectureMap.injectionMaxBytes` from config. If the compact index exceeds the cap, inject the freshness banner, the first capped bytes, and an explicit truncation note telling the agent to call `architecture_map_read` for the full index or module shards.
missions/plans/code-structure-map/plan.md:512:- Register `architecture_map_read` with parameters `{ module?: string }`. Without `module`, return the current index and freshness. With `module`, resolve by `resource` frontmatter from known shards, reject path traversal, and return the shard plus freshness.
missions/plans/code-structure-map/plan.md:516:Add the `architecture-memory` extension to these existing agent definitions:
missions/plans/code-structure-map/plan.md:534:The module graph diagram should be a deterministic server-rendered SVG (or equivalent static HTML diagram) derived from internal dependency edges in the map index. It must link module nodes to their shard pages. Layout is a simple deterministic layered/grid placement computed from dependency depth — no graph-layout library and no new runtime dependencies for the viewer in W1; crude-but-correct is acceptable. Health metrics, graph editing, and live watch refresh are out of scope.
missions/plans/code-structure-map/plan.md:542:- **Markdown remains source of truth.** The viewer renders generated/planned markdown; it stores no parallel state and has no edit capability.
missions/plans/code-structure-map/plan.md:549:- **Freshness is two-tier.** Content hashes are generate-time truth; agent-turn and viewer checks compare a recorded stat fingerprint (path/size/mtime) — full-tree content hashing never runs on agent turns. Only the resolved `architectureMap` config section is hashed, not the whole project config. *(Added 2026-07-02 after review.)*
missions/plans/code-structure-map/plan.md:550:- **The extension gates on agent identity.** Because `domains/shared/extensions` is pi-package-advertised, architecture-memory must be inert for agents outside the five consumers even when a Pi host auto-loads it. *(Added 2026-07-02 after review.)*
missions/plans/code-structure-map/plan.md:555:- `missions/plans/code-structure-map/analysis-tools-audit.md` (new) — plan-local audit rider artifact with findings and substrate recommendation.
missions/plans/code-structure-map/plan.md:560:- `lib/config/types.ts` — add optional `architectureMap` project config shape.
missions/plans/code-structure-map/plan.md:561:- `lib/config/loader.ts` — parse and validate primitive `architectureMap` config fields.
missions/plans/code-structure-map/plan.md:562:- `tests/config/loader.test.ts` — cover valid and malformed `architectureMap` config parsing.
missions/plans/code-structure-map/plan.md:593:- `domains/shared/extensions/architecture-memory/index.ts` (new) — agent map injection and shard-reading tool.
missions/plans/code-structure-map/plan.md:594:- `tests/extensions/architecture-memory.test.ts` (new) — extension injection/tool/truncation behavior.
missions/plans/code-structure-map/plan.md:595:- `bundled/coding/agents/planner.ts` — add `architecture-memory` extension.
missions/plans/code-structure-map/plan.md:596:- `bundled/coding/agents/plan-reviewer.ts` — add `architecture-memory` extension.
missions/plans/code-structure-map/plan.md:597:- `bundled/coding/agents/coordinator.ts` — add `architecture-memory` extension.
missions/plans/code-structure-map/plan.md:598:- `bundled/coding/agents/worker.ts` — add `architecture-memory` extension.
missions/plans/code-structure-map/plan.md:599:- `bundled/coding/agents/quality-manager.ts` — add `architecture-memory` extension.
missions/plans/code-structure-map/plan.md:600:- `tests/domains/coding-agents.test.ts` — invariant that the five consuming agents load `architecture-memory`.
missions/plans/code-structure-map/plan.md:612:- **Scope creep into W2/W3/W4.** Curated records, drift detection, reuse-scan, health metrics, embeddings, and memory-interface extraction are tempting adjacent work. Mitigation: keep them out of files/tasks for this plan and record any findings as follow-up only.
missions/plans/code-structure-map/plan.md:621:4. The five specified consuming agents load the `architecture-memory` extension; other agents are not silently widened into scope, and the extension is inert for non-consuming agents even when auto-loaded by a Pi host.
missions/plans/code-structure-map/plan.md:629:| 3 | `mutation` | bindable | unbound | generator tests fail if sourceHash and skeletonHash are conflated, if narrative provider is called on body-only edits, if analyzer config changes are ignored, or if failure replacement is non-atomic | pending | unbound, not enforced; reviewer judgment required |
missions/plans/code-structure-map/plan.md:636:1. **Audit gate first (B-001).** Write `missions/plans/code-structure-map/analysis-tools-audit.md` with current-state evidence from `package.json`, `biome.json`, `tsconfig.json`, `vitest.config.ts`, `fallow.toml`, `domains/shared/extensions/project-tools/index.ts`, and the quality-manager prompt. The document must end with the selected analyzer substrate and identify analyzer config files that freshness must hash. If it does not select a viable substrate, stop and revise this plan.
docs/designs/cosmo-ambient-assistant.md:217:(`architecture-of-record`, `embedding-memory`, `memory/<slug>.knowledge.jsonl`).
docs/designs/cosmo-ambient-assistant.md:232:   invocable, editable.
docs/designs/cosmo-ambient-assistant.md:238:- **Self-authored, but human-legible and editable.** `cosmo` writes its own
docs/designs/cosmo-ambient-assistant.md:287:  with code-knowledge memory (`architecture-of-record`/`embedding-memory`), or is
docs/designs/cosmo-ambient-assistant.md:305:- ROADMAP.md — `architecture-of-record`, `embedding-memory` (the *code-knowledge* memory, distinct from this operational memory)
lib/architecture-map/types.ts:9:	"code-structure-map-w1" as const;
lib/architecture-map/types.ts:12:	index: "code-structure-index",
lib/architecture-map/types.ts:13:	module: "code-structure-module",
missions/plans/code-structure-map/integration-report.md:3:plan: code-structure-map
missions/plans/code-structure-map/integration-report.md:8:The implementation preserves the contracts declared by the code-structure-map plan, including the PR-002 architecture-memory shard lookup change. The `architecture_map_read` tool accepts the planned `module` parameter, rejects traversal before path construction, validates shard frontmatter resources, and only enumerates all shards for unknown-module responses; generated module OKF frontmatter uses module resources. Behavior-marker coverage remains present for B-001 through B-021, and the focused extension/generator/freshness tests passed locally.
tests/extensions/orchestration-watch-events.test.ts:93:					toolName: "edit_file",
tests/extensions/orchestration-watch-events.test.ts:109:		expect(text).toContain("edit_file");
missions/plans/code-structure-map/analysis-tools-audit.md:3:Plan: `code-structure-map`
missions/plans/code-structure-map/analysis-tools-audit.md:39:| Candidate | Fit for code-structure map | Fit for analysis-tools rider | Runtime/package impact | Decision |
missions/plans/code-structure-map/analysis-tools-audit.md:47:| Tree-sitter / Babel parser | Good polyglot or syntax-level parsing. | Depends on custom rules. | New parsing substrate and custom resolver work. | Out of scope for TypeScript-first W1. |
missions/plans/code-structure-map/analysis-tools-audit.md:58:@cosmo-behavior plan:code-structure-map#B-001 audit assertion: analyzer adapter implementation is allowed to proceed using the **TypeScript compiler API** as the selected W1 map analysis substrate.
missions/plans/code-structure-map/analysis-tools-audit.md:74:- The resolved `.cosmonauts/config.json` `architectureMap` section, because it controls source roots, module roots, exclusions, injection cap, and narrative settings even though it is Cosmonauts map config rather than TypeScript analyzer config.
lib/architecture-map/generator.ts:377:		"- `code-structure-index`: project-wide architecture map index.",
lib/architecture-map/generator.ts:378:		"- `code-structure-module`: per-module code structure shard.",
bundled/coding/skills/fallow/SKILL.md:123:When embedding fallow inside a Node.js process (editor extensions, long-running servers, custom tooling), prefer the NAPI bindings over spawning the CLI. Same analysis engine, same JSON envelopes, no subprocess or JSON parsing overhead.
bundled/coding/skills/fallow/SKILL.md:230:# (replaces hand-written --workspace lists that drift as the repo evolves)
tests/extensions/task-tools.test.ts:6: * The task_create and task_edit tools are covered in task-plan-linkage.test.ts.
tests/extensions/task-tools.test.ts:88:		await pi.callTool("task_edit", { taskId: a.id, status: "Done" });
tests/extensions/task-tools.test.ts:176:		await pi.callTool("task_edit", {
tests/extensions/task-tools.test.ts:254:		await pi.callTool("task_edit", { taskId: a.id, status: "Done" });
tests/tasks/task-manager.test.ts:647:		it("listTasksReadOnly mirrors list filters without initializing scaffolding @cosmo-behavior plan:code-structure-map#B-016", async () => {
tests/tasks/task-manager.test.ts:677:		it("listTasksReadOnly skips parsing files outside the label filter @cosmo-behavior plan:code-structure-map#B-016", async () => {
bundled/coding/skills/fallow/references/cli-reference.md:318:| `--ownership` | bool | `false` | Attach ownership signals to hotspot entries: bus factor (Avelino truck factor), contributor count, top contributor with stale-days, recent contributors (top-3), `suggested_reviewers`, declared CODEOWNERS owner, ownership drift, unowned-hotspot detection. Human output gains a project-level summary line. JSON adds `low-bus-factor`, `unowned-hotspot`, `ownership-drift` action types. Test files get a `[test]` tag. Implies `--hotspots`. Requires git. |
bundled/coding/skills/fallow/references/cli-reference.md:1067:| `--trend` | bool | Compare current health metrics against saved snapshot. Implies `--score`. Shows per-metric deltas with directional indicators. Requires at least one saved snapshot in `.fallow/snapshots/` |
bundled/coding/skills/fallow/references/cli-reference.md:1087:| `FALLOW_TREND` | GitLab CI: set to `true` to compare current health metrics against saved snapshot. Implies `FALLOW_SCORE`. |
bundled/coding/skills/fallow/references/cli-reference.md:1125:| `FALLOW_TREND` | `false` | Compare current health metrics against saved snapshot. Implies `FALLOW_SCORE`. Shows per-metric deltas |
tests/extensions/orchestration-rendering.test.ts:24:	test("edit extracts file basename", () => {
tests/extensions/orchestration-rendering.test.ts:26:			summarizeToolCall("edit", { file_path: "/src/components/Button.tsx" }),
tests/extensions/orchestration-rendering.test.ts:27:		).toBe("edit Button.tsx");
tests/extensions/task-plan-linkage.test.ts:3: * plan label validation on task_create and task_edit.
tests/extensions/task-plan-linkage.test.ts:152:describe("task_edit plan label validation (integration)", () => {
tests/extensions/task-plan-linkage.test.ts:153:	const tmp = useTempDir("task-plan-edit-");
tests/extensions/task-plan-linkage.test.ts:165:		const result = (await pi.callTool("task_edit", {
tests/extensions/task-plan-linkage.test.ts:174:	it("allows edit with a single plan: label", async () => {
tests/extensions/task-plan-linkage.test.ts:177:		const result = (await pi.callTool("task_edit", {
tests/extensions/task-plan-linkage.test.ts:186:	it("allows edit with no plan: labels", async () => {
tests/extensions/task-plan-linkage.test.ts:192:		const result = (await pi.callTool("task_edit", {
tests/extensions/task-plan-linkage.test.ts:201:	it("allows edit that does not touch labels", async () => {
tests/extensions/task-plan-linkage.test.ts:207:		const result = (await pi.callTool("task_edit", {
tests/extensions/task-plan-linkage.test.ts:217:describe("task_edit acceptance criteria toggles (integration)", () => {
tests/extensions/task-plan-linkage.test.ts:218:	const tmp = useTempDir("task-ac-edit-");
tests/extensions/task-plan-linkage.test.ts:234:		const result = (await pi.callTool("task_edit", {
tests/extensions/task-plan-linkage.test.ts:254:		await pi.callTool("task_edit", {
tests/extensions/task-plan-linkage.test.ts:258:		const result = (await pi.callTool("task_edit", {
tests/extensions/architecture-memory.test.ts:8:} from "../../domains/shared/extensions/architecture-memory/index.ts";
tests/extensions/architecture-memory.test.ts:11:import * as architectureMap from "../../lib/architecture-map/index.ts";
tests/extensions/architecture-memory.test.ts:20:const tmp = useTempDir("architecture-memory-");
tests/extensions/architecture-memory.test.ts:33:describe("architecture-memory extension", () => {
tests/extensions/architecture-memory.test.ts:34:	test("injects one non-accumulating architecture index context with current stale and missing freshness banners @cosmo-behavior plan:code-structure-map#B-012", async () => {
tests/extensions/architecture-memory.test.ts:67:	test("architecture_map_read returns the full index by default and reads module shards by module without parsing unrelated shards @cosmo-behavior plan:code-structure-map#B-013", async () => {
tests/extensions/architecture-memory.test.ts:77:			"architecture_map_read",
tests/extensions/architecture-memory.test.ts:86:		const shard = (await pi.callTool("architecture_map_read", {
tests/extensions/architecture-memory.test.ts:96:	test("architecture_map_read lists modules from shard frontmatter and rejects module traversal @cosmo-behavior plan:code-structure-map#B-013", async () => {
tests/extensions/architecture-memory.test.ts:103:		const unknown = (await pi.callTool("architecture_map_read", {
tests/extensions/architecture-memory.test.ts:114:		const traversal = (await pi.callTool("architecture_map_read", {
tests/extensions/architecture-memory.test.ts:122:	test("oversized index injection respects injectionMaxBytes and tells agents to use architecture_map_read @cosmo-behavior plan:code-structure-map#B-019", async () => {
tests/extensions/architecture-memory.test.ts:152:		expect(result.message.content).toContain("architecture_map_read");
tests/extensions/architecture-memory.test.ts:156:	test("only the five consuming coding agents declare architecture-memory", async () => {
tests/extensions/architecture-memory.test.ts:160:				definition.extensions.includes("architecture-memory"),
tests/extensions/architecture-memory.test.ts:174:	test("auto-loaded extension stays inert for non-consuming agents @cosmo-behavior plan:code-structure-map#B-012", async () => {
tests/extensions/architecture-memory.test.ts:186:		expect(pi.tools.has("architecture_map_read")).toBe(false);
tests/extensions/architecture-memory.test.ts:189:	test("turn-time injection does not invoke content-hash freshness @cosmo-behavior plan:code-structure-map#B-012", async () => {
tests/extensions/architecture-memory.test.ts:197:			architectureMap,
tests/extensions/architecture-memory.test.ts:260:			"type: code-structure-index",
tests/extensions/architecture-memory.test.ts:275:		"---\ntype: code-structure-module\nresource: lib/agents\n---\n\n# lib/agents\n",
tests/extensions/architecture-memory.test.ts:280:		"---\ntype: code-structure-module\nresource: lib/tasks\n---\n\n# lib/tasks\n",
bundled/coding/skills/fallow/references/patterns.md:755:Use `--force` to remove a hook script that the user has edited (the marker is no longer present). Use `--dry-run` to preview without touching files.
domains/shared/skills/drive/SKILL.md:41:| Long-running or self-modifying repository work | `mode: "detached"` so the frozen runner survives session death and source edits |
bundled/coding/skills/reference-adaptation/SKILL.md:34:- Search for feature-specific keywords (e.g., "spawn", "failover", "embedding")
tests/extensions/plans.test.ts:72:	test("registers plan_create, plan_list, plan_view, plan_edit, and plan_archive tools", () => {
tests/extensions/plans.test.ts:76:		expect(pi.tools.has("plan_edit")).toBe(true);
tests/extensions/plans.test.ts:347:				"plan_edit",
tests/extensions/plans.test.ts:479:	describe("plan_edit", () => {
tests/extensions/plans.test.ts:483:				{ slug: "editable", title: "Original", description: "Body" },
tests/extensions/plans.test.ts:488:				"plan_edit",
tests/extensions/plans.test.ts:489:				{ slug: "editable", title: "Updated", body: "New body" },
tests/extensions/plans.test.ts:493:			expect(result.content[0]?.text).toContain('Updated plan "editable"');
tests/extensions/plans.test.ts:500:			expect(details.slug).toBe("editable");
tests/extensions/plans.test.ts:508:				{ slug: "editable-flag", title: "Editable Flag" },
tests/extensions/plans.test.ts:513:				"plan_edit",
tests/extensions/plans.test.ts:514:				{ slug: "editable-flag", behaviorsReviewPending: true },
tests/extensions/plans.test.ts:524:				"plan_edit",
tests/extensions/plans.test.ts:525:				{ slug: "editable-flag", behaviorsReviewPending: false },
tests/extensions/plans.test.ts:538:					"plan_edit",
tests/driver/run-run-loop.test.ts:206:	test("emits plan completion candidate without editing the plan when all plan tasks are done", async () => {
domains/shared/skills/work-artifacts/references/architecture-format.md:13:Do not store architecture-of-record content inside an implementation plan. Plans link to records through `Architecture Context`.
cli/plans/index.ts:6:import { registerEditCommand } from "./commands/edit.ts";
lib/prompts/framework/drive/envelope.md:7:- Discover the repository's package manager, scripts, test runner, module format, import style, and local conventions before editing.
lib/prompts/framework/drive/envelope.md:18:- Never edit `missions/` or `memory/` directories unless the work item explicitly requires it.
domains/shared/skills/task/SKILL.md:199:| `task_edit` | Update status, check/uncheck ACs by index, append implementation notes |
domains/shared/skills/task/SKILL.md:241:- **Acceptance criteria turn out to be wrong mid-implementation.** Update the ACs via `task_edit` before continuing. ACs are a contract — changing them is fine, but working against outdated ACs wastes effort.
tests/driver/prompt-template.test.ts:139:		expect(rendered).toContain(`cosmonauts task edit ${taskId} --check-ac`);
tests/driver/prompt-template.test.ts:144:		// Clarifies the CLI edit is not a commit (so a cautious agent does not skip it).
tests/cli/architecture/subcommand.test.ts:197:	test("reports unsupported non TypeScript projects without writing a map @cosmo-behavior plan:code-structure-map#B-009", async () => {
cli/plans/commands/edit.ts:27:		.command("edit")
cli/plans/commands/edit.ts:30:		.argument("<slug>", "Plan slug to edit")
domains/shared/skills/architecture/SKILL.md:15:- Keep architecture-of-record content out of `plan.md`; plans link to records through `Architecture Context`.
cli/pi-flags.ts:9: * means editing one entry here.
tests/cli/plans/commands/edit.test.ts:9:} from "../../../../cli/plans/commands/edit.ts";
tests/cli/plans/commands/edit.test.ts:90:describe("plan edit command", () => {
tests/cli/plans/commands/edit.test.ts:95:		tempDir = await mkdtemp(join(tmpdir(), "plan-edit-test-"));
tests/cli/plans/commands/edit.test.ts:104:		await manager.createPlan({ slug: "editable", title: "Original" });
tests/cli/plans/commands/edit.test.ts:105:		const updated = await manager.updatePlan("editable", {
tests/cli/plans/commands/edit.test.ts:159:describe("plan edit CLI", () => {
tests/cli/plans/commands/edit.test.ts:167:		context = await createCommandTestContext("plan-edit-command-test-");
tests/cli/plans/commands/edit.test.ts:179:		await expectPlanEditExit(["edit", "editable", "--status", "paused"]);
tests/cli/plans/commands/edit.test.ts:191:		await expectPlanEditExit(["--json", "edit", "no-change"]);
tests/cli/plans/commands/edit.test.ts:206:			"edit",
tests/cli/plans/commands/edit.test.ts:234:			"edit",
tests/cli/plans/commands/edit.test.ts:258:			"edit",
tests/cli/plans/commands/edit.test.ts:279:			"edit",
tests/cli/plans/commands/edit.test.ts:293:		await expectPlanEditExit(["edit", "missing-plan", "--title", "Missing"]);
tests/cli/plans/commands/edit.test.ts:310:			"edit",
tests/config/loader.test.ts:289:	test("parses only planned architectureMap primitive config fields", async () => {
tests/config/loader.test.ts:294:				architectureMap: {
tests/config/loader.test.ts:307:		expect(config.architectureMap).toEqual({
tests/config/loader.test.ts:316:	test("warns and ignores malformed architectureMap entries while preserving unrelated config", async () => {
tests/config/loader.test.ts:323:				architectureMap: {
tests/config/loader.test.ts:336:		expect(config.architectureMap).toEqual({
tests/config/loader.test.ts:342:			"architectureMap.sourceRoots entry",
tests/config/loader.test.ts:345:			"architectureMap.moduleRoots",
tests/config/loader.test.ts:348:			"architectureMap.injectionMaxBytes",
domains/shared/skills/pi/SKILL.md:62:  tools: ["read", "bash", "edit", "write"],
domains/shared/skills/pi/SKILL.md:79:| `tools` | `string[]` | `["read", "bash", "edit", "write"]` | When set, only these tool names are enabled |
domains/shared/skills/pi/SKILL.md:220:  tools: ["read", "bash", "edit", "write"], // explicit allowlist (only these enabled)
tests/cli/plans/subcommand.test.ts:24:		expect(commandNames).toContain("edit");
tests/prompts/plan-skill.test.ts:72:		expect(content).toContain("`plan_edit`");
tests/prompts/plan-skill.test.ts:87:			"Do not move architecture-of-record content into `plan.md`.",
tests/prompts/architecture-skill.test.ts:50:			"Do not store architecture-of-record content inside an implementation plan.",
bundled/coding/skills/languages/rails/rails-controllers/references/patterns.md:122:  before_action :ensure_permission_to_admin_board, only: [:edit, :update, :destroy]
tests/cli/serve/subcommand.test.ts:53:	test("keeps the server running when opening the browser fails @cosmo-behavior plan:code-structure-map#B-020", async () => {
tests/prompts/verifier.test.ts:20:			"**Do NOT use bash or any tool to write, edit, or create files.**",
tests/cli/tasks/commands/edit.test.ts:8:} from "../../../../cli/tasks/commands/edit.ts";
tests/cli/tasks/commands/edit.test.ts:16:} from "../../../../cli/tasks/commands/edit.ts";
tests/cli/tasks/commands/edit.test.ts:43:describe("task edit helpers", () => {
tests/cli/tasks/commands/edit.test.ts:91:	it("applies label and dependency edits case-insensitively", () => {
tests/cli/tasks/commands/edit.test.ts:110:	it("applies acceptance criterion edits in remove, reindex, add, check order", () => {
tests/cli/tasks/commands/edit.test.ts:111:		const edits: AcceptanceCriterionEditOptions = {
tests/cli/tasks/commands/edit.test.ts:125:				edits,
tests/cli/tasks/commands/edit.test.ts:168:describe("task edit command", () => {
tests/cli/tasks/commands/edit.test.ts:175:		context = await createCommandTestContext("task-edit-command-test-");
tests/cli/tasks/commands/edit.test.ts:188:		await expectEditToExit(["edit", "TASK-001", "--status", "waiting"]);
tests/cli/tasks/commands/edit.test.ts:199:		await expectEditToExit(["edit", "TASK-001", "--priority", "urgent"]);
tests/cli/tasks/commands/edit.test.ts:212:			"edit",
tests/cli/tasks/commands/edit.test.ts:227:		await expectEditToExit(["edit", "TASK-001"]);
tests/cli/tasks/commands/edit.test.ts:241:			"edit",
tests/cli/tasks/commands/edit.test.ts:269:			"edit",
tests/cli/tasks/commands/edit.test.ts:291:			"edit",
tests/cli/tasks/commands/edit.test.ts:314:			"edit",
tests/cli/tasks/commands/edit.test.ts:337:			"edit",
tests/cli/tasks/commands/edit.test.ts:365:			"edit",
tests/cli/tasks/commands/edit.test.ts:407:			"edit",
tests/cli/tasks/commands/edit.test.ts:422:		await expectEditToExit(["edit", "TASK-404", "--title", "Missing"]);
tests/cli/tasks/commands/edit.test.ts:434:		await expectEditToExit(["edit", "TASK-001", "--title", "Failure"]);
cli/tasks/commands/edit.ts:101:		.command("edit")
cli/tasks/commands/edit.ts:104:		.argument("<taskId>", "Task ID to edit (e.g., TASK-001)")
cli/tasks/commands/edit.ts:248:	edits: LabelEditOptions,
cli/tasks/commands/edit.ts:250:	const removeLabels = edits.removeLabels ?? [];
cli/tasks/commands/edit.ts:251:	const addLabels = edits.addLabels ?? [];
cli/tasks/commands/edit.ts:272:	edits: DependencyEditOptions,
cli/tasks/commands/edit.ts:274:	const removeDependencies = edits.removeDependencies ?? [];
cli/tasks/commands/edit.ts:275:	const addDependencies = edits.addDependencies ?? [];
cli/tasks/commands/edit.ts:300:	edits: AcceptanceCriterionEditOptions,
cli/tasks/commands/edit.ts:302:	const removeIndices = edits.removeIndices ?? [];
cli/tasks/commands/edit.ts:303:	const addCriteria = edits.addCriteria ?? [];
cli/tasks/commands/edit.ts:304:	const checkIndices = edits.checkIndices ?? [];
cli/tasks/commands/edit.ts:305:	const uncheckIndices = edits.uncheckIndices ?? [];
domains/shared/skills/plan/SKILL.md:22:Do not move architecture-of-record content into `plan.md`. If durable architecture context matters, create or link the active architecture record and keep only the relevant `Architecture Context` in the plan.
domains/shared/skills/plan/SKILL.md:30:5. Run the readiness check below before `plan_create` or `plan_edit`.
domains/shared/skills/plan/SKILL.md:47:Treat `## Design` as derived from behavior placement. The design should explain how the behavior seams, tests, and constraints fit together; do not author it as an independent section that could drift away from the behavior spine.
domains/shared/skills/plan/SKILL.md:51:Before calling `plan_create` or `plan_edit`, run a short visible readiness check. This is conversational output only; do not persist it as a plan section.
domains/shared/skills/plan/SKILL.md:73:| `plan_edit` | `cosmonauts plan edit <slug>` | Update plan fields, status, body, or spec content. |
domains/shared/skills/plan/SKILL.md:76:Use `plan_create` for new plan directories and `plan_edit` for living-plan updates. Do not hand-edit persisted plan files when the plan tools are available in the session.
domains/shared/skills/plan/SKILL.md:111:- **Architecture stuffing.** Durable boundary decisions are embedded in `plan.md`. Move architecture-of-record content to `architecture.md` and link it from `Architecture Context`.
domains/shared/skills/plan/SKILL.md:112:- **Task drift.** Tasks lose behavior ownership. Carry the behavior IDs, seams, named tests, and markers into task acceptance criteria.
tests/domains/public-surface.test.ts:31:			["editor", makeAgent("editor")],
tests/domains/public-surface.test.ts:35:		prompts: new Set(["editor", "reviewer"]),
tests/domains/public-surface.test.ts:42:				chain: "editor -> reviewer",
tests/domains/public-surface.test.ts:68:		expect(selectPublicAgentIds(domain)).toEqual(["editor", "reviewer"]);
lib/orchestration/tool-call-summary.ts:6:	edit: (args) => summarizePathToolCall("edit", args),
lib/orchestration/definition-resolution.ts:23:			return ["read", "bash", "edit", "write"];
tests/cli/tasks/subcommand.test.ts:25:		expect(commandNames).toContain("edit");
cli/tasks/subcommand.ts:5:import { registerEditCommand } from "./commands/edit.ts";
bundled/coding/skills/languages/rails/rails-hotwire/references/stimulus.md:49:- Saves on `disconnect()` so a Turbo navigation does not drop a pending edit.
lib/config/types.ts:40:	readonly architectureMap?: ProjectArchitectureMapConfig;
tests/orchestration/agent-spawner.test.ts:208:	test("verification includes bash but excludes edit and write", () => {
tests/orchestration/agent-spawner.test.ts:212:		expect(verification).not.toContain("edit");
tests/orchestration/agent-spawner.test.ts:258:			["read", "bash", "edit", "write"],
tests/orchestration/agent-spawner.test.ts:263:			"edit",
bundled/coding/skills/languages/rails/rails-hotwire/references/turbo.md:52:Nested frames let each record in a list own its own edit surface.
domains/shared/skills/archive/SKILL.md:153:**Tier 3 — Knowledge records** (`memory/<slug>.knowledge.jsonl`): The durable output. Each record is a self-contained unit of knowledge with structured metadata designed for future SQLite + vector embedding ingestion. **Knowledge records are never moved on archive** — they persist in `memory/` and accumulate across all plans.
lib/config/loader.ts:85:		architectureMap?: ProjectConfig["architectureMap"];
lib/config/loader.ts:146:	if ("architectureMap" in obj) {
lib/config/loader.ts:147:		config.architectureMap = parseArchitectureMapConfig(obj.architectureMap);
lib/config/loader.ts:155:): ProjectConfig["architectureMap"] | undefined {
lib/config/loader.ts:159:			`[warning] Skipping malformed architectureMap: expected an object, got ${formatConfigValue(value)}.`,
lib/config/loader.ts:165:	const architectureMap: MutableArchitectureMapConfig = {};
lib/config/loader.ts:168:		"architectureMap.sourceRoots",
lib/config/loader.ts:171:	if (sourceRoots) architectureMap.sourceRoots = sourceRoots;
lib/config/loader.ts:174:		"architectureMap.moduleRoots",
lib/config/loader.ts:177:	if (moduleRoots) architectureMap.moduleRoots = moduleRoots;
lib/config/loader.ts:179:	const exclude = parseStringArrayField("architectureMap.exclude", obj.exclude);
lib/config/loader.ts:180:	if (exclude) architectureMap.exclude = exclude;
lib/config/loader.ts:183:		"architectureMap.injectionMaxBytes",
lib/config/loader.ts:188:		architectureMap.injectionMaxBytes = injectionMaxBytes;
lib/config/loader.ts:192:		"architectureMap.narrative",
lib/config/loader.ts:198:		if (parsedNarrative) architectureMap.narrative = parsedNarrative;
lib/config/loader.ts:201:	return architectureMap;
lib/config/loader.ts:245:				`[warning] Skipping malformed architectureMap.narrative.enabled: expected a boolean, got ${formatConfigValue(obj.enabled)}.`,
lib/config/loader.ts:258:				`[warning] Skipping malformed architectureMap.narrative.maxModulesPerRun: expected a finite number, got ${formatConfigValue(obj.maxModulesPerRun)}.`,
domains/shared/extensions/plans/index.ts:144:	// plan_edit
domains/shared/extensions/plans/index.ts:146:		name: "plan_edit",
domains/shared/extensions/plans/index.ts:151:			slug: Type.String({ description: "Plan slug to edit" }),
bundled/coding/skills/languages/rails/rails-architecture/SKILL.md:68:- hot spots with repeated cross-layer edits are treated as architecture problems, not just cleanup tasks
lib/config/defaults.ts:16: *   drift out of sync. Projects customize a chain by adding a `chains` block
bundled/coding/skills/languages/rails/rails-architecture/references/patterns.md:86:A model is behaving like a god object when unrelated edits, callbacks, query rules, and workflow code all accumulate in one file.
domains/shared/skills/init/SKILL.md:3:description: Interactive project bootstrap workflow for Cosmonauts. Use when running `cosmonauts init` or `/init` to scan a project, ask questions, propose AGENTS.md and config changes, suggest skills, and write files only after confirmation. Do NOT load for normal coding tasks or non-interactive file edits.
domains/shared/extensions/tasks/index.ts:99:	edits: {
domains/shared/extensions/tasks/index.ts:106:	for (const indexToCheck of edits.checkAc ?? []) {
domains/shared/extensions/tasks/index.ts:110:	for (const indexToUncheck of edits.uncheckAc ?? []) {
domains/shared/extensions/tasks/index.ts:266:	// task_edit
domains/shared/extensions/tasks/index.ts:268:		name: "task_edit",
domains/shared/extensions/tasks/index.ts:272:			taskId: Type.String({ description: "Task ID to edit" }),
domains/shared/extensions/orchestration/driver-tool.ts:115:						"Execution mode. Omit it to use `inline` for fewer than 4 tasks and `detached` for 4+ tasks. `detached` writes a frozen run directory that survives session death and source edits — required for long or self-modifying work, not supported with the `cosmonauts-subagent` backend.",
domains/shared/capabilities/tasks.md:12:| `task_edit` | Update status, check ACs, append notes |
bundled/coding/skills/languages/typescript/references/testing-patterns.md:221:The most common testing mistake in TypeScript is escaping the type system with `any` or `as unknown as X` to make test data easier to construct. This defeats the purpose -- when the production type changes, untyped test data silently drifts and tests pass against stale shapes.
bundled/coding/skills/languages/typescript/references/testing-patterns.md:223:**Principle**: All test data (fixtures, mocks, factory return values) should be typed against the production types. Use `satisfies` for fixtures to validate the shape without widening, so the compiler catches drift immediately. If constructing valid test data is painful, that is design feedback -- the type has too many required fields or the constructor is too complex.
tests/domains/main-domain.test.ts:146:		for (const tool of ["read", "bash", "edit", "write"]) {
bundled/coding/skills/languages/rails/rails-testing/references/patterns.md:33:- **Referential integrity**: Fixture relationships fail fast when foreign keys drift.
bundled/coding/skills/languages/rails/rails-testing/references/patterns.md:140:| WebMock stubs | You want explicit request and response control in unit or request tests | Stubs drift from the real API over time |
bundled/coding/agents/worker.ts:15:	extensions: ["tasks", "architecture-memory"],
bundled/coding/agents/planner.ts:16:	extensions: ["plans", "orchestration", "architecture-memory"],
tests/artifact-viewer/render.test.ts:5:	test("escapes markdown before rendering viewer pages @cosmo-behavior plan:code-structure-map#B-016", () => {
bundled/coding/skills/git-workflow/SKILL.md:3:description: Git hygiene for implementation work — feature branches and naming, decomposing changes into atomic commits, one-structural-change-per-commit, the commit and pull-request procedures, and rebase vs. merge. Use when starting a feature, committing, opening a PR, untangling a messy worktree, or shaping history before review. Do NOT load for read-only work or routine edits with no commit step.
bundled/coding/skills/git-workflow/SKILL.md:54:- Interactive rebase (`git rebase -i`) for tidying local history is fine *before* a branch is shared — but the interactive editor isn't available in this environment, so do reshaping by other means (soft resets, cherry-picks) or hand it to the user.
bundled/coding/agents/coordinator.ts:14:		"architecture-memory",
tests/artifact-viewer/server.test.ts:17:	test("serves architecture map pages and missing map empty state @cosmo-behavior plan:code-structure-map#B-014", async () => {
tests/artifact-viewer/server.test.ts:71:	test("serves plan pages with read only task status and empty states @cosmo-behavior plan:code-structure-map#B-015", async () => {
tests/artifact-viewer/server.test.ts:131:	test("rejects traversal routes before artifact reads @cosmo-behavior plan:code-structure-map#B-017", async () => {
bundled/coding/prompts/plan-reviewer.md:96:- Check that the architecture record is useful: it must change implementation or review through decisions, boundary rules, or multi-plan coordination. Background context that does not affect implementation or review is not architecture-of-record material.
domains/shared/extensions/architecture-memory/index.ts:65:				name: "architecture_map_read",
domains/shared/extensions/architecture-memory/index.ts:230:		"Call `architecture_map_read` with no `module` for the full index, or with a module resource for a shard.",
domains/shared/extensions/architecture-memory/index.ts:244:		)} bytes. Use \`architecture_map_read\` for the full index or module shards.]`;
lib/sessions/types.ts:32:	 *  This is the field that gets vectorized for semantic search. */
bundled/coding/agents/quality-manager.ts:20:		"architecture-memory",
tests/artifact-viewer/loaders.test.ts:20:	test("escapes loaded artifact markdown before HTML rendering @cosmo-behavior plan:code-structure-map#B-016", async () => {
tests/artifact-viewer/loaders.test.ts:76:	test("renders only the W1 markdown subset and uses escaped preformatted fallback @cosmo-behavior plan:code-structure-map#B-016", async () => {
tests/artifact-viewer/loaders.test.ts:93:	test("validates slugs and architecture resources before loading artifacts @cosmo-behavior plan:code-structure-map#B-016", async () => {
tests/artifact-viewer/loaders.test.ts:110:	test("loads task status through read-only listing without task scaffolding @cosmo-behavior plan:code-structure-map#B-016", async () => {
tests/artifact-viewer/loaders.test.ts:162:	test("plan task status does not parse unrelated task files @cosmo-behavior plan:code-structure-map#B-016", async () => {
bundled/coding/agents/plan-reviewer.ts:15:	extensions: ["plans", "architecture-memory"],
bundled/coding/skills/creating-skills/references/evaluation.md:84:- Authoring agent: designs and edits the skill.
bundled/coding/skills/languages/rails/rails-auth/SKILL.md:44:If the repo uses Pundit, Action Policy, custom policy objects, or API permission checks, keep that boundary in `/skill:rails-api` or the repo's established controller layer rather than embedding permission logic in the authenticator.
bundled/coding/agents/distiller.ts:6:		"Reads plan artifacts and session transcripts, then produces structured KnowledgeBundle JSONL files for future SQLite + vector embedding ingestion.",
bundled/coding/capabilities/coding-readwrite.md:3:Discipline for agents with full coding tool access: read, write, edit, bash, grep, glob.
bundled/coding/capabilities/coding-readwrite.md:20:- When editing code, read the surrounding context (especially imports) to understand framework and library choices.
bundled/coding/capabilities/coding-readwrite.md:21:- Prefer editing existing files over creating new ones.
bundled/coding/capabilities/coding-readwrite.md:28:- For migration-shaped edits that move or rename a file, directory, exported symbol, command, config key, or path, grep the whole repository source tree for the old name/path before calling the work complete. Cover runtime source first (`lib/`, `cli/`, `bin/`, `domains/`, `bundled/`, `scripts/`), then tests and docs (`tests/`, `docs/`, and any other tracked references), and update every stale reference.
bundled/coding/capabilities/coding-readwrite.md:51:- File editing -> use `edit`, not `sed`/`awk`
bundled/coding/prompts/fixer.md:74:4. **Do not create or edit tasks unless explicitly instructed by parent prompt.**
bundled/coding/prompts/distiller.md:3:You're the Distiller. You read everything a completed plan left behind — the plan, the tasks, the session transcripts — and you keep only the few insights worth carrying forward, as a structured `KnowledgeBundle` JSONL file built for future SQLite + vector-embedding ingestion.
bundled/coding/prompts/planner.md:60:7. **Hand off to plan-reviewer, then revise.** For any non-trivial plan, this is not optional — the review *is* the adversarial pass, and it's a different agent (a fresh-eyes reviewer, often a different base model) by design. As a chain stage, the chain runner routes you to `plan-reviewer` and back automatically; standalone, spawn it yourself (see Sidecar agents). When the findings file exists (`missions/plans/<slug>/review.md`), this is a revision pass — read every finding, verify each against the code, revise to address all high/medium severity, update via `plan_edit`. Don't start from scratch, and don't wave findings off as "future work" — a defect the reviewer caught is one you'd have shipped into the tasks.
bundled/coding/prompts/verifier.md:37:**Do NOT use bash or any tool to write, edit, or create files.**
bundled/coding/skills/languages/rails/rails-views/SKILL.md:24:5. **Keep interaction guidance separate** — when a template needs Turbo or Stimulus behavior, load `/skill:rails-hotwire` rather than embedding inline handlers or ad hoc client logic.
bundled/coding/skills/languages/rails/rails-views/SKILL.md:74:- `/skill:rails-conventions` — Detect the repo's helpers, form builders, layout usage, CSS hooks, and component conventions before editing views.
bundled/coding/prompts/quality-manager.md:5:You don't write code or fixes yourself; you orchestrate. Fixes go to `fixer` (targeted commits) or to remediation tasks driven through `coordinator`. Your `bash` is for running checks, your `read` for files and reports, your git for status — not for editing source.
bundled/coding/prompts/quality-manager.md:232:- Mark any associated plan as completed: if tasks share a `plan:<slug>` label and all tasks for that plan are Done, call `plan_edit` with `status: "completed"` on the plan.
bundled/coding/prompts/quality-manager.md:238:1. **Never edit code directly.** You orchestrate quality and remediation.
bundled/coding/prompts/coordinator.md:89:   - If the worker failed or left the task "In Progress", set it back to "To Do" via `task_edit` and add a note about the failure. If the same task has failed multiple times, set it to "Blocked".
bundled/coding/prompts/coordinator.md:95:- **Worker fails once**: If the worker left the task in a non-Done state, set it back to "To Do". Append a note via `task_edit` explaining what went wrong so the next attempt has context.
bundled/coding/prompts/integration-verifier.md:109:1. **If a unique plan slug exists, do not edit repository files outside `missions/plans/<slug>/integration-report.md`. If no unique slug exists, do not write any repository file.** This restriction is absolute.
bundled/coding/drivers/templates/envelope.md:7:- Discover the repository's package manager, scripts, test runner, module format, import style, and local conventions before editing.
bundled/coding/drivers/templates/envelope.md:18:- Never edit `missions/` or `memory/` directories unless the work item explicitly requires it.
bundled/coding/prompts/refactorer.md:19:Call `task_edit` to set status to "In Progress" and assignee to "refactorer". This signals to the coordinator that work has begun and who owns it.
bundled/coding/prompts/refactorer.md:57:As you satisfy each acceptance criterion, call `task_edit` to check it off immediately. Do not wait until the end. This gives the coordinator real-time visibility into your progress.
bundled/coding/prompts/refactorer.md:75:Call `task_edit` to set status to "Done". Add implementation notes if anything is worth noting for future agents (a tradeoff you accepted, a follow-up worth doing, code you found that's still rough but out of scope).
bundled/coding/prompts/refactorer.md:89:1. Call `task_edit` to set status to "Blocked".
bundled/coding/prompts/worker.md:21:Call `task_edit` to set status to "In Progress" and assignee to "worker". This signals to the coordinator that work has begun and who owns it.
bundled/coding/prompts/worker.md:63:As you complete each acceptance criterion, call `task_edit` with `checkAc: [index]` to check it off immediately. Do not wait until the end to check all ACs at once.
bundled/coding/prompts/worker.md:87:Call `task_edit` to set status to "Done". Add implementation notes if anything is worth noting for future agents (unusual decisions, caveats, follow-up suggestions).
bundled/coding/prompts/worker.md:95:1. Call `task_edit` to set status to "Blocked".
bundled/coding/skills/languages/rails/rails-views/references/patterns.md:99:If the component also needs Turbo or Stimulus behavior, load `/skill:rails-hotwire` instead of embedding that advice here.
bundled/coding/skills/languages/ruby/ruby-refactoring/references/refactoring-patterns.md:50:- new variants should be added without editing a central conditional
bundled/coding/skills/languages/ruby/ruby-refactoring/references/code-smells.md:38:A class is too large when unrelated edits keep landing in the same file.
bundled/coding/skills/languages/ruby/ruby-refactoring/references/code-smells.md:90:A change request should have one obvious home. If every small rule change forces edits in a parser, validator, formatter, and notifier, the ownership boundary is wrong.
lib/driver/prompt-template.ts:152:		`cosmonauts task edit ${taskId} --check-ac <index>   # repeat --check-ac per satisfied criterion, e.g. --check-ac 1 --check-ac 2`,

exec
/bin/zsh -lc 'git diff --check main...HEAD' in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
exec
/bin/zsh -lc "git diff --name-only main...HEAD | sed -n '/"'^lib'"\\/architecture-map\\//p' | xargs -I{} sh -c 'printf \"%s\\n\" \""'$1"; rg -n "from '"\\\"(\\.\\./\\.\\./cli|\\.\\./\\.\\./domains|\\.\\./\\.\\./lib/artifact-viewer|\\.\\./\\.\\./lib/(plans|tasks|orchestration)|@earendil-works/pi)\" \""'$1" || true'"' sh {}" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
lib/architecture-map/analyzer.ts
lib/architecture-map/config.ts
lib/architecture-map/freshness.ts
lib/architecture-map/generator.ts
lib/architecture-map/index.ts
lib/architecture-map/store.ts
lib/architecture-map/types.ts

codex
The exact-five wiring is present in the five agent definitions shown by the diff, and the extension has a hardcoded consuming-agent allowlist. I’m checking whether that allowlist can accidentally miss those same agents because of ID format mismatches in runtime identity extraction.
exec
/bin/zsh -lc "nl -ba lib/agents/runtime-identity.ts | sed -n '1,220p'" in /Users/cosmos/Projects/cosmonauts
exec
/bin/zsh -lc "nl -ba tests/extensions/architecture-memory.test.ts | sed -n '1,380p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	/**
     2	 * Runtime identity marker helpers.
     3	 *
     4	 * We embed a hidden marker into each agent's system prompt so extensions can
     5	 * determine which agent definition is currently executing a tool call.
     6	 */
     7	
     8	const AGENT_ID_MARKER_PREFIX = "COSMONAUTS_AGENT_ID:";
     9	const AGENT_ID_MARKER_REGEX =
    10		/<!--\s*COSMONAUTS_AGENT_ID:([a-z0-9/-]+)\s*-->/gi;
    11	
    12	/** @deprecated Use `qualifyRole` from `qualified-role.ts` instead. */
    13	export { qualifyRole as qualifyAgentId } from "./qualified-role.ts";
    14	
    15	/** Build a hidden system-prompt marker for an agent ID. */
    16	export function buildAgentIdentityMarker(agentId: string): string {
    17		return `<!-- ${AGENT_ID_MARKER_PREFIX}${agentId} -->`;
    18	}
    19	
    20	/**
    21	 * Append the runtime identity marker to prompt content.
    22	 * If prompt content is empty, returns only the marker.
    23	 */
    24	export function appendAgentIdentityMarker(
    25		promptContent: string | undefined,
    26		agentId: string,
    27	): string {
    28		const marker = buildAgentIdentityMarker(agentId);
    29		return promptContent ? `${promptContent}\n\n${marker}` : marker;
    30	}
    31	
    32	/**
    33	 * Extract the agent ID marker from a resolved system prompt.
    34	 * Returns undefined when the marker is missing.
    35	 */
    36	export function extractAgentIdFromSystemPrompt(
    37		systemPrompt: string,
    38	): string | undefined {
    39		const matches = [...systemPrompt.matchAll(AGENT_ID_MARKER_REGEX)];
    40		const last = matches.at(-1);
    41		return last?.[1]?.toLowerCase();
    42	}

 succeeded in 0ms:
     1	import { mkdir, readdir, writeFile } from "node:fs/promises";
     2	import { join } from "node:path";
     3	import { fileURLToPath, pathToFileURL } from "node:url";
     4	import { describe, expect, test, vi } from "vitest";
     5	import {
     6		default as architectureMemoryExtension,
     7		createArchitectureMemoryExtension,
     8	} from "../../domains/shared/extensions/architecture-memory/index.ts";
     9	import { buildAgentIdentityMarker } from "../../lib/agents/runtime-identity.ts";
    10	import type { AgentDefinition } from "../../lib/agents/types.ts";
    11	import * as architectureMap from "../../lib/architecture-map/index.ts";
    12	import {
    13		ARCHITECTURE_MAP_OUTPUT_DIR,
    14		type ArchitectureMapConfig,
    15		type ArchitectureMapFreshness,
    16	} from "../../lib/architecture-map/index.ts";
    17	import { useTempDir } from "../helpers/fs.ts";
    18	import { createMockPi } from "../helpers/mocks/index.ts";
    19	
    20	const tmp = useTempDir("architecture-memory-");
    21	
    22	const BASE_CONFIG: ArchitectureMapConfig = {
    23		outputDir: ARCHITECTURE_MAP_OUTPUT_DIR,
    24		sourceRoots: ["lib"],
    25		exclude: [],
    26		injectionMaxBytes: 24_000,
    27		narrative: {
    28			enabled: true,
    29			maxModulesPerRun: 20,
    30		},
    31	};
    32	
    33	describe("architecture-memory extension", () => {
    34		test("injects one non-accumulating architecture index context with current stale and missing freshness banners @cosmo-behavior plan:code-structure-map#B-012", async () => {
    35			await writeArchitectureMap(tmp.path);
    36	
    37			for (const freshness of [
    38				{ kind: "current", hash: "stat-current" },
    39				{ kind: "stale", oldHash: "stat-old", newHash: "stat-new" },
    40				{ kind: "missing" },
    41			] satisfies ArchitectureMapFreshness[]) {
    42				const pi = createMockPi({ cwd: tmp.path });
    43				createArchitectureMemoryExtension(deps({ freshness }))(pi as never);
    44	
    45				const result = (await pi.fireEvent(
    46					"before_agent_start",
    47					{ systemPrompt: buildAgentIdentityMarker("coding/planner") },
    48					{ cwd: tmp.path },
    49				)) as { message: { customType: string; content: string } };
    50	
    51				expect(result.message.customType).toBe("architecture-map-context");
    52				expect(result.message.content).toContain(
    53					`Architecture map freshness: ${freshness.kind}`,
    54				);
    55				expect(result.message.content).toContain("Architecture Map");
    56	
    57				const filtered = (await pi.fireEvent("context", {
    58					messages: [
    59						{ customType: "architecture-map-context", content: "old map" },
    60						{ role: "user", content: "keep me" },
    61					],
    62				})) as { messages: unknown[] };
    63				expect(filtered.messages).toEqual([{ role: "user", content: "keep me" }]);
    64			}
    65		});
    66	
    67		test("architecture_map_read returns the full index by default and reads module shards by module without parsing unrelated shards @cosmo-behavior plan:code-structure-map#B-013", async () => {
    68			await writeArchitectureMap(tmp.path);
    69			await writeFile(
    70				join(tmp.path, "memory", "architecture", "modules", "lib", "broken.md"),
    71				"---\nresource: [lib/broken\n---\n\n# broken\n",
    72				"utf-8",
    73			);
    74			const pi = await enabledPi(tmp.path);
    75	
    76			const index = (await pi.callTool(
    77				"architecture_map_read",
    78				{},
    79			)) as ToolResult;
    80			expect(resultText(index)).toContain("Architecture map freshness: current");
    81			expect(resultText(index)).toContain("# Architecture Map");
    82			expect(index.details).toMatchObject({
    83				resource: "memory/architecture/index.md",
    84			});
    85	
    86			const shard = (await pi.callTool("architecture_map_read", {
    87				module: "lib/agents",
    88			})) as ToolResult;
    89			expect(resultText(shard)).toContain("# lib/agents");
    90			expect(shard.details).toMatchObject({
    91				resource: "lib/agents",
    92				path: "memory/architecture/modules/lib/agents.md",
    93			});
    94		});
    95	
    96		test("architecture_map_read lists modules from shard frontmatter and rejects module traversal @cosmo-behavior plan:code-structure-map#B-013", async () => {
    97			await writeArchitectureMap(
    98				tmp.path,
    99				"- `lib/from-index-only` - stale row.",
   100			);
   101			const pi = await enabledPi(tmp.path);
   102	
   103			const unknown = (await pi.callTool("architecture_map_read", {
   104				module: "lib/missing",
   105			})) as ToolResult;
   106			expect(resultText(unknown)).toContain(
   107				"Unknown architecture map module: lib/missing",
   108			);
   109			expect(resultText(unknown)).toContain(
   110				"Available modules: lib/agents, lib/tasks",
   111			);
   112			expect(resultText(unknown)).not.toContain("lib/from-index-only");
   113	
   114			const traversal = (await pi.callTool("architecture_map_read", {
   115				module: "../outside",
   116			})) as ToolResult;
   117			expect(resultText(traversal)).toContain(
   118				"Rejected unsafe architecture map resource",
   119			);
   120		});
   121	
   122		test("oversized index injection respects injectionMaxBytes and tells agents to use architecture_map_read @cosmo-behavior plan:code-structure-map#B-019", async () => {
   123			await writeArchitectureMap(
   124				tmp.path,
   125				Array.from(
   126					{ length: 80 },
   127					(_, index) => `- \`lib/module-${index}\` - ${"large ".repeat(8)}`,
   128				).join("\n"),
   129			);
   130			const injectionMaxBytes = 700;
   131			const pi = createMockPi({ cwd: tmp.path });
   132			createArchitectureMemoryExtension(
   133				deps({
   134					config: { ...BASE_CONFIG, injectionMaxBytes },
   135					freshness: { kind: "stale", oldHash: "old-stat", newHash: "new-stat" },
   136				}),
   137			)(pi as never);
   138	
   139			const result = (await pi.fireEvent(
   140				"before_agent_start",
   141				{ systemPrompt: buildAgentIdentityMarker("coding/worker") },
   142				{ cwd: tmp.path },
   143			)) as { message: { content: string } };
   144	
   145			expect(
   146				Buffer.byteLength(result.message.content, "utf-8"),
   147			).toBeLessThanOrEqual(injectionMaxBytes);
   148			expect(result.message.content).toContain(
   149				"Architecture map freshness: stale",
   150			);
   151			expect(result.message.content).toContain("Truncated from");
   152			expect(result.message.content).toContain("architecture_map_read");
   153			expect(result.message.content).not.toContain("lib/module-79");
   154		});
   155	
   156		test("only the five consuming coding agents declare architecture-memory", async () => {
   157			const agentDefinitions = await loadBundledCodingAgents();
   158			const consumers = agentDefinitions
   159				.filter((definition) =>
   160					definition.extensions.includes("architecture-memory"),
   161				)
   162				.map((definition) => definition.id)
   163				.sort();
   164	
   165			expect(consumers).toEqual([
   166				"coordinator",
   167				"plan-reviewer",
   168				"planner",
   169				"quality-manager",
   170				"worker",
   171			]);
   172		});
   173	
   174		test("auto-loaded extension stays inert for non-consuming agents @cosmo-behavior plan:code-structure-map#B-012", async () => {
   175			await writeArchitectureMap(tmp.path);
   176			const pi = createMockPi({ cwd: tmp.path });
   177			architectureMemoryExtension(pi as never);
   178	
   179			const result = await pi.fireEvent(
   180				"before_agent_start",
   181				{ systemPrompt: buildAgentIdentityMarker("coding/reviewer") },
   182				{ cwd: tmp.path },
   183			);
   184	
   185			expect(result).toBeUndefined();
   186			expect(pi.tools.has("architecture_map_read")).toBe(false);
   187		});
   188	
   189		test("turn-time injection does not invoke content-hash freshness @cosmo-behavior plan:code-structure-map#B-012", async () => {
   190			await writeArchitectureMap(tmp.path);
   191			await mkdir(join(tmp.path, "lib"), { recursive: true });
   192			await writeFile(
   193				join(tmp.path, "lib", "alpha.ts"),
   194				"export const alpha = 1;\n",
   195			);
   196			const contentHashFreshness = vi.spyOn(
   197				architectureMap,
   198				"checkArchitectureMapFreshness",
   199			);
   200			const pi = createMockPi({ cwd: tmp.path });
   201			architectureMemoryExtension(pi as never);
   202	
   203			await pi.fireEvent(
   204				"before_agent_start",
   205				{ systemPrompt: buildAgentIdentityMarker("coding/planner") },
   206				{ cwd: tmp.path },
   207			);
   208	
   209			expect(contentHashFreshness).not.toHaveBeenCalled();
   210			contentHashFreshness.mockRestore();
   211		});
   212	});
   213	
   214	interface ToolResult {
   215		content: { type: "text"; text: string }[];
   216		details: unknown;
   217	}
   218	
   219	function resultText(result: ToolResult): string {
   220		return result.content.map((entry) => entry.text).join("\n");
   221	}
   222	
   223	function deps(options: {
   224		config?: ArchitectureMapConfig;
   225		freshness?: ArchitectureMapFreshness;
   226	}): Parameters<typeof createArchitectureMemoryExtension>[0] {
   227		return {
   228			loadConfig: async () => options.config ?? BASE_CONFIG,
   229			analyzer: { getConfigInputs: async () => [] },
   230			checkFreshness: async () =>
   231				options.freshness ?? { kind: "current", hash: "stat-current" },
   232		};
   233	}
   234	
   235	async function enabledPi(cwd: string) {
   236		const pi = createMockPi({ cwd });
   237		createArchitectureMemoryExtension(deps({}))(pi as never);
   238		await pi.fireEvent(
   239			"before_agent_start",
   240			{ systemPrompt: buildAgentIdentityMarker("coding/planner") },
   241			{ cwd },
   242		);
   243		return pi;
   244	}
   245	
   246	async function writeArchitectureMap(
   247		projectRoot: string,
   248		moduleInventory = [
   249			"- `lib/agents` - Agent definitions.",
   250			"- `lib/tasks` - Task management.",
   251		].join("\n"),
   252	): Promise<void> {
   253		await mkdir(join(projectRoot, "memory", "architecture", "modules", "lib"), {
   254			recursive: true,
   255		});
   256		await writeFile(
   257			join(projectRoot, "memory", "architecture", "index.md"),
   258			[
   259				"---",
   260				"type: code-structure-index",
   261				"resource: memory/architecture/index.md",
   262				"statFingerprint: stat-current",
   263				"---",
   264				"",
   265				"# Architecture Map",
   266				"",
   267				"## Module Inventory",
   268				moduleInventory,
   269				"",
   270			].join("\n"),
   271			"utf-8",
   272		);
   273		await writeFile(
   274			join(projectRoot, "memory", "architecture", "modules", "lib", "agents.md"),
   275			"---\ntype: code-structure-module\nresource: lib/agents\n---\n\n# lib/agents\n",
   276			"utf-8",
   277		);
   278		await writeFile(
   279			join(projectRoot, "memory", "architecture", "modules", "lib", "tasks.md"),
   280			"---\ntype: code-structure-module\nresource: lib/tasks\n---\n\n# lib/tasks\n",
   281			"utf-8",
   282		);
   283	}
   284	
   285	async function loadBundledCodingAgents(): Promise<AgentDefinition[]> {
   286		const agentsDir = fileURLToPath(
   287			new URL("../../bundled/coding/agents/", import.meta.url),
   288		);
   289		const files = (await readdir(agentsDir))
   290			.filter((file) => file.endsWith(".ts"))
   291			.sort();
   292		const definitions: AgentDefinition[] = [];
   293		for (const file of files) {
   294			const module = (await import(
   295				pathToFileURL(join(agentsDir, file)).href
   296			)) as { default: AgentDefinition };
   297			definitions.push(module.default);
   298		}
   299		return definitions;
   300	}

exec
/bin/zsh -lc 'rg -n "Agent ID|agent id|runtime identity|extractAgentIdFromSystemPrompt|id:" lib domains bundled tests | head -200' in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
bundled/coding/domain.ts:5:	id: "coding",
domains/main/domain.ts:5:	id: "main",
bundled/coding/agents/verifier.ts:4:	id: "verifier",
bundled/coding/agents/worker.ts:4:	id: "worker",
tests/skills/discovery.test.ts:15:function makeDomain(id: string, rootDir: string): LoadedDomain {
tests/runtime.test.ts:21:	id: string,
tests/runtime.test.ts:26:		`export const manifest = { id: "${id}", description: "Test domain ${id}" ${extras} };\n`,
tests/runtime.test.ts:33:	id: string,
tests/runtime.test.ts:91:	agents: Array<{ id: string; capabilities?: string[]; extensions?: string[] }>,
tests/runtime.test.ts:126:	id: string,
tests/runtime.test.ts:127:	agents: Array<{ id: string; overrides?: Record<string, unknown> }>,
tests/runtime.test.ts:169:				{ id: "worker", capabilities: ["core"] },
tests/runtime.test.ts:216:				{ id: "worker", capabilities: ["core"] },
tests/runtime.test.ts:217:				{ id: "planner", capabilities: ["core"] },
tests/runtime.test.ts:530:				[{ id: "planner", capabilities: ["core"] }],
tests/runtime.test.ts:606:					id: "worker",
tests/runtime.test.ts:615:					id: "worker",
tests/runtime.test.ts:624:					id: "leader",
tests/runtime.test.ts:694:						id: "placeholder",
tests/runtime.test.ts:707:						id: "cody",
tests/runtime.test.ts:714:						id: "worker",
tests/runtime.test.ts:735:					id: "leader",
tests/runtime.test.ts:939:				[{ id: "worker", capabilities: ["core"] }],
bundled/coding/agents/planner.ts:4:	id: "planner",
bundled/coding/agents/fixer.ts:4:	id: "fixer",
bundled/coding/agents/coordinator.ts:4:	id: "coordinator",
tests/chains/named-chain-loader.test.ts:25:		manifest: { id: "ruby-coding", description: "Ruby coding" },
tests/chains/named-chain-loader.test.ts:351:				id: "ruby-coding",
bundled/coding/agents/integration-verifier.ts:4:	id: "integration-verifier",
tests/helpers/tasks.ts:25:		id: "TASK-001",
bundled/coding/agents/refactorer.ts:4:	id: "refactorer",
tests/architecture-map/analyzer.test.ts:120:			"\tid: string;",
tests/architecture-map/analyzer.test.ts:123:			'\treturn { id: "barrel" };',
bundled/coding/agents/performance-reviewer.ts:4:	id: "performance-reviewer",
bundled/coding/agents/plan-reviewer.ts:4:	id: "plan-reviewer",
bundled/coding/agents/cody.ts:4:	id: "cody",
tests/helpers/packages.ts:62:	id: string;
tests/helpers/packages.ts:129:		id: domainId,
tests/helpers/packages.ts:220:			id: agent.id,
bundled/coding/agents/explorer.ts:4:	id: "explorer",
bundled/coding/agents/security-reviewer.ts:4:	id: "security-reviewer",
tests/helpers/domain-package-fixture.test.ts:27:					id: "captain",
tests/helpers/domain-package-fixture.test.ts:32:				{ id: "worker", capabilities: ["navigation"] },
tests/helpers/domain-package-fixture.test.ts:87:			id: "ruby-coding",
tests/helpers/domain-package-fixture.test.ts:97:			id: "captain",
tests/helpers/packages.test.ts:28:						id: "captain",
tests/helpers/packages.test.ts:33:					{ id: "worker", capabilities: ["navigation"] },
tests/helpers/packages.test.ts:76:			id: "ruby-coding",
tests/helpers/packages.test.ts:83:			id: "captain",
bundled/coding/agents/distiller.ts:4:	id: "distiller",
bundled/coding/agents/task-manager.ts:4:	id: "task-manager",
domains/main/agents/cosmo.ts:4:	id: "cosmo",
bundled/coding/agents/quality-manager.ts:4:	id: "quality-manager",
bundled/coding/skills/engineering-principles/SKILL.md:54:Avoid: generic names (`data`, `result`, `item`, `handle`, `process`, `manager`), abbreviations that save a few characters but cost clarity, names that describe implementation instead of intent, and names that are design-pattern labels (`UserFactory`, `OrderBuilder`, `PaymentStrategy`). Name after domain purpose, not the pattern you used.
tests/helpers/delete-command-tests.ts:66:		id: (entity: Entity) => string;
tests/helpers/delete-command-tests.ts:67:		get: (manager: Manager, id: string) => Promise<Entity | null>;
tests/helpers/delete-command-tests.ts:73:		id: string;
tests/helpers/delete-command-tests.ts:79:		id: (entity: Entity) => string;
tests/helpers/delete-command-tests.ts:80:		get: (manager: Manager, id: string) => Promise<Entity | null>;
tests/helpers/delete-command-tests.ts:87:		id: string;
bundled/coding/agents/reviewer.ts:4:	id: "reviewer",
bundled/coding/agents/spec-writer.ts:4:	id: "spec-writer",
bundled/coding/agents/ux-reviewer.ts:4:	id: "ux-reviewer",
bundled/coding/prompts/plan-reviewer.md:156:- id: PR-001
bundled/coding/prompts/plan-reviewer.md:167:- id: PR-002
bundled/coding/prompts/ux-reviewer.md:121:- id: UR-001
bundled/coding/prompts/ux-reviewer.md:142:- id: UR-002
bundled/coding/skills/creating-skills/references/complex-skills.md:76:Avoid:
domains/shared/domain.ts:5:	id: "shared",
bundled/coding/prompts/performance-reviewer.md:122:- id: PF-001
bundled/coding/prompts/performance-reviewer.md:143:- id: PF-002
bundled/coding/prompts/verifier.md:54:- id: C-001
bundled/coding/prompts/verifier.md:60:- id: C-002
bundled/coding/skills/creating-skills/references/foundations.md:102:Avoid:
tests/extensions/orchestration-spawn-inline-compiler.test.ts:118:				expect.objectContaining({ id: "worker" }),
bundled/coding/prompts/integration-verifier.md:70:- id: I-001
tests/extensions/orchestration-chain-tool-durable.test.ts:287:function agent(id: string, loop: boolean): AgentDefinition {
bundled/coding/prompts/security-reviewer.md:124:- id: SR-001
bundled/coding/prompts/security-reviewer.md:145:- id: SR-002
lib/driver/drive-graph-compiler.ts:137:		id: taskId,
lib/driver/drive-graph-compiler.ts:156:		id: sourceCommitFinalizerId(taskId),
lib/driver/drive-graph-compiler.ts:171:		id: taskStatusFinalizerId(taskId),
lib/driver/drive-graph-compiler.ts:185:		id: "finalizer-state-commit",
lib/driver/drive-graph-compiler.ts:195:	id: string;
lib/driver/drive-graph-compiler.ts:202:		id: options.id,
lib/driver/drive-graph-compiler.ts:238:		{ id: "task", path: `missions/tasks/${taskId}.md`, kind: "task" },
lib/driver/drive-graph-compiler.ts:239:		{ id: "prompt", path: `prompts/${taskId}.md`, kind: "prompt" },
lib/driver/drive-graph-compiler.ts:245:		id: `step:${taskId}`,
domains/shared/extensions/agent-switch/index.ts:21:import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
domains/shared/extensions/agent-switch/index.ts:240:			const sourceAgentId = extractAgentIdFromSystemPrompt(
domains/shared/extensions/agent-switch/index.ts:253:		const agentId = extractAgentIdFromSystemPrompt(ctx.getSystemPrompt());
bundled/coding/prompts/reviewer.md:120:- id: F-001
bundled/coding/prompts/reviewer.md:126:- id: F-001
domains/shared/extensions/orchestration/spawn-tool.ts:8:import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
domains/shared/extensions/orchestration/spawn-tool.ts:452:			const callerRole = extractAgentIdFromSystemPrompt(systemPrompt);
domains/shared/extensions/orchestration/spawn-tool.ts:458:							text: "spawn_agent denied: caller role could not be resolved from runtime identity marker",
domains/shared/extensions/tasks/index.ts:50:	id: string;
domains/shared/extensions/tasks/index.ts:60:		id: string;
domains/shared/extensions/tasks/index.ts:398:				details: { deleted: true, id: task.id, title: task.title },
domains/shared/extensions/orchestration/chain-tool.ts:4:import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
domains/shared/extensions/orchestration/chain-tool.ts:116:			const callerRole = extractAgentIdFromSystemPrompt(ctx.getSystemPrompt());
domains/shared/extensions/todo/index.ts:11:	id: string;
domains/shared/extensions/todo/index.ts:61:					id: Type.String({ description: "Short identifier (e.g. '1', 'a')" }),
domains/shared/extensions/architecture-memory/index.ts:7:import { extractAgentIdFromSystemPrompt } from "../../../../lib/agents/runtime-identity.ts";
domains/shared/extensions/architecture-memory/index.ts:391:	const agentId = extractAgentIdFromSystemPrompt(systemPrompt);
lib/driver/run-state.ts:17:	pid: number;
lib/driver/run-state.ts:53:		pid: process.pid,
bundled/coding/skills/languages/rails/rails-testing/references/patterns.md:132:  double(id: "pi_123", status: "succeeded")
bundled/coding/skills/languages/rails/rails-testing/references/patterns.md:178:      { user_id: user.id, exp: 1.hour.from_now.to_i },
lib/driver/lock.ts:31:	pid: number;
lib/driver/lock.ts:108:export function isProcessAlive(pid: number): boolean {
lib/driver/lock.ts:124:		pid: process.pid,
lib/driver/lock.ts:172:			pid: typeof parsed.pid === "number" ? parsed.pid : Number.NaN,
lib/driver/lock.ts:177:		return { runId: "unknown", pid: Number.NaN, startedAt: "unknown" };
lib/driver/lock.ts:204:			previousPid: Number.isFinite(existing.pid) ? existing.pid : undefined,
lib/driver/durable-steps.ts:55:	id: "pending-finalization",
lib/driver/durable-steps.ts:632:		id: taskId,
lib/driver/durable-steps.ts:671:		id: stepId,
lib/driver/durable-steps.ts:907:			id: REPORT_ARTIFACT_ID,
lib/driver/durable-steps.ts:926:		id: `step:${id}`,
lib/driver/durable-steps.ts:937:		{ id: "task", path: `missions/tasks/${taskId}.md`, kind: "task" },
lib/driver/durable-steps.ts:938:		{ id: "prompt", path: `prompts/${taskId}.md`, kind: "prompt" },
lib/driver/durable-steps.ts:983:		id: `commit:${sha}`,
bundled/coding/skills/languages/rails/rails-devops/references/patterns.md:147:        pid: Process.pid,
bundled/coding/skills/languages/rails/rails-devops/references/patterns.md:148:        tid: Thread.current.object_id
bundled/coding/skills/languages/rails/rails-devops/references/patterns.md:166:      user_id: controller.current_user&.id,
bundled/coding/skills/languages/rails/rails-devops/references/patterns.md:167:      request_id: controller.request.request_id
lib/driver/driver.ts:273:				pid: child.pid,
lib/driver/drive-finalization.ts:35:	id: "pending-finalization",
lib/driver/drive-finalization.ts:589:		id: `commit:${sha}`,
lib/driver/drive-finalization.ts:676:		id: `drive-task-status-partial:${taskId}`,
bundled/coding/skills/languages/rails/rails-mailers/references/patterns.md:138:    order = Order.first || Order.new(id: 1, number: "PREVIEW-001", created_at: Time.current)
tests/extensions/orchestration-helpers.ts:44:				id: "cody",
tests/extensions/orchestration-helpers.ts:47:			{ id: "coordinator", loop: true },
tests/extensions/orchestration-helpers.ts:48:			{ id: "explorer" },
tests/extensions/orchestration-helpers.ts:49:			{ id: "planner" },
tests/extensions/orchestration-helpers.ts:50:			{ id: "verifier" },
tests/extensions/orchestration-helpers.ts:51:			{ id: "worker" },
tests/extensions/orchestration-helpers.ts:52:			{ id: "quality-manager", subagents: ["verifier"] },
lib/driver/durable-events.ts:102:				id: `commit:${event.taskId}:${event.sha}`,
lib/driver/shell-command-finalizer.ts:317:		throw new Error(`Unexpected Drive finalizer step id: ${step.id}`);
lib/driver/drive-scheduler-backend.ts:688:				id: `drive-partial-continue:${taskId}:${attemptId}`,
lib/driver/drive-scheduler-backend.ts:726:			id: `drive-output:${taskId}:${attemptId}`,
bundled/coding/skills/languages/rails/rails-auth/references/patterns.md:75:  Current.user.sessions.where.not(id: Current.session.id).destroy_all
bundled/coding/skills/languages/rails/rails-auth/references/patterns.md:159:    find_or_create_by(provider: auth.provider, uid: auth.uid) do |user|
tests/extensions/orchestration-run-control-surface.test.ts:235:function agent(id: string): AgentDefinition {
bundled/coding/skills/languages/rails/rails-views/references/patterns.md:189:<%= f.email_field :email, aria: { invalid: @user.errors[:email].any?, describedby: "email-error" } %>
lib/domains/registry.ts:22:	get(id: string): LoadedDomain | undefined {
lib/domains/registry.ts:27:	has(id: string): boolean {
lib/domains/types.ts:15:	readonly id: string;
lib/domains/types.ts:30:	/** Agent IDs hidden from callers outside the owning domain. */
domains/shared/skills/task/SKILL.md:24:id: COSMO-001
domains/shared/skills/task/SKILL.md:208:id: COSMO-003
tests/orchestration/chain-routing.test.ts:129:function agent(id: string, loop: boolean): AgentDefinition {
lib/tasks/task-manager.ts:163:	async updateTask(id: string, input: TaskUpdateInput): Promise<Task> {
lib/tasks/task-manager.ts:185:			id: existingTask.id,
lib/tasks/task-manager.ts:214:	async deleteTask(id: string): Promise<void> {
lib/tasks/task-manager.ts:230:	async getTask(id: string): Promise<Task | null> {
lib/tasks/task-manager.ts:246:	private async findTaskFilenameById(id: string): Promise<string | undefined> {
lib/sessions/types.ts:22:	id: string;
tests/extensions/orchestration.test.ts:98:		id: string,
tests/extensions/orchestration.test.ts:426:- id: C-001
tests/extensions/orchestration.test.ts:431:- id: C-002
tests/extensions/orchestration.test.ts:888:					text: "spawn_agent denied: caller role could not be resolved from runtime identity marker",
bundled/coding/skills/languages/rails/rails-models/references/associations.md:64:          id: ActiveRecord::Type::Uuid.generate,
bundled/coding/skills/languages/rails/rails-models/references/associations.md:65:          board_id: proxy_association.owner.id,
bundled/coding/skills/languages/rails/rails-models/references/associations.md:66:          user_id: user.id,
bundled/coding/skills/languages/rails/rails-models/references/associations.md:67:          account_id: user.account_id,
lib/orchestration/spawn-compiler.ts:65:		id: options.stepId ?? DEFAULT_SPAWN_STEP_ID,
lib/tasks/task-serializer.ts:26:		id: task.id,
lib/tasks/task-serializer.ts:131: *   id: "TASK-1",
lib/agents/resolve-default-lead.ts:9:		get(id: string): LoadedDomain | undefined;
lib/agents/resolve-default-lead.ts:13:		resolve(id: string, domainContext?: string): AgentDefinition;
lib/agents/runtime-identity.ts:21: * Append the runtime identity marker to prompt content.
lib/agents/runtime-identity.ts:36:export function extractAgentIdFromSystemPrompt(
lib/tasks/lock.ts:17:	pid: number;
lib/tasks/lock.ts:18:	uuid: string;
lib/tasks/lock.ts:77:		pid: process.pid,
lib/tasks/lock.ts:78:		uuid: randomUUID(),
lib/tasks/lock.ts:125:			pid: typeof parsed.pid === "number" ? parsed.pid : Number.NaN,
lib/tasks/lock.ts:126:			uuid: typeof parsed.uuid === "string" ? parsed.uuid : "unknown",
lib/tasks/lock.ts:131:		return { pid: Number.NaN, uuid: "unknown", startedAt: "unknown" };
lib/tasks/lock.ts:135:function isProcessAlive(pid: number): boolean {
lib/agents/skills.ts:61:			id: "shared",
lib/agents/index.ts:17:	extractAgentIdFromSystemPrompt,
lib/agents/resolver.ts:86:	get(id: string, domainContext?: string): AgentDefinition | undefined {
lib/agents/resolver.ts:102:	resolve(id: string, domainContext?: string): AgentDefinition {
lib/agents/resolver.ts:123:	has(id: string, domainContext?: string): boolean {
lib/agents/resolver.ts:136:		id: string,
lib/agents/resolver.ts:161:		id: string,
lib/agents/resolver.ts:201:		id: string,
lib/agents/resolver.ts:210:		id: string,
lib/agents/resolver.ts:234:			const { domain, id: agent } = splitRole(id);
lib/agents/resolver.ts:255:			const { id: unqualified } = splitRole(key);
lib/agents/resolver.ts:292:		id: string,
lib/agents/resolver.ts:326:		id: string,
tests/orchestration/session-factory.security.test.ts:42:	id: "planner",
tests/orchestration/session-factory.security.test.ts:65:			model: { id: "test/model" },
lib/agents/types.ts:20:	/** Unique agent identifier. */
lib/agents/types.ts:21:	readonly id: string;

exec
/bin/zsh -lc 'rg -n "architecture-memory" bundled domains tests package.json' in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
tests/extensions/architecture-memory.test.ts:8:} from "../../domains/shared/extensions/architecture-memory/index.ts";
tests/extensions/architecture-memory.test.ts:20:const tmp = useTempDir("architecture-memory-");
tests/extensions/architecture-memory.test.ts:33:describe("architecture-memory extension", () => {
tests/extensions/architecture-memory.test.ts:156:	test("only the five consuming coding agents declare architecture-memory", async () => {
tests/extensions/architecture-memory.test.ts:160:				definition.extensions.includes("architecture-memory"),
bundled/coding/agents/worker.ts:15:	extensions: ["tasks", "architecture-memory"],
bundled/coding/agents/planner.ts:16:	extensions: ["plans", "orchestration", "architecture-memory"],
bundled/coding/agents/quality-manager.ts:20:		"architecture-memory",
bundled/coding/agents/coordinator.ts:14:		"architecture-memory",
bundled/coding/agents/plan-reviewer.ts:15:	extensions: ["plans", "architecture-memory"],

codex
The identity marker supports qualified IDs like `coding/planner`, and the tests exercise that exact form. I’m narrowing now to correctness failures that would survive the known passing suite, especially behavior with module roots, stale shard removal, and real-world TS syntax.
exec
/bin/zsh -lc "nl -ba tests/architecture-map/config.test.ts | sed -n '1,180p'" in /Users/cosmos/Projects/cosmonauts
exec
/bin/zsh -lc "nl -ba tests/architecture-map/freshness.test.ts | sed -n '1,300p'" in /Users/cosmos/Projects/cosmonauts
exec
/bin/zsh -lc "nl -ba tests/architecture-map/generator.test.ts | sed -n '1,560p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import { mkdir, symlink, writeFile } from "node:fs/promises";
     2	import { join } from "node:path";
     3	import { describe, expect, test, vi } from "vitest";
     4	import { resolveArchitectureMapConfig } from "../../lib/architecture-map/index.ts";
     5	import { useTempDir } from "../helpers/fs.ts";
     6	
     7	const tmp = useTempDir("architecture-map-config-");
     8	
     9	describe("resolveArchitectureMapConfig", () => {
    10		test("ignores architecture map roots that escape the project root @cosmo-behavior plan:code-structure-map#B-018", async () => {
    11			const projectRoot = join(tmp.path, "project");
    12			const outsideRoot = join(tmp.path, "outside");
    13			await mkdir(join(projectRoot, "lib", "safe"), { recursive: true });
    14			await mkdir(join(projectRoot, "src"), { recursive: true });
    15			await mkdir(outsideRoot, { recursive: true });
    16			await symlink(outsideRoot, join(projectRoot, "outside-link"));
    17			const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    18	
    19			const config = await resolveArchitectureMapConfig({
    20				projectRoot,
    21				projectConfig: {
    22					architectureMap: {
    23						sourceRoots: [
    24							"lib",
    25							join(projectRoot, "src"),
    26							"../outside",
    27							"outside-link",
    28						],
    29						moduleRoots: ["lib/safe", "/tmp/outside-module", "lib/../escape"],
    30					},
    31				},
    32			});
    33	
    34			expect(config.sourceRoots).toEqual(["lib"]);
    35			expect(config.moduleRoots).toEqual(["lib/safe"]);
    36			expect(warn).toHaveBeenCalledTimes(5);
    37			const warnings = warn.mock.calls.map((call) => String(call[0])).join("\n");
    38			expect(warnings).toContain("architectureMap.sourceRoots");
    39			expect(warnings).toContain("architectureMap.moduleRoots");
    40			expect(warnings).toContain("absolute paths and traversal");
    41			expect(warnings).toContain("resolved path is outside the project root");
    42			warn.mockRestore();
    43		});
    44	
    45		test("loads architectureMap settings from .cosmonauts/config.json when no projectConfig is supplied (generate path)", async () => {
    46			const projectRoot = join(tmp.path, "project-generate-config");
    47			await mkdir(join(projectRoot, "src", "keep"), { recursive: true });
    48			await mkdir(join(projectRoot, "src", "skip"), { recursive: true });
    49			await mkdir(join(projectRoot, ".cosmonauts"), { recursive: true });
    50			await writeFile(
    51				join(projectRoot, ".cosmonauts", "config.json"),
    52				JSON.stringify({ architectureMap: { sourceRoots: ["src/keep"] } }),
    53			);
    54	
    55			// The generator resolves config without pre-loading projectConfig; the
    56			// resolver must read .cosmonauts/config.json from disk itself, otherwise
    57			// generation silently falls back to default source roots while the
    58			// viewer/extension freshness paths honor the configured roots.
    59			const config = await resolveArchitectureMapConfig({ projectRoot });
    60	
    61			expect(config.sourceRoots).toEqual(["src/keep"]);
    62		});
    63	});

 succeeded in 0ms:
     1	import { mkdir, writeFile } from "node:fs/promises";
     2	import { join } from "node:path";
     3	import { describe, expect, test } from "vitest";
     4	import {
     5		checkArchitectureMapFreshness,
     6		checkArchitectureMapStatFreshness,
     7		computeArchitectureMapStatFingerprint,
     8		createProjectSnapshot,
     9		resolveArchitectureMapConfig,
    10	} from "../../lib/architecture-map/index.ts";
    11	import { loadProjectConfig } from "../../lib/config/index.ts";
    12	import { useTempDir } from "../helpers/fs.ts";
    13	
    14	const tmp = useTempDir("architecture-map-freshness-");
    15	
    16	const analyzer = {
    17		getConfigInputs: async () => ["tsconfig.json"],
    18	};
    19	
    20	describe("architecture map freshness", () => {
    21		test("reports missing current and stale from persisted frontmatter and disk state @cosmo-behavior plan:code-structure-map#B-007", async () => {
    22			await writeFixtureProject(tmp.path);
    23			const config = await resolveArchitectureMapConfig({
    24				projectRoot: tmp.path,
    25				projectConfig: { architectureMap: { sourceRoots: ["lib"] } },
    26			});
    27	
    28			await expect(
    29				checkArchitectureMapFreshness({
    30					projectRoot: tmp.path,
    31					config,
    32					analyzer,
    33				}),
    34			).resolves.toEqual({ kind: "missing" });
    35	
    36			const snapshot = await createProjectSnapshot({
    37				projectRoot: tmp.path,
    38				config,
    39				analyzer,
    40			});
    41			const statFingerprint = await computeArchitectureMapStatFingerprint({
    42				projectRoot: tmp.path,
    43				config,
    44				analyzer,
    45			});
    46			await writeIndexFrontmatter(tmp.path, {
    47				projectHash: snapshot.hash,
    48				statFingerprint: statFingerprint.hash,
    49			});
    50	
    51			await expect(
    52				checkArchitectureMapFreshness({
    53					projectRoot: tmp.path,
    54					config,
    55					analyzer,
    56				}),
    57			).resolves.toEqual({ kind: "current", hash: snapshot.hash });
    58	
    59			await writeFile(
    60				join(tmp.path, "lib", "alpha.ts"),
    61				"export const alpha = 12345;\n",
    62				"utf-8",
    63			);
    64	
    65			const stale = await checkArchitectureMapFreshness({
    66				projectRoot: tmp.path,
    67				config,
    68				analyzer,
    69			});
    70	
    71			expect(stale.kind).toBe("stale");
    72			expect(stale).toMatchObject({ oldHash: snapshot.hash });
    73			if (stale.kind === "stale") {
    74				expect(stale.newHash).not.toBe(snapshot.hash);
    75			}
    76		});
    77	
    78		test("reports stale when analyzer configuration changes but unrelated project config changes stay current @cosmo-behavior plan:code-structure-map#B-007", async () => {
    79			await writeFixtureProject(tmp.path);
    80			await mkdir(join(tmp.path, ".cosmonauts"), { recursive: true });
    81			await writeFile(
    82				join(tmp.path, ".cosmonauts", "config.json"),
    83				JSON.stringify({
    84					domainBindings: { main: "alternate-main" },
    85					architectureMap: { sourceRoots: ["lib"] },
    86				}),
    87				"utf-8",
    88			);
    89			const firstProjectConfig = await loadProjectConfig(tmp.path);
    90			const firstConfig = await resolveArchitectureMapConfig({
    91				projectRoot: tmp.path,
    92				projectConfig: firstProjectConfig,
    93			});
    94			const snapshot = await createProjectSnapshot({
    95				projectRoot: tmp.path,
    96				config: firstConfig,
    97				analyzer,
    98			});
    99			await writeIndexFrontmatter(tmp.path, { projectHash: snapshot.hash });
   100	
   101			await writeFile(
   102				join(tmp.path, ".cosmonauts", "config.json"),
   103				JSON.stringify({
   104					domainBindings: { main: "other-main" },
   105					architectureMap: { sourceRoots: ["lib"] },
   106				}),
   107				"utf-8",
   108			);
   109			const unrelatedProjectConfig = await loadProjectConfig(tmp.path);
   110			const unchangedMapConfig = await resolveArchitectureMapConfig({
   111				projectRoot: tmp.path,
   112				projectConfig: unrelatedProjectConfig,
   113			});
   114	
   115			await expect(
   116				checkArchitectureMapFreshness({
   117					projectRoot: tmp.path,
   118					config: unchangedMapConfig,
   119					analyzer,
   120				}),
   121			).resolves.toEqual({ kind: "current", hash: snapshot.hash });
   122	
   123			await writeFile(
   124				join(tmp.path, "tsconfig.json"),
   125				'{ "compilerOptions": { "module": "NodeNext", "strict": true } }\n',
   126				"utf-8",
   127			);
   128	
   129			const stale = await checkArchitectureMapFreshness({
   130				projectRoot: tmp.path,
   131				config: unchangedMapConfig,
   132				analyzer,
   133			});
   134			expect(stale.kind).toBe("stale");
   135			expect(stale).toMatchObject({ oldHash: snapshot.hash });
   136		});
   137	
   138		test("computes the turn-time stat fingerprint from included source analyzer config files and architecture-map config", async () => {
   139			await writeFixtureProject(tmp.path);
   140			const config = await resolveArchitectureMapConfig({
   141				projectRoot: tmp.path,
   142				projectConfig: { architectureMap: { sourceRoots: ["lib"] } },
   143			});
   144			const fingerprint = await computeArchitectureMapStatFingerprint({
   145				projectRoot: tmp.path,
   146				config,
   147				analyzer,
   148			});
   149	
   150			expect(fingerprint.hash).toMatch(/^[a-f0-9]{64}$/u);
   151			expect(fingerprint.files.map((file) => file.path)).toEqual([
   152				"lib/alpha.ts",
   153				"tsconfig.json",
   154			]);
   155			await writeIndexFrontmatter(tmp.path, {
   156				statFingerprint: fingerprint.hash,
   157			});
   158	
   159			await expect(
   160				checkArchitectureMapStatFreshness({
   161					projectRoot: tmp.path,
   162					config,
   163					analyzer,
   164				}),
   165			).resolves.toEqual({ kind: "current", hash: fingerprint.hash });
   166	
   167			const moduleRootConfig = await resolveArchitectureMapConfig({
   168				projectRoot: tmp.path,
   169				projectConfig: {
   170					architectureMap: { sourceRoots: ["lib"], moduleRoots: ["lib"] },
   171				},
   172			});
   173			const configStale = await checkArchitectureMapStatFreshness({
   174				projectRoot: tmp.path,
   175				config: moduleRootConfig,
   176				analyzer,
   177			});
   178			expect(configStale.kind).toBe("stale");
   179			expect(configStale).toMatchObject({ oldHash: fingerprint.hash });
   180	
   181			await writeFile(
   182				join(tmp.path, "lib", "alpha.ts"),
   183				"export const alpha = 12345;\n",
   184				"utf-8",
   185			);
   186	
   187			const stale = await checkArchitectureMapStatFreshness({
   188				projectRoot: tmp.path,
   189				config,
   190				analyzer,
   191			});
   192			expect(stale.kind).toBe("stale");
   193			expect(stale).toMatchObject({ oldHash: fingerprint.hash });
   194		});
   195	});
   196	
   197	async function writeFixtureProject(projectRoot: string): Promise<void> {
   198		await mkdir(join(projectRoot, "lib"), { recursive: true });
   199		await writeFile(
   200			join(projectRoot, "lib", "alpha.ts"),
   201			"export const alpha = 1;\n",
   202			"utf-8",
   203		);
   204		await writeFile(
   205			join(projectRoot, "tsconfig.json"),
   206			'{ "compilerOptions": { "module": "NodeNext" } }\n',
   207			"utf-8",
   208		);
   209	}
   210	
   211	async function writeIndexFrontmatter(
   212		projectRoot: string,
   213		values: { projectHash?: string; statFingerprint?: string },
   214	): Promise<void> {
   215		await mkdir(join(projectRoot, "memory", "architecture"), { recursive: true });
   216		const lines = ["---"];
   217		if (values.projectHash) lines.push(`projectHash: ${values.projectHash}`);
   218		if (values.statFingerprint) {
   219			lines.push(`statFingerprint: ${values.statFingerprint}`);
   220		}
   221		lines.push("---", "", "# Architecture Map", "");
   222		await writeFile(
   223			join(projectRoot, "memory", "architecture", "index.md"),
   224			lines.join("\n"),
   225			"utf-8",
   226		);
   227	}

 succeeded in 0ms:
     1	import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
     2	import { join } from "node:path";
     3	import matter from "gray-matter";
     4	import { describe, expect, test } from "vitest";
     5	import {
     6		generateArchitectureMap,
     7		type SourceAnalyzer,
     8		typescriptSourceAnalyzer,
     9	} from "../../lib/architecture-map/index.ts";
    10	import type {
    11		AnalysisInput,
    12		AnalysisResult,
    13		ModuleSkeleton,
    14		NarrativeProvider,
    15	} from "../../lib/architecture-map/types.ts";
    16	import { useTempDir } from "../helpers/fs.ts";
    17	
    18	const tmp = useTempDir("architecture-map-generator-");
    19	
    20	describe("generateArchitectureMap", () => {
    21		test("writes OKF index and module shards for a TypeScript fixture @cosmo-behavior plan:code-structure-map#B-002", async () => {
    22			await writeTypeScriptFixture(tmp.path);
    23	
    24			const result = await generateArchitectureMap({
    25				projectRoot: tmp.path,
    26				analyzer: typescriptSourceAnalyzer,
    27				configOverrides: {
    28					sourceRoots: ["src"],
    29					moduleRoots: ["src/domain", "src/shared"],
    30					narrative: { enabled: false, maxModulesPerRun: 20 },
    31				},
    32			});
    33	
    34			expect(result).toMatchObject({
    35				kind: "written",
    36				pendingModules: ["src/domain", "src/shared"],
    37			});
    38			if (result.kind === "written") {
    39				expect(result.changedFiles).toEqual([
    40					"memory/architecture/index.md",
    41					"memory/architecture/modules/src/domain.md",
    42					"memory/architecture/modules/src/shared.md",
    43				]);
    44			}
    45	
    46			const index = await readMapFile(tmp.path, "index.md");
    47			const domainShard = await readMapFile(tmp.path, "modules/src/domain.md");
    48			const sharedShard = await readMapFile(tmp.path, "modules/src/shared.md");
    49			const parsedIndex = matter(index);
    50			const parsedDomain = matter(domainShard);
    51	
    52			expect(parsedIndex.data).toMatchObject({
    53				type: "code-structure-index",
    54				title: "Architecture Map",
    55				description: "Generated TypeScript code structure map.",
    56				resource: "memory/architecture/index.md",
    57				generatorVersion: "code-structure-map-w1",
    58				moduleCount: 2,
    59				narrativeStatus: "pending",
    60			});
    61			expect(parsedIndex.data.projectHash).toMatch(/^[a-f0-9]{64}$/u);
    62			expect(parsedIndex.data.statFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    63			expect(parsedIndex.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/u);
    64			expect(parsedIndex.data.tags).toEqual([
    65				"architecture-map",
    66				"generated",
    67				"typescript",
    68			]);
    69			expect(parsedDomain.data).toMatchObject({
    70				type: "code-structure-module",
    71				title: "src/domain",
    72				resource: "src/domain",
    73				generatorVersion: "code-structure-map-w1",
    74				sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    75				skeletonHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    76				narrativeStatus: "pending",
    77			});
    78	
    79			expect(parsedIndex.content).toContain("`code-structure-index`");
    80			expect(parsedIndex.content).toContain("`code-structure-module`");
    81			expect(parsedIndex.content).toContain(
    82				"- `src/domain` - Narrative pending for `src/domain`.",
    83			);
    84			expect(parsedIndex.content).toContain(
    85				"- `src/shared` - Narrative pending for `src/shared`.",
    86			);
    87			// @cosmo-behavior plan:code-structure-map#B-003
    88			expect(parsedIndex.content).toContain("- `src/domain` -> `src/shared`");
    89			expect(parsedIndex.content).toContain("- `src/shared` -> none");
    90			expect(domainShard).toContain("- `src/shared`");
    91			expect(sharedShard).toContain("- `src/domain`");
    92	
    93			await expect(
    94				access(join(tmp.path, "memory", "architecture", "log.md")),
    95			).rejects.toMatchObject({ code: "ENOENT" });
    96		});
    97	
    98		test("returns unchanged without touching generated files when sources are unchanged @cosmo-behavior plan:code-structure-map#B-004", async () => {
    99			await writeTypeScriptFixture(tmp.path);
   100			const options = {
   101				projectRoot: tmp.path,
   102				analyzer: typescriptSourceAnalyzer,
   103				configOverrides: {
   104					sourceRoots: ["src"],
   105					moduleRoots: ["src/domain", "src/shared"],
   106					narrative: { enabled: false, maxModulesPerRun: 20 },
   107				},
   108			};
   109	
   110			await expect(generateArchitectureMap(options)).resolves.toMatchObject({
   111				kind: "written",
   112			});
   113			const indexPath = join(tmp.path, "memory", "architecture", "index.md");
   114			const shardPath = join(
   115				tmp.path,
   116				"memory",
   117				"architecture",
   118				"modules",
   119				"src",
   120				"domain.md",
   121			);
   122			const beforeIndex = await readFile(indexPath, "utf-8");
   123			const beforeShard = await readFile(shardPath, "utf-8");
   124			const beforeIndexStat = await stat(indexPath);
   125			const beforeShardStat = await stat(shardPath);
   126	
   127			const result = await generateArchitectureMap(options);
   128	
   129			expect(result).toEqual({ kind: "unchanged" });
   130			await expect(readFile(indexPath, "utf-8")).resolves.toBe(beforeIndex);
   131			await expect(readFile(shardPath, "utf-8")).resolves.toBe(beforeShard);
   132			await expect(stat(indexPath)).resolves.toMatchObject({
   133				mtimeMs: beforeIndexStat.mtimeMs,
   134			});
   135			await expect(stat(shardPath)).resolves.toMatchObject({
   136				mtimeMs: beforeShardStat.mtimeMs,
   137			});
   138		});
   139	
   140		test("reuses narrative for body-only edits without provider calls @cosmo-behavior plan:code-structure-map#B-005", async () => {
   141			await writeTypeScriptFixture(tmp.path);
   142			const provider = fakeNarrativeProvider();
   143			const options = {
   144				projectRoot: tmp.path,
   145				analyzer: typescriptSourceAnalyzer,
   146				narrativeProvider: provider,
   147				configOverrides: {
   148					sourceRoots: ["src"],
   149					moduleRoots: ["src/domain", "src/shared"],
   150					narrative: { enabled: true, maxModulesPerRun: 20 },
   151				},
   152			};
   153	
   154			await expect(generateArchitectureMap(options)).resolves.toMatchObject({
   155				kind: "written",
   156				pendingModules: [],
   157			});
   158			const beforeDomain = matter(
   159				await readMapFile(tmp.path, "modules/src/domain.md"),
   160			);
   161			provider.calls.length = 0;
   162	
   163			await writeFile(
   164				join(tmp.path, "src", "domain", "index.ts"),
   165				[
   166					'import type { SharedThing } from "../shared/model";',
   167					"export interface DomainApi {",
   168					"\tshared: SharedThing;",
   169					"}",
   170					"export function runDomain(): string {",
   171					'\treturn "domain body changed";',
   172					"}",
   173					"",
   174				].join("\n"),
   175				"utf-8",
   176			);
   177	
   178			const result = await generateArchitectureMap(options);
   179			expect(result).toMatchObject({
   180				kind: "written",
   181				pendingModules: [],
   182			});
   183			if (result.kind === "written") {
   184				expect(result.changedFiles).toEqual([
   185					"memory/architecture/index.md",
   186					"memory/architecture/modules/src/domain.md",
   187				]);
   188			}
   189			expect(provider.calls).toEqual([]);
   190	
   191			const afterDomain = matter(
   192				await readMapFile(tmp.path, "modules/src/domain.md"),
   193			);
   194			expect(afterDomain.data.sourceHash).not.toBe(beforeDomain.data.sourceHash);
   195			expect(afterDomain.data.skeletonHash).toBe(beforeDomain.data.skeletonHash);
   196			expect(afterDomain.data.narrativeStatus).toBe("reused");
   197			expect(afterDomain.content).toContain(
   198				"Generated narrative for src/domain.",
   199			);
   200			expect(afterDomain.content).toContain("Detailed narrative for src/domain.");
   201		});
   202	
   203		test("regenerates only the affected public-interface module narrative @cosmo-behavior plan:code-structure-map#B-006", async () => {
   204			await writeTypeScriptFixture(tmp.path);
   205			const provider = fakeNarrativeProvider();
   206			const options = {
   207				projectRoot: tmp.path,
   208				analyzer: typescriptSourceAnalyzer,
   209				narrativeProvider: provider,
   210				configOverrides: {
   211					sourceRoots: ["src"],
   212					moduleRoots: ["src/domain", "src/shared"],
   213					narrative: { enabled: true, maxModulesPerRun: 20 },
   214				},
   215			};
   216	
   217			await expect(generateArchitectureMap(options)).resolves.toMatchObject({
   218				kind: "written",
   219				pendingModules: [],
   220			});
   221			const beforeDomain = matter(
   222				await readMapFile(tmp.path, "modules/src/domain.md"),
   223			);
   224			const sharedPath = join(
   225				tmp.path,
   226				"memory",
   227				"architecture",
   228				"modules",
   229				"src",
   230				"shared.md",
   231			);
   232			const beforeShared = matter(await readFile(sharedPath, "utf-8"));
   233			const beforeSharedStat = await stat(sharedPath);
   234			provider.calls.length = 0;
   235	
   236			await writeFile(
   237				join(tmp.path, "src", "domain", "index.ts"),
   238				[
   239					'import type { SharedThing } from "../shared/model";',
   240					"export interface DomainApi {",
   241					"\tshared: SharedThing;",
   242					"\tversion: number;",
   243					"}",
   244					"export function runDomain(): string {",
   245					'\treturn "domain";',
   246					"}",
   247					"",
   248				].join("\n"),
   249				"utf-8",
   250			);
   251	
   252			const result = await generateArchitectureMap(options);
   253			expect(result).toMatchObject({
   254				kind: "written",
   255				pendingModules: [],
   256			});
   257			if (result.kind === "written") {
   258				expect(result.changedFiles).toEqual([
   259					"memory/architecture/index.md",
   260					"memory/architecture/modules/src/domain.md",
   261				]);
   262			}
   263			expect(provider.calls).toEqual(["src/domain"]);
   264	
   265			const afterDomain = matter(
   266				await readMapFile(tmp.path, "modules/src/domain.md"),
   267			);
   268			const afterShared = matter(await readFile(sharedPath, "utf-8"));
   269			expect(afterDomain.data.skeletonHash).not.toBe(
   270				beforeDomain.data.skeletonHash,
   271			);
   272			expect(afterDomain.data.narrativeStatus).toBe("generated");
   273			expect(afterShared.data.skeletonHash).toBe(beforeShared.data.skeletonHash);
   274			expect(afterShared.content).toContain(
   275				"Generated narrative for src/shared.",
   276			);
   277			expect(
   278				Math.abs((await stat(sharedPath)).mtimeMs - beforeSharedStat.mtimeMs),
   279			).toBeLessThan(2);
   280		});
   281	
   282		test("writes pending narratives for disabled budget-exhausted and failed generation @cosmo-behavior plan:code-structure-map#B-010", async () => {
   283			const disabledRoot = join(tmp.path, "disabled");
   284			await writeTypeScriptFixture(disabledRoot);
   285			const disabledProvider = fakeNarrativeProvider();
   286			await expect(
   287				generateArchitectureMap({
   288					projectRoot: disabledRoot,
   289					analyzer: typescriptSourceAnalyzer,
   290					narrativeProvider: disabledProvider,
   291					configOverrides: {
   292						sourceRoots: ["src"],
   293						moduleRoots: ["src/domain", "src/shared"],
   294						narrative: { enabled: false, maxModulesPerRun: 20 },
   295					},
   296				}),
   297			).resolves.toMatchObject({
   298				kind: "written",
   299				pendingModules: ["src/domain", "src/shared"],
   300			});
   301			expect(disabledProvider.calls).toEqual([]);
   302			expect(await readMapFile(disabledRoot, "index.md")).toContain(
   303				"- `src/domain` - Narrative pending for `src/domain`.",
   304			);
   305			expect(await readMapFile(disabledRoot, "modules/src/domain.md")).toContain(
   306				"Narrative generation is disabled for this run.",
   307			);
   308	
   309			const budgetRoot = join(tmp.path, "budget");
   310			await writeTypeScriptFixture(budgetRoot);
   311			const budgetProvider = fakeNarrativeProvider();
   312			await expect(
   313				generateArchitectureMap({
   314					projectRoot: budgetRoot,
   315					analyzer: typescriptSourceAnalyzer,
   316					narrativeProvider: budgetProvider,
   317					configOverrides: {
   318						sourceRoots: ["src"],
   319						moduleRoots: ["src/domain", "src/shared"],
   320						narrative: { enabled: true, maxModulesPerRun: 1 },
   321					},
   322				}),
   323			).resolves.toMatchObject({
   324				kind: "written",
   325				pendingModules: ["src/shared"],
   326			});
   327			expect(budgetProvider.calls).toEqual(["src/domain"]);
   328			expect(await readMapFile(budgetRoot, "modules/src/shared.md")).toContain(
   329				"Narrative generation budget was exhausted for this run.",
   330			);
   331	
   332			const failedRoot = join(tmp.path, "failed");
   333			await writeTypeScriptFixture(failedRoot);
   334			await expect(
   335				generateArchitectureMap({
   336					projectRoot: failedRoot,
   337					analyzer: typescriptSourceAnalyzer,
   338					narrativeProvider: fakeNarrativeProvider({
   339						failFor: new Set(["src/domain", "src/shared"]),
   340					}),
   341					configOverrides: {
   342						sourceRoots: ["src"],
   343						moduleRoots: ["src/domain", "src/shared"],
   344						narrative: { enabled: true, maxModulesPerRun: 20 },
   345					},
   346				}),
   347			).resolves.toMatchObject({
   348				kind: "written",
   349				pendingModules: ["src/domain", "src/shared"],
   350			});
   351			expect(await readMapFile(failedRoot, "modules/src/domain.md")).toContain(
   352				"Narrative generation failed: failed src/domain",
   353			);
   354		});
   355	
   356		test("completes pending narratives later without touching unaffected module files @cosmo-behavior plan:code-structure-map#B-021", async () => {
   357			await writeTypeScriptFixture(tmp.path);
   358			const disabledOptions = {
   359				projectRoot: tmp.path,
   360				analyzer: typescriptSourceAnalyzer,
   361				configOverrides: {
   362					sourceRoots: ["src"],
   363					moduleRoots: ["src/domain", "src/shared"],
   364					narrative: { enabled: false, maxModulesPerRun: 20 },
   365				},
   366			};
   367	
   368			await expect(
   369				generateArchitectureMap(disabledOptions),
   370			).resolves.toMatchObject({
   371				kind: "written",
   372				pendingModules: ["src/domain", "src/shared"],
   373			});
   374			const sharedPath = join(
   375				tmp.path,
   376				"memory",
   377				"architecture",
   378				"modules",
   379				"src",
   380				"shared.md",
   381			);
   382			const beforeShared = await readFile(sharedPath, "utf-8");
   383			const beforeSharedStat = await stat(sharedPath);
   384			const provider = fakeNarrativeProvider();
   385	
   386			const result = await generateArchitectureMap({
   387				projectRoot: tmp.path,
   388				analyzer: typescriptSourceAnalyzer,
   389				narrativeProvider: provider,
   390				configOverrides: {
   391					sourceRoots: ["src"],
   392					moduleRoots: ["src/domain", "src/shared"],
   393					narrative: { enabled: true, maxModulesPerRun: 1 },
   394				},
   395			});
   396	
   397			expect(result).toMatchObject({
   398				kind: "written",
   399				pendingModules: ["src/shared"],
   400			});
   401			if (result.kind === "written") {
   402				expect(result.changedFiles).toEqual([
   403					"memory/architecture/index.md",
   404					"memory/architecture/modules/src/domain.md",
   405				]);
   406			}
   407			expect(provider.calls).toEqual(["src/domain"]);
   408			expect(
   409				matter(await readMapFile(tmp.path, "modules/src/domain.md")).data,
   410			).toMatchObject({
   411				narrativeStatus: "generated",
   412			});
   413			expect(await readFile(sharedPath, "utf-8")).toBe(beforeShared);
   414			expect(
   415				Math.abs((await stat(sharedPath)).mtimeMs - beforeSharedStat.mtimeMs),
   416			).toBeLessThan(2);
   417		});
   418	
   419		test("preserves previous content and leaves no partial map on analysis or render failure @cosmo-behavior plan:code-structure-map#B-008", async () => {
   420			await writeEmptyTypeScriptProject(tmp.path);
   421			await mkdir(join(tmp.path, "memory", "architecture"), { recursive: true });
   422			await writeFile(
   423				join(tmp.path, "memory", "architecture", "index.md"),
   424				"previous map\n",
   425				"utf-8",
   426			);
   427	
   428			const analysisFailure = await generateArchitectureMap({
   429				projectRoot: tmp.path,
   430				analyzer: fakeAnalyzer({
   431					analyze: async () => {
   432						throw new Error("analysis exploded");
   433					},
   434				}),
   435			});
   436	
   437			expect(analysisFailure).toEqual({
   438				kind: "failed",
   439				error: "analysis exploded",
   440				previousMapIntact: true,
   441			});
   442			await expect(
   443				readFile(join(tmp.path, "memory", "architecture", "index.md"), "utf-8"),
   444			).resolves.toBe("previous map\n");
   445			await expect(
   446				access(join(tmp.path, "memory", ".architecture.tmp")),
   447			).rejects.toMatchObject({ code: "ENOENT" });
   448	
   449			const renderFailure = await generateArchitectureMap({
   450				projectRoot: tmp.path,
   451				analyzer: fakeAnalyzer({
   452					analyze: async () => ({
   453						modules: [moduleSkeleton("../outside")],
   454						diagnostics: [],
   455					}),
   456				}),
   457			});
   458	
   459			expect(renderFailure).toMatchObject({
   460				kind: "failed",
   461				previousMapIntact: true,
   462			});
   463			await expect(
   464				readFile(join(tmp.path, "memory", "architecture", "index.md"), "utf-8"),
   465			).resolves.toBe("previous map\n");
   466			await expect(
   467				access(join(tmp.path, "memory", "outside.md")),
   468			).rejects.toMatchObject({ code: "ENOENT" });
   469			await expect(
   470				access(join(tmp.path, "memory", ".architecture.tmp")),
   471			).rejects.toMatchObject({ code: "ENOENT" });
   472	
   473			const noPreviousRoot = join(tmp.path, "no-previous");
   474			await writeEmptyTypeScriptProject(noPreviousRoot);
   475			const noPreviousFailure = await generateArchitectureMap({
   476				projectRoot: noPreviousRoot,
   477				analyzer: fakeAnalyzer({
   478					analyze: async () => {
   479						throw new Error("analysis exploded");
   480					},
   481				}),
   482			});
   483	
   484			expect(noPreviousFailure).toEqual({
   485				kind: "failed",
   486				error: "analysis exploded",
   487				previousMapIntact: false,
   488			});
   489			await expect(
   490				access(join(noPreviousRoot, "memory", "architecture")),
   491			).rejects.toMatchObject({ code: "ENOENT" });
   492			await expect(
   493				access(join(noPreviousRoot, "memory", ".architecture.tmp")),
   494			).rejects.toMatchObject({ code: "ENOENT" });
   495		});
   496	
   497		test("writes a valid empty OKF index for an empty TypeScript project @cosmo-behavior plan:code-structure-map#B-011", async () => {
   498			await writeEmptyTypeScriptProject(tmp.path);
   499	
   500			const result = await generateArchitectureMap({
   501				projectRoot: tmp.path,
   502				analyzer: typescriptSourceAnalyzer,
   503			});
   504	
   505			expect(result).toEqual({
   506				kind: "written",
   507				changedFiles: ["memory/architecture/index.md"],
   508				pendingModules: [],
   509			});
   510			const index = await readMapFile(tmp.path, "index.md");
   511			const parsed = matter(index);
   512			expect(parsed.data).toMatchObject({
   513				type: "code-structure-index",
   514				moduleCount: 0,
   515				narrativeStatus: "generated",
   516			});
   517			expect(parsed.data.projectHash).toMatch(/^[a-f0-9]{64}$/u);
   518			expect(parsed.data.statFingerprint).toMatch(/^[a-f0-9]{64}$/u);
   519			expect(parsed.content).toContain("No modules discovered.");
   520			expect(parsed.content).toContain("- Modules discovered: 0");
   521			await expect(
   522				access(join(tmp.path, "memory", "architecture", "modules")),
   523			).rejects.toMatchObject({ code: "ENOENT" });
   524			await expect(
   525				access(join(tmp.path, "memory", "architecture", "log.md")),
   526			).rejects.toMatchObject({ code: "ENOENT" });
   527		});
   528	
   529		test("recovers crash leftovers and confines replacement to memory architecture", async () => {
   530			await writeTypeScriptFixture(tmp.path);
   531			await mkdir(join(tmp.path, "memory", ".architecture.tmp"), {
   532				recursive: true,
   533			});
   534			await writeFile(
   535				join(tmp.path, "memory", ".architecture.tmp", "partial.md"),
   536				"partial\n",
   537				"utf-8",
   538			);
   539			await mkdir(join(tmp.path, "memory", ".architecture.bak"), {
   540				recursive: true,
   541			});
   542			await writeFile(
   543				join(tmp.path, "memory", ".architecture.bak", "index.md"),
   544				"backup map\n",
   545				"utf-8",
   546			);
   547			await writeFile(
   548				join(tmp.path, "memory", "architecture-note.md"),
   549				"human note\n",
   550				"utf-8",
   551			);
   552	
   553			const result = await generateArchitectureMap({
   554				projectRoot: tmp.path,
   555				analyzer: typescriptSourceAnalyzer,
   556				configOverrides: {
   557					sourceRoots: ["src"],
   558					moduleRoots: ["src/domain", "src/shared"],
   559					narrative: { enabled: false, maxModulesPerRun: 20 },
   560				},

exec
/bin/zsh -lc "nl -ba tests/artifact-viewer/server.test.ts | sed -n '1,240p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import { access, mkdir, readFile, writeFile } from "node:fs/promises";
     2	import { join } from "node:path";
     3	import { describe, expect, test, vi } from "vitest";
     4	import {
     5		generateArchitectureMap,
     6		typescriptSourceAnalyzer,
     7	} from "../../lib/architecture-map/index.ts";
     8	import { handleArtifactViewerRequest } from "../../lib/artifact-viewer/index.ts";
     9	import { PlanManager } from "../../lib/plans/index.ts";
    10	import { serializeTask } from "../../lib/tasks/task-serializer.ts";
    11	import { useTempDir } from "../helpers/fs.ts";
    12	import { createTaskRecordFixture } from "../helpers/tasks.ts";
    13	
    14	const tmp = useTempDir("artifact-viewer-server-");
    15	
    16	describe("artifact-viewer server", () => {
    17		test("serves architecture map pages and missing map empty state @cosmo-behavior plan:code-structure-map#B-014", async () => {
    18			const home = await request("/");
    19			expect(home.statusCode).toBe(200);
    20			expect(home.body).toContain("/architecture/");
    21	
    22			await mkdir(join(tmp.path, "src", "shared"), { recursive: true });
    23			await mkdir(join(tmp.path, "src", "domain"), { recursive: true });
    24			await writeFile(
    25				join(tmp.path, "src", "shared", "index.ts"),
    26				"export const sharedValue = 1;\n",
    27				"utf-8",
    28			);
    29			await writeFile(
    30				join(tmp.path, "src", "domain", "index.ts"),
    31				"import { sharedValue } from '../shared/index.ts';\nexport const domainValue = sharedValue;\n",
    32				"utf-8",
    33			);
    34			await generateArchitectureMap({
    35				projectRoot: tmp.path,
    36				analyzer: typescriptSourceAnalyzer,
    37			});
    38	
    39			const index = await request("/architecture/");
    40			const modulePage = await request("/architecture/modules/src/domain");
    41	
    42			expect(index.statusCode).toBe(200);
    43			expect(index.body).toContain("Freshness: current");
    44			expect(index.body).toContain("Module Graph");
    45			expect(index.body).toContain("/architecture/modules/src/domain");
    46			expect(index.body).toContain("/architecture/modules/src/shared");
    47			expect(index.body).toContain("Architecture Map");
    48			expect(modulePage.statusCode).toBe(200);
    49			expect(modulePage.body).toContain("src/domain");
    50			expect(modulePage.body).toContain("Back to architecture map");
    51	
    52			const serverSource = await readFile(
    53				join(process.cwd(), "lib", "artifact-viewer", "server.ts"),
    54				"utf-8",
    55			);
    56			expect(serverSource).toContain("checkArchitectureMapStatFreshness");
    57			expect(serverSource).not.toContain("checkArchitectureMapFreshness(");
    58			expect(serverSource).not.toContain("createProjectSnapshot");
    59	
    60			const missingRoot = `${tmp.path}-missing`;
    61			await mkdir(missingRoot, { recursive: true });
    62			const missing = await handleArtifactViewerRequest({
    63				projectRoot: missingRoot,
    64				url: "/architecture/",
    65			});
    66			expect(missing.statusCode).toBe(200);
    67			expect(missing.body).toContain("No architecture map found");
    68			expect(missing.body).toContain("cosmonauts architecture generate");
    69		});
    70	
    71		test("serves plan pages with read only task status and empty states @cosmo-behavior plan:code-structure-map#B-015", async () => {
    72			const emptyList = await request("/plans/");
    73			expect(emptyList.statusCode).toBe(200);
    74			expect(emptyList.body).toContain("No plans found");
    75			await expect(access(join(tmp.path, "missions", "tasks"))).rejects.toThrow();
    76	
    77			const manager = new PlanManager(tmp.path);
    78			await manager.createPlan({
    79				slug: "empty-plan",
    80				title: "Empty Plan",
    81				description: "# Empty\n\nNo task files.",
    82			});
    83			const emptyPlan = await request("/plans/empty-plan");
    84			expect(emptyPlan.statusCode).toBe(200);
    85			expect(emptyPlan.body).toContain(
    86				"missions/tasks/config.json was not found",
    87			);
    88			await expect(access(join(tmp.path, "missions", "tasks"))).rejects.toThrow();
    89	
    90			await manager.createPlan({
    91				slug: "viewer-plan",
    92				title: "Viewer Plan",
    93				description: "# Plan Body\n\nImplement the route.",
    94				spec: "# Spec Body\n\nRoute requirements.",
    95			});
    96			await writeFile(
    97				join(tmp.path, "missions", "plans", "viewer-plan", "review.md"),
    98				"# Review Body\n\nLooks consistent.",
    99				"utf-8",
   100			);
   101			await mkdir(join(tmp.path, "missions", "tasks"), { recursive: true });
   102			await writeFile(
   103				join(tmp.path, "missions", "tasks", "TASK-123 - Viewer Task.md"),
   104				serializeTask(
   105					createTaskRecordFixture({
   106						id: "TASK-123",
   107						title: "Viewer Task",
   108						status: "In Progress",
   109						labels: ["plan:viewer-plan"],
   110					}),
   111				),
   112				"utf-8",
   113			);
   114	
   115			const list = await request("/plans/");
   116			const page = await request("/plans/viewer-plan");
   117	
   118			expect(list.body).toContain("/plans/viewer-plan");
   119			expect(page.statusCode).toBe(200);
   120			expect(page.body).toContain("Plan Body");
   121			expect(page.body).toContain("Spec Body");
   122			expect(page.body).toContain("Review Body");
   123			expect(page.body).toContain("Read-only Task Status");
   124			expect(page.body).toContain("TASK-123");
   125			expect(page.body).toContain("Viewer Task");
   126			await expect(
   127				access(join(tmp.path, "missions", "tasks", "config.json")),
   128			).rejects.toThrow();
   129		});
   130	
   131		test("rejects traversal routes before artifact reads @cosmo-behavior plan:code-structure-map#B-017", async () => {
   132			const dependencies = {
   133				loadArchitectureIndex: vi.fn(),
   134				loadArchitectureModule: vi.fn(),
   135				listPlans: vi.fn(),
   136				loadPlanPage: vi.fn(),
   137				checkArchitectureFreshness: vi.fn(),
   138			};
   139	
   140			for (const url of [
   141				"/plans/../x",
   142				"/plans/%2e%2e%2fx",
   143				"/architecture/modules/../secret",
   144				"/architecture/modules/lib/%2e%2e/secret",
   145			]) {
   146				const response = await handleArtifactViewerRequest({
   147					projectRoot: tmp.path,
   148					url,
   149					dependencies,
   150				});
   151				expect(response.statusCode).toBe(400);
   152			}
   153	
   154			expect(dependencies.loadArchitectureIndex).not.toHaveBeenCalled();
   155			expect(dependencies.loadArchitectureModule).not.toHaveBeenCalled();
   156			expect(dependencies.listPlans).not.toHaveBeenCalled();
   157			expect(dependencies.loadPlanPage).not.toHaveBeenCalled();
   158			expect(dependencies.checkArchitectureFreshness).not.toHaveBeenCalled();
   159		});
   160	});
   161	
   162	async function request(url: string) {
   163		return await handleArtifactViewerRequest({
   164			projectRoot: tmp.path,
   165			url,
   166		});
   167	}

codex
The tests cover the advertised happy paths and several regression points, but they don’t cover every route encoding and not every TypeScript export shape. I’m doing a small manual probe with a temp project for a representative TS syntax edge rather than trusting static inspection alone.
exec
/bin/zsh -lc 'tmpdir=$(mktemp -d); mkdir -p "$tmpdir/src/mod"; printf '"'export const a = 1, b = 2;\\n' > \""'$tmpdir/src/mod/index.ts"; printf '"'{\"compilerOptions\":{\"module\":\"NodeNext\",\"moduleResolution\":\"NodeNext\"}}\\n' > \""'$tmpdir/tsconfig.json"; bun --silent -e '"'import { generateArchitectureMap, typescriptSourceAnalyzer } from \"./lib/architecture-map/index.ts\"; const root=process.argv[2]; const r=await generateArchitectureMap({projectRoot: root, analyzer: typescriptSourceAnalyzer, configOverrides:{sourceRoots:[\"src\"], narrative:{enabled:false,maxModulesPerRun:20}}}); console.log(JSON.stringify(r));' \""'$tmpdir"; printf '"'\\n--- shard ---\\n'; sed -n '1,120p' \""'$tmpdir/memory/architecture/modules/src/mod.md"' in /Users/cosmos/Projects/cosmonauts
 exited 1 in 130ms:
111 | 	readonly memoryDir: string;
112 | 	readonly targetDir: string;
113 | 	readonly tempDir: string;
114 | 	readonly backupDir: string;
115 | } {
116 | 	const memoryDir = join(projectRoot, "memory");
                         ^
TypeError: The "paths[0]" property must be of type string, got undefined
 code: "ERR_INVALID_ARG_TYPE"

      at architectureStoragePaths (/Users/cosmos/Projects/cosmonauts/lib/architecture-map/store.ts:116:20)
      at recoverArchitectureMapStorage (/Users/cosmos/Projects/cosmonauts/lib/architecture-map/store.ts:48:16)
      at recoverArchitectureMapStorage (/Users/cosmos/Projects/cosmonauts/lib/architecture-map/store.ts:46:2)
      at generateArchitectureMap (/Users/cosmos/Projects/cosmonauts/lib/architecture-map/generator.ts:49:8)
      at generateArchitectureMap (/Users/cosmos/Projects/cosmonauts/lib/architecture-map/generator.ts:47:2)
      at /Users/cosmos/Projects/cosmonauts/[eval]:1:144

Bun v1.2.22 (macOS arm64)

--- shard ---
sed: /var/folders/kq/1jrmsh1141b4x5cfd79qyq200000gn/T/tmp.0wcWzBEPfB/memory/architecture/modules/src/mod.md: No such file or directory

codex
My first probe command passed the temp root incorrectly to Bun, so it failed before reaching the generator. I’m rerunning that probe with the root injected through an environment variable; still read-only with respect to the repo.
exec
/bin/zsh -lc 'tmpdir=$(mktemp -d); mkdir -p "$tmpdir/src/mod"; printf '"'export const a = 1, b = 2;\\n' > \""'$tmpdir/src/mod/index.ts"; printf '"'{\"compilerOptions\":{\"module\":\"NodeNext\",\"moduleResolution\":\"NodeNext\"}}\\n' > \""'$tmpdir/tsconfig.json"; ROOT="$tmpdir" bun --silent -e '"'import { generateArchitectureMap, typescriptSourceAnalyzer } from \"./lib/architecture-map/index.ts\"; const root=process.env.ROOT; const r=await generateArchitectureMap({projectRoot: root, analyzer: typescriptSourceAnalyzer, configOverrides:{sourceRoots:[\"src\"], narrative:{enabled:false,maxModulesPerRun:20}}}); console.log(JSON.stringify(r));'; printf '\\n--- shard ---\\n'; sed -n '1,140p' \""'$tmpdir/memory/architecture/modules/src/mod.md"' in /Users/cosmos/Projects/cosmonauts
 succeeded in 299ms:
{"kind":"written","changedFiles":["memory/architecture/index.md","memory/architecture/modules/src/mod.md"],"pendingModules":["src/mod"]}

--- shard ---
---
type: code-structure-module
title: src/mod
description: Generated TypeScript code structure shard for src/mod.
resource: src/mod
tags:
  - architecture-map
  - generated
  - typescript
  - module
generatorVersion: code-structure-map-w1
sourceHash: fbcdaf0d2cc50d723fe757765b7e836a037b0296c914eacbfc32b17fa0776b6d
skeletonHash: 9f94ef19e6a148decd40e4e6b41e55fa6720a3a2e328f4695cd91457f624ac14
narrativeStatus: pending
timestamp: '2026-07-03T18:06:09.922Z'
---
# src/mod

Narrative pending for `src/mod`.

## Narrative
Narrative generation is disabled for this run.

## Files
- `src/mod/index.ts`

## Public Interface
- `const` `a` - `export const a: 1;`
- `const` `b` - `export const b: 2;`

## Dependencies
- none

## Dependents
- none

## External Dependencies
- none

exec
/bin/zsh -lc 'rg -n "function validateSlug|export function validateSlug|const validateSlug" lib/plans tests/plans' in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
lib/plans/plan-manager.ts:27:export function validateSlug(slug: string): void {

exec
/bin/zsh -lc "nl -ba lib/plans/plan-manager.ts | sed -n '1,120p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	/**
     2	 * Plan Manager for plans
     3	 * Orchestrates all core modules for plan CRUD operations
     4	 */
     5	
     6	import type { TaskManager } from "../tasks/task-manager.ts";
     7	import {
     8		createPlanDirectory,
     9		deletePlanDirectory,
    10		ensurePlansDirectory,
    11		listPlanSlugs,
    12		readPlanFile,
    13		readSpecFile,
    14		writePlanFile,
    15		writeSpecFile,
    16	} from "./file-system.ts";
    17	import type {
    18		Plan,
    19		PlanCreateInput,
    20		PlanStatus,
    21		PlanSummary,
    22		PlanUpdateInput,
    23	} from "./plan-types.ts";
    24	
    25	const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    26	
    27	export function validateSlug(slug: string): void {
    28		if (!slug) {
    29			throw new Error("Plan slug cannot be empty");
    30		}
    31		if (slug.includes("/") || slug.includes("\\") || slug.includes("..")) {
    32			throw new Error(`Invalid plan slug (path traversal): ${slug}`);
    33		}
    34		if (!SLUG_PATTERN.test(slug)) {
    35			throw new Error(
    36				`Invalid plan slug "${slug}": must be lowercase alphanumeric with hyphens (e.g. "auth-system")`,
    37			);
    38		}
    39	}
    40	
    41	/**
    42	 * PlanManager orchestrates all core modules for plan management
    43	 */
    44	export class PlanManager {
    45		private projectRoot: string;
    46	
    47		/**
    48		 * Create a new PlanManager instance
    49		 * @param projectRoot - The root directory of the project
    50		 */
    51		constructor(projectRoot: string) {
    52			this.projectRoot = projectRoot;
    53		}
    54	
    55		/**
    56		 * Create a new plan
    57		 * Creates the plan directory, writes plan.md, and optionally writes spec.md
    58		 * @param input - Plan creation input
    59		 * @returns The created plan
    60		 */
    61		async createPlan(input: PlanCreateInput): Promise<Plan> {
    62			validateSlug(input.slug);
    63	
    64			await ensurePlansDirectory(this.projectRoot);
    65	
    66			// Check if plan already exists
    67			const existing = await readPlanFile(this.projectRoot, input.slug);
    68			if (existing) {
    69				throw new Error(`Plan already exists: ${input.slug}`);
    70			}
    71	
    72			const now = new Date();
    73	
    74			const plan: Omit<Plan, "spec"> = {
    75				slug: input.slug,
    76				title: input.title,
    77				status: "active",
    78				createdAt: now,
    79				updatedAt: now,
    80				body: input.description ?? "",
    81			};
    82	
    83			// Create directory and write plan.md
    84			await createPlanDirectory(this.projectRoot, input.slug);
    85			await writePlanFile(this.projectRoot, input.slug, plan);
    86	
    87			// Write spec.md if provided
    88			if (input.spec) {
    89				await writeSpecFile(this.projectRoot, input.slug, input.spec);
    90			}
    91	
    92			return {
    93				...plan,
    94				spec: input.spec,
    95			};
    96		}
    97	
    98		/**
    99		 * Get a plan by slug
   100		 * @param slug - The plan slug (directory name)
   101		 * @returns The plan or null if not found
   102		 */
   103		async getPlan(slug: string): Promise<Plan | null> {
   104			const planData = await readPlanFile(this.projectRoot, slug);
   105			if (!planData) {
   106				return null;
   107			}
   108	
   109			const spec = await readSpecFile(this.projectRoot, slug);
   110	
   111			return {
   112				...planData,
   113				spec: spec ?? undefined,
   114			};
   115		}
   116	
   117		/**
   118		 * List all plans, optionally filtered by status
   119		 * @param statusFilter - Optional status to filter by
   120		 * @returns Array of plans

codex
The simple TS export probe behaved correctly. I’m going one level deeper on public-interface extraction because default exports and re-export forms are common in this codebase and can produce misleading signatures even when typecheck passes.
exec
/bin/zsh -lc 'tmpdir=$(mktemp -d); mkdir -p "$tmpdir/src/mod"; printf '"'export default function makeThing(name: string): string { return name; }\\nexport { helper as renamed } from \"./helper\";\\n' > \""'$tmpdir/src/mod/index.ts"; printf '"'export function helper(id: number): number { return id; }\\n' > \""'$tmpdir/src/mod/helper.ts"; printf '"'{\"compilerOptions\":{\"module\":\"NodeNext\",\"moduleResolution\":\"NodeNext\"}}\\n' > \""'$tmpdir/tsconfig.json"; ROOT="$tmpdir" bun --silent -e '"'import { generateArchitectureMap, typescriptSourceAnalyzer } from \"./lib/architecture-map/index.ts\"; const root=process.env.ROOT; const r=await generateArchitectureMap({projectRoot: root, analyzer: typescriptSourceAnalyzer, configOverrides:{sourceRoots:[\"src\"], narrative:{enabled:false,maxModulesPerRun:20}}}); console.log(JSON.stringify(r));'; printf '\\n--- public interface ---\\n'; awk '/## Public Interface/{flag=1} /## Dependencies/{flag=0} flag{print}' \""'$tmpdir/memory/architecture/modules/src/mod.md"' in /Users/cosmos/Projects/cosmonauts
 succeeded in 295ms:
{"kind":"written","changedFiles":["memory/architecture/index.md","memory/architecture/modules/src/mod.md"],"pendingModules":["src/mod"]}

--- public interface ---
## Public Interface
- `function` `default` - `export function default(name: string): string;`
- `function` `renamed` - `export function renamed(id: number): number;`


exec
/bin/zsh -lc "nl -ba lib/tasks/file-system.ts | sed -n '1,220p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	/**
     2	 * File system utilities for tasks
     3	 * Handles all file I/O operations for tasks and configuration
     4	 */
     5	
     6	import {
     7		access,
     8		mkdir,
     9		readdir,
    10		readFile,
    11		rm,
    12		writeFile,
    13	} from "node:fs/promises";
    14	import { join } from "node:path";
    15	import type { ForgeTasksConfig } from "./task-types.ts";
    16	
    17	// Directory constants
    18	const MISSIONS_DIR = "missions";
    19	const TASKS_DIR = "tasks";
    20	const PLANS_DIR = "plans";
    21	const ARCHIVE_DIR = "archive";
    22	const REVIEWS_DIR = "reviews";
    23	const MEMORY_DIR = "memory";
    24	const CONFIG_FILE = "config.json";
    25	
    26	/**
    27	 * Ensure the full project directory scaffold exists:
    28	 *   missions/tasks/
    29	 *   missions/plans/
    30	 *   missions/archive/tasks/
    31	 *   missions/archive/plans/
    32	 *   missions/reviews/
    33	 *   memory/
    34	 *
    35	 * Idempotent — safe to call on an already-scaffolded project.
    36	 *
    37	 * @param projectRoot - The project root directory
    38	 * @returns The path to missions/tasks/
    39	 */
    40	export async function ensureForgeDirectory(
    41		projectRoot: string,
    42	): Promise<string> {
    43		const missionsDir = join(projectRoot, MISSIONS_DIR);
    44		const tasksDir = join(missionsDir, TASKS_DIR);
    45		const plansDir = join(missionsDir, PLANS_DIR);
    46		const archiveTasksDir = join(missionsDir, ARCHIVE_DIR, TASKS_DIR);
    47		const archivePlansDir = join(missionsDir, ARCHIVE_DIR, PLANS_DIR);
    48		const reviewsDir = join(missionsDir, REVIEWS_DIR);
    49		const memoryDir = join(projectRoot, MEMORY_DIR);
    50	
    51		await Promise.all([
    52			mkdir(tasksDir, { recursive: true }),
    53			mkdir(plansDir, { recursive: true }),
    54			mkdir(archiveTasksDir, { recursive: true }),
    55			mkdir(archivePlansDir, { recursive: true }),
    56			mkdir(reviewsDir, { recursive: true }),
    57			mkdir(memoryDir, { recursive: true }),
    58		]);
    59	
    60		return tasksDir;
    61	}
    62	
    63	/**
    64	 * Load configuration from missions/tasks/config.json
    65	 * @param projectRoot - The project root directory
    66	 * @returns The configuration object or null if file doesn't exist
    67	 */
    68	export async function loadConfig(
    69		projectRoot: string,
    70	): Promise<ForgeTasksConfig | null> {
    71		const configPath = join(projectRoot, MISSIONS_DIR, TASKS_DIR, CONFIG_FILE);
    72	
    73		try {
    74			const exists = await access(configPath)
    75				.then(() => true)
    76				.catch(() => false);
    77	
    78			if (!exists) {
    79				return null;
    80			}
    81	
    82			const content = await readFile(configPath, "utf-8");
    83			return stripLegacyConfigFields(JSON.parse(content) as ForgeTasksConfig);
    84		} catch (error) {
    85			// Return null for any errors (file doesn't exist, parse errors, etc.)
    86			if (process.env.DEBUG) {
    87				console.error("Error loading config:", error);
    88			}
    89			return null;
    90		}
    91	}
    92	
    93	/**
    94	 * Save configuration to missions/tasks/config.json
    95	 * @param projectRoot - The project root directory
    96	 * @param config - The configuration object to save
    97	 */
    98	export async function saveConfig(
    99		projectRoot: string,
   100		config: ForgeTasksConfig,
   101	): Promise<void> {
   102		// Ensure directories exist before saving config
   103		await ensureForgeDirectory(projectRoot);
   104		const configPath = join(projectRoot, MISSIONS_DIR, TASKS_DIR, CONFIG_FILE);
   105		const content = JSON.stringify(stripLegacyConfigFields(config), null, 2);
   106		await writeFile(configPath, `${content}\n`, "utf-8");
   107	}
   108	
   109	function stripLegacyConfigFields(config: ForgeTasksConfig): ForgeTasksConfig {
   110		const { lastIdNumber: _lastIdNumber, ...currentConfig } =
   111			config as ForgeTasksConfig & { lastIdNumber?: unknown };
   112		return currentConfig;
   113	}
   114	
   115	/**
   116	 * List all .md files in missions/tasks/
   117	 * @param projectRoot - The project root directory
   118	 * @returns Array of filenames (not full paths)
   119	 */
   120	export async function listTaskFiles(projectRoot: string): Promise<string[]> {
   121		const tasksDir = join(projectRoot, MISSIONS_DIR, TASKS_DIR);
   122	
   123		return await listMarkdownFiles(tasksDir);
   124	}
   125	
   126	/**
   127	 * List all .md files in missions/archive/tasks/
   128	 * @param projectRoot - The project root directory
   129	 * @returns Array of filenames (not full paths)
   130	 */
   131	export async function listArchivedTaskFiles(
   132		projectRoot: string,
   133	): Promise<string[]> {
   134		const archivedTasksDir = join(
   135			projectRoot,
   136			MISSIONS_DIR,
   137			ARCHIVE_DIR,
   138			TASKS_DIR,
   139		);
   140	
   141		return await listMarkdownFiles(archivedTasksDir);
   142	}
   143	
   144	async function listMarkdownFiles(directory: string): Promise<string[]> {
   145		try {
   146			const entries = await readdir(directory);
   147			return entries.filter((file) => file.endsWith(".md")).sort();
   148		} catch (error) {
   149			// Return empty array if directory doesn't exist
   150			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
   151				return [];
   152			}
   153			throw error;
   154		}
   155	}
   156	
   157	/**
   158	 * Read task file content from missions/tasks/
   159	 * @param projectRoot - The project root directory
   160	 * @param filename - The filename to read
   161	 * @returns The file content or null if file doesn't exist
   162	 */
   163	export async function readTaskFile(
   164		projectRoot: string,
   165		filename: string,
   166	): Promise<string | null> {
   167		const filePath = join(projectRoot, MISSIONS_DIR, TASKS_DIR, filename);
   168	
   169		try {
   170			const exists = await access(filePath)
   171				.then(() => true)
   172				.catch(() => false);
   173	
   174			if (!exists) {
   175				return null;
   176			}
   177	
   178			return await readFile(filePath, "utf-8");
   179		} catch (error) {
   180			if (process.env.DEBUG) {
   181				console.error("Error reading task file:", error);
   182			}
   183			return null;
   184		}
   185	}
   186	
   187	/**
   188	 * Write task file to missions/tasks/
   189	 * @param projectRoot - The project root directory
   190	 * @param filename - The filename to write
   191	 * @param content - The content to write
   192	 */
   193	export async function saveTaskFile(
   194		projectRoot: string,
   195		filename: string,
   196		content: string,
   197	): Promise<void> {
   198		// Ensure directory exists
   199		await ensureForgeDirectory(projectRoot);
   200	
   201		const filePath = join(projectRoot, MISSIONS_DIR, TASKS_DIR, filename);
   202		await writeFile(filePath, content, "utf-8");
   203	}
   204	
   205	/**
   206	 * Remove task file from missions/tasks/
   207	 * @param projectRoot - The project root directory
   208	 * @param filename - The filename to delete
   209	 */
   210	export async function deleteTaskFile(
   211		projectRoot: string,
   212		filename: string,
   213	): Promise<void> {
   214		const filePath = join(projectRoot, MISSIONS_DIR, TASKS_DIR, filename);
   215	
   216		try {
   217			await rm(filePath);
   218		} catch (error) {
   219			// Ignore if file doesn't exist
   220			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {

exec
/bin/zsh -lc "nl -ba lib/plans/file-system.ts | sed -n '1,180p' && nl -ba lib/plans/plan-manager.ts | sed -n '117,220p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	/**
     2	 * File system utilities for plans
     3	 * Handles all file I/O operations for plan directories and files
     4	 */
     5	
     6	import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
     7	import { join } from "node:path";
     8	import matter from "gray-matter";
     9	import type { Plan, PlanStatus } from "./plan-types.ts";
    10	
    11	// ============================================================================
    12	// Constants
    13	// ============================================================================
    14	
    15	const MISSIONS_DIR = "missions";
    16	const PLANS_DIR = "plans";
    17	const PLAN_FILE = "plan.md";
    18	const SPEC_FILE = "spec.md";
    19	
    20	const VALID_STATUSES: PlanStatus[] = ["active", "completed"];
    21	
    22	// ============================================================================
    23	// Directory Operations
    24	// ============================================================================
    25	
    26	/**
    27	 * Ensure the missions/plans/ directory exists
    28	 * @param projectRoot - The project root directory
    29	 * @returns The path to missions/plans/
    30	 */
    31	export async function ensurePlansDirectory(
    32		projectRoot: string,
    33	): Promise<string> {
    34		const plansDir = join(projectRoot, MISSIONS_DIR, PLANS_DIR);
    35		await mkdir(plansDir, { recursive: true });
    36		return plansDir;
    37	}
    38	
    39	/**
    40	 * List all plan directory slugs in missions/plans/
    41	 * @param projectRoot - The project root directory
    42	 * @returns Array of directory names (slugs)
    43	 */
    44	export async function listPlanSlugs(projectRoot: string): Promise<string[]> {
    45		const plansDir = join(projectRoot, MISSIONS_DIR, PLANS_DIR);
    46	
    47		try {
    48			const entries = await readdir(plansDir, { withFileTypes: true });
    49			return entries
    50				.filter((entry) => entry.isDirectory())
    51				.map((entry) => entry.name)
    52				.sort();
    53		} catch (error) {
    54			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    55				return [];
    56			}
    57			throw error;
    58		}
    59	}
    60	
    61	/**
    62	 * Create a plan directory at missions/plans/<slug>/
    63	 * @param projectRoot - The project root directory
    64	 * @param slug - The plan slug (directory name)
    65	 * @returns The path to the created directory
    66	 */
    67	export async function createPlanDirectory(
    68		projectRoot: string,
    69		slug: string,
    70	): Promise<string> {
    71		const planDir = join(projectRoot, MISSIONS_DIR, PLANS_DIR, slug);
    72		await mkdir(planDir, { recursive: true });
    73		return planDir;
    74	}
    75	
    76	/**
    77	 * Delete a plan directory and all its contents
    78	 * @param projectRoot - The project root directory
    79	 * @param slug - The plan slug (directory name)
    80	 */
    81	export async function deletePlanDirectory(
    82		projectRoot: string,
    83		slug: string,
    84	): Promise<void> {
    85		const planDir = join(projectRoot, MISSIONS_DIR, PLANS_DIR, slug);
    86	
    87		try {
    88			await rm(planDir, { recursive: true, force: true });
    89		} catch (error) {
    90			// Ignore if directory doesn't exist
    91			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    92				throw error;
    93			}
    94		}
    95	}
    96	
    97	// ============================================================================
    98	// Plan File Operations
    99	// ============================================================================
   100	
   101	/**
   102	 * Parse a plan status value, defaulting to "active" for invalid values
   103	 */
   104	function parseStatus(value: unknown): PlanStatus {
   105		if (!value) return "active";
   106	
   107		const str = String(value).toLowerCase().trim();
   108		if (VALID_STATUSES.includes(str as PlanStatus)) {
   109			return str as PlanStatus;
   110		}
   111	
   112		return "active";
   113	}
   114	
   115	/**
   116	 * Parse a date value from frontmatter
   117	 */
   118	function parseDate(value: unknown, defaultDate: Date): Date {
   119		if (!value) return defaultDate;
   120	
   121		if (value instanceof Date) {
   122			return Number.isNaN(value.getTime()) ? defaultDate : value;
   123		}
   124	
   125		if (typeof value === "string") {
   126			const parsed = new Date(value.trim());
   127			if (!Number.isNaN(parsed.getTime())) {
   128				return parsed;
   129			}
   130		}
   131	
   132		return defaultDate;
   133	}
   134	
   135	function parseBehaviorsReviewPending(value: unknown): boolean | undefined {
   136		if (typeof value === "boolean") {
   137			return value;
   138		}
   139	
   140		if (typeof value === "string") {
   141			const normalized = value.trim().toLowerCase();
   142			if (normalized === "true") {
   143				return true;
   144			}
   145			if (normalized === "false") {
   146				return false;
   147			}
   148		}
   149	
   150		return undefined;
   151	}
   152	
   153	/**
   154	 * Read and parse a plan.md file
   155	 * @param projectRoot - The project root directory
   156	 * @param slug - The plan slug (directory name)
   157	 * @returns Parsed plan data (without spec) or null if file doesn't exist
   158	 */
   159	export async function readPlanFile(
   160		projectRoot: string,
   161		slug: string,
   162	): Promise<Omit<Plan, "spec"> | null> {
   163		const filePath = join(projectRoot, MISSIONS_DIR, PLANS_DIR, slug, PLAN_FILE);
   164	
   165		try {
   166			const content = await readFile(filePath, "utf-8");
   167			const parsed = matter(content);
   168			const frontmatter = parsed.data;
   169			const now = new Date();
   170	
   171			return {
   172				slug,
   173				title: String(frontmatter.title || ""),
   174				status: parseStatus(frontmatter.status),
   175				createdAt: parseDate(frontmatter.createdAt, now),
   176				updatedAt: parseDate(frontmatter.updatedAt, now),
   177				body: parsed.content.trim(),
   178				behaviorsReviewPending: parseBehaviorsReviewPending(
   179					frontmatter.behaviorsReviewPending,
   180				),
   117		/**
   118		 * List all plans, optionally filtered by status
   119		 * @param statusFilter - Optional status to filter by
   120		 * @returns Array of plans
   121		 */
   122		async listPlans(statusFilter?: PlanStatus): Promise<Plan[]> {
   123			const slugs = await listPlanSlugs(this.projectRoot);
   124			const plans: Plan[] = [];
   125	
   126			for (const slug of slugs) {
   127				const plan = await this.getPlan(slug);
   128				if (plan) {
   129					if (!statusFilter || plan.status === statusFilter) {
   130						plans.push(plan);
   131					}
   132				}
   133			}
   134	
   135			return plans;
   136		}
   137	
   138		/**
   139		 * Update an existing plan's frontmatter fields
   140		 * @param slug - The plan slug to update
   141		 * @param input - Fields to update
   142		 * @returns The updated plan
   143		 * @throws Error if plan not found
   144		 */
   145		async updatePlan(slug: string, input: PlanUpdateInput): Promise<Plan> {
   146			validateSlug(slug);
   147	
   148			const existing = await readPlanFile(this.projectRoot, slug);
   149			if (!existing) {
   150				throw new Error(`Plan not found: ${slug}`);
   151			}
   152	
   153			const updated: Omit<Plan, "spec"> = {
   154				...existing,
   155				title: input.title ?? existing.title,
   156				status: input.status ?? existing.status,
   157				body: input.body ?? existing.body,
   158				behaviorsReviewPending:
   159					input.behaviorsReviewPending === undefined
   160						? existing.behaviorsReviewPending
   161						: input.behaviorsReviewPending,
   162				updatedAt: new Date(),
   163			};
   164	
   165			await writePlanFile(this.projectRoot, slug, updated);
   166	
   167			// Update spec if provided
   168			if (input.spec !== undefined) {
   169				await writeSpecFile(this.projectRoot, slug, input.spec);
   170			}
   171	
   172			const spec =
   173				input.spec ?? (await readSpecFile(this.projectRoot, slug)) ?? undefined;
   174	
   175			return {
   176				...updated,
   177				spec,
   178			};
   179		}
   180	
   181		/**
   182		 * Delete a plan and its entire directory
   183		 * @param slug - The plan slug to delete
   184		 * @throws Error if plan not found
   185		 */
   186		async deletePlan(slug: string): Promise<void> {
   187			const existing = await readPlanFile(this.projectRoot, slug);
   188			if (!existing) {
   189				throw new Error(`Plan not found: ${slug}`);
   190			}
   191	
   192			await deletePlanDirectory(this.projectRoot, slug);
   193		}
   194	
   195		/**
   196		 * Get a plan summary with count of associated tasks
   197		 * The task count is obtained by querying TaskManager for tasks with the label "plan:<slug>"
   198		 * TaskManager is passed as a parameter to keep PlanManager and TaskManager loosely coupled
   199		 *
   200		 * @param slug - The plan slug
   201		 * @param taskManager - A TaskManager instance to query for associated tasks
   202		 * @returns The plan summary or null if plan not found
   203		 */
   204		async getPlanSummary(
   205			slug: string,
   206			taskManager: TaskManager,
   207		): Promise<PlanSummary | null> {
   208			const plan = await this.getPlan(slug);
   209			if (!plan) {
   210				return null;
   211			}
   212	
   213			const tasks = await taskManager.listTasks({ label: `plan:${slug}` });
   214	
   215			return {
   216				slug: plan.slug,
   217				title: plan.title,
   218				status: plan.status,
   219				createdAt: plan.createdAt,
   220				updatedAt: plan.updatedAt,

exec
/bin/zsh -lc "nl -ba cli/architecture/narrative-provider.ts | sed -n '1,280p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import type { AgentMessage } from "@earendil-works/pi-agent-core";
     2	import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
     3	import {
     4		AuthStorage,
     5		createAgentSession,
     6		DefaultResourceLoader,
     7		getAgentDir,
     8		ModelRegistry,
     9		SessionManager,
    10	} from "@earendil-works/pi-coding-agent";
    11	import type {
    12		GeneratedNarrative,
    13		NarrativeInput,
    14		NarrativeProvider,
    15	} from "../../lib/architecture-map/index.ts";
    16	import {
    17		FALLBACK_MODEL,
    18		resolveModel,
    19	} from "../../lib/orchestration/model-resolution.ts";
    20	
    21	interface PiArchitectureNarrativeProviderOptions {
    22		readonly projectRoot: string;
    23		readonly model?: string;
    24	}
    25	
    26	type PiSession = Awaited<ReturnType<typeof createAgentSession>>["session"];
    27	
    28	const SYSTEM_PROMPT = [
    29		"You write concise architecture-map narratives for TypeScript modules.",
    30		"Return only strict JSON with keys oneLiner and text.",
    31		"oneLiner must be one sentence. text must be one short paragraph.",
    32		"Do not invent behavior that is not visible in the supplied skeleton.",
    33	].join("\n");
    34	
    35	export function createPiArchitectureNarrativeProvider(
    36		options: PiArchitectureNarrativeProviderOptions,
    37	): NarrativeProvider {
    38		return new PiArchitectureNarrativeProvider(options);
    39	}
    40	
    41	class PiArchitectureNarrativeProvider implements NarrativeProvider {
    42		private sessionPromise?: Promise<PiSession>;
    43	
    44		constructor(
    45			private readonly options: PiArchitectureNarrativeProviderOptions,
    46		) {}
    47	
    48		async generate(
    49			input: NarrativeInput,
    50			_signal?: AbortSignal,
    51		): Promise<GeneratedNarrative> {
    52			const session = await this.getSession();
    53			const beforeCount = session.messages.length;
    54			await session.prompt(buildNarrativePrompt(input));
    55			const response = extractLatestAssistantText(session.messages, beforeCount);
    56			return parseGeneratedNarrative(response);
    57		}
    58	
    59		private async getSession(): Promise<PiSession> {
    60			this.sessionPromise ??= createNarrativeSession(this.options);
    61			return this.sessionPromise;
    62		}
    63	}
    64	
    65	async function createNarrativeSession(
    66		options: PiArchitectureNarrativeProviderOptions,
    67	): Promise<PiSession> {
    68		const authStorage = AuthStorage.create();
    69		const modelRegistry = ModelRegistry.create(authStorage);
    70		const agentDir = getAgentDir();
    71		const resourceLoader = new DefaultResourceLoader({
    72			cwd: options.projectRoot,
    73			agentDir,
    74			noExtensions: true,
    75			noSkills: true,
    76			noPromptTemplates: true,
    77			noThemes: true,
    78			noContextFiles: true,
    79			systemPrompt: SYSTEM_PROMPT,
    80		});
    81		await resourceLoader.reload();
    82	
    83		const { session } = await createAgentSession({
    84			cwd: options.projectRoot,
    85			agentDir,
    86			authStorage,
    87			modelRegistry,
    88			model: resolveModel(options.model ?? FALLBACK_MODEL, modelRegistry),
    89			noTools: "all",
    90			resourceLoader,
    91			sessionManager: SessionManager.inMemory(),
    92		});
    93		return session;
    94	}
    95	
    96	function buildNarrativePrompt(input: NarrativeInput): string {
    97		return JSON.stringify(
    98			{
    99				task: "Generate an architecture-map narrative for this module skeleton.",
   100				module: input.skeleton,
   101				priorNarrative: input.priorNarrative,
   102				output: {
   103					oneLiner: "single sentence",
   104					text: "short paragraph",
   105				},
   106			},
   107			null,
   108			2,
   109		);
   110	}
   111	
   112	function extractLatestAssistantText(
   113		messages: readonly AgentMessage[],
   114		beforeCount: number,
   115	): string {
   116		for (let index = messages.length - 1; index >= beforeCount; index -= 1) {
   117			const message = messages[index];
   118			if (!isAssistantMessage(message)) continue;
   119			const text = message.content
   120				.filter(isTextContent)
   121				.map((content) => content.text)
   122				.join("")
   123				.trim();
   124			if (text.length > 0) return text;
   125		}
   126		throw new Error("Narrative provider returned no assistant text.");
   127	}
   128	
   129	function isAssistantMessage(
   130		message: AgentMessage | undefined,
   131	): message is AssistantMessage {
   132		return (
   133			message !== undefined && "role" in message && message.role === "assistant"
   134		);
   135	}
   136	
   137	function isTextContent(
   138		content: AssistantMessage["content"][number],
   139	): content is TextContent {
   140		return content.type === "text";
   141	}
   142	
   143	function parseGeneratedNarrative(response: string): GeneratedNarrative {
   144		const parsed = parseJsonObject(response);
   145		const oneLiner = parsed ? stringField(parsed, "oneLiner") : undefined;
   146		const text = parsed ? stringField(parsed, "text") : undefined;
   147		if (oneLiner && text) {
   148			return { oneLiner, text };
   149		}
   150	
   151		const fallback = response.trim();
   152		if (fallback.length === 0) {
   153			throw new Error("Narrative provider returned empty text.");
   154		}
   155		const [firstLine] = fallback.split(/\r?\n/u);
   156		return {
   157			oneLiner: (firstLine ?? fallback).trim(),
   158			text: fallback,
   159		};
   160	}
   161	
   162	function parseJsonObject(value: string): Record<string, unknown> | undefined {
   163		const trimmed = value.trim();
   164		const candidate =
   165			trimmed.startsWith("{") && trimmed.endsWith("}")
   166				? trimmed
   167				: trimmed.match(/\{[\s\S]*\}/u)?.[0];
   168		if (!candidate) return undefined;
   169	
   170		try {
   171			const parsed: unknown = JSON.parse(candidate);
   172			return isRecord(parsed) ? parsed : undefined;
   173		} catch {
   174			return undefined;
   175		}
   176	}
   177	
   178	function stringField(
   179		record: Record<string, unknown>,
   180		key: string,
   181	): string | undefined {
   182		const value = record[key];
   183		return typeof value === "string" && value.trim().length > 0
   184			? value.trim()
   185			: undefined;
   186	}
   187	
   188	function isRecord(value: unknown): value is Record<string, unknown> {
   189		return typeof value === "object" && value !== null && !Array.isArray(value);
   190	}

exec
/bin/zsh -lc "nl -ba package.json | sed -n '1,220p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	{
     2		"name": "cosmonauts",
     3		"version": "0.1.0",
     4		"type": "module",
     5		"keywords": [
     6			"pi-package"
     7		],
     8		"pi": {
     9			"extensions": [
    10				"./domains/shared/extensions"
    11			],
    12			"themes": [
    13				"./themes"
    14			]
    15		},
    16		"bin": {
    17			"cosmonauts": "./bin/cosmonauts"
    18		},
    19		"files": [
    20			"bundled/",
    21			"domains/",
    22			"external-skills/",
    23			"lib/",
    24			"cli/",
    25			"bin/",
    26			"themes/"
    27		],
    28		"scripts": {
    29			"lint": "biome check .",
    30			"lint:fix": "biome check --write .",
    31			"format": "biome format --write .",
    32			"format:check": "biome format .",
    33			"typecheck": "tsc --noEmit",
    34			"compile:drive-step": "bun build --compile lib/driver/run-step.ts --outfile bin/cosmonauts-drive-step",
    35			"test": "node ./scripts/vitest-runner.mjs",
    36			"test:watch": "vitest",
    37			"test:coverage": "vitest run --coverage"
    38		},
    39		"dependencies": {
    40			"@earendil-works/pi-agent-core": "0.79.8",
    41			"@earendil-works/pi-ai": "0.79.8",
    42			"@earendil-works/pi-coding-agent": "0.79.8",
    43			"@earendil-works/pi-tui": "0.79.8",
    44			"commander": "^14.0.2",
    45			"gray-matter": "^4.0.3",
    46			"typebox": "1.1.33",
    47			"typescript": "^5.6.2"
    48		},
    49		"devDependencies": {
    50			"@biomejs/biome": "^2.3.14",
    51			"@types/node": "^22.0.0",
    52			"@vitest/coverage-v8": "^3.0.0",
    53			"vitest": "^3.0.0"
    54		}
    55	}

codex
The packaging change promotes `typescript` to a runtime dependency, which matches the chosen compiler-API analyzer. I’m checking the actual exported surface next, because dead exports and missing public entry points tend to slip past behavioral tests.
exec
/bin/zsh -lc "nl -ba lib/architecture-map/types.ts | sed -n '1,260p'" in /Users/cosmos/Projects/cosmonauts
exec
/bin/zsh -lc "nl -ba lib/architecture-map/index.ts | sed -n '1,160p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	export {
     2		createTypeScriptSourceAnalyzer,
     3		typescriptSourceAnalyzer,
     4	} from "./analyzer.ts";
     5	export {
     6		canonicalizeArchitectureMapConfig,
     7		loadArchitectureMapConfig,
     8		resolveArchitectureMapConfig,
     9	} from "./config.ts";
    10	export {
    11		checkArchitectureMapFreshness,
    12		checkArchitectureMapStatFreshness,
    13		compareFreshnessHashes,
    14		computeArchitectureMapStatFingerprint,
    15		createProjectSnapshot,
    16		readArchitectureMapIndexFrontmatter,
    17	} from "./freshness.ts";
    18	export { generateArchitectureMap } from "./generator.ts";
    19	export type {
    20		AnalysisInput,
    21		AnalysisResult,
    22		ArchitectureMapConfig,
    23		ArchitectureMapFreshness,
    24		ArchitectureMapIndex,
    25		GenerateArchitectureMapOptions,
    26		GenerateArchitectureMapResult,
    27		GeneratedNarrative,
    28		ModuleDependency,
    29		ModuleDependent,
    30		ModuleNarrative,
    31		ModuleRecord,
    32		ModuleSkeleton,
    33		NarrativeInput,
    34		NarrativeProvider,
    35		NarrativeStatus,
    36		OkfRecordType,
    37		ProjectSnapshot,
    38		PublicExport,
    39		SourceAnalyzer,
    40		SourceFileSnapshot,
    41		StatFingerprint,
    42		StatFingerprintFile,
    43	} from "./types.ts";
    44	export {
    45		ARCHITECTURE_MAP_GENERATOR_VERSION,
    46		ARCHITECTURE_MAP_OUTPUT_DIR,
    47		OKF_RECORD_TYPES,
    48		OKF_REQUIRED_FRONTMATTER_KEYS,
    49	} from "./types.ts";

 succeeded in 0ms:
     1	/**
     2	 * Stable architecture-map contracts shared by analyzer, generator, CLI,
     3	 * extension, and viewer work.
     4	 */
     5	
     6	export const ARCHITECTURE_MAP_OUTPUT_DIR = "memory/architecture" as const;
     7	
     8	export const ARCHITECTURE_MAP_GENERATOR_VERSION =
     9		"code-structure-map-w1" as const;
    10	
    11	export const OKF_RECORD_TYPES = {
    12		index: "code-structure-index",
    13		module: "code-structure-module",
    14	} as const;
    15	
    16	export type OkfRecordType =
    17		(typeof OKF_RECORD_TYPES)[keyof typeof OKF_RECORD_TYPES];
    18	
    19	export const OKF_REQUIRED_FRONTMATTER_KEYS = [
    20		"type",
    21		"title",
    22		"description",
    23		"resource",
    24		"tags",
    25		"timestamp",
    26	] as const;
    27	
    28	export interface ArchitectureMapConfig {
    29		readonly outputDir: typeof ARCHITECTURE_MAP_OUTPUT_DIR;
    30		readonly sourceRoots: readonly string[];
    31		readonly moduleRoots?: readonly string[];
    32		readonly exclude: readonly string[];
    33		readonly injectionMaxBytes: number;
    34		readonly narrative: {
    35			readonly enabled: boolean;
    36			readonly maxModulesPerRun: number;
    37		};
    38	}
    39	
    40	export interface ProjectSnapshot {
    41		/** sha256 over resolved map config, analyzer config files, source paths, and source contents. */
    42		readonly hash: string;
    43		readonly files: readonly SourceFileSnapshot[];
    44		/** Existing repo-relative analyzer/config input files included in the snapshot hash. */
    45		readonly analyzerConfigFiles: readonly string[];
    46	}
    47	
    48	export interface SourceAnalyzer {
    49		getConfigInputs(
    50			projectRoot: string,
    51			config: ArchitectureMapConfig,
    52		): Promise<readonly string[]>;
    53		analyze(input: AnalysisInput): Promise<AnalysisResult>;
    54	}
    55	
    56	export interface ModuleSkeleton {
    57		/** Repo-relative module root, e.g. "lib/agents". */
    58		readonly resource: string;
    59		readonly rootDir: string;
    60		readonly files: readonly string[];
    61		readonly hasBarrel: boolean;
    62		readonly publicInterface: readonly PublicExport[];
    63		readonly dependencies: readonly ModuleDependency[];
    64		readonly externalDependencies: readonly string[];
    65		readonly sourceHash: string;
    66		readonly skeletonHash: string;
    67	}
    68	
    69	export interface ModuleRecord extends ModuleSkeleton {
    70		readonly dependents: readonly ModuleDependent[];
    71		readonly narrative: ModuleNarrative;
    72		/** Repo-relative to memory/architecture, e.g. "modules/lib/agents.md". */
    73		readonly shardPath: string;
    74	}
    75	
    76	export interface ArchitectureMapIndex {
    77		readonly generatedAt: string;
    78		readonly projectHash: string;
    79		readonly modules: readonly ModuleRecord[];
    80	}
    81	
    82	export interface NarrativeProvider {
    83		generate(
    84			input: NarrativeInput,
    85			signal?: AbortSignal,
    86		): Promise<GeneratedNarrative>;
    87	}
    88	
    89	export interface SourceFileSnapshot {
    90		/** Repo-relative path. */
    91		readonly path: string;
    92		readonly size: number;
    93		readonly mtimeMs: number;
    94		/** sha256 of contents. */
    95		readonly hash: string;
    96	}
    97	
    98	export interface AnalysisInput {
    99		readonly projectRoot: string;
   100		readonly config: ArchitectureMapConfig;
   101		readonly snapshot: ProjectSnapshot;
   102	}
   103	
   104	export interface AnalysisResult {
   105		readonly modules: readonly ModuleSkeleton[];
   106		readonly diagnostics: readonly string[];
   107	}
   108	
   109	export interface PublicExport {
   110		readonly name: string;
   111		readonly kind:
   112			| "function"
   113			| "class"
   114			| "interface"
   115			| "type"
   116			| "const"
   117			| "enum"
   118			| "other";
   119		readonly signature: string;
   120		/** Repo-relative source file. */
   121		readonly sourceFile: string;
   122	}
   123	
   124	export interface ModuleDependency {
   125		/** Target module resource. */
   126		readonly resource: string;
   127		/** Repo-relative importing files. */
   128		readonly importedBy: readonly string[];
   129	}
   130	
   131	export interface ModuleDependent {
   132		readonly resource: string;
   133	}
   134	
   135	export type NarrativeStatus = "generated" | "reused" | "pending";
   136	
   137	export interface ModuleNarrative {
   138		readonly status: NarrativeStatus;
   139		readonly oneLiner?: string;
   140		readonly text?: string;
   141		/** Required when status is "pending". */
   142		readonly pendingReason?: string;
   143	}
   144	
   145	export interface NarrativeInput {
   146		readonly skeleton: ModuleSkeleton;
   147		readonly priorNarrative?: ModuleNarrative;
   148	}
   149	
   150	export interface GeneratedNarrative {
   151		readonly oneLiner: string;
   152		readonly text: string;
   153	}
   154	
   155	export type GenerateArchitectureMapResult =
   156		| {
   157				readonly kind: "written";
   158				readonly changedFiles: readonly string[];
   159				readonly pendingModules: readonly string[];
   160		  }
   161		| { readonly kind: "unchanged" }
   162		| { readonly kind: "unsupported"; readonly reason: string }
   163		| {
   164				readonly kind: "failed";
   165				readonly error: string;
   166				readonly previousMapIntact: boolean;
   167		  };
   168	
   169	export interface GenerateArchitectureMapOptions {
   170		readonly projectRoot: string;
   171		readonly analyzer: SourceAnalyzer;
   172		/** Absent means --no-narrative semantics. */
   173		readonly narrativeProvider?: NarrativeProvider;
   174		readonly configOverrides?: Partial<ArchitectureMapConfig>;
   175	}
   176	
   177	export type ArchitectureMapFreshness =
   178		| {
   179				readonly kind: "current";
   180				readonly hash: string;
   181		  }
   182		| {
   183				readonly kind: "stale";
   184				readonly oldHash: string;
   185				readonly newHash: string;
   186		  }
   187		| { readonly kind: "missing" };
   188	
   189	export interface StatFingerprint {
   190		readonly hash: string;
   191		readonly files: readonly StatFingerprintFile[];
   192	}
   193	
   194	export interface StatFingerprintFile {
   195		readonly path: string;
   196		readonly size: number;
   197		readonly mtimeMs: number;
   198	}

exec
/bin/zsh -lc "nl -ba lib/artifact-viewer/index.ts | sed -n '1,120p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	export {
     2		type ArtifactDocument,
     3		type ArtifactKind,
     4		loadArchitectureIndexArtifact,
     5		loadArchitectureModuleArtifact,
     6		loadPlanArtifact,
     7		loadPlanPageData,
     8		loadPlanReviewArtifact,
     9		loadPlanTaskStatus,
    10		loadReviewArtifact,
    11		type PlanTaskStatus,
    12		type PlanViewerData,
    13		validateArchitectureResource,
    14	} from "./loaders.ts";
    15	export {
    16		escapeHtml,
    17		type RenderMarkdownOptions,
    18		renderArtifactMarkdown,
    19	} from "./renderer.ts";
    20	export {
    21		type ArtifactViewerDependencies,
    22		type ArtifactViewerResponse,
    23		type ArtifactViewerServerOptions,
    24		createArtifactViewerServer,
    25		handleArtifactViewerRequest,
    26	} from "./server.ts";

exec
/bin/zsh -lc "nl -ba cli/main.ts | sed -n '1,180p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	/**
     2	 * CLI entry point for cosmonauts.
     3	 *
     4	 * Modes:
     5	 *   cosmonauts                                    → interactive REPL
     6	 *   cosmonauts "prompt"                           → interactive with initial prompt
     7	 *   cosmonauts --print "prompt"                   → non-interactive (run, output, exit)
     8	 *   cosmonauts run chain name "prompt"             → named chain or chain DSL
     9	 *   cosmonauts run drive --plan slug               → driver run management
    10	 *   cosmonauts -c                                 → continue most recent session
    11	 *   cosmonauts --dump-prompt [-a agent]           → dump composed system prompt to stdout
    12	 *   cosmonauts --dump-prompt --file path          → dump composed system prompt to file
    13	 *   cosmonauts init                               → agent-driven AGENTS.md bootstrap
    14	 *   cosmonauts task <command>                     → task management subcommands
    15	 *   cosmonauts plan <command>                     → plan management subcommands
    16	 *   cosmonauts serve                             → local read-only artifact viewer
    17	 *   cosmonauts export ...                         → export packaged agents as binaries
    18	 *
    19	 * Pi flags (session, provider, tools, mode, etc.) pass through automatically.
    20	 * See cli/pi-flags.ts for the full registry.
    21	 */
    22	
    23	import { writeFile } from "node:fs/promises";
    24	import { join } from "node:path";
    25	import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
    26	import { InteractiveMode, runPrintMode } from "@earendil-works/pi-coding-agent";
    27	import { Command, CommanderError } from "commander";
    28	import { resolveDefaultLead } from "../lib/agents/resolve-default-lead.ts";
    29	import {
    30		appendAgentIdentityMarker,
    31		qualifyAgentId,
    32	} from "../lib/agents/runtime-identity.ts";
    33	import type { AgentDefinition } from "../lib/agents/types.ts";
    34	import { createDefaultProjectConfig } from "../lib/config/defaults.ts";
    35	import {
    36		FRAMEWORK_DEFAULT_DOMAIN,
    37		resolveDefaultDomain,
    38	} from "../lib/domains/default-domain.ts";
    39	import { assemblePrompts } from "../lib/domains/prompt-assembly.ts";
    40	import type { DomainResolver } from "../lib/domains/resolver.ts";
    41	import { buildInitBootstrapPrompt } from "../lib/init/prompt.ts";
    42	import { setSharedRegistry } from "../lib/interactive/agent-switch.ts";
    43	import { setSharedDomainBindings } from "../lib/interactive/domain-bindings.ts";
    44	import {
    45		discoverBundledPackageDirs,
    46		isCosmonautsFrameworkRepo,
    47	} from "../lib/packages/dev-bundled.ts";
    48	import type { CosmonautsRuntime } from "../lib/runtime.ts";
    49	import { createArchitectureProgram } from "./architecture/subcommand.ts";
    50	import { createCreateProgram } from "./create/subcommand.ts";
    51	import { createEjectProgram } from "./eject/subcommand.ts";
    52	import { createExportProgram } from "./export/subcommand.ts";
    53	import {
    54		createInstallProgram,
    55		createPackagesProgram,
    56		createUninstallProgram,
    57	} from "./packages/subcommand.ts";
    58	import { type PiFlagParseResult, parsePiFlags } from "./pi-flags.ts";
    59	import { createPlanProgram } from "./plans/index.ts";
    60	import { createRunProgram } from "./run/subcommand.ts";
    61	import {
    62		type CliRuntimeOptions,
    63		createCliRuntimeContext,
    64		parseCliRuntimeOptions,
    65		parseThinkingLevel,
    66	} from "./runtime-bootstrap.ts";
    67	import { createScaffoldProgram } from "./scaffold/subcommand.ts";
    68	import { createServeProgram } from "./serve/subcommand.ts";
    69	import { createSession, GracefulExitError } from "./session.ts";
    70	import { createSessionsProgram } from "./sessions/subcommand.ts";
    71	import { printCliError } from "./shared/errors.ts";
    72	import {
    73		type CliOutputMode,
    74		getOutputMode,
    75		printJson,
    76		printLines,
    77	} from "./shared/output.ts";
    78	import { createSkillsProgram } from "./skills/subcommand.ts";
    79	import { createTaskProgram } from "./tasks/subcommand.ts";
    80	import type { CliOptions } from "./types.ts";
    81	import { createUpdateProgram } from "./update/subcommand.ts";
    82	
    83	export { discoverBundledPackageDirs, isCosmonautsFrameworkRepo };
    84	
    85	// ============================================================================
    86	// Argument Parsing
    87	// ============================================================================
    88	
    89	/**
    90	 * Parse CLI arguments into CliOptions.
    91	 * Exported for testing — not intended for external use.
    92	 */
    93	export function parseCliArgs(argv: string[]): CliOptions {
    94		const { isInit, effectiveArgv } = detectInitSubcommand(argv);
    95		const piResult = parsePiFlags(effectiveArgv);
    96		for (const w of piResult.warnings) {
    97			console.warn(`[cosmonauts] ${w}`);
    98		}
    99	
   100		const program = buildCliParser();
   101		program.parse(piResult.remaining, { from: "user" });
   102	
   103		return normalizeCliOptions(program, isInit, piResult);
   104	}
   105	
   106	function detectInitSubcommand(argv: readonly string[]): {
   107		isInit: boolean;
   108		effectiveArgv: string[];
   109	} {
   110		const isInit = argv.length > 0 && argv[0] === "init";
   111		return {
   112			isInit,
   113			effectiveArgv: isInit ? argv.slice(1) : [...argv],
   114		};
   115	}
   116	
   117	function buildCliParser(): Command {
   118		const program = new Command();
   119	
   120		program
   121			.name("cosmonauts")
   122			.description("AI coding orchestration system")
   123			.version("0.1.0");
   124	
   125		program
   126			.option("-p, --print", "Non-interactive mode (run, output, exit)")
   127			.option(
   128				"-a, --agent <id>",
   129				"Agent to use (e.g. planner, worker, coordinator)",
   130			)
   131			.option(
   132				"--completion-label <label>",
   133				'Task label scope for loop completion checks (e.g. "plan:auth-system")',
   134			)
   135			.option("-m, --model <provider/model-id>", "Override the default model")
   136			.option(
   137				"-t, --thinking [level]",
   138				"Set thinking level (default: high when flag present)",
   139			)
   140			.option("-d, --domain <id>", "Set domain context for agent resolution")
   141			.option("--list-domains", "List all discovered domains and exit")
   142			.option("--list-agents", "List available agent IDs and exit")
   143			.option(
   144				"--dump-prompt",
   145				"Dump the composed system prompt for an agent and exit",
   146			)
   147			.option(
   148				"--file <path>",
   149				"Write output to a file instead of stdout (used with --dump-prompt)",
   150			)
   151			.option(
   152				"--plugin-dir <path>",
   153				"Add a directory as a session-only domain source (repeatable)",
   154				(val: string, prev: string[]) => [...prev, val],
   155				[] as string[],
   156			)
   157			.option(
   158				"--profile",
   159				"Write profiling trace and summary files after a chain run",
   160			)
   161			.option(
   162				"--json",
   163				"Emit machine-readable JSON output (for --list-domains, --list-agents)",
   164			)
   165			.option(
   166				"--plain",
   167				"Emit minimal plain-text output for agents (for --list-domains, --list-agents)",
   168			)
   169			.argument("[prompt...]", "Prompt text");
   170	
   171		program.exitOverride();
   172		return program;
   173	}
   174	
   175	function parseThinkingOption(value: unknown): ThinkingLevel | undefined {
   176		if (value === undefined) {
   177			return undefined;
   178		}
   179	
   180		if (value === true) {

exec
/bin/zsh -lc "nl -ba cli/main.ts | sed -n '180,380p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
   180		if (value === true) {
   181			return "high";
   182		}
   183	
   184		if (typeof value === "string") {
   185			return parseThinkingLevel(value);
   186		}
   187	
   188		throw new Error(`Invalid thinking option value: ${String(value)}`);
   189	}
   190	
   191	interface ParsedCliOptionValues {
   192		print?: boolean;
   193		agent?: string;
   194		completionLabel?: string;
   195		model?: string;
   196		thinking?: unknown;
   197		domain?: string;
   198		listDomains?: boolean;
   199		listAgents?: boolean;
   200		dumpPrompt?: boolean;
   201		file?: string;
   202		profile?: boolean;
   203		pluginDir?: string[];
   204		json?: boolean;
   205		plain?: boolean;
   206	}
   207	
   208	function normalizeCliOptions(
   209		program: Command,
   210		isInit: boolean,
   211		piResult: PiFlagParseResult,
   212	): CliOptions {
   213		const opts = program.opts<ParsedCliOptionValues>();
   214		const thinking = parseThinkingOption(opts.thinking);
   215	
   216		const promptArgs: string[] = program.args;
   217		const prompt = promptArgs.length > 0 ? promptArgs.join(" ") : undefined;
   218	
   219		const pluginDirs: string[] = opts.pluginDir ?? [];
   220	
   221		return {
   222			prompt,
   223			print: opts.print ?? false,
   224			agent: opts.agent,
   225			completionLabel: opts.completionLabel,
   226			model: opts.model,
   227			thinking,
   228			init: isInit,
   229			listAgents: opts.listAgents ?? false,
   230			domain: opts.domain,
   231			listDomains: opts.listDomains ?? false,
   232			dumpPrompt: opts.dumpPrompt ?? false,
   233			dumpPromptFile: opts.file,
   234			profile: opts.profile ?? undefined,
   235			pluginDirs: pluginDirs.length > 0 ? pluginDirs : undefined,
   236			json: opts.json ?? false,
   237			plain: opts.plain ?? false,
   238			piFlags: piResult.flags,
   239		};
   240	}
   241	
   242	export function buildInitSessionConfig(cwd: string) {
   243		return {
   244			ignoreProjectSkills: true as const,
   245			initialMessage: buildInitBootstrapPrompt({
   246				cwd,
   247				defaultConfig: createDefaultProjectConfig(),
   248			}),
   249		};
   250	}
   251	
   252	// ============================================================================
   253	// Mode Dispatch
   254	// ============================================================================
   255	
   256	type CliRunMode =
   257		| "no-domain-guard"
   258		| "list-domains"
   259		| "list-agents"
   260		| "dump-prompt"
   261		| "init"
   262		| "print"
   263		| "interactive";
   264	
   265	export function selectRunMode(
   266		options: CliOptions,
   267		hasRunnableDefault: boolean,
   268	): CliRunMode {
   269		const isBypassCommand =
   270			options.init ||
   271			options.listDomains ||
   272			options.listAgents ||
   273			options.dumpPrompt;
   274		if (!hasRunnableDefault && !isBypassCommand) {
   275			return "no-domain-guard";
   276		}
   277	
   278		if (options.listDomains) return "list-domains";
   279		if (options.listAgents) return "list-agents";
   280		if (options.dumpPrompt) return "dump-prompt";
   281		if (options.init) return "init";
   282		if (options.print) return "print";
   283		return "interactive";
   284	}
   285	
   286	async function run(options: CliOptions): Promise<void> {
   287		const { cwd, runtime } = await createCliRuntimeContext(options);
   288		const runtimeHasRunnableDefault = hasRunnableDefaultDomain(runtime);
   289	
   290		const mode = selectRunMode(options, runtimeHasRunnableDefault);
   291		const handlers: Record<CliRunMode, () => Promise<void>> = {
   292			"no-domain-guard": async () => handleNoDomainGuard(),
   293			"list-domains": () => handleListDomains(runtime, options),
   294			"list-agents": () => handleListAgents(runtime, options),
   295			"dump-prompt": () => handleDumpPrompt(runtime, options),
   296			init: () => handleInitMode(runtime, options, cwd),
   297			print: () => handlePrintMode(runtime, options, cwd),
   298			interactive: () => handleInteractiveMode(runtime, options, cwd),
   299		};
   300	
   301		await handlers[mode]();
   302	}
   303	
   304	export function hasRunnableDefaultDomain(runtime: CosmonautsRuntime): boolean {
   305		return runtime.domains.some((domain) => domain.manifest.id !== "shared");
   306	}
   307	
   308	export function resolveInteractiveExtensionPaths(
   309		runtime: Pick<CosmonautsRuntime, "domainsDir">,
   310	): string[] {
   311		return [
   312			join(runtime.domainsDir, "shared", "extensions", "agent-switch"),
   313			join(runtime.domainsDir, "shared", "extensions", "domain-bindings"),
   314		];
   315	}
   316	
   317	interface ResolveDumpPromptDomainOptions {
   318		readonly definition: Pick<AgentDefinition, "id" | "domain">;
   319		readonly resolver?: DomainResolver;
   320		readonly resolveDefault?: typeof resolveDefaultDomain;
   321	}
   322	
   323	export function resolveDumpPromptDomain(
   324		options: ResolveDumpPromptDomainOptions,
   325	): string {
   326		const resolveDefault = options.resolveDefault ?? resolveDefaultDomain;
   327		return resolveDefault({
   328			explicitDomain: options.definition.domain,
   329			resolver: options.resolver,
   330			purpose: `dump-prompt for agent "${options.definition.id}"`,
   331		});
   332	}
   333	
   334	function handleNoDomainGuard(): void {
   335		printCliError(buildNoRunnableDefaultDomainMessage(), {});
   336		process.exitCode = 1;
   337	}
   338	
   339	function buildNoRunnableDefaultDomainMessage(): string {
   340		return `No runnable default domain installed. Install or activate a domain with a lead agent, or restore the built-in "${FRAMEWORK_DEFAULT_DOMAIN}" domain. Run \`cosmonauts --list-domains\` to inspect active domains.`;
   341	}
   342	
   343	export function buildInitNoRunnableDefaultDomainLines(): string[] {
   344		return [
   345			buildNoRunnableDefaultDomainMessage(),
   346			"",
   347			"After a runnable domain is available, run `cosmonauts init` again to set up your project.",
   348		];
   349	}
   350	
   351	function resolveCliOutputMode(options: CliOptions): CliOutputMode {
   352		return getOutputMode({ json: options.json, plain: options.plain });
   353	}
   354	
   355	/** Domain entry shape used by `--list-domains --json`. */
   356	export interface DomainListItem {
   357		id: string;
   358		description: string;
   359		portable: boolean;
   360	}
   361	
   362	/** Agent entry shape used by `--list-agents --json`. */
   363	export interface AgentListItem {
   364		id: string;
   365		domain: string | null;
   366		description: string;
   367		model: string;
   368		tools: AgentDefinition["tools"];
   369		session: AgentDefinition["session"];
   370	}
   371	
   372	export function renderDomainsList(
   373		domains: readonly DomainListItem[],
   374		mode: CliOutputMode,
   375	): { kind: "json"; value: unknown } | { kind: "lines"; lines: string[] } {
   376		if (mode === "json") {
   377			return { kind: "json", value: domains };
   378		}
   379	
   380		if (mode === "plain") {

exec
/bin/zsh -lc 'rg -n "createArchitectureProgram|createServeProgram|architecture|serve" cli/main.ts tests/cli/architecture tests/cli/serve' in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
cli/main.ts:16: *   cosmonauts serve                             → local read-only artifact viewer
cli/main.ts:49:import { createArchitectureProgram } from "./architecture/subcommand.ts";
cli/main.ts:68:import { createServeProgram } from "./serve/subcommand.ts";
cli/main.ts:640:	subcommand === "serve" ||
cli/main.ts:642:	subcommand === "architecture" ||
cli/main.ts:646:		architecture: createArchitectureProgram,
cli/main.ts:647:		arch: createArchitectureProgram,
cli/main.ts:659:		serve: createServeProgram,
tests/cli/architecture/main-dispatch.test.ts:4:const architectureProgramMocks = vi.hoisted(() => ({
tests/cli/architecture/main-dispatch.test.ts:5:	createArchitectureProgram: vi.fn(),
tests/cli/architecture/main-dispatch.test.ts:13:vi.mock("../../../cli/architecture/subcommand.ts", () => ({
tests/cli/architecture/main-dispatch.test.ts:14:	createArchitectureProgram: architectureProgramMocks.createArchitectureProgram,
tests/cli/architecture/main-dispatch.test.ts:21:describe("cli/main architecture dispatch", () => {
tests/cli/architecture/main-dispatch.test.ts:31:	it("routes cosmonauts architecture generate to createArchitectureProgram", async () => {
tests/cli/architecture/main-dispatch.test.ts:32:		architectureProgramMocks.createArchitectureProgram.mockImplementation(
tests/cli/architecture/main-dispatch.test.ts:40:					.action((options) => architectureProgramMocks.action(options));
tests/cli/architecture/main-dispatch.test.ts:47:			"architecture",
tests/cli/architecture/main-dispatch.test.ts:57:			architectureProgramMocks.createArchitectureProgram,
tests/cli/architecture/main-dispatch.test.ts:59:		expect(architectureProgramMocks.action).toHaveBeenCalledWith(
tests/cli/architecture/main-dispatch.test.ts:68:		architectureProgramMocks.createArchitectureProgram.mockImplementation(
tests/cli/architecture/main-dispatch.test.ts:75:					.action((options) => architectureProgramMocks.action(options));
tests/cli/architecture/main-dispatch.test.ts:88:			architectureProgramMocks.createArchitectureProgram,
tests/cli/architecture/main-dispatch.test.ts:90:		expect(architectureProgramMocks.action).toHaveBeenCalledWith(
tests/cli/serve/main-dispatch.test.ts:4:const serveProgramMocks = vi.hoisted(() => ({
tests/cli/serve/main-dispatch.test.ts:5:	createServeProgram: vi.fn(),
tests/cli/serve/main-dispatch.test.ts:13:vi.mock("../../../cli/serve/subcommand.ts", () => ({
tests/cli/serve/main-dispatch.test.ts:14:	createServeProgram: serveProgramMocks.createServeProgram,
tests/cli/serve/main-dispatch.test.ts:21:describe("cli/main serve dispatch", () => {
tests/cli/serve/main-dispatch.test.ts:31:	it("routes cosmonauts serve to createServeProgram with host port open options", async () => {
tests/cli/serve/main-dispatch.test.ts:32:		serveProgramMocks.createServeProgram.mockImplementation(() => {
tests/cli/serve/main-dispatch.test.ts:40:				.action((options) => serveProgramMocks.action(options));
tests/cli/serve/main-dispatch.test.ts:46:			"serve",
tests/cli/serve/main-dispatch.test.ts:57:		expect(serveProgramMocks.createServeProgram).toHaveBeenCalledTimes(1);
tests/cli/serve/main-dispatch.test.ts:58:		expect(serveProgramMocks.action).toHaveBeenCalledWith(
tests/cli/serve/main-dispatch.test.ts:68:		serveProgramMocks.createServeProgram.mockImplementation(() => {
tests/cli/serve/main-dispatch.test.ts:76:		process.argv = ["node", "cosmonauts", "serve", "--no-open"];
tests/cli/serve/main-dispatch.test.ts:81:		expect(serveProgramMocks.createServeProgram).toHaveBeenCalledTimes(1);
tests/cli/architecture/subcommand.test.ts:5:	createArchitectureProgram,
tests/cli/architecture/subcommand.test.ts:8:} from "../../../cli/architecture/subcommand.ts";
tests/cli/architecture/subcommand.test.ts:13:} from "../../../lib/architecture-map/index.ts";
tests/cli/architecture/subcommand.test.ts:17:const tmp = useTempDir("architecture-cli-");
tests/cli/architecture/subcommand.test.ts:31:describe("architecture generate CLI rendering", () => {
tests/cli/architecture/subcommand.test.ts:43:				changedFiles: ["memory/architecture/index.md"],
tests/cli/architecture/subcommand.test.ts:50:				"  memory/architecture/index.md",
tests/cli/architecture/subcommand.test.ts:56:				"changedFiles=memory/architecture/index.md",
tests/cli/architecture/subcommand.test.ts:109:describe("architecture generate command", () => {
tests/cli/architecture/subcommand.test.ts:128:		const program = createArchitectureProgram({
tests/cli/architecture/subcommand.test.ts:149:				"Generating architecture map...",
tests/cli/architecture/subcommand.test.ts:150:				"Generating architecture narratives...",
tests/cli/architecture/subcommand.test.ts:160:		const program = createArchitectureProgram({
tests/cli/architecture/subcommand.test.ts:218:			access(join(tmp.path, "memory", "architecture")),
tests/cli/serve/subcommand.test.ts:5:	createServeProgram,
tests/cli/serve/subcommand.test.ts:8:} from "../../../cli/serve/subcommand.ts";
tests/cli/serve/subcommand.test.ts:11:const tmp = useTempDir("serve-command-");
tests/cli/serve/subcommand.test.ts:13:describe("cosmonauts serve command", () => {
tests/cli/serve/subcommand.test.ts:14:	test("starts the read-only artifact viewer server and prints the local URL", async () => {
tests/cli/serve/subcommand.test.ts:17:		const program = createServeProgram({
tests/cli/serve/subcommand.test.ts:32:				throw new Error("serve command did not report startup");
tests/cli/serve/subcommand.test.ts:34:			expect(started.server.listening).toBe(true);
tests/cli/serve/subcommand.test.ts:53:	test("keeps the server running when opening the browser fails @cosmo-behavior plan:code-structure-map#B-020", async () => {
tests/cli/serve/subcommand.test.ts:75:			expect(result.server.listening).toBe(true);
tests/cli/serve/subcommand.test.ts:90:			join(process.cwd(), "cli", "serve", "subcommand.ts"),
tests/cli/serve/subcommand.test.ts:103:		result.server.close((error) => {

exec
/bin/zsh -lc "nl -ba cli/main.ts | sed -n '600,680p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
   600		await interactive.init();
   601		await interactive.run();
   602	}
   603	
   604	function resolveCliAgent(
   605		runtime: CosmonautsRuntime,
   606		options: CliOptions,
   607	): AgentDefinition {
   608		return resolveDefaultLead(runtime, options);
   609	}
   610	
   611	// ============================================================================
   612	// Entry Point
   613	// ============================================================================
   614	
   615	const subcommand = process.argv[2];
   616	const runInvocation = parseRunInvocation(process.argv.slice(2));
   617	if (runInvocation) {
   618		const program = createRunProgram({
   619			runtimeOptions: runInvocation.runtimeOptions,
   620		});
   621		program
   622			.parseAsync(runInvocation.argv, { from: "user" })
   623			.catch((err: unknown) => {
   624				const message = err instanceof Error ? err.message : String(err);
   625				printCliError(message, {}, { prefix: "cosmonauts run" });
   626				process.exitCode = 1;
   627			});
   628	} else if (
   629		subcommand === "task" ||
   630		subcommand === "plan" ||
   631		subcommand === "scaffold" ||
   632		subcommand === "skills" ||
   633		subcommand === "create" ||
   634		subcommand === "install" ||
   635		subcommand === "uninstall" ||
   636		subcommand === "packages" ||
   637		subcommand === "update" ||
   638		subcommand === "eject" ||
   639		subcommand === "export" ||
   640		subcommand === "serve" ||
   641		subcommand === "session" ||
   642		subcommand === "architecture" ||
   643		subcommand === "arch"
   644	) {
   645		const programs: Record<string, () => Command> = {
   646			architecture: createArchitectureProgram,
   647			arch: createArchitectureProgram,
   648			task: createTaskProgram,
   649			plan: createPlanProgram,
   650			scaffold: createScaffoldProgram,
   651			skills: createSkillsProgram,
   652			create: createCreateProgram,
   653			install: createInstallProgram,
   654			uninstall: createUninstallProgram,
   655			packages: createPackagesProgram,
   656			update: createUpdateProgram,
   657			eject: createEjectProgram,
   658			export: createExportProgram,
   659			serve: createServeProgram,
   660			session: createSessionsProgram,
   661		};
   662		// subcommand is guaranteed to be in the map by the if-check above
   663		const createProgram = programs[subcommand];
   664		if (!createProgram) throw new Error(`Unknown subcommand: ${subcommand}`);
   665		const program = createProgram();
   666		program
   667			.parseAsync(process.argv.slice(3), { from: "user" })
   668			.catch((err: unknown) => {
   669				const message = err instanceof Error ? err.message : String(err);
   670				printCliError(message, {}, { prefix: `cosmonauts ${subcommand}` });
   671				process.exitCode = 1;
   672			});
   673	} else {
   674		try {
   675			const options = parseCliArgs(process.argv.slice(2));
   676	
   677			run(options).catch((err: unknown) => {
   678				if (err instanceof GracefulExitError) {
   679					// Benign abort (cancel resume, decline fork) — exit cleanly
   680					return;

codex
I found one contract mismatch in the viewer renderer: the plan says the dependency-free markdown subset includes links, but the inline renderer only handles code spans and escaping. I’m checking whether there are any higher-impact issues before deciding whether that is just a P3 polish gap or a shipping blocker.
exec
/bin/zsh -lc "bun --silent -e 'import { renderArtifactMarkdown } from \"./lib/artifact-viewer/index.ts\"; console.log(renderArtifactMarkdown(\"See [docs](https://example.test) and "'`code`."));'"'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 106ms:
<p>See [docs](https://example.test) and <code>code</code>.</p>

exec
/bin/zsh -lc "nl -ba tests/architecture-map/analyzer.test.ts | sed -n '1,240p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	import { mkdir, writeFile } from "node:fs/promises";
     2	import { join } from "node:path";
     3	import { describe, expect, test } from "vitest";
     4	import {
     5		createProjectSnapshot,
     6		resolveArchitectureMapConfig,
     7		typescriptSourceAnalyzer,
     8	} from "../../lib/architecture-map/index.ts";
     9	import { useTempDir } from "../helpers/fs.ts";
    10	
    11	const tmp = useTempDir("architecture-map-analyzer-");
    12	
    13	describe("typescriptSourceAnalyzer", () => {
    14		test("records public interfaces internal dependencies and external imports @cosmo-behavior plan:code-structure-map#B-003", async () => {
    15			await writeAnalyzerFixture(tmp.path);
    16			const config = await resolveArchitectureMapConfig({
    17				projectRoot: tmp.path,
    18				projectConfig: {
    19					architectureMap: {
    20						sourceRoots: ["src"],
    21						moduleRoots: ["src/barrel", "src/features", "src/shared"],
    22					},
    23				},
    24			});
    25			const snapshot = await createProjectSnapshot({
    26				projectRoot: tmp.path,
    27				config,
    28				analyzer: typescriptSourceAnalyzer,
    29			});
    30	
    31			const result = await typescriptSourceAnalyzer.analyze({
    32				projectRoot: tmp.path,
    33				config,
    34				snapshot,
    35			});
    36	
    37			expect(result.diagnostics).toEqual([]);
    38			const modules = new Map(
    39				result.modules.map((module) => [module.resource, module]),
    40			);
    41			expect([...modules.keys()]).toEqual([
    42				"src/barrel",
    43				"src/features",
    44				"src/shared",
    45			]);
    46	
    47			const barrel = modules.get("src/barrel");
    48			expect(barrel?.hasBarrel).toBe(true);
    49			expect(barrel?.publicInterface.map((item) => item.name).sort()).toEqual([
    50				"PublicBarrel",
    51				"createBarrel",
    52			]);
    53			expect(
    54				barrel?.publicInterface.some((item) => item.name === "HiddenBarrel"),
    55			).toBe(false);
    56	
    57			const features = modules.get("src/features");
    58			expect(features?.hasBarrel).toBe(false);
    59			expect(features?.publicInterface.map((item) => item.name).sort()).toEqual([
    60				"ConsumerApi",
    61				"consumer",
    62			]);
    63			expect(features?.dependencies).toEqual([
    64				{
    65					resource: "src/barrel",
    66					importedBy: ["src/features/consumer.ts"],
    67				},
    68				{
    69					resource: "src/shared",
    70					importedBy: ["src/features/consumer.ts"],
    71				},
    72			]);
    73			expect(features?.externalDependencies).toEqual([
    74				"react",
    75				"unresolved-side-effect",
    76			]);
    77		});
    78	});
    79	
    80	async function writeAnalyzerFixture(projectRoot: string): Promise<void> {
    81		await mkdir(join(projectRoot, "src", "barrel"), { recursive: true });
    82		await mkdir(join(projectRoot, "src", "features"), { recursive: true });
    83		await mkdir(join(projectRoot, "src", "shared"), { recursive: true });
    84		await writeFile(
    85			join(projectRoot, "package.json"),
    86			JSON.stringify({ type: "module" }),
    87			"utf-8",
    88		);
    89		await writeFile(
    90			join(projectRoot, "tsconfig.json"),
    91			JSON.stringify({
    92				compilerOptions: {
    93					target: "ES2023",
    94					module: "ESNext",
    95					moduleResolution: "Bundler",
    96					baseUrl: ".",
    97					paths: {
    98						"@shared/*": ["src/shared/*"],
    99					},
   100					allowImportingTsExtensions: true,
   101					strict: true,
   102				},
   103				include: ["src/**/*.ts"],
   104			}),
   105			"utf-8",
   106		);
   107		await writeFile(
   108			join(projectRoot, "src", "barrel", "index.ts"),
   109			[
   110				'export type { PublicBarrel } from "./public.ts";',
   111				'export { createBarrel } from "./public.ts";',
   112				"",
   113			].join("\n"),
   114			"utf-8",
   115		);
   116		await writeFile(
   117			join(projectRoot, "src", "barrel", "public.ts"),
   118			[
   119				"export interface PublicBarrel {",
   120				"\tid: string;",
   121				"}",
   122				"export function createBarrel(): PublicBarrel {",
   123				'\treturn { id: "barrel" };',
   124				"}",
   125				"",
   126			].join("\n"),
   127			"utf-8",
   128		);
   129		await writeFile(
   130			join(projectRoot, "src", "barrel", "private.ts"),
   131			["export interface HiddenBarrel {", "\tsecret: string;", "}", ""].join(
   132				"\n",
   133			),
   134			"utf-8",
   135		);
   136		await writeFile(
   137			join(projectRoot, "src", "shared", "models.ts"),
   138			["export interface SharedThing {", "\tlabel: string;", "}", ""].join("\n"),
   139			"utf-8",
   140		);
   141		await writeFile(
   142			join(projectRoot, "src", "features", "consumer.ts"),
   143			[
   144				'import React from "react";',
   145				'import "unresolved-side-effect";',
   146				'import { createBarrel } from "../barrel/index.ts";',
   147				'import type { SharedThing } from "@shared/models";',
   148				"export interface ConsumerApi {",
   149				"\tshared: SharedThing;",
   150				"}",
   151				"export const consumer = createBarrel;",
   152				"void React;",
   153				"",
   154			].join("\n"),
   155			"utf-8",
   156		);
   157	}

codex
I found a stronger freshness edge: the analyzer honors TypeScript’s config parser, but the freshness input collector uses plain `JSON.parse` for `extends`. That can miss extended config files when `tsconfig.json` contains comments, which is common. I’m validating that with a temp fixture because this affects stale/current correctness.
exec
/bin/zsh -lc 'tmpdir=$(mktemp -d); mkdir -p "$tmpdir/src/a" "$tmpdir/src/b"; printf '"'{\\n  // comment allowed by TS\\n  \"extends\": \"./tsconfig.base.json\",\\n  \"compilerOptions\": { \"module\": \"ESNext\", \"moduleResolution\": \"Bundler\" }\\n}\\n' > \""'$tmpdir/tsconfig.json"; printf '"'{\"compilerOptions\":{\"baseUrl\":\".\",\"paths\":{\"@b/*\":[\"src/b/*\"]}}}\\n' > \""'$tmpdir/tsconfig.base.json"; printf '"'import { b } from \"@b/index\"; export const a = b;\\n' > \""'$tmpdir/src/a/index.ts"; printf '"'export const b = 1;\\n' > \""'$tmpdir/src/b/index.ts"; ROOT="$tmpdir" bun --silent -e '"'import { resolveArchitectureMapConfig, createProjectSnapshot, typescriptSourceAnalyzer } from \"./lib/architecture-map/index.ts\"; const root=process.env.ROOT; const config=await resolveArchitectureMapConfig({projectRoot: root, projectConfig:{architectureMap:{sourceRoots:[\"src\"]}}}); const snap=await createProjectSnapshot({projectRoot: root, config, analyzer: typescriptSourceAnalyzer}); console.log(JSON.stringify(snap.analyzerConfigFiles));'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 105ms:
["tsconfig.json"]

exec
/bin/zsh -lc 'tmpdir=$(mktemp -d); mkdir -p "$tmpdir/src/a" "$tmpdir/src/b"; printf '"'{\\n  // comment allowed by TS\\n  \"extends\": \"./tsconfig.base.json\",\\n  \"compilerOptions\": { \"module\": \"ESNext\", \"moduleResolution\": \"Bundler\" }\\n}\\n' > \""'$tmpdir/tsconfig.json"; printf '"'{\"compilerOptions\":{\"baseUrl\":\".\",\"paths\":{\"@b/*\":[\"src/b/*\"]}}}\\n' > \""'$tmpdir/tsconfig.base.json"; printf '"'import { b } from \"@b/index\"; export const a = b;\\n' > \""'$tmpdir/src/a/index.ts"; printf '"'export const b = 1;\\n' > \""'$tmpdir/src/b/index.ts"; ROOT="$tmpdir" bun --silent -e '"'import { generateArchitectureMap, typescriptSourceAnalyzer } from \"./lib/architecture-map/index.ts\"; const root=process.env.ROOT; const r=await generateArchitectureMap({projectRoot: root, analyzer: typescriptSourceAnalyzer, configOverrides:{sourceRoots:[\"src\"], narrative:{enabled:false,maxModulesPerRun:20}}}); console.log(JSON.stringify(r));'; grep -n \"src/a ->\" \""'$tmpdir/memory/architecture/index.md"; before=$(grep '"'"'^projectHash:'"' \""'$tmpdir/memory/architecture/index.md"); printf '"'{\"compilerOptions\":{\"baseUrl\":\".\",\"paths\":{\"@b/*\":[\"src/missing/*\"]}}}\\n' > \""'$tmpdir/tsconfig.base.json"; ROOT="$tmpdir" bun --silent -e '"'import { resolveArchitectureMapConfig, checkArchitectureMapFreshness, typescriptSourceAnalyzer } from \"./lib/architecture-map/index.ts\"; const root=process.env.ROOT; const config=await resolveArchitectureMapConfig({projectRoot: root, projectConfig:{architectureMap:{sourceRoots:[\"src\"]}}}); console.log(JSON.stringify(await checkArchitectureMapFreshness({projectRoot:root,config,analyzer:typescriptSourceAnalyzer})));'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 394ms:
{"kind":"written","changedFiles":["memory/architecture/index.md","memory/architecture/modules/src/a.md","memory/architecture/modules/src/b.md"],"pendingModules":["src/a","src/b"]}
{"kind":"stale","oldHash":"e1b778495626650b5eb1acd7c8a1d460c90552dafa12f2fc926c258ee166620a","newHash":"359c544f0a71ca85ffc0d0aa24cfa5696d1eb49ed82af49a2630e9f274b5b7c9"}

codex
The first validation accidentally changed the effective architecture-map config between generate and freshness check, so it correctly went stale for the wrong reason. I’m rerunning with the exact same resolved map config to isolate the extended-tsconfig case.
exec
/bin/zsh -lc 'tmpdir=$(mktemp -d); mkdir -p "$tmpdir/src/a" "$tmpdir/src/b"; printf '"'{\\n  // comment allowed by TS\\n  \"extends\": \"./tsconfig.base.json\",\\n  \"compilerOptions\": { \"module\": \"ESNext\", \"moduleResolution\": \"Bundler\" }\\n}\\n' > \""'$tmpdir/tsconfig.json"; printf '"'{\"compilerOptions\":{\"baseUrl\":\".\",\"paths\":{\"@b/*\":[\"src/b/*\"]}}}\\n' > \""'$tmpdir/tsconfig.base.json"; printf '"'import { b } from \"@b/index\"; export const a = b;\\n' > \""'$tmpdir/src/a/index.ts"; printf '"'export const b = 1;\\n' > \""'$tmpdir/src/b/index.ts"; ROOT="$tmpdir" bun --silent -e '"'import { generateArchitectureMap, typescriptSourceAnalyzer } from \"./lib/architecture-map/index.ts\"; const root=process.env.ROOT; const opts={sourceRoots:[\"src\"], narrative:{enabled:false,maxModulesPerRun:20}}; const r=await generateArchitectureMap({projectRoot: root, analyzer: typescriptSourceAnalyzer, configOverrides:opts}); console.log(JSON.stringify(r));'; printf '{\"compilerOptions\":{\"baseUrl\":\".\",\"paths\":{\"@b/*\":[\"src/missing/*\"]}}}\\n' > \""'$tmpdir/tsconfig.base.json"; ROOT="$tmpdir" bun --silent -e '"'import { resolveArchitectureMapConfig, checkArchitectureMapFreshness, typescriptSourceAnalyzer } from \"./lib/architecture-map/index.ts\"; const root=process.env.ROOT; const config=await resolveArchitectureMapConfig({projectRoot: root, overrides:{sourceRoots:[\"src\"], narrative:{enabled:false,maxModulesPerRun:20}}}); console.log(JSON.stringify(await checkArchitectureMapFreshness({projectRoot:root,config,analyzer:typescriptSourceAnalyzer})));'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 385ms:
{"kind":"written","changedFiles":["memory/architecture/index.md","memory/architecture/modules/src/a.md","memory/architecture/modules/src/b.md"],"pendingModules":["src/a","src/b"]}
{"kind":"current","hash":"e1b778495626650b5eb1acd7c8a1d460c90552dafa12f2fc926c258ee166620a"}

codex
The extended-tsconfig freshness miss is confirmed: with a commented `tsconfig.json`, generation uses the extended config, but freshness does not include the extended file, so changing the base config can still report `current`. I’m checking docs for the single-writer assumption and then I’ll wrap findings.
exec
/bin/zsh -lc "nl -ba docs/architecture-map.md | sed -n '1,180p'" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
     1	# Architecture Map
     2	
     3	Cosmonauts W1 architecture maps are generated TypeScript code-structure records
     4	under `memory/architecture/`. They are derived files: agents and humans can read
     5	them, but source code and `.cosmonauts/config.json` remain the inputs.
     6	
     7	## W1 scope
     8	
     9	W1 supports TypeScript projects only. A project is supported when it has a
    10	`tsconfig.json` or included `.ts`/`.tsx` source files after exclusions. The
    11	mechanical map is generated from source and analyzer/configuration inputs; model
    12	calls are only for optional narrative text in later generator work.
    13	
    14	Generate or refresh the map from the project root:
    15	
    16	```bash
    17	cosmonauts architecture generate
    18	```
    19	
    20	Use `cosmonauts arch generate` as the short alias. Pass `--no-narrative` to
    21	write the mechanical map with pending narrative text instead of calling the
    22	CLI-owned narrative provider. `--json` and `--plain` are available for scripted
    23	output.
    24	
    25	Open the local read-only artifact viewer from the project root:
    26	
    27	```bash
    28	cosmonauts serve
    29	```
    30	
    31	The server renders the architecture map and plans from their markdown source.
    32	It is a live local server only in W1; there is no static export and no file
    33	watching.
    34	
    35	## Generated layout
    36	
    37	Generated bundles use this layout:
    38	
    39	```text
    40	memory/architecture/
    41	  index.md
    42	  modules/<resource>.md
    43	```
    44	
    45	`index.md` is the progressive-disclosure index. Module shards preserve the module
    46	resource where possible, for example `memory/architecture/modules/lib/agents.md`.
    47	Generated W1 bundles never include an OKF `log.md`; `log.md` is reserved for
    48	curated W2+ architecture records where human-authored history is useful.
    49	
    50	## OKF vocabulary
    51	
    52	The architecture map uses OKF v0.1-style markdown with YAML frontmatter. Every
    53	generated record carries the OKF fields `type`, `title`, `description`,
    54	`resource`, `tags`, and `timestamp`.
    55	
    56	Cosmonauts defines this W1 type vocabulary:
    57	
    58	- `code-structure-index` for `memory/architecture/index.md`
    59	- `code-structure-module` for module shard files
    60	
    61	Generated records may also carry project-specific keys such as
    62	`generatorVersion`, `projectHash`, `statFingerprint`, `sourceHash`,
    63	`skeletonHash`, `narrativeStatus`, and `moduleCount`.
    64	
    65	Narrative states are explicit. `generated` means the module has current
    66	narrative text, `reused` means the previous narrative was kept because the
    67	module skeleton did not change, and `pending` means the mechanical spine was
    68	written but narrative text is unavailable for this run. Pending narratives can
    69	be completed by a later refresh when narrative generation is enabled and budget
    70	is available.
    71	
    72	## Config escape hatch
    73	
    74	Projects can add an optional `architectureMap` object to
    75	`.cosmonauts/config.json`:
    76	
    77	```json
    78	{
    79	  "architectureMap": {
    80	    "sourceRoots": ["lib", "cli"],
    81	    "moduleRoots": ["lib/agents"],
    82	    "exclude": ["fixtures"],
    83	    "injectionMaxBytes": 24000,
    84	    "narrative": {
    85	      "enabled": true,
    86	      "maxModulesPerRun": 20
    87	    }
    88	  }
    89	}
    90	```
    91	
    92	Only those primitive fields are accepted. Malformed entries are ignored with
    93	warnings. `sourceRoots`, `moduleRoots`, and `exclude` entries must be
    94	repo-relative paths inside the project root; absolute paths, traversal, and
    95	existing paths that resolve outside the project root are ignored.
    96	
    97	Unrelated project config, such as `domainBindings`, is not part of map
    98	freshness. Only the resolved `architectureMap` section and analyzer inputs that
    99	affect TypeScript source inclusion or module resolution are map-relevant.
   100	
   101	## Freshness
   102	
   103	Freshness has two tiers:
   104	
   105	- Generate-time truth: a content-hash `ProjectSnapshot` compares the persisted
   106	  `projectHash` in `index.md` frontmatter against current source files, resolved
   107	  architecture-map config, and analyzer config files.
   108	- Turn-time check: a cheap stat fingerprint compares the persisted
   109	  `statFingerprint` against a hash of repo-relative path, size, and `mtimeMs` for
   110	  each included source and map-relevant analyzer config file.
   111	
   112	Both tiers are reconstructed from persisted map frontmatter and current disk
   113	state. Correctness does not depend on process-local cache.
   114	
   115	## Viewer limitations
   116	
   117	`cosmonauts serve` is a dependency-free, read-only viewer for local markdown
   118	artifacts. It renders a bounded markdown subset: headings, paragraphs, lists,
   119	links, inline and fenced code, and best-effort tables. Source content is escaped
   120	before rendering; unsupported markdown stays readable instead of becoming active
   121	HTML. The viewer reads task status through read-only APIs and does not scaffold
   122	task files or make plans, reviews, or map shards editable.
   123	
   124	## W1 exclusions
   125	
   126	W1 does not include curated architecture-of-record, drift signals, reuse-scan,
   127	embeddings or vector storage, general agent memory, health metrics, viewer
   128	editing, static viewer export, file watching, polyglot analyzers, or generated
   129	map OKF `log.md` files.

exec
/bin/zsh -lc 'rg -n "single writer|single-writer|concurrent|lock|architecture generate" docs/architecture-map.md lib/architecture-map missions/plans/code-structure-map/plan.md' in /Users/cosmos/Projects/cosmonauts
exec
/bin/zsh -lc "rg -n \"renderInline|\\[|link|href\" lib/artifact-viewer/renderer.ts lib/artifact-viewer/server.ts tests/artifact-viewer" in /Users/cosmos/Projects/cosmonauts
exec
/bin/zsh -lc "rg -n \"JSON.parse\\(|readConfigFile|parseJsonConfigFileContent|collectTsconfigInputs|resolveTsconfigExtends\" lib/architecture-map/analyzer.ts" in /Users/cosmos/Projects/cosmonauts
 succeeded in 0ms:
lib/artifact-viewer/renderer.ts:9:	readonly lines: string[];
lib/artifact-viewer/renderer.ts:36:	const html: string[] = [];
lib/artifact-viewer/renderer.ts:41:		const line = lines[index] ?? "";
lib/artifact-viewer/renderer.ts:63:			lines: [...(pending?.lines ?? []), line],
lib/artifact-viewer/renderer.ts:73:	readonly lines: readonly string[];
lib/artifact-viewer/renderer.ts:76:	readonly html: string[];
lib/artifact-viewer/renderer.ts:96:	if (heading?.[1] && heading[2]) {
lib/artifact-viewer/renderer.ts:117:	lines: readonly string[],
lib/artifact-viewer/renderer.ts:119:	html: string[],
lib/artifact-viewer/renderer.ts:121:	const codeLines: string[] = [];
lib/artifact-viewer/renderer.ts:123:	while (index < lines.length && !lines[index]?.startsWith("```")) {
lib/artifact-viewer/renderer.ts:124:		codeLines.push(lines[index] ?? "");
lib/artifact-viewer/renderer.ts:132:function renderHeading(heading: RegExpMatchArray, html: string[]): void {
lib/artifact-viewer/renderer.ts:133:	const marker = heading[1] ?? "#";
lib/artifact-viewer/renderer.ts:134:	const text = heading[2] ?? "";
lib/artifact-viewer/renderer.ts:136:	html.push(`<h${level}>${renderInline(text.trim())}</h${level}>`);
lib/artifact-viewer/renderer.ts:140:	lines: readonly string[],
lib/artifact-viewer/renderer.ts:142:	html: string[],
lib/artifact-viewer/renderer.ts:144:	const items: string[] = [];
lib/artifact-viewer/renderer.ts:147:		const match = lines[index]?.match(UNORDERED_LIST_PATTERN);
lib/artifact-viewer/renderer.ts:148:		if (!match?.[1]) break;
lib/artifact-viewer/renderer.ts:149:		items.push(`<li>${renderInline(match[1])}</li>`);
lib/artifact-viewer/renderer.ts:156:function flushPending(html: string[], pending: PendingBlock | undefined): void {
lib/artifact-viewer/renderer.ts:166:	html.push(`<p>${renderInline(pending.lines.join("\n"))}</p>`);
lib/artifact-viewer/renderer.ts:180:function renderInline(value: string): string {
lib/artifact-viewer/server.ts:45:	}) => Promise<readonly Plan[]>;
lib/artifact-viewer/server.ts:62:	readonly dependencies: readonly string[];
lib/artifact-viewer/server.ts:66:const PROTECTED_ROUTE_PREFIXES = ["/plans/", "/architecture/modules/"] as const;
lib/artifact-viewer/server.ts:182:			[
lib/artifact-viewer/server.ts:200:		[
lib/artifact-viewer/server.ts:238:		[
lib/artifact-viewer/server.ts:241:			`<p><a href="/architecture/">Back to architecture map</a></p>`,
lib/artifact-viewer/server.ts:254:			? [
lib/artifact-viewer/server.ts:261:			: [
lib/artifact-viewer/server.ts:267:							`<li><a href="/plans/${encodeURIComponent(plan.slug)}">${escapeHtml(plan.title || plan.slug)}</a> <span>${escapeHtml(plan.status)}</span></li>`,
lib/artifact-viewer/server.ts:291:		[
lib/artifact-viewer/server.ts:293:			`<p><a href="/plans/">Back to plans</a></p>`,
lib/artifact-viewer/server.ts:305:	return [
lib/artifact-viewer/server.ts:309:		'<li><a href="/architecture/">Architecture map</a></li>',
lib/artifact-viewer/server.ts:310:		'<li><a href="/plans/">Plans</a></li>',
lib/artifact-viewer/server.ts:316:	return [
lib/artifact-viewer/server.ts:318:		`<a${active === "architecture" ? ' aria-current="page"' : ""} href="/architecture/">Architecture</a>`,
lib/artifact-viewer/server.ts:319:		`<a${active === "plans" ? ' aria-current="page"' : ""} href="/plans/">Plans</a>`,
lib/artifact-viewer/server.ts:334:function renderModuleLinks(modules: readonly GraphModule[]): string {
lib/artifact-viewer/server.ts:336:	return [
lib/artifact-viewer/server.ts:340:				`<li><a href="${escapeHtml(moduleHref(module.resource))}"><code>${escapeHtml(module.resource)}</code></a></li>`,
lib/artifact-viewer/server.ts:346:function renderModuleGraph(modules: readonly GraphModule[]): string {
lib/artifact-viewer/server.ts:352:		...[...columns.values()].map((items) => items.length),
lib/artifact-viewer/server.ts:358:	for (const [depth, depthModules] of columns) {
lib/artifact-viewer/server.ts:373:	return [
lib/artifact-viewer/server.ts:402:	return [
lib/artifact-viewer/server.ts:403:		`<a href="${escapeHtml(moduleHref(module.resource))}">`,
lib/artifact-viewer/server.ts:415:		return [
lib/artifact-viewer/server.ts:423:	return [
lib/artifact-viewer/server.ts:437:		return [
lib/artifact-viewer/server.ts:445:	return [
lib/artifact-viewer/server.ts:450:			([status, count]) =>
lib/artifact-viewer/server.ts:467:function parseModuleGraph(markdown: string): readonly GraphModule[] {
lib/artifact-viewer/server.ts:469:	const modules = new Map<string, string[]>();
lib/artifact-viewer/server.ts:479:		for (const match of markdown.matchAll(/^- `([^`]+)`(?: - .*)?$/gmu)) {
lib/artifact-viewer/server.ts:480:			if (match[1]) modules.set(match[1], []);
lib/artifact-viewer/server.ts:484:	return [...modules.entries()]
lib/artifact-viewer/server.ts:485:		.map(([resource, dependencies]) => ({ resource, dependencies }))
lib/artifact-viewer/server.ts:491:): { readonly resource: string; readonly dependencies: string[] } | undefined {
lib/artifact-viewer/server.ts:492:	const match = line.match(/^- `([^`]+)` -> (.+)$/u);
lib/artifact-viewer/server.ts:493:	if (!match?.[1] || !match[2]) return undefined;
lib/artifact-viewer/server.ts:495:		match[2] === "none"
lib/artifact-viewer/server.ts:496:			? []
lib/artifact-viewer/server.ts:497:			: [...match[2].matchAll(/`([^`]+)`/gu)].map((m) => m[1] ?? "");
lib/artifact-viewer/server.ts:499:		resource: match[1],
lib/artifact-viewer/server.ts:511:	const body: string[] = [];
lib/artifact-viewer/server.ts:520:	modules: readonly GraphModule[],
lib/artifact-viewer/server.ts:522:	const moduleMap = new Map(modules.map((module) => [module.resource, module]));
lib/artifact-viewer/server.ts:552:	modules: readonly GraphModule[],
lib/artifact-viewer/server.ts:554:): ReadonlyMap<number, readonly GraphModule[]> {
lib/artifact-viewer/server.ts:555:	const groups = new Map<number, GraphModule[]>();
lib/artifact-viewer/server.ts:558:		groups.set(depth, [...(groups.get(depth) ?? []), module]);
lib/artifact-viewer/server.ts:561:		[...groups.entries()]
lib/artifact-viewer/server.ts:562:			.sort(([left], [right]) => left - right)
lib/artifact-viewer/server.ts:563:			.map(([depth, depthModules]) => [
lib/artifact-viewer/server.ts:592:	return [
lib/artifact-viewer/server.ts:600:		'body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;margin:0;color:#202124;background:#fafafa}',
lib/artifact-viewer/server.ts:636:		/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(?<path>[^?#]*)/iu,
lib/artifact-viewer/server.ts:638:	const path = originForm ?? url.split(/[?#]/u, 1)[0] ?? "/";
tests/artifact-viewer/render.test.ts:7:			[
tests/artifact-viewer/server.test.ts:109:					labels: ["plan:viewer-plan"],
tests/artifact-viewer/server.test.ts:140:		for (const url of [
tests/artifact-viewer/loaders.test.ts:25:			description: [
tests/artifact-viewer/loaders.test.ts:56:		const documents = await Promise.all([
tests/artifact-viewer/loaders.test.ts:72:		expect(documents[0]?.html).not.toContain("<img");
tests/artifact-viewer/loaders.test.ts:73:		expect(documents[0]?.html).toContain("&lt;img src=x onerror=alert(2)&gt;");
tests/artifact-viewer/loaders.test.ts:78:			["# Supported", "", "1. <script>unsupported()</script>"].join("\n"),
tests/artifact-viewer/loaders.test.ts:131:					labels: ["plan:status-plan"],
tests/artifact-viewer/loaders.test.ts:143:					labels: ["plan:other"],
tests/artifact-viewer/loaders.test.ts:155:		expect(status.tasks.map((task) => task.id)).toEqual(["TASK-001"]);
tests/artifact-viewer/loaders.test.ts:156:		expect(status.counts["In Progress"]).toBe(1);
tests/artifact-viewer/loaders.test.ts:170:					labels: ["plan:status-plan"],
tests/artifact-viewer/loaders.test.ts:182:					labels: ["plan:other"],
tests/artifact-viewer/loaders.test.ts:207:		expect(status.tasks.map((task) => task.id)).toEqual(["TASK-001"]);
tests/artifact-viewer/loaders.test.ts:214:		const roots = ["lib/architecture-map", "lib/plans", "lib/tasks"];
tests/artifact-viewer/loaders.test.ts:215:		const offenders: string[] = [];
tests/artifact-viewer/loaders.test.ts:221:		expect(offenders).toEqual([]);
tests/artifact-viewer/loaders.test.ts:227:	offenders: string[],

 succeeded in 0ms:
docs/architecture-map.md:17:cosmonauts architecture generate
missions/plans/code-structure-map/plan.md:61:- Expected: `missions/plans/code-structure-map/analysis-tools-audit.md` contains findings plus a `Substrate recommendation` section that explicitly allows or blocks map analyzer adapter implementation
missions/plans/code-structure-map/plan.md:70:- Action: the user runs `cosmonauts architecture generate`
missions/plans/code-structure-map/plan.md:90:- Action: the user runs `cosmonauts architecture generate` again
missions/plans/code-structure-map/plan.md:130:- Action: `cosmonauts architecture generate` encounters the failure
missions/plans/code-structure-map/plan.md:140:- Action: the user runs `cosmonauts architecture generate`
missions/plans/code-structure-map/plan.md:160:- Action: the user runs `cosmonauts architecture generate`
missions/plans/code-structure-map/plan.md:191:- Expected: the viewer renders the map index, module graph, module page links, freshness banner, and per-module pages from markdown; without a map it renders an empty state pointing to `cosmonauts architecture generate`
missions/plans/code-structure-map/plan.md:260:- Action: the user runs `cosmonauts architecture generate`
missions/plans/code-structure-map/plan.md:474:6. Use fixed sibling names (e.g. `memory/.architecture.tmp/`, `memory/.architecture.bak/`). At the start of every generate, detect leftovers from a crashed prior run and recover before doing any work: a leftover backup alongside a missing or incomplete canonical directory is restored; leftover temp directories are deleted. W1 assumes a single writer — there is no lock; concurrent generates are documented as unsupported.
missions/plans/code-structure-map/plan.md:485:cosmonauts architecture generate [--no-narrative] [--json] [--plain]
missions/plans/code-structure-map/plan.md:540:- **Analysis substrate remains gated.** The design fixes the analyzer output contract but not the concrete adapter until `analysis-tools-audit.md` records the recommendation. Provisional path is TypeScript compiler API; if used in the published CLI, move `typescript` from `devDependencies` to `dependencies` and update `bun.lock`.
missions/plans/code-structure-map/plan.md:556:- `docs/architecture-map.md` (new) — OKF type vocabulary, generated file layout, and `cosmonauts architecture generate` usage.
missions/plans/code-structure-map/plan.md:558:- `bun.lock` — update only if package dependency placement changes.
missions/plans/code-structure-map/plan.md:580:- `cli/architecture/subcommand.ts` (new) — `cosmonauts architecture generate` / `arch generate` command.
missions/plans/code-structure-map/plan.md:640:5. **Add `cosmonauts architecture generate` and the CLI-owned narrative provider (B-002, B-009).** Wire CLI output modes and unsupported/failure exit behavior. Do not add serve behavior in this step.

 succeeded in 0ms:
41:	await collectTsconfigInputs(projectRoot, "tsconfig.json", inputs, new Set());
125:	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
128:	const parsed = ts.parseJsonConfigFileContent(
438:async function collectTsconfigInputs(
454:		parsed = JSON.parse(raw);
460:		const extendedPath = resolveTsconfigExtends(
466:			await collectTsconfigInputs(projectRoot, extendedPath, inputs, seen);
506:function resolveTsconfigExtends(

codex
**Findings**

P2 - [lib/architecture-map/analyzer.ts:450](/Users/cosmos/Projects/cosmonauts/lib/architecture-map/analyzer.ts:450)  
`collectTsconfigInputs()` uses `JSON.parse()` to discover `extends`, while the actual analyzer uses TypeScript’s config parser at [lib/architecture-map/analyzer.ts:125](/Users/cosmos/Projects/cosmonauts/lib/architecture-map/analyzer.ts:125). A commented `tsconfig.json` with `extends: "./tsconfig.base.json"` is valid TypeScript config and is honored by generation, but the freshness input collector fails to parse it and excludes `tsconfig.base.json` from both `projectHash` and `statFingerprint`. Changing aliases/module resolution in the base config can therefore leave the map reporting `current` even though analyzer output would change. This violates B-007 and the two-tier freshness guarantee for analyzer config changes.

P3 - [lib/artifact-viewer/renderer.ts:180](/Users/cosmos/Projects/cosmonauts/lib/artifact-viewer/renderer.ts:180)  
The viewer docs promise markdown links in the supported subset, but `renderInline()` only handles code spans and escaping. A plan line like `See [docs](https://example.test)` renders as literal bracket syntax, not a clickable link. This is not an XSS issue, but it misses the documented viewer contract at [docs/architecture-map.md:117](/Users/cosmos/Projects/cosmonauts/docs/architecture-map.md:117).

DO-NOT-SHIP
tokens used
185,089
**Findings**

P2 - [lib/architecture-map/analyzer.ts:450](/Users/cosmos/Projects/cosmonauts/lib/architecture-map/analyzer.ts:450)  
`collectTsconfigInputs()` uses `JSON.parse()` to discover `extends`, while the actual analyzer uses TypeScript’s config parser at [lib/architecture-map/analyzer.ts:125](/Users/cosmos/Projects/cosmonauts/lib/architecture-map/analyzer.ts:125). A commented `tsconfig.json` with `extends: "./tsconfig.base.json"` is valid TypeScript config and is honored by generation, but the freshness input collector fails to parse it and excludes `tsconfig.base.json` from both `projectHash` and `statFingerprint`. Changing aliases/module resolution in the base config can therefore leave the map reporting `current` even though analyzer output would change. This violates B-007 and the two-tier freshness guarantee for analyzer config changes.

P3 - [lib/artifact-viewer/renderer.ts:180](/Users/cosmos/Projects/cosmonauts/lib/artifact-viewer/renderer.ts:180)  
The viewer docs promise markdown links in the supported subset, but `renderInline()` only handles code spans and escaping. A plan line like `See [docs](https://example.test)` renders as literal bracket syntax, not a clickable link. This is not an XSS issue, but it misses the documented viewer contract at [docs/architecture-map.md:117](/Users/cosmos/Projects/cosmonauts/docs/architecture-map.md:117).

DO-NOT-SHIP
