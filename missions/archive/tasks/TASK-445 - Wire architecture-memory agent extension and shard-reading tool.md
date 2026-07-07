---
id: TASK-445
title: Wire architecture-memory agent extension and shard-reading tool
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:code-structure-map'
dependencies:
  - TASK-444
createdAt: '2026-07-03T14:13:28.751Z'
updatedAt: '2026-07-03T16:05:25.979Z'
---

## Description

Implementation order step 6. Behavior ownership: owns B-012, B-013, and B-019 only. Add the shared architecture-memory extension, register it only for the five consuming coding agents, and enforce the runtime auto-load guard so pi-package auto-loading leaves all other agents inert. Planned-behavior tests must carry markers for the owned behavior IDs.

<!-- AC:BEGIN -->
- [ ] #1 B-012: planner, plan-reviewer, coordinator, worker, and quality-manager receive one non-accumulating architecture-map index context message with a current/stale/missing freshness banner for mapped projects.
- [ ] #2 B-013: the `architecture_map_read` tool returns the current index when no module is requested and reads named module shards by `resource` with freshness status when a valid module is requested.
- [ ] #3 B-013: unknown modules return a helpful available-module list and traversal attempts are rejected without reading outside `memory/architecture/`.
- [ ] #4 B-019: oversized index injection respects `architectureMap.injectionMaxBytes`, includes freshness, truncates honestly, and tells the agent to call `architecture_map_read` for the full index or module shards.
- [ ] #5 Exactly the five specified agent definitions load `architecture-memory`; no other bundled agents are silently widened into scope.
- [ ] #6 The extension is inert for non-consuming agents even when auto-loaded by a Pi host, including no context injection and no tool registration unless explicitly enabled.
- [ ] #7 Tests for B-012, B-013, and B-019 carry the required `@cosmo-behavior plan:code-structure-map#...` markers.
- [ ] #8 Turn-time freshness for injection compares only the stat fingerprint recorded in index frontmatter — full-tree content hashing never runs on agent turns; a test asserts the content-hash tier is not invoked by the extension.
<!-- AC:END -->
