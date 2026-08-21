---
type: decision
title: Treat shared as a special final fallback
description: >-
  The shared domain is universally available but remains the final fallback and
  sole owner of framework-wide base prompt resources.
resource: >-
  knowledge/package-system/decision-treat-shared-as-a-special-final-fallback-d14e3bfecbf8.md
tags:
  - domains
  - prompts
  - resource-resolution
  - shared
timestamp: '2026-04-01T03:32:49.716Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/package-system/plan.md
date: '2026-04-01T03:32:49.716Z'
---
Do not model shared as an ordinary portable provider whose position can vary. It must resolve after the agent domain and all portable domains, while framework-wide base and runtime-template resources resolve directly from shared. This preserves a stable baseline without preventing installed domains from specializing agent-scoped resources.
