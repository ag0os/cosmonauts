---
type: convention
title: 'Use own, portable, shared resource resolution tiers'
description: >-
  Agent-scoped resource lookup checks the agent's domain first, portable domains
  in deterministic discovery order next, and shared last.
resource: >-
  knowledge/package-system/convention-use-own-portable-shared-resource-resolution-tiers-aba8064ae7c8.md
tags:
  - domains
  - portable-domains
  - precedence
  - resource-resolution
timestamp: '2026-08-21T14:58:05.107Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/package-system/spec.md
date: '2026-08-21T14:58:05.107Z'
---
Apply the same three-tier order to capabilities, extensions, reusable personas, and relevant skill discovery: the requesting agent's domain, then every portable domain in discovery order, then the shared baseline. First match wins. Keeping one order across resource kinds makes overrides predictable and prevents each consumer from inventing different fallback behavior.
