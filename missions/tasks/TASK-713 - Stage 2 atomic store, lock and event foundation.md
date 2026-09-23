---
id: TASK-713
title: 'Stage 2: atomic store, lock and event foundation'
status: To Do
priority: high
labels:
  - 'plan:execution-liveness'
  - backend
dependencies:
  - TASK-712
createdAt: '2026-09-23T13:13:10.709Z'
updatedAt: '2026-09-23T13:13:10.709Z'
---

## Description

Execution-liveness Implementation Order stage 2; owns B-007 and B-011 (Design §§4-5; D-035, D-036). Begin from observable failures: losing claim, old owner deleting its successor's lock, duplicate stop or sequence, obsolete result, release-uncertain, dead-owner effect crash, torn tail, active structural corruption, post-terminal corruption, and a terminal-to-terminal rewrite. Implement D-035 generation retirement, conditional store transitions, the first-terminal guard, retained effect transactions, and event repair with diagnostics before refactoring callers. Carries review-7 Missing Coverage on diagnostics and on the lock claimant (D-041).

<!-- AC:BEGIN -->
- [ ] #1 B-007: a late full completion is retained with its identity and rejection and never becomes canonical; existing terminal fields stay byte-identical, including after later event corruption is reported (seen red first).
- [ ] #2 B-011: under concurrent Drive resume/reconciliation, ownership, attempt IDs, stop intent, lock generations and event sequences stay unique and strictly increasing. A crash-torn final fragment is preserved and repaired without sequence reuse. Non-tail corruption blocks an active run but only adds diagnostic evidence on a terminal one. Paging by the returned cursor skips and rereads nothing.
- [ ] #3 Unsequenced StoredRuntimeDiagnostic records written by FileRunStore.appendDiagnostic stay valid between event envelopes; the contiguous-prefix validator does not treat them as structural corruption (review-7 Missing Coverage).
- [ ] #4 The retirement claimant's exact process identity is stored atomically with the exclusive inode claim, dead-claimant takeover works from it, and generation tombstones have a bounded collection rule (review-7 Missing Coverage, D-035).
- [ ] #5 No release or reclaimer issues a path-only unlink (R-007).
- [ ] #6 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->
