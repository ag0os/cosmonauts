# Code-Structure Map — Forward Architecture & Roadmap

**Status:** Forward source of truth for the **derived code-structure map** —
the mechanical, regenerated-from-code half of what `architectural-memory.md`
used to cover. Carved out 2026-08-18 when that doc's curated facets merged into
`knowledge-and-memory.md`. The boundary is lifecycle: everything here is
**derived, never authored** — regenerated from the code, safe to delete, never
curated. Curated knowledge (decisions, conventions, work history, the intended
architecture) lives in `knowledge-and-memory.md`.

## What shipped (W1, 2026-07-03)

The derived map (`cosmonauts architecture generate`) — archived at
`missions/archive/plans/code-structure-map/`, distilled to
`memory/code-structure-map.md`:

- Mechanical spine (dependency tree + public interfaces) always-fresh via
  **cache-on-hash**; narrative "what each module does" blurbs regenerated
  lazily, only when a module's skeleton changes.
- Sharded OKF markdown under `memory/architecture/`: tracked `index.md`
  (always loaded for the five consuming agents) + per-module shards on demand.
- Sharding decided 2026-07-02: module-level, directory-based module roots with
  a config escape hatch; barrel (`index.ts`) exports define the public
  interface where present.
- Substrate: the TypeScript compiler API (selected by the bundled
  `analysis-tools` audit); tree-sitter remains the polyglot path later.
- Retrieval routes through the shared memory interface
  (`write`/`retrieve`/`consolidate`) — retrofitted in memory-interface W1;
  don't build a second retrieval path.

## The drift signal

The map is the *actual* structure. The *intended* structure — module map,
dependency rules, public contracts — is a curated knowledge record
(`knowledge-and-memory.md`, intended-architecture record class). Divergence
between the two is the **drift signal**. The comparison spans both docs by
design: derived half here, curated half there.

## Forward work

- **reuse-scan** *(formerly architectural-memory W3)* — a mandatory, evidenced
  reuse check in plans: a small skill loaded by the planners that queries the
  map and the knowledge surface at design time; adds a **Reuse Analysis** plan
  section + a `plan-reviewer` dimension. Queries both surfaces; homed here
  because its cheap, mechanical evidence source is the map.
- **Presentation layer** *(deferred; the HTML/diagram half is delivered by the
  cross-cutting `artifact-viewer` roadmap Idea)* — human HTML / interactive
  graph + Mermaid diagrams over the map.
- **Health metrics** *(stays here)* — cyclic deps, god-modules, orphan files,
  churn hotspots, layering violations vs. the intended-architecture record.
- **Polyglot** — tree-sitter (or equivalent) behind the same map contract when
  a non-TypeScript project needs it.

## Open decisions

- Health-analysis presentation depth here vs. `artifact-viewer`, which owns the
  human HTML/diagram rendering for plans + architecture.
- When (if ever) the polyglot substrate is worth building — driven by a real
  non-TS project, not speculation.

## Lineage

- Carved out of `architectural-memory.md` (deleted 2026-08-18); that doc's
  facets 2–3 (decisions & rationale, work history), W2
  (architecture-of-record), and W4 (semantic retrieval) merged into
  `knowledge-and-memory.md` — see its §8 lineage ledger.
- W1 absorbed the `architecture-viz` Idea's derived-map half and bundled the
  `analysis-tools` audit + `artifact-viewer` first slices.

## Cross-links

- `missions/architecture/knowledge-and-memory.md` — the curated half: knowledge
  records, retrieval, consolidation, and the intended-architecture record this
  map diffs against.
- `memory/code-structure-map.md` — distilled record of the shipped W1.
- `missions/archive/plans/code-structure-map/` — the archived plan, including
  the `analysis-tools` audit that selected the substrate.
