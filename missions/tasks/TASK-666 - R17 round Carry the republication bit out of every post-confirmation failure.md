---
id: TASK-666
title: 'R17 round: Carry the republication bit out of every post-confirmation failure'
status: Done
priority: high
labels:
  - 'plan:living-memory-fidelity'
dependencies: []
createdAt: '2026-09-09T15:33:19.679Z'
updatedAt: '2026-09-09T15:33:47.323Z'
---

## Description

Close the four findings review-17 recorded.

Three are axis A reopened at the sites axis C created: a confirmation write is
a new source of commitment, and each of its error paths threw untagged.
- R17-001 `consolidation-proposals.ts:106`
- R17-002 `consolidation-receipts.ts:189,:208` — the confirmation read and the
  parse were both outside the tag
- R17-003 `consolidation-receipts.ts:263-268` — markMaterialized drops its
  internal read's bit when replaceText fails

R17-004 is axis B, made reachable by this plan's own af7d406:
`consolidation-sources.ts:579` throws a committed-tagged error whenever
`pruned.length > 0`, and recovery can now honestly report a prune another
actor performed with `writesCommitted: false`.

<!-- AC:BEGIN -->
- [x] #1 (R17-001) A proposal republication followed by a failing confirmation read throws an error carrying `writesCommitted: true`; a failure with no republication stays untagged.
- [x] #2 (R17-002) The receipt confirmation read, the changed-bytes check and `parseReceipt` are all inside one guard, so any failure after a republication carries the bit; a failure with no republication stays untagged.
- [x] #3 (R17-003) `markMaterialized()` preserves its internal read's republication when directory validation or `replaceText` fails, without re-wrapping an error that already carries the bit.
- [x] #4 (R17-004) `finalize()` derives its committed error tag from `writesCommitted` alone. A finalization failure after a recovery that reported a prune it did not perform is not tagged committed.
- [x] #5 (mutation evidence) Four mutations, one at a time, restored from a `cp` backup between runs, and every one is red.
- [x] #6 (no regression) All prior committed-write regressions stay green in both directions across SR-015..SR-018 and CDX16-001..004.
- [x] #7 (Quality Contract assertion 6) Live corpus digest is `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` over 237 files before and after.
- [x] #8 (D-012/D-013 boundary) `lib/memory/retirement-store.ts` stays byte-identical, no operation is added, removed or reordered, and D-026 is not reopened.
- [x] #9 (Quality Contract assertion 7) test, lint, typecheck, `git diff --check` and `plan check-artifacts` all pass with conformance GREEN.
<!-- AC:END -->

## Implementation Notes

Closed all four review-17 findings by making every post-republication path carry the bit out.

- R17-001 consolidation-proposals.ts: the confirmation read and its check move
  inside a try; a failure after a republication rethrows a new
  ProposalCommittedError.
- R17-002 consolidation-receipts.ts read(): the confirmation read, the
  changed-bytes check and parseReceipt all move inside one try, replacing the
  narrower branch-only tag added in TASK-664.
- R17-003 markMaterialized(): directory validation and replaceText move inside a
  try; a failure after confirmedByRead rethrows ReceiptCommittedError, guarded by
  hasCommittedWrites so an already-tagged error is not double-wrapped.
- R17-004 consolidation-sources.ts finalize(): the committed error tag now derives
  from writesCommitted alone. pruned is a domain outcome, not a write receipt —
  recovery can honestly report a prune another actor performed.

Four regressions added, one per finding. Mutation evidence: all four red when the
corresponding guard is removed, restored from cp backups between runs rather than
git checkout (which silently discarded uncommitted fixes earlier in this session).

Gates: 3111 tests pass (263 files, exit 0), typecheck 0, lint 0, git diff --check
clean, check-artifacts GREEN 12/0/0. Corpus digest
adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932 over 237 files
before and after. retirement-store.ts unchanged at
f064d1db0f26e70ae70d399a85184509b8147ad5b018cd0708def179228b400c. types.ts is
unchanged this round, so its pin stands at
08593a2c9f4d7311fe3b374872cd54ede2b7e6aeda376b79429797ad45a3c38d.
