---
id: COSMO-014
title: Write chain parser tests
status: Done
priority: medium
labels:
  - orchestration
  - testing
dependencies:
  - COSMO-010
createdAt: '2026-02-09T19:09:26.949Z'
updatedAt: '2026-02-09T19:16:21.338Z'
---

## Description

Create tests/orchestration/chain-parser.test.ts. Comprehensive tests for the chain DSL parser. Test pipeline expressions, loop expressions, combined expressions, edge cases, error cases. Follow existing test patterns from tests/tasks/.

<!-- AC:BEGIN -->
- [x] #1 Tests for simple pipeline parsing (a -> b -> c)
- [x] #2 Tests for loop parsing (agent:N)
- [x] #3 Tests for combined expressions
- [x] #4 Tests for edge cases: whitespace, single stage, empty
- [x] #5 Tests for error cases: invalid expressions, malformed input
<!-- AC:END -->
