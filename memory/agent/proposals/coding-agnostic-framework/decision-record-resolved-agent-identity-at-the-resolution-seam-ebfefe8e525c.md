---
type: decision
title: Record resolved agent identity at the resolution seam
description: >-
  When durable runs must prove routing, emit requested and resolved agent
  identities where resolution occurs and carry that observation into run
  activity.
resource: >-
  knowledge/coding-agnostic-framework/decision-record-resolved-agent-identity-at-the-resolution-seam-ebfefe8e525c.md
tags:
  - agents
  - durability
  - observability
  - orchestration
timestamp: '2026-06-29T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/coding-agnostic-framework/dogfood-drive-verification.md
date: '2026-06-29T00:00:00.000Z'
---
A successful run or requested role does not prove which qualified agent executed. If existing artifacts cannot expose routing, emit a minimal informational observation at the existing resolution seam containing both the requested role and resolved qualified agent id, then map it into durable run activity without adding another resolution path. Keep listener failures isolated and test that resolution behavior is unchanged. Treat this observability addition as an explicit scope decision when the original work otherwise excludes runtime changes.
