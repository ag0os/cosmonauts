# Performance Review: round 1

## Overall

incorrect

## Assessment

The enabled bridge drain and transition-lock wait have explicit timers, and the focused liveness tests pass, but several terminal and lock paths remain unbounded or race-prone. In particular, detached abort can wait forever, thrown terminals retain the plan lock during episode I/O, and the stale-lock recovery protocol can delete a newly acquired lock.

## Findings

- id: PR-001
  dimension: scaling
  priority: P1
  severity: high
  confidence: 0.99
  complexity: simple
  title: "Detached abort waits forever for a child that ignores SIGTERM"
  files: lib/driver/driver.ts
  lineRange: 239-247, 276-296
  summary: |
    `abortDetachedRun` sends one SIGTERM and then awaits `waitForChildExit`, whose
    promise has no deadline or escalation path. If the detached process traps or
    ignores SIGTERM, `abort()` never settles, the fallback completion at line 247
    is never written, and `handle.result` can continue polling indefinitely. The
    new abort-race tests only use children that explicitly emit `exit` or trap
    SIGTERM and exit, so they do not fail under this liveness mutation.
  suggestedFix: Bound the child-exit wait and provide a terminal cleanup path when SIGTERM does not produce an exit.

- id: PR-002
  dimension: scaling
  priority: P1
  severity: high
  confidence: 0.98
  complexity: simple
  title: "Thrown terminal episode I/O still runs while the plan lock is held"
  files: lib/driver/drive-graph-runner.ts, lib/driver/driver.ts, lib/driver/run-step.ts
  lineRange: 240-242; 122-123; 89-90
  summary: |
    The thrown scheduler path awaits `recordDriveThrownTerminalEpisode` before
    rethrowing. Inline and detached callers release the plan lock only in their
    outer `finally`, so all terminal-ledger and episode filesystem I/O happens
    under the plan lock on this path. A slow or stalled episode write therefore
    blocks or rejects every later same-plan run for as long as the host PID stays
    alive, contrary to AC-007. The hook-order tests cover completion-backed
    outcomes; the thrown test calls `runDriveOnGraph` without an acquired plan
    lock and cannot detect this ordering defect.
  suggestedFix: Release the plan lock before thrown-terminal episode recording, retaining the existing final backstop.

- id: PR-003
  dimension: scaling
  priority: P1
  severity: high
  confidence: 0.96
  complexity: complex
  title: "Stale-lock recovery can unlink a replacement owner's live lock"
  files: lib/entity-file-lock.ts
  lineRange: 76-83, 190-195
  summary: |
    A contender reads a stale owner and later calls `unlink(lockPath)` without
    confirming that the file still contains that owner. With two contenders,
    both can classify the old lock as stale; contender A can remove it and
    acquire a replacement, after which contender B removes A's live lock and
    acquires concurrently. The supposedly serialized plan/task actions can then
    overlap, causing lost file updates or duplicate transition decisions. The
    stale-owner test has only one contender and does not exercise this
    check-to-unlink race.
  suggestedFix: Make stale removal ownership-validated so it cannot remove a lock that changed after the stale read.
  task:
    title: "Make entity stale-lock recovery ownership-safe"
    labels: [review-fix]
    acceptanceCriteria:
      - "A deterministic two-contender stale-recovery test proves that a newly acquired replacement lock is never removed by the other contender."
      - "Same-entity actions remain non-overlapping through stale-owner recovery."

- id: PR-004
  dimension: io-hot-path
  priority: P2
  severity: medium
  confidence: 0.95
  complexity: simple
  title: "The two-second drain deadline does not bound the final JSONL read"
  files: lib/driver/driver.ts, lib/driver/event-stream.ts
  lineRange: 372-378, 644-675
  summary: |
    After the two-second child-exit wait, `startDetachedProcess` still awaits
    `bridge.finish()`. `finish()` awaits any in-flight poll and then performs
    another `readFile` of the entire event log before stopping. Its deadline only
    starts `finish`; it does not bound either read. Drain latency is therefore
    `2s + O(event-log bytes)` and can remain unbounded on a stalled filesystem;
    each enabled drain poll also allocates the full log even though only the
    suffix after `cursor` is processed. Existing deadline tests use tiny local
    files with immediately resolving reads, so they prove timer cleanup but not
    the claimed result-latency bound.
  suggestedFix: Make the drain deadline settle and stop independently of an in-flight or final full-log read.

- id: PR-005
  dimension: io-hot-path
  priority: P3
  severity: low
  confidence: 0.99
  complexity: simple
  title: "Gate-OFF contextual updates now reread project config on every edit"
  files: lib/memory/episode-transition-lock.ts, lib/plans/plan-manager.ts, lib/tasks/task-manager.ts
  lineRange: 59-68; 168-178; 197-203
  summary: |
    Every plan/task update carrying episode context calls `loadProjectConfig`
    before the primary action, even when `episodicLog.enabled` is absent or
    false. This adds one filesystem read and JSON parse to every OFF-state edit;
    status transitions then read the same config again in `recordEpisode`.
    Context-free Drive managers bypass the cost, but normal contextual edit
    surfaces do not. The OFF tests assert bytes and absence of lock artifacts,
    not the added I/O, so this regression is not mutation-resistant.
  suggestedFix: Preserve enabled-only lock selection without rereading project config for every OFF-state contextual update.
