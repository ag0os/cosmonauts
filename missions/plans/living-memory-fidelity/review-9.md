# Stage 4 Final Fresh Structural Review: living-memory-fidelity

- Date: `2026-09-07`
- Task: `TASK-640`
- Reviewed range: `0493e54..c22b2e8` (the complete permitted Stage-1/2/3 implementation remediation, excluding Stage-0 plan-only preparation)
- Reviewer context: the complete seven-round parent trajectory in `missions/plans/living-memory/review-rounds.md` and every Stage-1/2/3 verdict in `review-2.md` through `review-8.md` were supplied and read before reviewing the implementation. Six of seven parent fixes introduced a fresh defect; this plan then required SR-001 through SR-007 across its first three stages. The review therefore inspected every named contract, seam, adapter, and permanent counterexample rather than following only current failures.
- Verdict: **remediation required — one unresolved medium finding; final scope audit and handoff may not proceed**

## Findings

### SR-008 — Episode-prune journal commit can be under-reported before rename

- Severity: **medium**
- Dimension: committed-write monotonicity / lifecycle invariant
- Ratified ground: D-004, B-008, INV-003, Quality Contract assertion 4, Implementation Order step 20
- Code: `lib/memory/consolidation-sources.ts:506-546`, `lib/memory/living-memory.ts:832-849`, and `lib/memory/living-memory.ts:934-940`

The production episode finalizer durably replaces
`.living-memory-episode-prune.json` before attempting the episode-to-tombstone
rename. Its local `writesCommitted` bit is set only after tombstone removal. If
`renameFile()` throws an ordinary, untagged error before it mutates, the journal
write has already changed durable domain state, but the finalizer rethrows the
ordinary error. The consolidator consequently cannot fold that write into its
OR-only committed-state accumulator and returns a failed result with
`writesCommitted: false`.

This is observable state, not private pre-publication staging: the journal is a
recovery input consumed by a later pass. A temporary-directory end-to-end probe
used the production durable `replaceText()` implementation, the production
episode source and the full consolidator, while making only `renameFile()` fail
before mutation. The actual probe command was `bun -e '<inline end-to-end temporary-directory probe using createDurableMachineFiles(), createEpisodeConsolidationSource(), and createLivingMemoryConsolidator()>'`; its relevant output was:

```text
{"kind":"failed","reason":"simulated pre-rename failure after journal commit","writesCommitted":false,"journalWritten":true}
```

The required remediation is bounded to the Stage-3 committed-write owner. It
must preserve monotonic reporting when the prune journal has committed and a
later rename or verification step fails. A permanent regression must drive the
production finalizer through the full consolidator, assert that the journal
exists, and assert `writesCommitted: true`. Per the stop-and-escalate rule, this
reviewer did not implement or self-accept a fix. Another fresh final structural
review is required after the bounded remediation.

## Complete Contract and Seam Inspection

The complete `0493e54..c22b2e8` implementation range was inspected by hand,
including every changed production file and mirrored test:

- The shared public/query/render contract retains one required canonical
  descriptor, one required render input, and one injection renderer. Corpus
  indexing, combined-context rendering, pressure measurement, and CLI
  composition consume those same projections; no second retrieval or legacy
  `toIndexRecords` route remains.
- The production corpus and episode adapters retain explicit completeness and
  warning propagation. Custom-source coverage is checked, and incomplete or
  unusable input blocks destructive downstream phases.
- The combined-context renderer and pressure gate use the exact injected bytes,
  including warning and metadata overhead. Record and byte ceilings remain
  distinct. Retirement authority still depends on safe pressure and the
  inherited receipt/retirement constraints.
- The completeness barrier occurs after bounded observation and pressure work
  but before judgment acceptance, proposal materialization, episode finalizing,
  receipt materialization, and retirement.
- Receipt creation/materialization remains a two-state transition. The result
  details and committed-state assembly remain OR-only across normal return and
  tagged-error paths. SR-008 is the one uncovered phase-local commit that fails
  to enter that assembly.
- Interface ownership pins, parent behavior carriers, and the real CLI
  composition test remain in place. The CLI test copies a production corpus
  into a temporary root and exercises production query, pressure, and
  combined-context rendering rather than a test-only adapter.
- Permanent B-001/B-002/B-003 and parent B-021 measurements were rerun. The
  exact-renderer, both round-7 divergence directions, warning-byte accounting,
  and oversized-metadata counterexamples all passed.

Completeness and committed-write monotonicity were inspected explicitly.
Completeness remains fail-closed at its required barrier. The committed-write
audit traced receipt writes, proposal writes, source recovery/finalization,
retirement operations, durable primitives, materialization, cleanup errors,
and outer result folding. That audit exposed SR-008.

