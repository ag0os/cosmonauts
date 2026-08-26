---
type: decision
title: Read-only check observes pending recovery without performing it
description: >-
  Verification reports recovery-pending state as non-current but never acquires
  locks or mutates transaction artifacts.
resource: >-
  knowledge/harness-adapters/decision-read-only-check-observes-pending-recovery-without-performing-it-4c29c67382e3.md
tags:
  - check
  - harness-adapters
  - read-only
  - recovery
timestamp: '2026-08-26T18:35:52.964Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/harness-adapters/review.md
date: '2026-08-26T18:35:52.964Z'
---
Keep check and repair as separate operations. A check may double-read manifest and journal around target observation to detect concurrent change, but it must not create roots, acquire write locks, update timestamps, reconcile journals, or clean backups. Pending, ambiguous, evidence-required, or concurrently changing state is reported nonzero for a later normal sync or migration driver to resolve.
