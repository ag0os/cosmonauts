---
type: decision
title: Domain visibility is default-public with an explicit internal deny-list
description: >-
  Hide cross-domain assets only when the provider names them under the
  corresponding internal asset type.
resource: >-
  knowledge/domain-authoring/decision-domain-visibility-is-default-public-with-an-explicit-internal-deny-list-1ee3b85b7ab2.md
tags:
  - api-contract
  - domains
  - validation
  - visibility
timestamp: '2026-06-23T21:05:57.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/domain-authoring/plan.md
date: '2026-06-23T21:05:57.000Z'
---
Model provider visibility as a per-asset-type deny-list for agents, skills, and chains. If the visibility declaration or one of its asset-type lists is absent, every asset in that category remains public; if present, only named assets are hidden from outside consumers, while the owner domain retains access. Validate that every hidden name actually exists, and report internal access separately from not-found. This choice prevents an omitted export declaration from silently breaking consumers and avoids name collisions across asset categories.
