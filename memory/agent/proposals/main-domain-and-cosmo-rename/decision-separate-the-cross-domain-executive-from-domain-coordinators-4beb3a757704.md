---
type: decision
title: Separate the cross-domain executive from domain coordinators
description: >-
  Use a dedicated top-level executive that delegates directly to specialists,
  while each domain retains its own coordinator for domain-focused sessions.
resource: >-
  knowledge/main-domain-and-cosmo-rename/decision-separate-the-cross-domain-executive-from-domain-coordinators-4beb3a757704.md
tags:
  - agents
  - architecture
  - delegation
  - domains
timestamp: '2026-05-04T21:09:14.040Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/main-domain-and-cosmo-rename/plan.md
date: '2026-05-04T21:09:14.040Z'
---
A cross-domain executive and a domain coordinator are different roles and should be represented by different agents. The executive owns cross-domain routing and delegates directly to qualified specialists; it should not add a redundant hop through a domain coordinator. Domain coordinators remain the default entry point when users explicitly enter that domain and can apply domain-specific discipline and tools.
