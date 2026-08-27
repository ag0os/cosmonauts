---
type: convention
title: Resolve exact saved names before permissive expression syntax
description: >-
  When a token can be both a registry name and valid DSL, exact registry matches
  take precedence.
resource: >-
  knowledge/orchestration-surface-consolidation/convention-resolve-exact-saved-names-before-permissive-expression-syntax-1c84062e557a.md
tags:
  - cli
  - dsl
  - name-resolution
  - registry
timestamp: '2026-06-06T14:31:22.801Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/orchestration-surface-consolidation/plan.md
date: '2026-06-06T14:31:22.801Z'
---
For a command accepting either a saved definition or a raw expression, perform exact saved-name lookup first, then fall back to expression parsing. Reserve command words only in the ambiguous positional form, and provide an explicit name-only option so a valid saved item that collides with a command word remains addressable without DSL fallback.
