---
id: TASK-712
title: 'Stage 1: shared liveness contracts and platform proofs'
status: To Do
priority: high
labels:
  - 'plan:execution-liveness'
  - backend
dependencies: []
createdAt: '2026-09-23T13:13:10.149Z'
updatedAt: '2026-09-23T13:13:10.149Z'
---

## Description

Execution-liveness Implementation Order stages 0-1 (plan.md Design §§1-4, §7, §10, §12; D-034..D-041). Freeze the ratified ground first (INV-001..INV-007, D-013, H-001/H-002, the twelve behaviors). Do not edit missions/architecture/orchestration-future.md or D-033; H-004's amendment is applied by the coordinator once the human approves its text. Then define the shared TypeScript contracts every later stage consumes: resolved policy, clocks, authority, start phases and the D-034 start signatures, stop and failed-dispatch provenance, attempt-local/process/Pi controls, logical descendants, the D-037 observation API, D-038 task mutation, the effect/hook transaction, lock retirement outcomes, event recovery and the terminal guard, compatibility, and early Chain start. Prove that each current backend maps onto them honestly (R-004: never fabricate host control), and that the target filesystems support generation-bound retirement (R-007). Carries review-7 PR-003, PR-004, PR-005 and the platform half of PR-007 (D-041). Owns no behavior; the stage tasks that follow consume these contracts.

<!-- AC:BEGIN -->
- [ ] #1 The fresh-process control contract is callable, not only named: BackendControlPort, NestedRunControlPort, AttemptOwnerProbe and CompatibilityProjector each have exact method signatures and result variants, as do BackendCompletion, BackendSettlement, AttemptMutationRejection and the settlement query. Signatures include idempotent request/target identity and unavailable/failed outcomes (review-7 PR-003).
- [ ] #2 The effect transaction can record a known non-publication: a task digest conflict, or a Git update-ref expected-value CAS rejection, closes the intent as absent/conflict rather than as unconfirmed. RunStore.resolveStepEffect has an exact input shape and cannot re-acquire the step lock that its own transaction holds (review-7 PR-004).
- [ ] #3 DriverRunSpec has one exact liveness member carrying the explicit, resumed or default Drive cap, every candidate and its source, the effective deadline, and the legacy marker, plus a documented mapping into the durable run/attempt records. The CLI writer, the tool writer, resume, the graph compiler and the event bridge all consume that one type (review-7 PR-005).
- [ ] #4 A platform/backend capability proof lists each current backend and platform, including Windows without process-group control, as supported or refused. A refused combination has a named, user-visible refusal reason that stage 3 surfaces at launch (review-7 PR-007).
- [ ] #5 Any collision with INV-001..INV-007 or the architecture boundary found here is reported under the deviation protocol and not decided in code.
- [ ] #6 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->
