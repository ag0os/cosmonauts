---
type: decision
title: Domain ID conflicts are precedence-sensitive and provenance-rich
description: >-
  Equal-precedence active providers with one domain ID conflict, while
  unequal-precedence providers retain customization semantics.
resource: >-
  knowledge/domain-authoring/decision-domain-id-conflicts-are-precedence-sensitive-and-provenance-rich-1f0f7492ec33.md
tags:
  - conflicts
  - domains
  - loading
  - precedence
  - provenance
timestamp: '2026-06-23T21:05:57.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/domain-authoring/plan.md
date: '2026-06-23T21:05:57.000Z'
---
Track origin, precedence, source kind, and root for every loaded provider. If two active providers declare the same domain identifier at equal precedence, fail explicitly and name both origins. If precedence differs, preserve the established merge, replace, or skip customization policy and combine provenance in precedence order. A blanket duplicate-ID rejection would break intentional overrides; silent equal-precedence merging would make execution source-dependent and opaque.
