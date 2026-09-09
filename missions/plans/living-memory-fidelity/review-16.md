# Independent Structural Review: SR-015..SR-018 overstatement remediation

- Date: `2026-09-09`
- Task: `TASK-663`
- Remediation commit: `af7d406` (`27a8f4f..af7d406`)
- Reviewer: independent `codex exec --sandbox read-only`, given the domain
  context, the two intended status/commit-bit distinctions, and eight numbered
  questions by category with an explicit instruction to report a nil result
  rather than stay silent.
- Verdict: **remediation required — three unresolved high findings and one
  medium; the plan cannot close**

## What the round confirmed closed

- **SR-016, SR-017, SR-018 are correct in both directions.** Receipt `write()`
  reports false for the pre-read identical receipt and for a lost publication
  race, true for a real link. `dischargeStale()` ORs `removal.removed` per
  receipt and combines the accumulated bit with the current error's committed tag
  on failure; all-ENOENT removals stay false, any real removal stays true.
  `recoverEpisodePruneJournal()` ORs the returned facts at all three sites.
- **`durableRestore` is correct at all three exits**, confirmed by direct
  reproduction returning `true`, `true`, `false`.
- **`dischargeStale` introduced no under-reporting.** The inverse defect the
  remediation could have created does not exist.
- **No durable filesystem operation was added, removed, or reordered**, and
  `lib/memory/retirement-store.ts` is byte-identical — both revisions reference
  blob `51a6588b7a485da49694d9222fab3e246ff33b1c`, SHA-256
  `f064d1db0f26e70ae70d399a85184509b8147ad5b018cd0708def179228b400c`.
- **No existing assertion was weakened** by the 39 mechanical test-double
  updates. Wrappers around real durable operations now return the real result.
- **All three added comments are accurate** against the code they describe.

## Findings

### CDX16-001 — HIGH — Existing-proposal confirmation discards a real publication

- Code: `lib/memory/consolidation-proposals.ts:99`, `:117`
- Dimension: committed-write understatement / proposal durability confirmation

The existing-proposal branch calls `writeText` to fsync a proposal it has already
read. If another actor unlinks the file between the read at `:87` and that call,
`writeTextExclusive` takes its absent-destination path and **republishes** the
proposal, returning `destinationLinked: true`. That result was discarded and
`:117` hard-coded `writesCommitted: false`. If the destination then changes, the
confirmation at `:100-108` throws *after* the real write and the commit fact is
still lost.

### CDX16-002 — HIGH — Accepted-receipt `read()` can write with no reporting channel

- Code: `lib/memory/consolidation-receipts.ts:176`, caller `lib/memory/living-memory.ts:618`
- Dimension: committed-write understatement / missing contract channel

`read()` performs the same durability-confirmation write. After reading raw
receipt bytes, another actor can remove the file; the confirmation republishes it
with `destinationLinked: true`, discards that value, and returns only the
receipt. The contract had **no channel at all** through which the caller could
learn a write happened.

### CDX16-003 — HIGH — Episode proposal confirmation discards a real publication

- Code: `lib/memory/consolidation-sources.ts:509`, skip at `:522-527`
- Dimension: committed-write understatement / source finalization

Same shape inside `finalize()`. Worse in consequence: if the episode changed
after collection, `:522-527` `continue`s past all journal and prune work, so
`finalize()` returned `{ episodePrunes: [], writesCommitted: false }` having just
republished the proposal. The reviewer reproduced exactly that result.

### CDX16-004 — MEDIUM — The new tests do not pin the three changed consumers

- Code: `lib/memory/living-memory.ts:111`, `:287`, `:705`

The eight SR-015..SR-018 regressions call producers directly. Reverting the
consolidator to status inference, path-length inference, or unconditional-success
inference left **all eight green**.

## Coordinator verification of each finding

Every finding was checked against the repository before any code changed, per the
review-triage rule that a reviewer is not an oracle.

- CDX16-001, CDX16-002, CDX16-003: confirmed by reading the three call sites. All
  three are "durability confirmation" writes — calls whose *purpose* is to fsync
  an existing file, which republish it when it has vanished. This is a **third
  axis** of the committed-write class, distinct from the two the plan already
  closed: axis A was error paths losing the bit, axis B was success paths
  inferring it from a proxy, and axis C is a confirmation path **discarding a
  real bit it was handed**. Axis C only became visible once `af7d406` made the
  primitives return the fact; the understatement itself pre-dates it, since
  `status: "existing"` also mapped to not-committed.
- CDX16-004: confirmed by **execution**, not static reading. Each of the three
  consumer lines was reverted one at a time — never blended — and the memory and
  architecture-memory suites re-run. All three mutations survived with 192/192
  passing. The finding is exact.

## Remediation applied (TASK-664)

- CDX16-001: the confirmation write's result is captured and
  `writesCommitted: confirmation.destinationLinked` replaces the hard-coded false.
- CDX16-002: `AcceptedJudgmentReceiptStore.read()` now returns
  `{ receipt, writesCommitted }`, matching `write()` and `markMaterialized()` so
  every operation on the store reports its own commit bit. A confirmation that
  republished and then found different bytes throws a `ReceiptCommittedError`
  carrying the bit rather than an untagged error. `markMaterialized()` ORs the
  bit its internal `read()` reports, and `living-memory.ts:619` reports it.
- CDX16-003: `writesCommitted ||= confirmation.destinationLinked` is recorded
  before the episode-changed `continue` can skip the rest of finalization.
- CDX16-004: three producer-level regressions for the new findings plus four
  consumer-level regressions that isolate one bit each. Splitting them mattered —
  a first combined attempt left two of four mutations surviving because the
  default doubles' `markMaterialized` and `persist` supplied a commit of their
  own; a `nonCommittingReceiptStore()`/`nonCommittingProposalStore()` pair now
  makes each test's single bit the only possible source of `true`.

## Mutation evidence

The `mutation` gate is unbound, so this is the only executable mutation evidence
for this round. Six mutations, applied **one at a time** with the file restored
between each:

| Mutation | Result |
|---|---|
| `persistProposal` → `proposal.status === "written"` | **red** |
| discharge → `discharge.paths.length > 0` | **red** |
| accepted-receipt write → unconditional `true` | **red** |
| receipt read bit → dropped (`false`) | **red** |
| proposal confirmation bit → `false` | **red** |
| episode confirmation bit → removed | **red** |

All six were green before this round's tests were added.

## Structural Gate Status

No executable structural-analysis capability was registered in either the
reviewer's or the coordinator's session. All five bindable gates are
**degraded/unbound**; no executable structural evidence exists for any of them.
The reviewer's report states the same. Manual inspection and the mutation table
above do not convert an unbound gate into a passing structural result.

## Verification

- `bun run test`: 3107 passed, 263 files, exit 0.
- `bun run typecheck`, `bun run lint`, `git diff --check`: clean.
- `bun bin/cosmonauts plan check-artifacts living-memory-fidelity`: GREEN,
  12 behaviours, 0 issues, 0 advisories.
- Live corpus guard before and after:
  `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`, 237 files.
- `lib/memory/retirement-store.ts` unchanged at
  `f064d1db0f26e70ae70d399a85184509b8147ad5b018cd0708def179228b400c`.

## Closing assessment

The round found a third axis of the plan's central defect class that sixteen
prior rounds did not name, and one test-strength gap that would have let all
three consumer sites silently regress. Both are now closed with executable
evidence. Because remediation followed the verdict, D-006 requires another fresh
structural review before this round can be considered closed — recorded at
`review-17.md`.
