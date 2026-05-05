---
id: TASK-291
title: 'Plan 3: Verification gate — full test, lint, typecheck'
status: Done
priority: high
labels:
  - testing
  - devops
  - 'plan:external-backends-and-cli'
dependencies:
  - TASK-282
  - TASK-280
  - TASK-288
  - TASK-289
  - TASK-290
  - TASK-286
createdAt: '2026-05-04T20:23:13.448Z'
updatedAt: '2026-05-05T16:24:40.142Z'
---

## Description

Implements Implementation Order step 16. Quality Contract: QC-014.

Final integration gate: all Plan 3 code is in place; all QC-001 through QC-014 must pass.

**All P3-INV invariants must be satisfied by the code under test:**
- P3-INV-1: Binary calls `runRunLoop` directly, acquires lock, calls `taskManager.init()`, writes completion record before releasing.
- P3-INV-2: No separate "SerializedDriverRunSpec" type anywhere.
- P3-INV-3: Both `startDetached` and the registry reject `cosmonauts-subagent` for detached mode.
- P3-INV-4: `init()` not `initialize()`; Title Case status literals throughout.
- P3-INV-5: Pi tool registration shape preserved.
- P3-INV-6: Binary holds plan lock; parent does not.
- P3-INV-7: `run.completion.json` written before lock release; bash trap removes only `run.pid`.
- P3-INV-8: `createDriveProgram()` zero-arg factory; wired at `cli/main.ts:658-688`.
- P3-INV-9: All `Bun.spawn` calls use argv arrays, no shell strings.
- P3-INV-10: Runtime compile inside `startDetached`; `compile:drive-step` is dev-time only.
- P3-INV-11: Bridge handles missing file, partial lines, parse errors, auto-stops on terminal events.
- P3-INV-12: Resume guard checks `git status --porcelain`; refuses dirty unless `--resume-dirty`.

<!-- AC:BEGIN -->
- [ ] #1 bun run test passes including all tests added across Plan 3 tasks (QC-001 through QC-013 coverage).
- [ ] #2 bun run lint passes with no new lint errors or warnings.
- [ ] #3 bun run typecheck passes with no type errors.
- [ ] #4 bun run test --grep 'driver detached codex e2e' passes (QC-001).
- [ ] #5 bun run test --grep 'inline vs detached parity' passes (QC-007).
- [ ] #6 bun run test && bun run lint && bun run typecheck composite check passes (QC-014).
<!-- AC:END -->

## Implementation Notes

Final verification gate passed. Ran full composite `bun run test && bun run lint && bun run typecheck`: 131 test files / 1927 tests passed, Biome clean, TypeScript clean. Also ran required grep checks after naming coverage tests: `bun run test --grep 'driver detached codex e2e'` and `bun run test --grep 'inline vs detached parity'`, both passed. Updated test names to make QC grep targets explicit.
