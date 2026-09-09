---
id: TASK-664
title: 'CDX16 round: Carry the confirmation-write commit fact and pin the consumers'
status: Done
priority: high
labels:
  - 'plan:living-memory-fidelity'
dependencies: []
createdAt: '2026-09-09T15:15:11.090Z'
updatedAt: '2026-09-09T15:15:34.577Z'
---

## Description

Close the four findings review-16 recorded.

Three are one shape the plan had not yet named — a *durability-confirmation*
write. Three call sites call `writeText` purely to fsync a file they have
already read; when the file vanished in between, the primitive republishes it
and returns `destinationLinked: true`, and the caller throws that fact away.
This is a third axis of the committed-write class: axis A was error paths
losing the bit, axis B was success paths inferring it from a proxy, axis C is
a confirmation path discarding a real bit it was handed.

- CDX16-001 `consolidation-proposals.ts:99,:117`
- CDX16-002 `consolidation-receipts.ts:176` — `read()` has no channel at all
- CDX16-003 `consolidation-sources.ts:509` — worse, the episode-changed skip
  at `:522-527` then returns `writesCommitted: false`

CDX16-004 is a test-strength gap confirmed by execution: reverting each of
the three consumer sites in `living-memory.ts` one at a time left all eight
SR-015..SR-018 regressions green.

<!-- AC:BEGIN -->
- [x] #1 (CDX16-001) The proposal store's existing-proposal branch reports `writesCommitted` from the confirmation write's `destinationLinked`, so a republication after a concurrent unlink is reported and an ordinary fsync of an intact file is not.
- [x] #2 (CDX16-002) `AcceptedJudgmentReceiptStore.read()` carries its own commit bit, matching `write()` and `markMaterialized()`. A confirmation that republished and then found different bytes throws an error tagged committed rather than an untagged one. `markMaterialized()` ORs the bit its internal read reports, and the consolidator reports it.
- [x] #3 (CDX16-003) `finalize()` records the confirmation bit before the episode-changed `continue` can skip the remaining work, so a pass that republished a proposal and then skipped the prune reports the write.
- [x] #4 (CDX16-004) Each of the four consumer sites in `living-memory.ts` is pinned by a regression that isolates one bit: reverting that site alone turns its test red. Tests must not be blended — a double supplying a commit of its own masks the bit under test.
- [x] #5 (mutation evidence) Six mutations — four consumer, two producer — are applied one at a time with the file restored between each, and every one is red. All six were green before this round.
- [x] #6 (INV-003, no regression) All prior committed-write regressions stay green in both directions, including SR-015..SR-018 and the CDX-001 materialization pair.
- [x] #7 (Quality Contract assertion 6) Live corpus digest is `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` over 237 files before and after.
- [x] #8 (D-012/D-013 boundary) `lib/memory/retirement-store.ts` stays byte-identical, no operation is added, removed or reordered, and D-026 is not reopened.
- [x] #9 (Quality Contract assertion 7) test, lint, typecheck, `git diff --check` and `plan check-artifacts` all pass with conformance GREEN.
<!-- AC:END -->

## Implementation Notes

Closed all four review-16 findings.

CDX16-001/002/003 are one shape the plan had not named: a durability-confirmation
write. Three sites call writeText purely to fsync a file they already read; when
the file vanished in between, writeTextExclusive republishes it and returns
destinationLinked: true. Each now carries that fact.
- consolidation-proposals.ts: writesCommitted = confirmation.destinationLinked,
  replacing a hard-coded false.
- consolidation-receipts.ts: read() returns { receipt, writesCommitted }, matching
  write() and markMaterialized() so every store operation reports its own bit. A
  confirmation that republished and then found different bytes throws a new
  ReceiptCommittedError carrying the bit. markMaterialized() ORs the bit its
  internal read reports; living-memory.ts:619 reports it.
- consolidation-sources.ts: writesCommitted ||= confirmation.destinationLinked is
  recorded before the episode-changed continue can skip the rest of finalization.

CDX16-004: three producer regressions plus four consumer regressions, each
isolating one bit. The first attempt at the consumer tests left two of four
mutations surviving because the default doubles' markMaterialized and persist
supplied a commit of their own; nonCommittingReceiptStore/nonCommittingProposalStore
now make each test's single bit the only possible source of true. The read/write
pair also needed records with no stale citation, since a deterministic finding
takes the fast path and never reaches the judgment seam where read() is called.

Mutation evidence, one at a time with the file restored between each: all six red
(four consumer, two producer). All six were green before this round.

Gates: 3107 tests pass (263 files, exit 0), typecheck 0, lint 0, git diff --check
clean, check-artifacts GREEN 12/0/0. Corpus digest
adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932 over 237 files
before and after. retirement-store.ts unchanged at
f064d1db0f26e70ae70d399a85184509b8147ad5b018cd0708def179228b400c. types.ts
re-pinned in the same commit to
08593a2c9f4d7311fe3b374872cd54ede2b7e6aeda376b79429797ad45a3c38d.
