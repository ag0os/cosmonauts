---
type: convention
title: Separate runtime cwd from temporary prompt assets
description: >-
  An exported coding agent runs in the caller's working directory while
  generated prompt assets live in a unique temporary directory.
resource: >-
  knowledge/external-agent-orchestration/convention-separate-runtime-cwd-from-temporary-prompt-assets-691518d1d8d1.md
tags:
  - cwd
  - external-runtime
  - lifecycle
  - temporary-files
timestamp: '2026-05-12T14:49:53.204Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-agent-orchestration/plan.md
date: '2026-05-12T14:49:53.204Z'
---
Pass the invocation's working directory explicitly from the caller so runtime tools operate on the intended project. Use temporary directories only for materialized embedded assets, expose cleanup as part of the materialized invocation contract, and invoke cleanup in a finally path after normal exit or spawn failure. Never use the asset directory as an implicit working directory.
