# Architectural Memory — Forward Architecture & Roadmap

**Status:** Forward source of truth for cosmonauts' **architectural (code-knowledge)
memory** — repo-scoped knowledge about the codebase. Companion to the
`architectural-memory` roadmap entry. **Absorbs** the former Prioritized items
`architecture-of-record`, `reuse-scan`, `embedding-memory`, and the former Idea
`architecture-viz` (its derived-map half). **Distinct from general/operational
agent memory** (profile, playbooks, episodic log) — that is a *sibling track*
with its own doc; it shares the "memory" philosophy but differs in scope (user vs.
repo) and lifecycle (self-authored vs. derived/curated). Last updated 2026-06-09.

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

## The axes that stay distinct (structure, not separate systems)

- **Lifecycle:** derived (regenerated from code, never authored) vs. curated
  (distilled / edited) vs. distilled (per-plan bundles).
- **Volatility:** always-fresh-derived vs. stable-curated — drives
  caching/invalidation (the code map's cache-on-hash spine + lazy narrative).

## Forward waves

Sequenced; the roadmap carries the next slice.

- **W1 — Derived code-structure map** *(active slice → `architectural-memory`)*.
  Mechanical spine (dependency tree + public interfaces) always-fresh via
  cache-on-hash; narrative "what each module does" blurbs regenerated lazily **only
  when a module's skeleton changes**. Sharded markdown: `architecture/index.md`
  (always loaded) + per-module shards (on demand) — agents stop re-scanning the
  repo. Build on existing TS tooling (dependency-cruiser / ts-morph / typedoc);
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
layering violations vs. the record).

## Open decisions

- Retrieval default: curated-record-first vs. embedding-first vs. both.
- Whether the HTML/diagram + health-analysis presentation layer is part of this
  track or a later standalone "presentation" track.
- W1 sharding/granularity: module vs. file vs. class resolution.
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
