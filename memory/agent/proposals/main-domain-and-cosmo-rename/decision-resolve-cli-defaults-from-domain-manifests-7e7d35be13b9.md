---
type: decision
title: Resolve CLI defaults from domain manifests
description: >-
  Default-agent routing derives from declared domain leads instead of hardcoded
  agent names.
resource: >-
  knowledge/main-domain-and-cosmo-rename/decision-resolve-cli-defaults-from-domain-manifests-7e7d35be13b9.md
tags:
  - cli
  - domains
  - manifests
  - routing
timestamp: '2026-05-04T20:41:27.063Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/sessions/main-domain-and-cosmo-rename/worker-bef40570-c70c-4ec4-b985-9d19c8aef4fb.transcript.md
date: '2026-05-04T20:41:27.063Z'
---
Resolve a CLI entry agent in this order: an explicit agent selection, the selected domain's declared lead, the main domain's declared lead, then the first installed non-infrastructure domain with a lead. If no lead exists, return a clear error. Every CLI path that chooses an agent—including interactive startup, initialization, and prompt dumping—must use the same resolver so adding or renaming a domain lead does not require scattered CLI edits.
