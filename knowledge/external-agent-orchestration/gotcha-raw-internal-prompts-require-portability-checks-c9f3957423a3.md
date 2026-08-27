---
type: gotcha
title: Raw internal prompts require portability checks
description: >-
  An internal agent prompt may depend on orchestration capabilities that do not
  exist in an exported runtime.
resource: >-
  knowledge/external-agent-orchestration/gotcha-raw-internal-prompts-require-portability-checks-c9f3957423a3.md
tags:
  - agent-packaging
  - compatibility
  - external-runtime
  - prompts
timestamp: '2026-05-12T14:49:53.204Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-agent-orchestration/plan.md
date: '2026-05-12T14:49:53.204Z'
---
Before exporting a source agent's prompt unchanged, reject dependencies on unavailable extensions, subagents, or orchestration-backed capabilities and report every incompatible feature. Do not reject the source agent as provenance when the package supplies an explicit external-safe prompt; the compatibility gate applies to raw prompt reuse, not metadata reuse. Directing users toward a reviewed explicit prompt avoids binaries that instruct the model to call nonexistent tools.
