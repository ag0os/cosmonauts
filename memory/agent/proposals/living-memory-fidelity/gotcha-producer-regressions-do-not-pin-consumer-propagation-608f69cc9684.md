---
type: gotcha
title: Producer regressions do not pin consumer propagation
description: >-
  Tests that prove a producer emits a field can all stay green while each
  consumer independently drops or reconstructs that field incorrectly.
resource: >-
  knowledge/living-memory-fidelity/gotcha-producer-regressions-do-not-pin-consumer-propagation-608f69cc9684.md
tags:
  - consumer-contracts
  - mutation-testing
  - result-propagation
  - testing
timestamp: '2026-09-09T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/living-memory-fidelity/review-16.md
date: '2026-09-09T00:00:00.000Z'
---
For every result field whose value crosses a seam, test both ownership and propagation. Producer tests should prove the operation computes the fact correctly; separate consumer tests should mutate or revert each consumer mapping one at a time and fail if the value is dropped, replaced, or inferred. A green direct-store or direct-adapter test says nothing about what the public result eventually reports.
