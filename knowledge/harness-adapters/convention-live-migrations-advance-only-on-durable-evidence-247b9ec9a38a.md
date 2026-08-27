---
type: convention
title: Live migrations advance only on durable evidence
description: >-
  Each live-state migration phase must be durably complete and independently
  checkable before the next, riskier phase begins.
resource: >-
  knowledge/harness-adapters/convention-live-migrations-advance-only-on-durable-evidence-247b9ec9a38a.md
tags:
  - evidence
  - harness-adapters
  - migration
  - sequencing
timestamp: '2026-08-26T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/harness-adapters/repo-export-validation-evidence.json
date: '2026-08-26T00:00:00.000Z'
---
Order live migrations from recoverable local state toward broader personal state, and gate each transition on re-read durable evidence plus a zero selected check. For this subsystem the sequence was repository-owned copies, then the personal bundle, then the personal command set. Retain backups and pending intent until the evidence receipt is verified; a successful in-memory operation or transient check is not enough to authorize the next migration.
