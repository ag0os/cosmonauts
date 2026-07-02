---
title: 'Derived code-structure map + riders (architectural-memory W1)'
status: active
createdAt: '2026-07-02T15:03:57.000Z'
updatedAt: '2026-07-02T18:28:22.000Z'
---

## Summary

W1 of the `architectural-memory` capability track
(`missions/architecture/architectural-memory.md`): a **derived, always-fresh
code-structure map** — dependency tree + public interfaces as the mechanical
spine, per-module narrative regenerated lazily — sharded as markdown so agents
load an index by default and pull module detail on demand, instead of
re-scanning the codebase every session. Bundled riders (agreed 2026-06-18):
the **`analysis-tools` audit** (spike) and the **`artifact-viewer`** HTML
rendering of the map + plans for humans.

Memory records and map shards adopt the **OKF (Open Knowledge Format) v0.1
conventions** as the record format — ratified 2026-07-02 and recorded in both
memory-track architecture docs. Also decided 2026-07-02: the map is tracked
under `memory/architecture/`; sharding is module-level/directory-based with a
config escape hatch (barrels define the public interface where present); and
the `analysis-tools` audit is sequenced early, gating the generator's tooling
choice. See spec Assumptions.

This plan is spec-ready and awaits planner design.

## Scope

The derived map (generation, freshness, sharded markdown, agent consumption),
the static-analysis audit spike, and the HTML view for the map + plans.
Curated architecture-of-record (W2), reuse-scan (W3), embedding retrieval
(W4), drift detection, health metrics, and the shared memory-interface
extraction (lands in `agent-memory` W1) are out of scope. Implementation
details are deferred to the planner.
