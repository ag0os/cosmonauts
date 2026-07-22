# Security Review: round 1

## Overall

incorrect

## Assessment

The diff adds reachable path-confinement and lock-ownership weaknesses on the enabled episodic path. Persisted completion input is also trusted without runtime validation, allowing a child-controlled workdir record to suppress the authoritative fallback result.

## Findings

- id: SR-001
  dimension: injection
  priority: P1
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Task IDs can escape the flat episode-lock directory"
  files: lib/tasks/task-manager.ts
  lineRange: 534-539
  summary: |
    `updateTask` passes its caller-supplied `id` into `getTaskEpisodeTransitionLockPath` before checking whether the task exists (lines 197-220). The path helper uppercases the value but interpolates it unchanged into `join`, so separators and `..` remain active path components. With episodic logging enabled and episode context present, a `task_edit` value such as `../../victim` resolves outside the intended synthetic lock filename. `withEntityFileLock` then creates parent directories and may classify an existing non-lock file as a dead owner and unlink it. This lets a tool caller create lock artifacts outside `.cosmonauts/` or delete a reachable pre-existing path ending in `.lock` (subject to the uppercased supplied components), rather than producing the required flat canonical task lock.
  suggestedFix: Encode or hash every non-canonical task ID before path construction (or reject it before lock acquisition), and verify the resulting lock is a direct child of `.cosmonauts/`.

- id: SR-002
  dimension: blast-radius
  priority: P1
  severity: medium
  confidence: 0.98
  complexity: complex
  title: "Concurrent stale-lock reclaimers can delete a replacement owner"
  files: lib/entity-file-lock.ts
  lineRange: 69-83
  summary: |
    Stale ownership is checked by reading the lock at lines 76-81, but `breakStaleLock` later unlinks only by pathname at lines 190-195 without tying removal to the inspected PID/UUID. Two processes can both read the same dead owner; the first removes it and acquires a new lock, then the second removes that live replacement and acquires its own. Both callers can consequently enter the supposedly serialized action. The release path has the same check-then-unlink gap at lines 207-217. Through the new enabled plan/task transition callers, this can produce overlapping read/merge/write windows, lost persisted updates, and false audit-transition episodes.
  suggestedFix: Make stale reclamation and release replacement-safe so removal is bound to the exact owner that was inspected.
  task:
    title: "Make entity lock reclamation replacement-safe"
    labels: [review-fix]
    acceptanceCriteria:
      - "Two concurrent reclaimers of one stale lock cannot both enter their critical sections."
      - "A releaser or stale reclaimer never removes a lock replaced by a different PID/UUID owner."
      - "The fix preserves the approved shared primitive, bounded fail-soft transition behavior, and exactly two repository lock protocols."

- id: SR-003
  dimension: blast-radius
  priority: P2
  severity: low
  confidence: 0.96
  complexity: complex
  title: "A transient release failure strands a live-owner lock and disables later serialization"
  files: lib/entity-file-lock.ts, lib/memory/episode-transition-lock.ts
  lineRange: 106-108
  summary: |
    `withEntityFileLock` attempts release once in its `finally` (entity-file-lock.ts:53-58), and an unlink error leaves the handle unreleased (entity-file-lock.ts:202-218). After the primary action has resolved, `withEpisodeTransitionLock` catches that release error, warns, returns the result, and discards the only handle (episode-transition-lock.ts:106-108). The lock still names the current, live PID, so subsequent processes will not reclaim it; they time out and execute unlocked. In a long-lived agent host, one transient unlink failure therefore degrades every later same-entity update to unsynchronized operation until the host exits.
  suggestedFix: Preserve fail-soft primary results while retaining a bounded retry/recovery path for a failed owned-lock release.
  task:
    title: "Recover entity locks after fail-soft release errors"
    labels: [review-fix]
    acceptanceCriteria:
      - "A transient first unlink failure is retried without changing the already-persisted primary result."
      - "A failed release cannot leave later same-process or cross-process updates permanently taking the unlocked timeout path."
      - "Warnings remain bounded and release never removes a replacement owner."

- id: SR-004
  dimension: input-validation
  priority: P2
  severity: low
  confidence: 0.98
  complexity: simple
  title: "Malformed or mismatched completion JSON is accepted as authoritative"
  files: lib/driver/run-state.ts, lib/driver/driver.ts
  lineRange: 98-119
  summary: |
    `readRunCompletion` blindly casts parsed JSON to `DriverResult`, and `writeFallbackRunCompletion` treats any non-`undefined` `completedAt` property as proof that the record is authoritative. It does not validate the result variant, timestamp, field types, or that `current.runId` matches the fallback run. The detached-abort path then passes this returned object into terminal capture (driver.ts:247-261); the CLI/tool fallback paths likewise suppress their real fallback. A child or other writer able to alter the persisted workdir can plant syntactically valid JSON such as a different run ID with a truthy `completedAt`, causing the parent to preserve and report attacker-selected terminal data instead of the actual abort result. Invalid JSON also throws across this fallback boundary rather than settling fail-soft.
  suggestedFix: Runtime-validate completion records, require an exact matching run ID and valid stamped result before preserving them, and handle invalid records without replacing the primary settlement failure.
