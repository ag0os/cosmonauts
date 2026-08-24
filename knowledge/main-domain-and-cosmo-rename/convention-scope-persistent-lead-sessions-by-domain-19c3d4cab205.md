---
type: convention
title: Scope persistent lead sessions by domain
description: >-
  Domain leads use domain-scoped session directories, while non-leads use
  agent-scoped directories.
resource: >-
  knowledge/main-domain-and-cosmo-rename/convention-scope-persistent-lead-sessions-by-domain-19c3d4cab205.md
tags:
  - cli
  - domains
  - persistence
  - sessions
timestamp: '2026-05-04T20:39:43.229Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/sessions/main-domain-and-cosmo-rename/worker-72b977ff-79af-4807-8f15-be86d1f90dde.transcript.md
date: '2026-05-04T20:39:43.229Z'
---
For persistent sessions, map each domain lead to `<session-root>/<domain>/` and each non-lead to `<session-root>/<agent-id>/`. Determine lead status from the domain manifest rather than a literal agent name. This preserves continuous history for each lead while preventing history bleed when multiple domains have their own leads.
