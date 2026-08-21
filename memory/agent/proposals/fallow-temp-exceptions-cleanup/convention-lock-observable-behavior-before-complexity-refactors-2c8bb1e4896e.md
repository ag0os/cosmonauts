---
type: convention
title: Lock observable behavior before complexity refactors
description: >-
  Each complexity-only refactor must first prove its current responsibilities
  through behavior tests, including important errors and edge cases.
resource: >-
  knowledge/fallow-temp-exceptions-cleanup/convention-lock-observable-behavior-before-complexity-refactors-2c8bb1e4896e.md
tags:
  - behavior-preservation
  - characterization-tests
  - refactoring
  - verification
timestamp: '2026-04-29T13:10:03.623Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/fallow-temp-exceptions-cleanup/plan.md
date: '2026-04-29T13:10:03.623Z'
---
Before removing a complexity suppression, identify the function's observable responsibilities and run tests that characterize them. Add missing cases before changing structure, then run the same focused tests after the refactor and the full verification suite afterward. Private functions and command callbacks do not need test-only exports when their behavior can be exercised through an existing public boundary. Coverage must include realistic failure and edge behavior, not only successful execution.
