---
id: TASK-717
title: 'Stage 6: Drive effects, fenced task mutation and compatibility cutover'
status: To Do
priority: high
labels:
  - 'plan:execution-liveness'
  - backend
dependencies:
  - TASK-716
createdAt: '2026-09-23T13:13:12.786Z'
updatedAt: '2026-09-23T13:13:12.786Z'
---

## Description

Execution-liveness Implementation Order stage 6; owns B-006 (Design §10; D-025, D-026, D-038, D-040). Add Driver-owned effect transactions, seeded temporary indexes, preserved hooks and signing, the D-040 dormant hook obligation, source/state CAS, D-038 task mutation sessions with digest replacement, and exact crash recovery. Then make the normalized terminal state drive legacy completion/status/resume. Remove the old abandoning timer only after every adapter uses the new start/settlement contract. Carries review-7 PR-001 and PR-002 plus two Missing Coverage items (D-041). lib/driver/prompt-template.ts joins Files to Change for PR-001. If publication cannot be reduced to one CAS or atomic replacement, stop (R-010).

<!-- AC:BEGIN -->
- [ ] #1 B-006: promotion closes at the earlier of the task cap and the configured baseline. From then on no late result, task transition, source/state commit, finalizer readiness or Drive lifecycle event is accepted.
- [ ] #2 A worker-issued `cosmonauts task edit <id> --check-ac ...` from a managed Drive attempt is conditional on that attempt's authority. Issued after the hard deadline, during stop grace, or after the step blocked, it is rejected and the task bytes are unchanged (seen red first). The prompt-template instruction and the task-edit path are routed through attempt authority, or the backend is contained/refused; AC-007 and AC-018 are not weakened (review-7 PR-001).
- [ ] #3 In the normal interval after the ref CAS receipt and before the owner releases the dormant post-commit hook, a concurrent run status or run watch does not block the step while the exact owner is alive or reachable. Only a crashed or inaccessible owner leads to post-commit-outcome-unconfirmed, and only at the original grace expiry (review-7 PR-002; B-009 and Design §7).
- [ ] #4 A title-changing task update (expectedPath differs from candidatePath) has an achievable atomic outcome that is tested, not a write-then-delete pair (review-7 Missing Coverage).
- [ ] #5 A manually executed post-commit hook that exits nonzero leaves the commit successful, as git commit does today, and the failure is visible in status (review-7 Missing Coverage; B-012).
- [ ] #6 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->
