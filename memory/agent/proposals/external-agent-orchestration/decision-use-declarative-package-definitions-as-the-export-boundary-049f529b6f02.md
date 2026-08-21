---
type: decision
title: Use declarative package definitions as the export boundary
description: >-
  External-agent exports compile from a target-aware package definition rather
  than directly from an internal runtime agent definition.
resource: >-
  knowledge/external-agent-orchestration/decision-use-declarative-package-definitions-as-the-export-boundary-049f529b6f02.md
tags:
  - agent-packaging
  - architecture
  - export
  - runtime-boundary
timestamp: '2026-05-12T14:49:53.204Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-agent-orchestration/plan.md
date: '2026-05-12T14:49:53.204Z'
---
Treat the human-reviewable package definition as the source of truth for every external export, including agent-ID shorthand that first normalizes into a definition. Keep internal agent definitions runtime-neutral, and place external prompt, tool, skill, and target choices in the package artifact. This creates one authoring boundary for multiple runtimes without contaminating internal orchestration contracts with exporter-specific flags.
