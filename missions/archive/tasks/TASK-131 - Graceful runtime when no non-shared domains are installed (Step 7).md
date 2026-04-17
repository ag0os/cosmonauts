---
id: TASK-131
title: Graceful runtime when no non-shared domains are installed (Step 7)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:framework-extraction'
dependencies: []
createdAt: '2026-03-30T18:19:41.602Z'
updatedAt: '2026-03-30T18:25:11.538Z'
---

## Description

Update `lib/runtime.ts` (and the domain validator if applicable) so that `CosmonautsRuntime.create()` does not throw or crash when only the `shared` domain is found. Meta commands (`install`, `uninstall`, `packages`, `create`, `update`) must work without any coding domain installed.

**Worktree:** All file operations in `/Users/cosmos/Projects/cosmonauts-extraction/`. Do NOT touch `/Users/cosmos/Projects/cosmonauts/`.

**Work:**
1. Find any assertion or error in `lib/runtime.ts` or `lib/domains/validator.ts` that requires at least one non-shared domain to be present
2. Remove or relax that assertion so the runtime initializes successfully with only `shared`
3. Ensure the validator does not flag an empty non-shared domain list as an error
4. Add a test in `tests/runtime.test.ts` that constructs a runtime with only the `shared` domain and verifies it does not throw

## Implementation Plan

AC1 ✓ — CosmonautsRuntime.create() already succeeds with only shared domain (no assertion to remove).
AC2 ✓ — validateDomains() produces zero diagnostics for shared-only config.
AC3 ✓ — Added 5 tests in "no installed domains (only shared)" describe block in tests/runtime.test.ts.
AC4 ✓ — All 1086 existing tests continue to pass.

<!-- AC:BEGIN -->
- [ ] #1 CosmonautsRuntime.create() succeeds when only the shared domain is present
- [ ] #2 Domain validator does not error on a zero non-shared domain configuration
- [ ] #3 A test in tests/runtime.test.ts covers the no-domain-installed scenario and passes
- [ ] #4 All existing runtime tests continue to pass
<!-- AC:END -->

## Implementation Notes

No assertion requiring non-shared domains existed in lib/runtime.ts or lib/domains/validator.ts — the runtime already handled the shared-only case correctly. The validator only checks invariants on domains that ARE present; an empty non-shared domain list produces zero diagnostics.

The sole gap was AC3: no dedicated test for this scenario. Added a "no installed domains (only shared)" describe block in tests/runtime.test.ts with 5 tests covering: create() resolves, shared-only domain registry, empty agent registry, empty workflows, and clean validator output. All 1086 tests pass. Lint errors/warnings are pre-existing and unrelated to this task.
