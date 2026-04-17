---
id: COSMO-049
title: Update workflow tests for empty default workflows
status: Done
priority: high
assignee: worker
labels:
  - testing
  - 'plan:local-vs-shared'
dependencies:
  - COSMO-048
createdAt: '2026-03-06T14:49:33.228Z'
updatedAt: '2026-03-06T15:05:11.442Z'
---

## Description

After `DEFAULT_WORKFLOWS` becomes an empty array, many tests in `tests/workflows/workflow-loader.test.ts` will fail because they assume built-in workflows exist. Rewrite these tests to:

1. Test that `loadWorkflows()` returns an empty array when no config file exists (empty defaults)
2. Test that `loadWorkflows()` returns only project-config-defined workflows when a config file is present
3. Test that `resolveWorkflow()` throws for any name when no config exists
4. Test that `resolveWorkflow()` works for project-config-defined workflows
5. Remove or rewrite tests that reference `DEFAULT_WORKFLOWS[0]` or assert `DEFAULT_WORKFLOWS.length > 0`

Key test rewrites needed in `tests/workflows/workflow-loader.test.ts`:
- "returns defaults when no config file exists" → assert empty array
- "loads and merges from project config.json" → assert only config-defined workflows (no +1 for defaults)
- "project config overrides built-in on name collision" → rewrite to test config-only behavior or remove (no built-ins to override)
- "empty config returns defaults only" → assert empty array
- "config with only skills and no workflows returns defaults" → assert empty array
- "resolves a built-in workflow by name" → rewrite to resolve a project-config workflow
- "listWorkflows returns same result as loadWorkflows" → still valid, just verifies empty or config-based

All other test files (`tests/cli/main.test.ts`, `tests/config/loader.test.ts`) do not reference `DEFAULT_WORKFLOWS` and should not need changes.

<!-- AC:BEGIN -->
- [x] #1 All tests in `tests/workflows/workflow-loader.test.ts` pass with `DEFAULT_WORKFLOWS` as an empty array
- [x] #2 Tests verify that `loadWorkflows()` returns an empty array when no project config exists
- [x] #3 Tests verify that `loadWorkflows()` returns only project-config-defined workflows
- [x] #4 Tests verify that `resolveWorkflow()` throws when no workflows are defined (no config)
- [x] #5 `bun run test` passes with zero failures
<!-- AC:END -->

## Implementation Notes

All 10 workflow tests pass with DEFAULT_WORKFLOWS as empty array. Test rewrites were done in COSMO-048.\n\nFixed 3 archive test failures in tests/plans/archive.test.ts caused by COSMO-047's ensureForgeDirectory changes (which now pre-creates memory/ and missions/archive/ directories). The tests had assertions that those directories didn't exist before archivePlan was called, but taskManager.init() now creates them. Removed stale pre-condition assertions and updated the safety-check test to verify the specific plan wasn't archived rather than asserting the archive directory doesn't exist.\n\nFull suite: 567/567 tests pass, zero failures."
