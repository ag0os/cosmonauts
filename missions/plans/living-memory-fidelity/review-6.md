# Stage 3 Fresh Structural Review: living-memory-fidelity

- Date: `2026-09-07`
- Task: `TASK-636`
- Reviewed range: `c023ffb..3dfd9f6` (the complete permitted Stage-3 implementation diff)
- Reviewer context: Stage 2 added an early failure path after recovery, and the original findings lost committed bits in both a receipt error wrapper and later details reconstruction. The review therefore traced committed state through success, failure, no-work, and incomplete-inventory returns rather than checking only the new happy-path assertions.
- Verdict: **remediation required — three unresolved medium findings; Stage 3 may not close and Stage 4 may not begin**

## Findings

### SR-004 — MEDIUM: materialization can commit before an untagged sync failure

`createDurableMachineFiles().replaceText()` renames the replacement over the
receipt before syncing its parent directory (`lib/memory/durable-files.ts:358-383`).
If that sync fails, `markMaterialized()` throws after the receipt bytes have
changed. The Stage-3 fold in `lib/memory/living-memory.ts:849-854` sets
`writesCommitted: true` only after `markMaterialized()` returns, while the catch
at `:923-930` can recover only an error already carrying a committed bit.

Counterexample: an accepted receipt and existing proposal reach B-012
materialization; rename replaces the receipt, parent-directory sync fails, and
the result is `failed` with `writesCommitted: false` although the receipt is
already materialized on disk.

### SR-005 — MEDIUM: successful proposal writes remain latent until final assembly

The deterministic proposal loop writes at
`lib/memory/living-memory.ts:416-430`, but folds proposal statuses into details
only at `:476-506`. The model-backed loops likewise write at `:680-767`, with
their commit fold deferred until `:862-907`. An intervening ordinary persist or
retirement error reaches the catch before the earlier successful write is
represented in details.

Counterexample: the first of two proposal persists returns `status: "written"`;
the second throws an ordinary identity-conflict error. The failed result reports
`writesCommitted: false` although the first proposal exists durably.

### SR-006 — MEDIUM: accepted-episode recovery can lose earlier committed work

`recoverAcceptedEpisodeFinalization()` accumulates recovered episode prunes at
`lib/memory/living-memory.ts:1084-1110`. Its committed-error protection covers
finalize failures through `:1112-1122`, but receipt materialization at
`:1142-1146` is outside that protection. The caller receives the helper's
`episodePrunes` and committed bit only after the helper returns at `:275-291`.

Counterexample: recovery successfully prunes an episode, then
`markMaterialized()` throws because a receipt disappeared or conflicts. The
helper never returns, so the outer failed result can omit the prune and report
`writesCommitted: false`.

No high finding was found. Because unresolved medium findings remain, each must
start with a bounded Stage-3 counterexample, proceed through RED/GREEN/refactor,
and receive another fresh review before Stage 4 handoff.

## Confirmed Stage-3 Behavior

- Receipt discharge combines earlier successful removals with a thrown removal
  error's own committed bit at `lib/memory/consolidation-receipts.ts:124-133`.
- Retirement recovery and source recovery OR their committed bits into the
  current state at `lib/memory/living-memory.ts:91-124`.
- Post-collection reconstruction preserves recovery `episodePrunes` and the
  committed bit at `lib/memory/living-memory.ts:170-188`; the Stage-2
  incomplete-inventory failure at `:213-229` returns those details unchanged.
- Recovery-only/no-selected work uses the accumulated bit to return `ran`, not
  `noop`, at `lib/memory/living-memory.ts:329-360`.
- A successful B-012 accepted-to-materialized transition sets the committed bit
  at `lib/memory/living-memory.ts:849-854`, and both final result assemblies OR
  prior state rather than replacing it.

The focused pack confirms these intended paths, but it does not exercise the
three failure interleavings above.

## Parent Ownership, Boundary, and D-026

