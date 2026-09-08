# Stage 4 Round 3 Final Fresh Structural Review: living-memory-fidelity

- Date: `2026-09-07`
- Task: `TASK-653`
- Reviewed range: `0493e54^..de66a75` (the complete permitted Stage-0
  through Stage-4 implementation remediation, including SR-001 through SR-009)
- Reviewer context: the complete seven-round parent trajectory in
  `missions/plans/living-memory/review-rounds.md` and every verdict in
  `review-2.md` through `review-10.md` were read before the implementation
  review. Six of seven parent fixes introduced a fresh defect, and this plan
  required nine findings across measurement, completeness, committed-error
  propagation, durable primitives, consolidation-module sequencing, and the
  successful source-result boundary. The review therefore independently
  enumerated current inference sites and both directions of committed-write
  reporting instead of accepting TASK-652's enumeration or following only
  green tests.
- Verdict: **pass - zero unresolved high or medium findings; the final scope
  audit and handoff may proceed**

## Findings

No unresolved high or medium finding was identified.

## SR-009 Closure and Complete Proxy-Inference Enumeration

SR-009 is closed at both call sites. `ConsolidationSource.finalize()` now
returns one result containing `episodePrunes` and `writesCommitted`. The
production finalizer returns its local monotonic bit, and both normal
finalization and accepted-episode recovery pass that bit directly into the
single OR-only `reportCommittedState()` accumulator. Neither caller derives
commit truth from the prune array.

The task's claimed inference-site list was checked against the current files.
Searches for `writesCommitted`, length/size-derived reports, all `finalize()`
callers, and every mutating seam found exactly these three relevant sites:

1. The former normal-finalization inference at
   `lib/memory/living-memory.ts:848` is now
   `writesCommitted: finalized.writesCommitted`.
2. The former accepted-recovery inference at
   `lib/memory/living-memory.ts:1120` is now
   `writesCommitted: finalized.writesCommitted`.
3. `lib/memory/living-memory.ts:280` still reports
   `dischargedReceipts.length > 0`. This proxy is equivalent in the supported
   locked flow: `dischargeStale()` has one domain mutation, receipt removal;
   each successful removal is appended immediately after its durable call;
   no later operation occurs before the next iteration; a failing removal
   separately combines prior completed removals with the current error's
   structural committed tag; and an unconfirmed lock release carries the same
   completed-removal state. Zero completed removals remains false.

The production empty-prune counterexamples prove both changed consumers rather
than only the result type. Normal finalization and accepted-episode recovery
each execute the real journal replace, episode rename, restore, and journal
cleanup sequence, return no pruned episode, and now report
`writesCommitted: true`. The inverse changed-episode counterexample performs no
finalization mutation and returns `{ episodePrunes: [], writesCommitted:
false }`. The full no-work paths preserve that false bit.

**The committed-write class is now closed across both axes - error paths and
success paths - and across every module in scope.** Error-path closure covers
the living-memory accumulator/callers, durable-file primitives,
consolidation-sources, and consolidation-receipts. Success-path closure carries
source finalization's real commit bit across its result boundary to both
consumers, while the only remaining array-derived receipt result is exactly
equivalent to its sole durable act under the store contract. No third axis or
fifth component remains in the reviewed scope.

## Error-Path Regression and Operation-Order Audit

The round-4 consolidation tagging remains intact after the result-shape change:

- In `lib/memory/consolidation-sources.ts`, the prune-journal commit is recorded
  immediately after `replaceText()` and before rename; verified-tombstone
  removal, restore, and journal removal in recovery record the local bit before
  later work; and caught failures after any recorded commit are rethrown as
  `ConsolidationSourceCommittedError`.
- In `lib/memory/consolidation-receipts.ts`, each completed stale removal is
  recorded immediately; a failing removal combines prior removals with the
  primitive error tag; and an unconfirmed inner-lock release preserves the
  completed-removal bit in `ReceiptDischargeError`.
- Receipt `read()` only confirms already-identical durable bytes. Receipt
  `write()` returns immediately after exclusive publication. `markMaterialized()`
  validates and builds the next state before `replaceText()` and performs only
  its return afterward, while a primitive post-rename failure is structurally
  tagged.

The `4ffacdd..de66a75` production diff changes only the source finalization
result shape and its two consumers; it does not alter any durable call or catch.
The earlier `c22b2e8..4ffacdd` consolidation-module diff adds commit recording
and error wrappers without moving a durable operation. The durable primitive
diff from `c023ffb..99c47d8` preserves every link, sync, unlink, rename,
restore, temporary-write, and cleanup ordering while adding flags and committed
error wrappers. `lib/memory/retirement-store.ts` is byte-unchanged across the
complete plan range. D-026 is not reopened, and retirement pathname sequencing
is untouched.

## Inverse Direction: No False Committed Report

The inverse audit was repeated across the whole plan rather than only
TASK-652's change:

- Dry runs skip source recovery/finalization, receipt discharge/write/
  materialization, live retirement, and non-preview proposal persistence.
- Request, source-contract, judgment-request, and model-output validation
  failures before a durable write preserve the initialized false bit.
- Healthy empty sources, represented/no-selected work, changed episodes skipped
  before finalization, and repeat/noop paths report `writesCommitted: false`.
