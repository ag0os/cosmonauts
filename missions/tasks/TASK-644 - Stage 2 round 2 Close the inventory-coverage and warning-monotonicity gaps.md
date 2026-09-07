---
id: TASK-644
title: 'Stage 2 round 2: Close the inventory-coverage and warning-monotonicity gaps'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-633
createdAt: '2026-09-07T22:07:08.431Z'
updatedAt: '2026-09-07T22:07:08.431Z'
---

## Description

Bounded Stage-2 remediation round 2, opened by findings SR-002 (high) and SR-003
(medium) in `missions/plans/living-memory-fidelity/review-4.md` (TASK-634). Stage 2 may
not hand off to Stage 3 until both are closed and a fresh review passes.

SR-002, independently confirmed against the code. The custom-source completeness
cross-check at `lib/memory/consolidation-sources.ts:787-798` is gated on
`snapshot.omitted > 0`. It therefore never verifies that a source claiming
`inventoryComplete: true` actually inventoried its admitted current records. A source
returning one valid admitted record with `inventory: []`, `omitted: 0` and
`inventoryComplete: true` is accepted as complete, crosses the barrier at
`lib/memory/living-memory.ts:211`, and reaches
`dischargeStale({ currentKeys: [] })`, removing a still-live materialized receipt whose
evidence was that admitted record. Captured evidence:
`{"kind":"noop","dischargeCalls":[[]],"details":{"sources":[{"sourceId":"custom","admitted":1,"omitted":0}],"writesCommitted":true}}`.
This is absence-of-evidence treated as evidence-of-absence at the contract-invalid
custom-source seam — the exact failure INV-002 forbids — and unlike the Stage-1 finding
it performs a real durable write.

The existing negative test covers `omitted: 1` with no inventory. It does not cover an
explicitly supplied inventory that fails to represent admitted or current evidence.

SR-003, independently confirmed. The barrier path preserves propagated source warnings
(they are appended at `lib/memory/living-memory.ts:183`, before the barrier at `:211`),
but the dry-run retirement-recovery failure path and the unhealthy citation-inventory
path replace `details.warnings` with only their own warnings rather than appending,
discarding source warnings that were already propagated. Warning reporting is therefore
non-monotonic on those later failure paths. This matters beyond tidiness: source
warnings carry the `path` and `message` identifying which record broke, and D-009's
exit from a blocked pass is human-only, so losing them on a failure path removes the
operator's means of diagnosing what to fix.

Work as one test-first commit per finding, or one commit covering both, but RED before
GREEN in each case. Do not weaken the Stage-1 measurement contract or the Stage-2
completeness barrier while closing these; the barrier must keep blocking absence-
dependent work on an incomplete inventory, and the fix for SR-002 must not make a
genuinely empty healthy source (zero records, zero omitted, empty inventory) report as
incomplete.

Ratified-ground handling: the five common constraints below and the spec Intent
invariants INV-001..INV-004 are stop-and-escalate ground under the deviation protocol.
INV-002 is the invariant SR-002 violates; close it without narrowing, widening or
reinterpreting it.


<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [ ] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [ ] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [ ] #4 (Quality Contract assertion 7; Implementation Order steps 9-11) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [ ] #5 (Quality Contract assertions 7-8; Implementation Order step 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [ ] #6 (SR-002; INV-002) A RED counterexample reproduces SR-002 before any production edit: a custom source supplying at least one admitted current record with an explicitly empty inventory, `omitted: 0`, and `inventoryComplete: true` is shown to cross the completeness barrier and reach stale-receipt discharge with empty `currentKeys`, removing a live materialized receipt. The test is retained permanently and is recorded to have failed for that reason rather than a setup or type error.
- [ ] #7 (SR-002; INV-002) After the fix, a source claiming `inventoryComplete: true` must have inventoried its admitted current records as well as its omitted ones; the coverage check is no longer conditional on `omitted > 0`. A source that claims completeness without representing its admitted evidence is rejected by the source contract rather than silently accepted, and no discharge, retirement authorization or represented-evidence conclusion proceeds from it.
- [ ] #8 (SR-002) The fix does not make a genuinely empty healthy source incomplete: a source with zero admitted records, zero omitted and an empty inventory still reports complete and does not block absence-dependent work. This case is covered by an explicit test so the distinction between empty-and-healthy and empty-but-lying is pinned.
- [ ] #9 (SR-003) A RED counterexample reproduces SR-003 before any production edit: a pass carrying a propagated source warning that then fails on the dry-run retirement-recovery path is shown to lose that source warning from the reported result. After the fix, `details.warnings` is append-only across every result path — success, barrier failure, dry-run retirement-recovery failure, unhealthy citation inventory, error wrap and details reconstruction — so a warning once propagated is never dropped by a later path.
- [ ] #10 (Quality Contract assertions 1-3) The Stage-1 measurement contract and the Stage-2 completeness barrier are preserved unweakened: one canonical descriptor, one required render input, one renderer, `toIndexRecords` still absent; and an incomplete inventory still blocks discharge, retirement authorization, represented-evidence conclusion and model/proposal materialization.
- [ ] #11 (Implementation Order step 11) After the fix, the Stage-1 measurement pack (B-001/B-002/B-003), the Stage-2 pack (B-004/B-005/B-006), and the exact parent B-012/B-016/B-021 carrier tests are all rerun and pass.
<!-- AC:END -->