- The committed Stage-3 diff changes only
  `lib/memory/consolidation-receipts.ts`, `lib/memory/living-memory.ts`, and
  `tests/memory/living-memory.test.ts`.
- All six exact parent B-012/B-016/B-021 carrier marker/name pairs remain in
  place. The frozen receipt floor, retirement/byte authority, fail-closed model
  validation, and existing behavior markers were not weakened.
- `lib/memory/types.ts` did not change and remains at its pinned full-source
  SHA-256 `d65ff19c00d28a5b8d03e697b235a19d7e6eca26cfa73bc3c97a0364ff103aea`.
- The reviewed diff does not touch live `knowledge/`,
  `lib/memory/retirement-store.ts`, retirement pathname sequencing, D-026
  tests, documentation, configuration, architecture records, or parent plan
  artifacts. D-026 was neither reopened nor given another verification layer.

This `review-6.md` file is the next unused D-010 review number after the
existing `review-1.md` through `review-5.md`; no earlier review was overwritten,
renamed, or deleted.

## Structural Gate Status

No executable structural-analysis capability was registered in the reviewer
session. Therefore no executable structural evidence exists for any bindable
gate below. The complete permitted diff was inspected by hand. Absence of tool
findings is **not** a passing structural result.

| Gate | Status | Manual review evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | Inspected the retained positive/negative controls and identified three missing failure interleavings; no executable mutation evidence exists. |
| `duplication` | **degraded/unbound** | Traced receipt, source-recovery, proposal, materialization, prune, and retirement commit folds by hand; no executable duplication evidence exists. |
| `complexity` | **degraded/unbound** | Audited every relevant `writesCommitted` assignment and all success, failure, no-work, and incomplete-inventory reconstruction paths manually. |
| `boundary-conformance` | **degraded/unbound** | Inspected the exact committed paths, import direction, parent ownership, forbidden-path exclusions, and review-record numbering manually. |
| `dead-code` | **degraded/unbound** | Scoped the new receipt error guard and all committed-state folds by hand; no repo-wide dead-code sweep was run. |

## Verification

The fresh reviewer ran:

```sh
bun x vitest run tests/extensions/architecture-memory.test.ts tests/memory/consolidation-sources.test.ts tests/memory/living-memory.test.ts tests/memory/interface.test.ts -t 'matches pressure to injection for both round-7 divergence directions|marks pressure unusable instead of reporting a false fit without an exact render input|counts injected knowledge warnings in measured index bytes|marks corpus inventory incomplete when retrieval omits a warned record|keeps receipts and blocks dependent work when corpus inventory is incomplete|counts malformed episodes as omitted incomplete inventory|reports a committed first receipt removal when its directory sync fails|preserves source-recovery episode prunes and committed writes in the final result|reports committed writes for a materialization-only retry pass|exposes exact living-memory outcomes through configured knowledge consolidate only|rehydrates accepted judgment and persisted evidence then converges to noop|retains a live receipt when a later pass exhausts its record limit|retains a live receipt when a later pass exhausts its byte allowance|measures index pressure with the exact injection renderer and budget|measures oversized corpus metadata exactly as combined-context injection'
```

Result: **pass**, 4 files; 15 selected tests passed and 104 were skipped.

Independent task-boundary verification also passed `bun run test` (262 files,
3,067 tests), `bun run lint` (579 files, no fixes), `bun run typecheck`, and
`git diff --check c023ffb..3dfd9f6`. The live corpus guard remained 237 files at
tree SHA-256
`adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`.

## Assessment

The Stage-3 patch closes its three named counterexamples and preserves parent
contracts, boundary rules, and the Stage-2 early-failure details. It does not yet
make committed-write reporting monotonic across all failure interleavings:
materialization sync failure, a later proposal failure after an earlier proposal
write, and a later receipt-transition failure after accepted-episode recovery
can each under-report durable mutation. Stage 3 requires bounded remediation and
another fresh review; Stage 4 may not begin.
