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
