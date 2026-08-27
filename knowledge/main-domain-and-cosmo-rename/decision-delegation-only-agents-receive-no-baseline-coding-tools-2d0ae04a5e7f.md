---
type: decision
title: Delegation-only agents receive no baseline coding tools
description: >-
  An orchestration-only agent should start with no filesystem or shell tools and
  receive only explicitly registered extension tools.
resource: >-
  knowledge/main-domain-and-cosmo-rename/decision-delegation-only-agents-receive-no-baseline-coding-tools-2d0ae04a5e7f.md
tags:
  - agents
  - least-privilege
  - orchestration
  - tools
timestamp: '2026-05-04T21:09:14.040Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/main-domain-and-cosmo-rename/plan.md
date: '2026-05-04T21:09:14.040Z'
---
Set a delegation-only executive's baseline tool pack to none rather than reusing a coding pack. Task, planning, spawning, and observability tools may still enter through explicit extension registration. This keeps the orchestrator useful while preventing accidental read, shell, edit, or write access and reducing its blast radius.
