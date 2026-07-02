# Architectural Memory — Forward Architecture & Roadmap

**Status:** Forward source of truth for cosmonauts' **architectural (code-knowledge)
memory** — repo-scoped knowledge about the codebase. Companion to the
`architectural-memory` roadmap entry. **Absorbs** the former Prioritized items
`architecture-of-record`, `reuse-scan`, `embedding-memory`, and the former Idea
`architecture-viz` (its derived-map half). **Distinct from general/operational
agent memory** (profile, playbooks, episodic log) — that is a *sibling track*
with its own doc; it shares the "memory" philosophy but differs in scope (user vs.
repo) and lifecycle (self-authored vs. derived/curated). Last updated 2026-07-02.

## The basic idea

Durable, retrievable knowledge **about the codebase** — its structure, the
decisions behind it, and the history of what was built — so agents and humans
don't lose the thread as agents write the code. Repo-scoped. One framework for
capture, retrieval, hygiene, and prompt-injection; typed records tagged by facet
and lifecycle. Targets *any* project cosmonauts runs in.

## Facets (what we remember)

1. **Code structure** — *actual* (a derived map: dependency tree + public
   interfaces, mechanical, always-fresh) **and** *intended* (architecture-of-record:
   module map, dependency *rules*, public contracts, curated). Divergence between
   the two is the **drift signal**.
2. **Decisions & rationale** — ADRs, conventions, trade-offs, distilled from plans.
3. **Work history** — per-plan distilled knowledge bundles (`memory/<slug>`).

> Operational/personal memory — profile, playbooks, and the episodic log of what
> agents *did* — belongs to the sibling **general agent-memory** track, not here.

## Cross-cutting machinery

- **Capture** — derived-scan (code structure), distiller (decisions / work history).
- **Retrieval** — semantic search (embedding) over records + curated single-source
  (the record) + on-demand sharded loading (per-module). `reuse-scan` is the
  *design-time discipline* that queries this at planning time.
- **Hygiene** — consolidation, pruning, temporal decay; human-legible and
  overridable.
- **Injection** — into prompt assembly for planner, plan-reviewer, coordinator,
  worker, quality-manager.

## Record format — OKF (decided 2026-07-02)

Memory records and derived-map shards conform to **OKF v0.1** (Open Knowledge
Format, github.com/GoogleCloudPlatform/knowledge-catalog): markdown + YAML
frontmatter (`type` required; `title`, `description`, `resource`, `tags`,
`timestamp` recommended), reserved `index.md` (progressive disclosure — the
same index-then-detail pattern the sharded map uses) and `log.md`, relative
links as untyped relationship edges. Cosmonauts defines its own `type`
vocabulary and custom frontmatter keys (e.g. the source hash driving
cache-on-hash) on top — OKF explicitly tolerates both. **Convention only:**
OKF standardizes what the files look like; retrieval, freshness, hygiene, and
injection remain this track's machinery. One record format shared with general
agent memory (`agent-memory.md`).

## The axes that stay distinct (structure, not separate systems)

- **Lifecycle:** derived (regenerated from code, never authored) vs. curated
  (distilled / edited) vs. distilled (per-plan bundles).
- **Volatility:** always-fresh-derived vs. stable-curated — drives
  caching/invalidation (the code map's cache-on-hash spine + lazy narrative).

## Forward waves

Sequenced; the roadmap carries the next slice.

- **W1 — Derived code-structure map** *(planned 2026-07-02 →
  `missions/plans/code-structure-map/`, bundling the `analysis-tools` audit +
  `artifact-viewer` riders)*. Mechanical spine (dependency tree + public
  interfaces) always-fresh via cache-on-hash; narrative "what each module does"
  blurbs regenerated lazily **only when a module's skeleton changes**. Sharded
  markdown, OKF-conformant: `memory/architecture/index.md` (tracked; always
  loaded) + per-module shards (on demand) — agents stop re-scanning the repo.
  Build on existing TS tooling (dependency-cruiser / ts-morph / typedoc) — the
  bundled audit's substrate recommendation gates the tooling choice;
  tree-sitter for polyglot later.
- **W2 — Architecture-of-record (curated/intended).** Distiller merges durable
  decisions (`type: decision | convention | trade-off`) into a living
  `memory/architecture.md`; planners load it; `plan-reviewer` checks
  design-vs-record consistency; `cosmonauts memory rebuild` reconstructs it from
  archived knowledge bundles. **Divergence from W1 = drift signal.**
- **W3 — reuse-scan discipline.** A mandatory, evidenced reuse check in plans
  (small skill loaded by the planners); queries W1/W2 at design time; adds a
  **Reuse Analysis** plan section + a `plan-reviewer` dimension.
- **W4 — Semantic retrieval (embedding).** SQLite + vector columns over
  KnowledgeRecords; local (Ollama) / API backends; auto-injection at
  prompt-assembly; temporal decay. The **data-capture layer is already built**
  (session-lineage writes KnowledgeRecord JSONL during plan execution) — remaining
  work is the query + injection pipeline.

**Deferred presentation layer** (on top of W1's graph, off the critical path):
human HTML / interactive graph (`cosmonauts arch serve`) + Mermaid diagrams;
**health metrics** (cyclic deps, god-modules, orphan files, churn hotspots,
layering violations vs. the record). The HTML/diagram half is delivered by the
cross-cutting **`artifact-viewer`** roadmap Idea (human HTML views for plans +
architecture); the health-analysis stays here.

## Open decisions

- Retrieval default: curated-record-first vs. embedding-first vs. both.
- Health-analysis presentation depth here vs. the shared `artifact-viewer` Idea,
  which owns the human HTML/diagram rendering for plans + architecture.
- ~~W1 sharding/granularity~~ — **decided 2026-07-02** (W1 spec): module-level,
  directory-based module roots with a config escape hatch; barrel (`index.ts`)
  exports define the public interface where present. Map is **tracked**, under
  `memory/architecture/` (beside distilled knowledge; W2's record lands adjacent,
  keeping the drift-signal pair together).
- Storage plumbing shared with the general agent-memory track or separate — the
  shared **memory interface** (`write`/`retrieve`/`consolidate`) is defined in
  `agent-memory.md`; this track is a consumer of it (same mechanism, different
  scope/lifecycle). Retrieval here (incl. any embeddings) routes through that
  interface — don't build a second one.

## Consolidation ledger

- **Absorbs Prioritized:** `architecture-of-record` (→ W2), `reuse-scan` (→ W3),
  `embedding-memory` (→ W4).
- **Absorbs Ideas:** `architecture-viz` (derived-map half → W1; web viz + health
  analysis → deferred presentation layer).
- **Sibling track, NOT absorbed:** general/operational agent memory (profile,
  playbooks, episodic) — its own doc + roadmap entry.
