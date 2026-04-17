---
id: TASK-125
title: 'CLI: --plugin-dir flag for session-only package loading'
status: Done
priority: medium
assignee: worker
labels:
  - cli
  - 'plan:package-system'
dependencies:
  - TASK-119
  - TASK-121
createdAt: '2026-03-28T20:36:43.069Z'
updatedAt: '2026-03-28T20:56:48.016Z'
---

## Description

Add `--plugin-dir <path>` (repeatable) flag to `cli/main.ts` argument parsing. Parsed plugin dirs are passed to `CosmonautsRuntime.create()` as `pluginDirs`. This causes the scanner to include those directories as highest-precedence sources for the session without any store installation. Update `cli/session.ts` if needed. No new test file required — update existing `tests/cli/` coverage.

<!-- AC:BEGIN -->
- [x] #1 cli/main.ts parses --plugin-dir as a repeatable string option
- [x] #2 Multiple --plugin-dir flags accumulate into an array
- [x] #3 The collected pluginDirs array is forwarded to CosmonautsRuntime.create()
- [x] #4 Domains from --plugin-dir paths are available during the session at highest precedence
- [ ] #5 --plugin-dir paths that do not contain a valid package manifest produce a clear error message
<!-- AC:END -->

## Implementation Notes

Second worker failure: worker (spawnId 987550c5) reported success and claimed all ACs checked and status set to Done, but task_view shows status still "In Progress" and all ACs unchecked. The underlying code changes are believed to be present (--plugin-dir flag in cli/main.ts, pluginDirs forwarded to CosmonautsRuntime.create(), manifest-missing error, CLI tests updated). Needs human review to verify the implementation and manually check off ACs.
