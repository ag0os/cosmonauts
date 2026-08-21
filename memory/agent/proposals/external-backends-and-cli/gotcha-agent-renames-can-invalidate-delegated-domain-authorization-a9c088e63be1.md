---
type: gotcha
title: Agent renames can invalidate delegated domain authorization
description: >-
  Renaming a domain lead without migrating caller identity and routing can make
  every delegation mechanism fail before work starts.
resource: >-
  knowledge/external-backends-and-cli/gotcha-agent-renames-can-invalidate-delegated-domain-authorization-a9c088e63be1.md
tags:
  - agent-identity
  - domains
  - migration
  - orchestration
timestamp: '2026-08-21T14:48:03.819Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/sessions/external-backends-and-cli/coordinator-fcaf1f39-a753-4e8b-9d36-13c0b00d5a0c.transcript.md
date: '2026-08-21T14:48:03.819Z'
---
Domain authorization is part of orchestration state, not merely display naming. When a lead agent is renamed or moved between domains, update registered agent identities, parent-session routing, chain callers, and driver authorization together. Add a smoke test that the executive can delegate one coding task after the migration. In this plan's sessions, direct spawning, chains, and driver execution all failed with the same stale lead identity, producing repeated retries and no task commits.
