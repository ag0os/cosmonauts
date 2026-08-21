---
type: convention
title: Make test-decoupling inventories executable
description: >-
  A migration ledger should classify every current source match and be enforced
  by a test that detects unclassified or improperly moved references.
resource: >-
  knowledge/coding-agnostic-framework/convention-make-test-decoupling-inventories-executable-77e4edfce8f8.md
tags:
  - conformance
  - migration
  - source-scans
  - testing
timestamp: '2026-06-29T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/coding-agnostic-framework/test-decoupling-ledger.md
date: '2026-06-29T00:00:00.000Z'
---
Generate a ledger from a fresh repository search and assign every matching test or helper an allowed disposition: retained domain-content coverage, synthetic explicit-domain behavior, intentional compatibility/catalog coverage, or false positive. An executable validator should compare current matches to the ledger, require rationale for every row, and assert that deferred content tests still use the real asset until their owning wave. This prevents both hidden coupling and premature migration from being concealed by reclassification.
