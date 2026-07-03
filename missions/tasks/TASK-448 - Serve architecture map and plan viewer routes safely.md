---
id: TASK-448
title: Serve architecture map and plan viewer routes safely
status: To Do
priority: medium
labels:
  - frontend
  - backend
  - api
  - testing
  - 'plan:code-structure-map'
dependencies:
  - TASK-447
createdAt: '2026-07-03T14:13:51.698Z'
updatedAt: '2026-07-03T14:13:51.698Z'
---

## Description

Implementation order step 7, viewer HTTP routes. Behavior ownership: owns B-014, B-015, and B-017 only. Implement the dependency-free local artifact viewer server on top of the read-only loader/render foundation, including architecture map pages, plan pages, deterministic module graph rendering, honest empty states, and traversal rejection before artifact reads. Planned-behavior tests must carry markers for the owned behavior IDs.

<!-- AC:BEGIN -->
- [ ] #1 B-014: architecture routes render the map index, freshness banner, deterministic module graph with module links, and per-module markdown pages when `memory/architecture/` exists.
- [ ] #2 B-014: architecture routes render an honest missing-map empty state pointing to `cosmonauts architecture generate` when no generated map exists.
- [ ] #3 B-015: plan routes render a navigable plan list and plan pages with plan, optional spec, optional review, and read-only task-status sections.
- [ ] #4 B-015: missing plans or missing task config render honest empty states and do not create or modify `missions/tasks/config.json` or scaffold directories.
- [ ] #5 B-017: `/plans/...` and architecture module routes reject decoded or encoded traversal-like input with a client error before plan, review, task, or shard filesystem reads occur.
- [ ] #6 The viewer remains a markdown-rendering presentation edge only: no edit capability, no static export, no file watching, no markdown/HTML/graph runtime dependencies.
- [ ] #7 Tests for B-014, B-015, and B-017 carry the required `@cosmo-behavior plan:code-structure-map#...` markers.
- [ ] #8 The viewer's per-request freshness banner is computed by comparing the recorded stat fingerprint (turn-time tier), never by full-tree content hashing per HTTP request.
<!-- AC:END -->
