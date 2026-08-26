---
type: decision
title: Transaction identity follows the canonical mutation root
description: >-
  Locks, journals, and manifests are keyed by the resolved owner root rather
  than caller-facing target and scope labels.
resource: >-
  knowledge/harness-adapters/decision-transaction-identity-follows-the-canonical-mutation-root-b8fa7aeaed16.md
tags:
  - filesystem
  - harness-adapters
  - locking
  - transactions
timestamp: '2026-08-26T18:35:52.947Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/harness-adapters/review-4.md
date: '2026-08-26T18:35:52.947Z'
---
Derive one transaction identity from the resolved canonical owner-root path and serialize every mutation beneath that root through it. Do not key locks by request labels such as target and scope, because distinct labels can resolve to the same filesystem root—for example when a project root is also the user's home. A request spanning aliased labels must become one transaction over one manifest, not concurrent transactions with independent journals.
