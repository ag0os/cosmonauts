---
id: TASK-646
title: 'Stage 3 round 2: Commit the write bit at the write, not at assembly'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-635
createdAt: '2026-09-07T22:58:16.951Z'
updatedAt: '2026-09-07T23:23:06.971Z'
---

## Description

Bounded Stage-3 remediation round 2, opened by findings SR-004, SR-005 and SR-006
(all medium) in `missions/plans/living-memory-fidelity/review-6.md` (TASK-636).
Stage 3 may not hand off to Stage 4 until all three are closed and a fresh review
passes.

All three are one defect class, independently confirmed against the code:
`details.writesCommitted` is folded at result-assembly points rather than at the
moment a durable write succeeds. Any throw between the write and its fold reaches
the catch at `lib/memory/living-memory.ts:923-930` with the bit still false, and
that catch can only recover a bit the error itself carries. The reported outcome
then understates committed writes, which is exactly what INV-003 forbids.

  SR-004  `markMaterialized()` renames the replacement over the receipt before
          syncing the parent directory (`lib/memory/durable-files.ts:358-383`).
          A sync failure throws after the receipt bytes have already changed,
          and the Stage-3 fold at `:849-854` only sets the bit after
          `markMaterialized()` returns.
  SR-005  The deterministic proposal loop writes at `:416-431` but folds
          proposal statuses into details only at `:476-506`; the model-backed
          loops write at `:680-767` and fold at `:862-907`. A second persist
          throwing an ordinary error loses the first, already-durable proposal.
  SR-006  `recoverAcceptedEpisodeFinalization()` accumulates prunes at
          `:1084-1110` with committed-error protection through `:1112-1122`,
          but receipt materialization at `:1142-1146` sits outside that
          protection, so the helper never returns and the caller loses both the
          prune and the bit.

Prefer one structural fix over three point patches. The durable direction is that a
successful durable write updates the reported state before anything else can throw,
rather than being reconstructed later from local variables. Point patches that leave
the write-then-fold gap intact at other sites will be treated as an incomplete fix by
the fresh review, which is instructed to look for remaining instances of the class.

File scope for this task is amended on record by D-012: `lib/memory/durable-files.ts`
is pre-authorized **only** if SR-004 cannot be closed at the call site, and **only**
to carry an already-committed bit out of a failed write. It authorizes no change to
retirement pathname sequencing, which D-026 closes as ratified ground.

Ratified-ground handling: the five common constraints below and the spec Intent
invariants INV-001..INV-004 are stop-and-escalate ground under the deviation
protocol. INV-003 is the invariant these three findings violate; close it without
narrowing, widening or reinterpreting it. Do not weaken the Stage-1 measurement
contract or the Stage-2 completeness barrier while doing so.

<!-- AC:BEGIN -->
- [x] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [x] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [x] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [x] #4 (Quality Contract assertion 7; Implementation Order steps 13-15) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [x] #5 (Quality Contract assertions 7-8; Implementation Order step 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [x] #6 (SR-004; INV-003) A RED counterexample reproduces SR-004 before any production edit: an accepted receipt reaches materialization, the receipt bytes are replaced, and the parent-directory sync then fails. The failed result is shown to report `writesCommitted: false` while the receipt is materialized on disk. After the fix that result reports `writesCommitted: true`.
- [x] #7 (SR-005; INV-003) A RED counterexample reproduces SR-005 before any production edit: the first of two proposal persists returns `status: "written"` and the second throws an ordinary (non-committed-tagged) error. The failed result is shown to report `writesCommitted: false` while the first proposal exists durably. After the fix that result reports `writesCommitted: true`. An equivalent counterexample covers the model-backed proposal loop.
- [x] #8 (SR-006; INV-003) A RED counterexample reproduces SR-006 before any production edit: accepted-episode recovery prunes an episode, then receipt materialization throws. The outer failed result is shown to omit the prune and report `writesCommitted: false`. After the fix the prune is reported and `writesCommitted` is true.
- [x] #9 (INV-003; Quality Contract assertion 4) The fix closes the class, not only the three instances: no durable write in `lib/memory/living-memory.ts` remains represented only by a local variable that a later throw can bypass. Every site that performs or observes a durable write updates the reported state before subsequent work can throw, and this is stated as a reviewable property rather than asserted per-site.
- [x] #10 (D-012) If `lib/memory/durable-files.ts` is changed, the change is confined to carrying an already-committed bit out of a failed write; it does not alter rename/sync ordering, retirement pathname sequencing, or any D-026 behaviour. If SR-004 is closed at the call site instead, `durable-files.ts` is left untouched.
- [x] #11 (Quality Contract assertions 1-4) The Stage-1 measurement contract and Stage-2 completeness barrier are preserved unweakened, and `details.warnings` remains append-only across every post-propagation seam. After the fix the Stage-1 pack (B-001..B-003), Stage-2 pack (B-004..B-006), Stage-3 pack (B-007/B-008/B-012) and the exact parent B-012/B-016/B-021 carrier tests all pass.
<!-- AC:END -->
