---
type: convention
title: Explicit packages own their external tool policy
description: >-
  A package with an explicit prompt must declare its target-safe tool policy
  instead of inheriting an internal agent's tools silently.
resource: >-
  knowledge/external-agent-orchestration/convention-explicit-packages-own-their-external-tool-policy-000375673764.md
tags:
  - agent-packaging
  - convention
  - least-privilege
  - tool-policy
timestamp: '2026-05-12T14:49:53.204Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-agent-orchestration/plan.md
date: '2026-05-12T14:49:53.204Z'
---
Treat tool permissions as part of the reviewed external package contract. Source-agent metadata may supply provenance and model defaults, but explicit package definitions must state their own tool preset and may provide an exact target-specific allowlist; an exact allowlist replaces rather than merges with preset mapping. Automatic tool-policy copying is reserved for shorthand normalization where the source prompt itself is being exported.
