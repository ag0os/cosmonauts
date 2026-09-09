---
type: decision
title: Mutation facts belong to the durable primitive
description: >-
  Every idempotent durable mutator returns whether this invocation actually
  mutated durable state, and callers carry that fact without reconstruction.
resource: >-
  knowledge/living-memory-fidelity/decision-mutation-facts-belong-to-the-durable-primitive-3aa2d41e0f40.md
tags:
  - api-contracts
  - commit-reporting
  - durability
  - idempotency
timestamp: '2026-09-09T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/living-memory-fidelity/plan.md
date: '2026-09-09T00:00:00.000Z'
---
Define durable operations so their result distinguishes domain success from mutation by the current invocation. An exclusive publish can succeed because identical bytes already exist, removal can succeed because the target is absent, and restoration can succeed because restoration already happened; none proves a new commit. The operation that observes the mutation point must return the mutation fact, stores must preserve it in their own results, and aggregators must OR the carried facts. Never infer commitment from a status label, result-array length, final state, or lack of an exception.
