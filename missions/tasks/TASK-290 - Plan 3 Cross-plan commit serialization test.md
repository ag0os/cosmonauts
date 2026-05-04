---
id: TASK-290
title: 'Plan 3: Cross-plan commit serialization test'
status: To Do
priority: medium
labels:
  - testing
  - 'plan:external-backends-and-cli'
dependencies:
  - TASK-278
createdAt: '2026-05-04T20:22:55.858Z'
updatedAt: '2026-05-04T20:22:55.858Z'
---

## Description

Implements Implementation Order step 14. Quality Contracts: QC-012, QC-013.

Create `tests/driver/cross-plan-commit-lock.test.ts` asserting that two concurrent detached runs on different plans in the same repo serialize commits correctly via Plan 1's `acquireRepoCommitLock`.

**Cross-plan invariant — P3-INV-6:**
`acquireRepoCommitLock(repoRoot)` is held briefly per commit inside `runOneTask` (Plan 1). Two Plan 3 detached runs both rely on this primitive for cross-plan git serialization. This test validates the integration at the Plan 3 level.

**Also verifies QC-013 (lock ownership):**
The detached plan lock is owned by the binary process, not the parent CLI or tool process. While a binary is running, a second invocation of `cosmonauts drive --plan X` against the same plan receives the active-lock error citing the binary's PID.

<!-- AC:BEGIN -->
- [ ] #1 tests/driver/cross-plan-commit-lock.test.ts simulates two detached runs on different plans within the same repo root, both attempting to commit concurrently.
- [ ] #2 Both runs commit cleanly; no .git/index.lock error occurs.
- [ ] #3 Commits appear in the expected order relative to acquireRepoCommitLock acquisition times.
- [ ] #4 Detached plan lock is owned by the binary process, not the parent; a second cosmonauts drive --plan X invocation while the binary holds the lock receives the active-lock error citing the binary's PID (QC-013).
<!-- AC:END -->
