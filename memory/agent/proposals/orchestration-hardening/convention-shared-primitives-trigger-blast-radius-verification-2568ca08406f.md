---
type: convention
title: Shared primitives trigger blast-radius verification
description: >-
  Changing a shared resolver, validator, helper, or error path requires
  enumerating existing callers and preserving each caller's observable
  semantics.
resource: >-
  knowledge/orchestration-hardening/convention-shared-primitives-trigger-blast-radius-verification-2568ca08406f.md
tags:
  - blast-radius
  - regression
  - shared-primitives
  - verification
timestamp: '2026-06-24T17:56:25.128Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/tasks/TASK-407 - Add a blast-radius review lens for new
  shared primitives (verifierreviewerQM).md
date: '2026-06-24T17:56:25.128Z'
---
Review a new or modified shared primitive through its pre-existing call sites, not only through the feature behaviors that motivated it. At every affected caller, check whether throw, return, empty-result, warning, and fallback behavior changed, then add a regression test at each caller whose semantics are exposed. This blast-radius lens catches regressions that behavior-scoped verification misses when common code silently changes old flows.
