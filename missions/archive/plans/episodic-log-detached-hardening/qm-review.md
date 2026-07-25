# Review Report

base: main
range: c68b2ef9739aa855e92fecf18c6dd2aa051e4b87..HEAD
overall: incorrect

## Overall Assessment

The verification suite, lint, and typecheck pass, but the patch still violates two central terminal-ownership behaviors and has concurrency/lifecycle defects in the new locking paths. In particular, current graph-backed terminal resumes can still miss their episode, and terminal capture can occur without the required persisted intent.

## Findings

- id: F-001
  priority: P1
  severity: high
  confidence: 0.99
  complexity: simple
  title: "[P1] Do not capture a terminal without a persisted intent"
  files: lib/driver/drive-graph-runner.ts, tests/driver/run-state.test.ts
  lineRange: lib/driver/drive-graph-runner.ts:381-425
  summary: When the terminal ledger cannot be read or the intended record cannot be written (for example, the ledger path is a file or temporarily unwritable), this path reports the failure but still calls `recordEpisode` with `claimPersisted === false`. A later settle or resume can then capture a different outcome/timestamp because no persisted owner exists, recreating the `failed`+`aborted` pair D-002 is meant to prevent; `tests/driver/run-state.test.ts:196-252` currently asserts this non-conforming unclaimed capture.
  suggestedFix: After a ledger read or intent-write failure, warn and skip capture. Call `recordEpisode` only after an `intended` record is known to be persisted, and change the regression to assert no episode is written.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. Every terminal `recordEpisode` call is preceded by a successfully persisted `intended` record containing the exact outcome and timestamp.
      2. Ledger failure remains non-fatal but writes no unclaimed terminal episode.

- id: F-002
  priority: P1
  severity: high
  confidence: 0.99
  complexity: simple
  title: "[P1] Prepare identity for completed graph-backed resumes"
  files: cli/drive/subcommand.ts, tests/cli/drive/graph-resume.test.ts
  lineRange: cli/drive/subcommand.ts:402-408
  summary: An off-era run completed by the current graph runner has both a persisted completion and a non-empty durable graph. On an off-then-enabled `--resume`, `hasGraphResumeState` therefore makes identity preparation return here, but `prepareResume` subsequently sees the completion at lines 470-479 and exits through terminal reconciliation; the source-less spec then records no terminal. The B-011 test only uses a legacy-style fixture with no graph, so AC-005 is not covered for normal current runs.
  suggestedFix: Base preparation on whether `prepareResume` will take a terminal completion path, not merely on graph existence. Add a completed graph plus completion fixture proving deterministic identity and one terminal episode while preserving refusal-path bytes when no completion exists.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. A completed graph-backed off-era run gains the run-derived identity and exactly one terminal episode after logging is enabled.
      2. Graph resumes that will continue or be refused still leave pre-execution inputs unchanged.

- id: F-003
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: complex
  title: "[P2] Do not unlink a replacement while breaking a stale entity lock"
  files: lib/entity-file-lock.ts
  lineRange: lib/entity-file-lock.ts:76-83, lib/entity-file-lock.ts:190-196
  summary: With a stale lock and two concurrent contenders, both can read the stale owner; the first unlinks it and acquires a replacement, after which the second blindly unlinks that replacement in `breakStaleLock`. Both contenders can then run their actions concurrently, so enabled same-plan/task updates can lose files or record transition counts that do not match persisted transitions. Existing stale and replacement tests cover these cases separately, not this stale-to-replacement acquisition race.
  suggestedFix: Make stale removal ownership-aware so a contender cannot remove a lock whose PID/nonce/content changed after its read, and add a deterministic two-contender regression that pauses between stale inspection and removal.
  task:
    title: Harden stale entity-lock recovery against replacement races
    labels: concurrency, locking
    acceptanceCriteria:
      1. A stale remover never deletes a replacement lock acquired after its stale read.
      2. Two contenders recovering the same stale lock never overlap their protected actions.

- id: F-004
  priority: P2
  severity: medium
  confidence: 0.97
  complexity: complex
  title: "[P2] Skip transition capture when lock release did not succeed"
  files: lib/memory/episode-transition-lock.ts, lib/plans/plan-manager.ts, lib/tasks/task-manager.ts
  lineRange: lib/memory/episode-transition-lock.ts:98-108
  summary: If the protected update resolves but owner release then fails (for example, an unlink permission error), the helper warns and returns the successful action result. Both managers consequently proceed to episode capture while their lock can still be owned and present, extending episode I/O under the lock and leaving the live process to force later writers through timeout/unlocked degradation. This contradicts the required release-before-capture ownership boundary.
  suggestedFix: Preserve the primary update result, but communicate unsuccessful release to the manager so transition capture is skipped; retain retryable owner-checked cleanup/backstop behavior and warn once.
  task:
    title: Preserve release-before-capture on entity-lock failures
    labels: concurrency, episodic-log
    acceptanceCriteria:
      1. Plan/task episode capture runs only after the entity lock is confirmed released or no longer owned.
      2. A release failure still returns the persisted primary update, warns once, and leaves cleanup retryable.

- id: F-005
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: complex
  title: "[P2] Keep terminal-hook failure behavior out of the OFF path"
  files: lib/driver/driver.ts, lib/driver/run-step.ts, tests/driver/drive-on-graph-acceptance.test.ts
  lineRange: lib/driver/driver.ts:113-123, lib/driver/run-step.ts:76-90
  summary: `onTerminalPersisted` and the swallowing release backstop are installed even when the spec has no episode identity and the gate is OFF. If release rejects after completion, main rejects from `.finally` (and its caller follows the established fallback/error path), while this patch emits `terminal_persisted_hook_failed`, retries and swallows release failure, and returns the persisted result; that changes OFF event bytes, completion/output behavior, and exit semantics. The inline portion of `tests/driver/drive-on-graph-acceptance.test.ts:450-492` uses no episode identity or enabled config and currently asserts this OFF-state drift.
  suggestedFix: Use the hook/contained backstop only for the enabled identity-bearing episode path; preserve the original release propagation for OFF/source-less runs. Add inline and compiled-child OFF release-failure parity regressions while keeping D-004 unchanged when capture is enabled.
  task:
    title: Restore OFF-state plan-lock failure parity
    labels: driver, regression
    acceptanceCriteria:
      1. Gate-OFF/source-less inline and detached-child release failures retain main's event, completion, output, and exit semantics.
      2. Enabled identity-bearing hook rejection remains isolated, creates no second terminal, and skips capture.
