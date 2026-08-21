---
type: convention
title: Single-source internal and packaged skill filtering
description: >-
  Source-agent package mode must reuse the same effective project-skill
  filtering logic as internal sessions.
resource: >-
  knowledge/external-agent-orchestration/convention-single-source-internal-and-packaged-skill-filtering-e7ef7b9e0e45.md
tags:
  - agent-packaging
  - filtering
  - single-source
  - skills
timestamp: '2026-05-12T00:55:53.354Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/sessions/external-agent-orchestration/worker-2d18a049-33bd-42a2-bd6a-e1b8b5bfb3b2.transcript.md
date: '2026-05-12T00:55:53.354Z'
---
Extract effective skill-filter computation into a shared helper and call it from both internal session assembly and package-time source-agent selection. Preserve shared skills under project-level allowlists, tolerate absent shared names, and retain undefined as the meaning of no configured filter. Duplicating this policy causes exported shorthand agents to lose skills that their internal counterparts still receive.
