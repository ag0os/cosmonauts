
The new OFF test proves only completed terminal-only resume, so it misses finding 1. The hanging-reporter test mocks acquisition failure and proves that branch, but the release-failure test uses a resolving reporter, so it misses finding 2.

VERDICT: DO-NOT-SHIP
tokens used
266,911
## Findings

1. **HIGH — Gate-OFF pending-finalization failures still create terminal ledger state.**  
   [cli/drive/subcommand.ts:454](/Users/cosmos/Projects/cosmonauts/cli/drive/subcommand.ts:454) retries pending finalization without forwarding `episodeCaptureEnabled`. Its failure branches call `persistResumeTerminal` without the flag at [subcommand.ts:1477](/Users/cosmos/Projects/cosmonauts/cli/drive/subcommand.ts:1477) and [subcommand.ts:1626](/Users/cosmos/Projects/cosmonauts/cli/drive/subcommand.ts:1626), so the default remains `true` at [subcommand.ts:1643](/Users/cosmos/Projects/cosmonauts/cli/drive/subcommand.ts:1643).

   Concrete scenario: an earlier enabled run leaves frozen identity plus pending finalization; the gate is then disabled; resume retries the finalization and fails again. `recordDriveTerminalEpisode` writes an `intended` record under `run.terminal-episodes/` before `recordEpisode` notices the disabled gate. An unstamped completion can also acquire `completedAt`. This violates B-001 and disposition 4.

2. **MEDIUM — A release error can still let a hanging warning reporter stall a successful update.**  
   [lib/memory/episode-transition-lock.ts:106](/Users/cosmos/Projects/cosmonauts/lib/memory/episode-transition-lock.ts:106) awaits warning delivery when the action resolved but entity-lock release subsequently failed.

   Concrete scenario: an enabled task update persists successfully, lock unlink fails with `EIO`, and `reportEpisodeWarning` returns a never-settling promise. `updateTask()` never resolves and post-lock episode capture never runs. The acquisition-failure branch is fixed, but the broader D-008 “never stall a primary update” requirement is not.

## Round-1 disposition verification

1. **Task-id lock escape: genuinely fixed.** Unsafe IDs produce a flat hashed segment; canonical IDs remain uppercase, and mixed-case valid IDs share one lock. No remaining semantic path escape or practical collision found.
2. **D-003 graph-state gap: genuinely fixed.** `reconcilePriorAttempt` now consults durable graph state; the regression test would fail pre-fix.
3. **F-005 / D-005: genuinely fixed.** Code matches the amended condition, including completed graph-backed resumes. Dirty-worktree and unsupported-backend refusal tests preserve `spec.json` and `task-queue.txt` bytes.
4. **OFF-gate ledger leak: not fully fixed.** Normal terminal-only resume is fixed, but finding 1 remains.
5. **D-008 warning stall: not fully fixed.** Acquisition failure no longer waits before running unlocked, but finding 2 remains. The noted unhandled-rejection residual is not reachable from an ordinarily rejecting reporter: rejection is caught at lines 135–141 and falls back to stderr.

The TASK-499 OFF-hook-parity characterization is accurate: `runInline` installs the hook unconditionally, so gate-OFF release rejection resolves the authoritative result with a diagnostic rather than rejecting as local `main` does.

## Other required checks

- D-001 ordering remains stamp → terminal legacy event → completion → hook → terminal capture.
- D-002 persists intended outcome/exact timestamp before capture, confirms only afterward, and replays intended records byte-identically.
- Ratified unclaimed capture on ledger failure remains intact.
- Bridge reject-path cleanup has both internal deadline and caller `finally`; tests use mocked children but real bridge/files/watchers.
- Exactly two lock protocols exist: `lib/driver/lock.ts` and `lib/entity-file-lock.ts`.
- Full verification: 2,702 tests passed; lint and typecheck passed; 29 markers present exactly once; worktree remained clean.

The new OFF test proves only completed terminal-only resume, so it misses finding 1. The hanging-reporter test mocks acquisition failure and proves that branch, but the release-failure test uses a resolving reporter, so it misses finding 2.

VERDICT: DO-NOT-SHIP
