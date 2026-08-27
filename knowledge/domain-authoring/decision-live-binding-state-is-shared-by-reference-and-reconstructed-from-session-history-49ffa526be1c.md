---
type: decision
title: >-
  Live binding state is shared by reference and reconstructed from session
  history
description: >-
  Cached runtimes and interactive commands must share one project-scoped mutable
  binding store whose state can be replayed.
resource: >-
  knowledge/domain-authoring/decision-live-binding-state-is-shared-by-reference-and-reconstructed-from-session-history-49ffa526be1c.md
tags:
  - bindings
  - domains
  - persistence
  - runtime-cache
  - session-state
timestamp: '2026-06-23T21:05:57.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/domain-authoring/plan.md
date: '2026-06-23T21:05:57.000Z'
---
A live binding switch must mutate a project-scoped store held by reference by all runtimes, including independently cached orchestration runtimes; copying a binding map at runtime construction makes later switches invisible. Persist successful switches as session entries and replay the latest valid entry per role when a session starts or resumes. Ignore stale or invalid entries with a warning rather than inventing a fallback. Process-global access is only a bridge: session history and project config remain the reconstructable sources of truth.
