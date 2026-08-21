---
type: decision
title: Plan locks and repository commit locks protect different scopes
description: >-
  Run exclusivity is plan-scoped, while mutating version-control operations
  require a separate repository-scoped lock.
resource: >-
  knowledge/external-backends-and-cli/decision-plan-locks-and-repository-commit-locks-protect-different-scopes-e47c42eaeb93.md
tags:
  - concurrency
  - git
  - locking
  - state-ownership
timestamp: '2026-08-21T14:48:03.813Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-backends-and-cli/review.md
date: '2026-08-21T14:48:03.813Z'
---
Use two locks with distinct lifetimes. Hold a plan lock for the complete run to prevent concurrent runs for the same plan. Hold a repository commit lock only around staging and commit operations to serialize runs from different plans that share a repository. A plan-scoped lock alone cannot prevent index-lock races, mixed staging, or commits that accidentally include another run's changes.
