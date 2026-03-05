---
id: COSMO-037
title: Adopt type-safe and readable assertion patterns
status: Done
priority: medium
assignee: worker
labels:
  - forge
  - testing
  - quality
  - 'plan:test-suite-standardization'
dependencies:
  - COSMO-034
createdAt: '2026-03-04T20:32:10.000Z'
updatedAt: '2026-03-04T21:14:27.145Z'
---

## Description

Improve maintainability and signal quality in tests by using compile-time type assertions (`expectTypeOf`) and more readable parameterized test tables (`test.each` tagged templates) for multi-parameter scenarios.

<!-- AC:BEGIN -->
- [ ] #1 Type-focused tests migrate from runtime `typeof` conformance checks to `expectTypeOf` where compile-time checks are the real objective
- [ ] #2 `tests/agents/definitions.test.ts` type-conformance coverage is updated to use `expectTypeOf` patterns
- [ ] #3 Multi-parameter parameterized tests in key files are rewritten to tagged-template `test.each` form for readability
- [ ] #4 Runtime assertions remain in place where behavior (not just type shape) must still be validated
- [ ] #5 `bun run test`, `bun run lint`, and `bun run typecheck` pass after assertion-pattern migration
<!-- AC:END -->

## Implementation Notes

Scoped to `tests/agents/definitions.test.ts` only per instructions.\n\nChanges:\n1. Imported `expectTypeOf` from vitest and `AgentToolSet`/`AgentSessionMode` from types.\n2. Replaced all `expect(typeof x).toBe(...)` with `expectTypeOf(x).toBeString()`/`.toBeBoolean()`/`.toEqualTypeOf<T>()`.\n3. Replaced `expect(Array.isArray(...)).toBe(true)` with `expectTypeOf(...).toEqualTypeOf<readonly string[]>()`.\n4. Merged \"uses valid tool set values\" + \"uses valid session mode values\" into one tagged-template `it.each` block.\n5. Added `expectTypeOf` assertion in the \"namespace is optional\" type conformance test.\n6. All 36 tests pass. Typecheck and lint have only pre-existing unrelated issues (resolver.test.ts, workflow-loader.test.ts TS errors; chain-runner.test.ts and todo-extension.test.ts lint warnings).\n\nRemaining ACs #1, #3, #5 apply to files beyond this scope — not addressed here."
