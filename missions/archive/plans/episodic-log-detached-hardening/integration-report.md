# Integration Report

plan: episodic-log-detached-hardening
overall: incorrect

## Overall Assessment

The implementation integrates B-001 through B-029 and AC-001 through AC-009 across the declared Drive, resume, ledger, bridge, hook, and manager seams, including the ratified D-001–D-004 contracts. One flat-lock-placement defect remains in the enabled task-transition path for unsafe task-id input.

## Findings

- id: I-001
  priority: P2
  severity: medium
  confidence: 0.98
  complexity: simple
  contract: Design §7 — flat canonical entity locks
  files: lib/tasks/task-manager.ts
  lineRange: lib/tasks/task-manager.ts:190-199, lib/tasks/task-manager.ts:534-539
  summary: `updateTask` passes the caller-supplied id directly to `getTaskEpisodeTransitionLockPath` before task lookup, and that helper only uppercases the id before interpolating it into a path (`lib/tasks/task-manager.ts:190-199`, `lib/tasks/task-manager.ts:534-539`). An enabled, episode-context update with an id containing `/` or `\` can therefore create a nested or escaped lock path rather than the contractually flat `.cosmonauts/episode-task-<canonical-id>.lock`; during the action that lock can be git-visible because `.cosmonauts/*.lock` covers only one level, and a crash can leave it outside the approved artifact location. This violates the flat canonical lock and no-scanner/git-visible-artifact contract even though normal generated task ids and mixed-case aliases work correctly.
  suggestedFix: Validate or deterministically encode unsafe task-id path characters before lock acquisition while preserving the existing uppercase filename for valid task ids; add an enabled-path regression proving separator/traversal-shaped nonexistent ids cannot create nested or escaped lock artifacts.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. Every task transition lock selected from caller input remains a single flat file directly under `.cosmonauts/`, while valid mixed-case ids continue sharing the uppercase canonical lock.
      2. Enabled episode-context updates using slash, backslash, and traversal-shaped nonexistent ids leave no nested, escaped, scanner-visible, or git-visible lock artifact and preserve the expected primary update failure.