- Exclusive-create different-byte `EEXIST` identity conflicts never set the
  destination-linked flag, preserve the winner, and carry no committed tag.
- Same-inode durable-link recovery, `durableRemove()` `ENOENT`, and
  already-restored durable-restore branches do not synthesize primitive tags.
- The normal and recovery finalization consumers fold the returned false bit
  without deriving truth from episode-prune presence. The accepted-to-
  materialized adapters are called only from an accepted-state precondition,
  so successful return represents the real receipt transition.

The selected dry-run, pre-write validation, no-work/noop, identity-conflict,
changed-episode, receipt, proposal, materialization, source recovery, source
finalization, and lock-release controls all passed. No reviewed path reports a
committed write where none occurred.

## Complete Plan Diff, Completeness, and Parent Ground

- The complete implementation range retains one canonical knowledge-index
  descriptor, one required records-plus-warnings render input, one renderer,
  one bounded corpus retrieval, and no `toIndexRecords` or local projection.
  Combined-context injection, pressure, the corpus source, and real CLI
  composition consume the same query, scopes, inventory-preferred projection,
  warning bytes, and renderer.
- Healthy, byte-deferred-but-inventoried, warned corpus omission, malformed
  episode, empty healthy, and contract-invalid custom source outcomes retain
  their designed distinctions. Source warnings append monotonically. Explicit
  inventory coverage is validated, and an incomplete aggregate stops before
  discharge, represented-evidence/no-work conclusions, judgment, proposal or
  receipt materialization, source finalization, and retirement authorization.
- All twelve fidelity marker/name owners and all six exact parent carriers
  remain present and executable: the B-012 owner, the B-016 owner plus its
  record-limit and byte-limit carriers, and the B-021 exact-renderer owner plus
  its oversized-metadata carrier.
- `lib/memory/types.ts` hashes to
  `d65ff19c00d28a5b8d03e697b235a19d7e6eca26cfa73bc3c97a0364ff103aea`,
  matching all three full-source pins. Receipt-floor, retirement/byte
  authority, fail-closed validation, and existing markers remain unweakened.
- The implementation range is confined to `lib/memory/`,
  `lib/extensions/knowledge-surface/`, and mirrored tests under `tests/`; the
  Stage-4 CLI work changes only its mirrored test. This review task authors only
  this permitted plan review record. Pre-existing Drive-owned TASK-652/TASK-653
  state edits are run state, not reviewer-authored implementation scope.
- `review-11.md` was absent before this task and is the next unused integer
  greater than every existing `review-*.md`. No prior review was overwritten,
  renamed, or deleted.
- No live `knowledge/` path was modified or targeted by a non-dry-run
  write-capable memory command.

## Structural Gate Status

The role's required capability check found no registered executable
structural-analysis capability. Therefore **no executable structural evidence
exists** for any of the five bindable gates below. The complete permitted diff
was inspected by hand. Absence of tool findings is **not** a passing structural
result.

| Gate | Status | Manual review evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | Rechecked the retained counterexamples, every durable sequence in the source/receipt/primitive modules, both source-result consumers, and inverse controls. No executable mutation evidence exists. |
| `duplication` | **degraded/unbound** | Checked the canonical query/render path, the one committed-state accumulator, all finalize consumers, and removed proxy call forms manually. No executable duplication evidence exists. |
| `complexity` | **degraded/unbound** | Traced measurement, completeness, dry-run, no-work, recovery, finalization, materialization, release, cleanup, success, and failure paths by hand. No executable complexity evidence exists. |
| `boundary-conformance` | **degraded/unbound** | Inspected the complete Stage-0..4 implementation path list, import direction, parent carriers, pins, D-012 amendments, D-026 exclusion, and review numbering manually. No executable boundary evidence exists. |
| `dead-code` | **degraded/unbound** | Checked changed exports, helpers, result shapes, adapters, and every source-finalization consumer within the permitted diff only. No repo-wide sweep was run and no executable dead-code evidence exists. |

## Verification

- Live corpus guard before and after review: SHA-256
  `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`,
  237 files, using the exact repository-root commands from Implementation Order
  step 1.
- Permanent measurement pack: passed, 2 files and 5 selected tests.
- Complete fidelity B-001..B-012 and all six exact parent B-012/B-016/B-021
  carriers: passed, 5 files and 18 selected tests.
- Committed-interleaving, SR-008/SR-009 regression, and inverse-direction pack:
  passed, 2 files and 23 selected tests, including both empty-prune consumers
  and the legitimate no-write finalization result.
- `bun run test` - passed, 263 files and 3,085 tests.
- `bun run lint` - passed, 580 files checked with no fixes.
- `bun run typecheck` - passed.
- `git diff --check` - passed.
- `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` - passed,
  12 behaviors, 0 issues, and 0 advisories.

## Assessment

SR-009 is closed at both consumers with production counterexamples. The
committed-write class is closed on error and success paths throughout the
reviewed living-memory, durable-file, source, and receipt components, and the
inverse direction does not report writes on supported no-mutation paths. The
measurement, completeness, warning, ownership, boundary, ordering, and D-026
contracts remain coherent. Zero unresolved high or medium findings remain, so
the final scope audit and handoff may proceed.
