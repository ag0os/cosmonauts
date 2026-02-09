---
id: COSMO-015
title: Write chain runner tests
status: Done
priority: medium
labels:
  - orchestration
  - testing
dependencies:
  - COSMO-012
createdAt: '2026-02-09T19:09:30.797Z'
updatedAt: '2026-02-09T19:19:11.096Z'
---

## Description

Create tests/orchestration/chain-runner.test.ts. Tests for the chain runner and agent spawner. Use mocked Pi sessions (mock createAgentSession). Test pipeline execution, loop execution, completion detection, error handling, abort. Follow existing test patterns.

<!-- AC:BEGIN -->
- [x] #1 Tests for pipeline stage execution (sequential, single-pass)
- [x] #2 Tests for loop stage execution (repeat until done or max)
- [x] #3 Tests for completion detection (all tasks Done)
- [x] #4 Tests for error handling (stage failure stops chain)
- [x] #5 Tests for abort signal support
- [x] #6 All tests use mocked Pi sessions, no real LLM calls
<!-- AC:END -->
