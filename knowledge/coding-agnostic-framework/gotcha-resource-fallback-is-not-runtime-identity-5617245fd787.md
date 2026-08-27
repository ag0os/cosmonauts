---
type: gotcha
title: Resource fallback is not runtime identity
description: >-
  Applying a default domain to resource lookup must not silently qualify a
  domainless agent's runtime identity.
resource: >-
  knowledge/coding-agnostic-framework/gotcha-resource-fallback-is-not-runtime-identity-5617245fd787.md
tags:
  - agents
  - authorization
  - domains
  - identity
timestamp: '2026-06-29T20:14:59.444Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/coding-agnostic-framework/plan.md
date: '2026-06-29T20:14:59.444Z'
---
A domain fallback used to locate prompts, extensions, capabilities, or requester-visible skills is a resource-selection mechanism, not an identity rewrite. Compute one fallback domain for those resource operations, but preserve the agent definition's original qualification when constructing authorization, registry, or runtime identity markers. Conflating the two can make synthetic unqualified agents appear to belong to the default domain and alter orchestration authorization behavior.
