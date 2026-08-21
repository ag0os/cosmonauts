---
type: trade-off
title: Deduplicate tests without hiding their intent
description: >-
  Prefer local builders and parameterized symmetric cases; accept small
  repetition when broader helpers would obscure assertion-specific data.
resource: >-
  knowledge/fallow-temp-exceptions-cleanup/trade-off-deduplicate-tests-without-hiding-their-intent-4c010f540d1c.md
tags:
  - duplication
  - fixtures
  - readability
  - testing
timestamp: '2026-04-29T13:10:03.623Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/fallow-temp-exceptions-cleanup/plan.md
date: '2026-04-29T13:10:03.623Z'
---
Static-analysis cleanup can make tests less readable if repeated setup is replaced by broad, highly configurable fixtures. Share a test helper when setup repeats across at least three call sites or files and represents a stable concept. Otherwise prefer a file-local builder, a table for symmetric cases, or a small inline collapse. Keep assertion-specific values visible in each test. The accepted cost is some remaining local repetition in exchange for diagnostic failures and one-concept-per-test readability.
