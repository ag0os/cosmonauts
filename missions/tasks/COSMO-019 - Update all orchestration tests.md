---
id: COSMO-019
title: Update all orchestration tests
status: Done
priority: high
labels:
  - orchestration
  - testing
dependencies:
  - COSMO-018
createdAt: '2026-02-09T19:30:34.517Z'
updatedAt: '2026-02-09T19:34:36.788Z'
---

## Description

Update chain-parser.test.ts and chain-runner.test.ts to match the refactored types and behavior. Remove iteration count tests, add role lifecycle tests, update runner tests for loop-until-done behavior and safety caps.

<!-- AC:BEGIN -->
- [x] #1 Parser tests updated: no colon tests, simple name parsing
- [x] #2 Runner tests updated: loop-until-done, safety caps, timeout
- [x] #3 All tests pass
- [x] #4 Typecheck passes
<!-- AC:END -->
