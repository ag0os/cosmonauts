---
type: decision
title: Role binding preserves requested and resolved identities
description: >-
  A stable role qualifier may redirect to another active domain, but execution
  identity must not overwrite the caller's requested identity.
resource: >-
  knowledge/domain-authoring/decision-role-binding-preserves-requested-and-resolved-identities-b4d06d0f7fd4.md
tags:
  - authorization
  - bindings
  - domains
  - identity
  - orchestration
timestamp: '2026-06-23T21:05:57.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/domain-authoring/plan.md
date: '2026-06-23T21:05:57.000Z'
---
Resolve a qualified reference in two stages: retain the requested role and asset identifier, then derive the bound target domain and resolved identifier. Carry both through authorization, orchestration, persistence, diagnostics, and display. Authorization should accept configured references according to the requested identity while also understanding the resolved target; durable work should persist both so resumes remain auditable. Treat the configured default domain as a role too, so bindings apply consistently to default leads, chains, and model settings as well as explicit qualified references.
