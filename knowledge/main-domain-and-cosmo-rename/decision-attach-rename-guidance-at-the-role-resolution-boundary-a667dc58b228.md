---
type: decision
title: Attach rename guidance at the role-resolution boundary
description: >-
  Migration hints for renamed workflow roles belong where unresolved roles are
  rejected, not in syntax parsing.
resource: >-
  knowledge/main-domain-and-cosmo-rename/decision-attach-rename-guidance-at-the-role-resolution-boundary-a667dc58b228.md
tags:
  - boundaries
  - errors
  - migration
  - workflows
timestamp: '2026-05-04T20:34:45.584Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/sessions/main-domain-and-cosmo-rename/worker-c04771a7-1397-486b-9d4a-4bb19833a9db.transcript.md
date: '2026-05-04T20:34:45.584Z'
---
Keep workflow parsers concerned with syntax. When a legacy role name can no longer resolve, append a targeted migration hint at the execution or role-resolution boundary that raises the unknown-role error. Preserve the base error text for compatibility, add the hint only for the retired name, and test that both replacement identities appear.