## Parent Ownership, Boundary, and Ratified Ground

- All six parent carrier marker/name pairs remain exact: B-012 in
  `tests/memory/interface.test.ts`; B-016 plus its record-limit and byte-limit
  carriers in `tests/memory/living-memory.test.ts`; and B-021 plus its
  oversized-metadata carrier across the extension and living-memory suites.
- The frozen receipt floor, retirement/byte authority, fail-closed model-output
  validation, and existing behavior markers are not weakened or removed.
- `lib/memory/types.ts` hashes to
  `d65ff19c00d28a5b8d03e697b235a19d7e6eca26cfa73bc3c97a0364ff103aea`; the
  profile-playbooks seam test carries that exact full-source pin.
- The implementation diff is confined to `lib/memory/`,
  `lib/extensions/knowledge-surface/`, and mirrored tests under `tests/`. No
  repo-wide dead-code sweep, export demotion, unrelated API cleanup,
  documentation, configuration, architecture record, or parent-plan edit is
  part of this review task.
- `lib/memory/retirement-store.ts` is unchanged in the reviewed range.
  Retirement pathname sequencing is untouched, and D-026 is neither reopened,
  re-litigated, nor given another verification layer.
- `review-9.md` was absent before this task and is the next unused integer after
  `review-8.md`. No existing review record was overwritten, renamed, or deleted.
- Drive-owned task-state edits for TASK-638, TASK-639, and TASK-640 are separate
  run state. This reviewer authored no production change.
- Live `knowledge/` was not modified, moved, deleted, or targeted by a
  write-capable command.

## Structural Gate Status

No executable structural-analysis capability was registered in this reviewer
session. Therefore **no executable structural evidence exists** for any of the
five bindable gates below. The entire permitted implementation diff was
inspected by hand. Absence of tool findings is **not** a passing structural
result.

| Gate | Status | Manual review evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | Traced all durable byte and pathname mutations, their ordering, error tagging, and inverse no-write paths by hand; SR-008 was found in the journal-before-rename sequence. |
| `duplication` | **degraded/unbound** | Checked canonical query/render ownership, the single committed-state fold, and adapter reuse manually; no executable duplication evidence exists. |
| `complexity` | **degraded/unbound** | Traced dry-run, incomplete, no-work, recovery, accepted-receipt, materialization, retirement, source-finalization, and failure paths manually; no executable complexity evidence exists. |
| `boundary-conformance` | **degraded/unbound** | Inspected the full path list, parent carriers, type pin, D-026 exclusion, review numbering, and task-authored diff manually; no executable boundary evidence exists. |
| `dead-code` | **degraded/unbound** | Checked changed exports, helpers, adapters, and consumers within the permitted diff only; no repo-wide sweep was run and no executable dead-code evidence exists. |

## Verification

- Live corpus guard before review: SHA-256
  `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`,
  237 files.
- `bun x vitest run tests/extensions/architecture-memory.test.ts tests/memory/living-memory.test.ts -t 'matches pressure to injection for both round-7 divergence directions|marks pressure unusable instead of reporting a false fit without an exact render input|counts injected knowledge warnings in measured index bytes|measures index pressure with the exact injection renderer and budget|measures oversized corpus metadata exactly as combined-context injection'`
  — passed, 2 files and 5 permanent measurement tests.
- `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` — passed,
  12 behaviors, 0 issues, 0 advisories.
- `bun run test` — passed on the final rerun, 263 files and 3,079 tests.
- `bun run lint` — passed, 580 files checked with no fixes.
- `bun run typecheck` — passed.
- `git diff --check` — passed.
- Live corpus guard after review: SHA-256
  `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`,
  237 files.

The first full-suite attempt observed an unrelated timing failure in
`tests/driver/drive-on-graph-acceptance.test.ts`:

```text
FAIL  tests/driver/drive-on-graph-acceptance.test.ts > continues an in-flight run from the envelope snapshot after the live file moves
expected task status "completed"; received "blocked"
blockedReason: "task timed out after 10ms"
```

The exact failing test passed immediately in isolation, and the complete
`bun run test` rerun then passed all 3,079 tests. The failure is not reproducible
at this task boundary and does not touch the reviewed memory paths.

## Assessment

The shared fidelity, completeness, ownership, and CLI composition work remains
structurally coherent, and the seven earlier stage findings remain closed.
However, SR-008 is an unresolved medium committed-write monotonicity defect.
The ratified zero-high/medium threshold is not met. Stage 3 must perform one
bounded remediation and a different fresh reviewer must review the complete
remediation again before the final scope audit.
