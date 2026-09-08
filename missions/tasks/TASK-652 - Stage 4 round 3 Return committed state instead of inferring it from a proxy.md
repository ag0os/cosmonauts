---
id: TASK-652
title: 'Stage 4 round 3: Return committed state instead of inferring it from a proxy'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-650
createdAt: '2026-09-08T01:29:32.136Z'
updatedAt: '2026-09-08T01:29:32.136Z'
---

## Description

Bounded remediation opened by finding SR-009 (medium) in
`missions/plans/living-memory-fidelity/review-10.md` (TASK-651). SR-008 is confirmed
closed. The final scope audit and handoff may not proceed until SR-009 is closed and
a fresh final review passes.

SR-009, independently confirmed against the code. Episode finalization returns only
`Object.freeze(pruned)` (`lib/memory/consolidation-sources.ts:549`), so both callers
infer the committed bit from that array's length:
`writesCommitted: finalized.length > 0` at `lib/memory/living-memory.ts:848` and
`writesCommitted: pruned.length > 0` at `:1120`. A finalization that durably writes
the prune journal, renames, restores and cleans up — but prunes nothing, because the
tombstone verification took the restore branch — returns an empty array, and both
callers report `writesCommitted: false` despite committed durable writes.

This is the same class rounds 2 through 4 closed on error paths, now on the **success
path**: a caller inferring committed state from a proxy value rather than receiving
it. The two axes together — error paths and success paths — are the whole class.

Close the axis, not the instance. The durable direction is that a function performing
durable writes returns its committed state as part of its result, so no caller can
infer it. Enumerated, the inference sites in scope are exactly three:

  living-memory.ts:848   `finalized.length > 0`   SR-009
  living-memory.ts:1120  `pruned.length > 0`      SR-009, second call site
  living-memory.ts:280   `dischargedReceipts.length > 0`
                         believed accurate — removal is dischargeStale's only durable
                         act — but confirm rather than assume, and record the reason.

Prefer changing the episode-finalization result shape so both call sites fold a real
bit. Keep the change minimal: this is the last remediation round before the final
scope audit, and widening it now costs more than it buys.

Scope bounds: `lib/memory/retirement-store.ts` is untouched and D-026 is not reopened.
Do not reorder operations. If a public type in `lib/memory/types.ts` changes, re-pin
its full-source SHA-256 in the same commit.

Ratified-ground handling: the five common constraints below and the spec Intent
invariants INV-001..INV-004 are stop-and-escalate ground. INV-003 is the invariant
SR-009 violates.


<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit.
- [ ] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. No live `knowledge/` change and no non-dry-run write-capable memory command.
- [ ] #3 (Quality Contract assertions 5 and 7) Parent ownership: all six exact parent B-012/B-016/B-021 marker/name carriers remain exact and parent-owned; no frozen pin, receipt floor, retirement/byte authority, fail-closed validation or existing marker is weakened. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the same commit.
- [ ] #4 (Quality Contract assertion 7) Gates: `bun run test`, `bun run lint`, `bun run typecheck`, `git diff --check` and `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` all pass, with artifact conformance GREEN. No test is committed red.
- [ ] #5 (Quality Contract assertions 7-8; D-026) D-026 is not reopened or given another verification layer, retirement pathname sequencing is untouched, and no operation is reordered.
- [ ] #6 (SR-009; INV-003) A RED counterexample reproduces SR-009 before any production edit: episode finalization durably writes the prune journal and takes the restore branch so it prunes nothing, returning an empty array. The result is shown to report `writesCommitted: false` despite the committed journal and restore writes. After the fix it reports `writesCommitted: true`. The counterexample covers the `:848` call site.
- [ ] #7 (SR-009, second call site) An equivalent counterexample or assertion covers the `:1120` call site, so the fix is proven at both places the inference occurred rather than only the one the finding named.
- [ ] #8 (axis closure) No caller in `lib/memory/` infers `writesCommitted` from a proxy value — an array length, a defined path, a set size — where the callee performed durable writes the proxy does not represent. The three enumerated inference sites are each either converted to receive a real committed bit or justified in the task notes with the reason the proxy is exactly equivalent.
- [ ] #9 (INV-003, inverse direction) The fix does not make `writesCommitted` true where nothing was durably written — dry-run paths, failures before any write, the no-work/noop path, and a finalization that legitimately performs no durable write at all.
- [ ] #10 (Quality Contract assertions 1-4) The Stage-1 measurement contract, the Stage-2 completeness barrier, warning append-only monotonicity and the Stage-3/4 commit recording are all preserved unweakened. After the fix the full fidelity pack B-001..B-012, the commit-interleaving tests and the exact parent B-012/B-016/B-021 carrier tests all pass.
<!-- AC:END -->
