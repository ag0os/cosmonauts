---
type: decision
title: 'Binding precedence is live, then project, then same-name'
description: >-
  Resolve domain roles through live overrides first, persistent project bindings
  second, and same-named domains by default.
resource: >-
  knowledge/domain-authoring/decision-binding-precedence-is-live-then-project-then-same-name-ff37893a4bed.md
tags:
  - bindings
  - configuration
  - domains
  - resolution
timestamp: '2026-06-23T21:05:57.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/domain-authoring/plan.md
date: '2026-06-23T21:05:57.000Z'
---
Use one binding resolver for every domain-aware runtime path. For a role, apply a valid live-session override first, then a project-configured binding, and finally default to the role's own name. Validate the selected target against the active domain registry and report both role and target when unavailable. Do not require target domains to expose an identical shape; missing assets remain ordinary use-time resolution errors.
