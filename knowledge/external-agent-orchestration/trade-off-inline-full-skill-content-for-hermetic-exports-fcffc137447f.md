---
type: trade-off
title: Inline full skill content for hermetic exports
description: >-
  Embedding complete selected skill bodies makes exported agents self-contained
  at the cost of larger eager prompts.
resource: >-
  knowledge/external-agent-orchestration/trade-off-inline-full-skill-content-for-hermetic-exports-fcffc137447f.md
tags:
  - agent-packaging
  - hermeticity
  - skills
  - trade-off
timestamp: '2026-05-12T14:49:53.204Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-agent-orchestration/plan.md
date: '2026-05-12T14:49:53.204Z'
---
When the external runtime cannot load project skills on demand, package complete skill markdown with metadata removed rather than only a skill index. Support all established skill layouts, fail on missing explicit selections, and deduplicate by discovery precedence. Accept prompt growth and changed eager-loading behavior in exchange for a binary that remains useful without the source repository; defer plugin or lazy skill delivery until its runtime contract is proven.
