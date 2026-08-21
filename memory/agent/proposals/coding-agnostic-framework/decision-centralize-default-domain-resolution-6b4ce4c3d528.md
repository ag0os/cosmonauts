---
type: decision
title: Centralize default-domain resolution
description: >-
  Domainless framework operations use one resolver that prefers an explicit
  domain, otherwise selects the framework default only when it is actually
  installed.
resource: >-
  knowledge/coding-agnostic-framework/decision-centralize-default-domain-resolution-6b4ce4c3d528.md
tags:
  - architecture
  - defaults
  - domains
  - error-handling
timestamp: '2026-06-29T20:14:59.444Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/coding-agnostic-framework/plan.md
date: '2026-06-29T20:14:59.444Z'
---
Define default-domain semantics in one framework-owned helper rather than repeating fallback literals at call sites. The contract should return an explicit domain unchanged; when a loaded domain registry is available, it should verify that the default domain exists and otherwise raise an actionable error requiring an explicit domain; when no registry is available, it may return the conventional default and let the subsequent file-specific lookup report missing resources. Use a source-scan test to prevent local fallback logic from reappearing.
