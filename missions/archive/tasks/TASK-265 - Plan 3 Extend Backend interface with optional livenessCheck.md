---
id: TASK-265
title: 'Plan 3: Extend Backend interface with optional livenessCheck'
status: Done
priority: high
labels:
  - backend
  - 'plan:external-backends-and-cli'
dependencies: []
createdAt: '2026-05-04T20:19:39.629Z'
updatedAt: '2026-05-05T15:17:33.454Z'
---

## Description

Implements Implementation Order step 1. Decision Log: D-P3-2, D-P3-9.

Add optional `livenessCheck?()` to the `Backend` interface in `lib/driver/backends/types.ts`. This is a non-breaking extension — existing Plan 1 backends that omit it still compile and all Plan 1 tests continue to pass.

**Cross-plan invariant:**
- P3-INV-2: `DriverRunSpec` is already serializable (Plan 1). No new type definitions needed in types.ts beyond the `livenessCheck` method.

**Contract being added:**
```ts
livenessCheck?(): { argv: string[]; expectExitZero: boolean };
```

Each backend declares its own check (e.g., codex: `["codex", "--version"]`, claude-cli: `["claude", "--version"]`). The driver runs the check before workdir creation; failure → structured error with backend name + argv + actual exit + stderr.

<!-- AC:BEGIN -->
- [ ] #1 Backend interface in lib/driver/backends/types.ts has livenessCheck?(): { argv: string[]; expectExitZero: boolean }.
- [ ] #2 Backends that do not implement livenessCheck compile without type errors (optional field).
- [ ] #3 All existing Plan 1 tests pass without modification after this change.
<!-- AC:END -->

## Implementation Notes

Implemented optional Backend.livenessCheck method in lib/driver/backends/types.ts. Verified with bun run typecheck and bun run test tests/driver tests/extensions/orchestration-driver-tool.test.ts (50 tests passing).
