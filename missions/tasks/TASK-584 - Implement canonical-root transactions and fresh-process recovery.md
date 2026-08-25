---
id: TASK-584
title: Implement canonical-root transactions and fresh-process recovery
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-580
  - TASK-581
  - TASK-582
  - TASK-583
createdAt: '2026-08-25T23:04:29.801Z'
updatedAt: '2026-08-25T23:04:29.801Z'
---

## Description

Owns B-007 from AC-002 at Implementation Order step 5. Seam/files: `lib/harness-adapters/sync.ts`, `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/index.ts`, the existing non-reentrant `lib/entity-file-lock.ts` callback contract, and `tests/harness-adapters/sync.test.ts`. AC-002, INV-002/INV-003, and D-009's canonical-root identity, bounded acquisition, journal ordering, evidence hold, and release semantics are load-bearing stop-and-escalate ground. Core imports remain inward-only; this task writes temp/ignored fixtures, never live targets or commands.

<!-- AC:BEGIN -->
- [ ] #1 B-007/D-009: read-only containment validation precedes one sibling-lock acquisition, containment is revalidated before every owner-root mutation, and one opaque `OwnerRootTransaction` reaches apply/migration code without any nested reacquisition.
- [ ] #2 B-007/D-009: transaction identity derives from the resolved canonical owner-root path; when `projectRoot === homedir()`, project and personal scopes share exactly one lock, journal, manifest, and transaction for a combined request.
- [ ] #3 B-007: an explicit bounded `waitTimeoutMs` is always passed; a live wedged owner yields a timely nonzero `lock-contended` row naming lock path and owner pid, writes nothing, and never waits indefinitely, while stale reclamation remains limited to a dead owner pid.
- [ ] #4 B-007: durable `prepared` journal state exists before stage/backup artifacts, and the complete Design §7 phase/vector table makes prepared/installing converge old, commit-ready/ordinary committed converge new, and rolling-back converge old from every exact partial vector without reversing intent.
- [ ] #5 B-007: `after-evidence` commit retains exact backups and journal until a re-read durable receipt proves new state; malformed evidence or ambiguous manifest/target/backup/stage bytes remain untouched, and generic sync cannot clean evidence-held or unreferenced migration backups.
- [ ] #6 B-007: check performs no lock or recovery and reports every pending/evidence-required row non-current; unconfirmed release preserves persisted phase/result, exits nonzero, and stops every later owner-root operation.
- [ ] #7 `tests/harness-adapters/sync.test.ts` contains `recovers every phase vector through one sibling lock while retaining evidence holds` with marker `@cosmo-behavior plan:harness-adapters#B-007`; fresh-process and mutation cases cover every phase row, journal-before-stage, partial rollback, check no-write, lock non-reentry/contention, evidence retention, containment, and release uncertainty.
<!-- AC:END -->
