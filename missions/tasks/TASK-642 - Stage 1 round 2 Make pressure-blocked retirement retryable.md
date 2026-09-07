---
id: TASK-642
title: 'Stage 1 round 2: Make pressure-blocked retirement retryable'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-631
createdAt: '2026-09-07T21:08:03.789Z'
updatedAt: '2026-09-07T21:08:03.789Z'
---

## Description

Bounded Stage-1 remediation round 2, opened by finding SR-001 in
`missions/plans/living-memory-fidelity/review-2.md` (TASK-632). Stage 1 may not
hand off to Stage 2 until this round and its fresh review are clean.

SR-001, independently confirmed against the code: when `pressure.kind !== "measured"`,
`lib/memory/living-memory.ts:577-582` sets `retirementCandidates` to the empty list,
and `capDeferredRetirements` slices from `observedRetirementCandidates.length`, so the
pressure-blocked candidates are recorded neither as applied nor as deferred. The
completion check at `lib/memory/living-memory.ts:804-814` then evaluates
`retirementCandidates.every(...)` over that empty list, which is vacuously true, so
`shouldMaterializeReceipt` holds and the pass calls `markMaterialized()` for a
retirement it blocked. A later pass that measures successfully sees the materialized
receipt, treats the still-live input as represented, and returns `noop`. The blocked
retirement is therefore never retried. Captured round-2 evidence:
`retirementCandidateCounts: [0, 0]`, `markMaterializedCalls: 1`,
`receiptStates: ["materialized"]`.

This is a liveness defect in the `unusable` pressure lifecycle that Stage 1 itself
introduced. It destroys no bytes, but it makes a pressure-blocked retirement
permanently unrecoverable, which contradicts the designed unusable-pressure lifecycle
and the plan's Design section 1 and D-002.

Work as one test-first commit: RED first with a full non-dry two-pass B-002
counterexample that fails for the intended lifecycle reason, then GREEN with the
smallest fix, then refactor. Do not weaken the Stage-1 measurement contract: the
canonical `KNOWLEDGE_INDEX_RETRIEVAL` descriptor, the single required
`KnowledgeIndexRenderInput`, the one-argument renderer, and the absence of any second
retrieval or private conversion all stand. Do not make unusable pressure authorize a
retirement; the fix is that a blocked retirement stays retryable, not that it proceeds.

Ratified-ground handling: the five common constraints below, the spec Intent
invariants INV-001..INV-004, and the acceptance-criterion letter are stop-and-escalate
ground under the deviation protocol. Classify the precise fix against that ground; if
closing SR-001 would require narrowing, widening or reinterpreting an invariant, halt
and escalate rather than worker-adjusting it.


<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [ ] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [ ] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [ ] #4 (Quality Contract assertion 7; Implementation Order steps 4-7) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [ ] #5 (Quality Contract assertions 7-8; Implementation Order step 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [ ] #6 (SR-001; Implementation Order steps 4-6) A RED counterexample reproduces SR-001 through the full non-dry consolidate path across two passes before any production edit: pass one measures unusable pressure and blocks retirement; pass two supplies a measured exact render input. The test is retained permanently, carries the `living-memory-fidelity#B-002` marker's stage-owned pack, and is recorded to have failed for the intended lifecycle reason rather than a setup or type error.
- [ ] #7 (SR-001) After the fix, a pass whose pressure is unusable does not materialize the accepted judgment receipt for a retirement it blocked. `markMaterialized` is not called on the vacuous-truth path, and a subsequent pass that measures pressure successfully still observes the blocked candidate and retries it rather than returning `noop`.
- [ ] #8 (SR-001; Quality Contract assertion 2) Pressure-blocked retirement candidates are represented truthfully in the reported outcome rather than silently dropped: they are not reported as applied, and the reported result distinguishes them from candidates that were genuinely absent. No candidate observed before the pressure gate disappears from the reported details without a status.
- [ ] #9 (Quality Contract assertions 1-2; INV-001) The Stage-1 measurement contract is preserved unweakened: one canonical `KNOWLEDGE_INDEX_RETRIEVAL` descriptor across scope, query, admission projection and renderer input; one required records-plus-warnings `KnowledgeIndexRenderInput`; one one-argument renderer; `toIndexRecords` still absent; no second corpus retrieval, no local render-input reconstruction, and no judgment-body-ceiling coupling introduced.
- [ ] #10 (Implementation Order step 6) The permanent measurement pack — B-001, B-002, B-003 and both exact parent B-021 carrier tests — is rerun and passes after the fix, together with the exact parent B-012 and B-016 carrier tests.
<!-- AC:END -->
