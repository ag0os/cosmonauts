# Independent Structural Review: confirmation-write remediation

- Date: `2026-09-09`
- Task: `TASK-665`
- Remediation commit: `587f8ea` (`af7d406..587f8ea`)
- Reviewer: independent `codex exec --sandbox read-only`, told that the previous
  round's remediation is the subject and that its correctness is unproven.
- Verdict: **remediation required — no high findings, four unresolved medium
  findings; the plan cannot close**

## What the round confirmed closed

- **All three confirmation sites report correctly in the success direction.** An
  ordinary fsync of an intact file returns false at every one; a clean
  republication after a concurrent unlink returns true. Direct intact-file probes
  produced false at all three.
- **The `read()` contract change is correct at both production callers.** The
  consolidator ORs the bit exactly once and attributes it to the current pass;
  `markMaterialized()`'s already-materialized branch is right to return
  `confirmedByRead`, because that republication happened during this call, and
  boolean OR accumulation prevents double-counting.
- **CDX16-003 is correct in both directions.** The OR at
  `consolidation-sources.ts:516` happens before every later check and `continue`.
- **All seven tests added by `587f8ea` genuinely pin their production change**,
  checked one at a time. The four consumer tests isolate their seams, with no
  sibling double masking the bit under test.
- **No durable operation added, removed, or reordered**;
  `lib/memory/retirement-store.ts` byte-identical between `af7d406` and `587f8ea`.
- **All nine added comments are accurate and none should be deleted** — with the
  qualification that two production comments stated invariants the code did not
  yet make universally true, which findings 1 and 2 below fix.

## Findings

Three of the four are **axis A reopened at the sites axis C created**: a
confirmation write is a new source of commitment, and a later throw on that path
loses it. The fourth is axis B, made reachable by this plan's own earlier change.

### R17-001 — MEDIUM — Proposal republication lost if the confirmation read fails

- Code: `lib/memory/consolidation-proposals.ts:102`, `:106`

`destinationLinked` is captured, but the confirmation check throws an untagged
`Error`. Interleaving: the pass reads the proposal; another actor unlinks it;
`writeText` republishes and returns true; another actor changes it before the
confirmation read; `persist()` throws with no commit tag; the consolidator's
catch reports `writesCommitted: false`. Reproduced.

### R17-002 — MEDIUM — Receipt republication lost on confirmation-read or parse failure

- Code: `lib/memory/consolidation-receipts.ts:189`, `:208`

Only the explicit `confirmed !== raw` branch was tagged. An exception from the
confirmation read itself, or from `parseReceipt()`, stayed untagged. Reproduced
with a malformed receipt that republishes successfully and then fails to parse.

### R17-003 — MEDIUM — `markMaterialized()` drops its internal read's true bit

- Code: `lib/memory/consolidation-receipts.ts:248`, `:263-268`

The bit is captured but not preserved on the accepted-receipt branch if directory
validation or `replaceText` fails. The internal `read()` republishes, `replaceText`
then fails before its own commit, and the untagged error erases the republication.

### R17-004 — MEDIUM — `finalize()` infers a commit from the `pruned` domain outcome

- Code: `lib/memory/consolidation-sources.ts:579`

`if (writesCommitted || pruned.length > 0)` throws a committed-tagged error even
when nothing was written. This is the forbidden inference from a domain outcome.
The line predates this plan's work, but `af7d406` is what made
`episodePrunes.length > 0` with `writesCommitted: false` reachable — recovery can
now honestly report a prune another actor performed. A third instance of "a
correct local fix changes the safety of a distant call site".

## Remediation applied (TASK-666)

- R17-001: the confirmation read and its check move inside a `try`; a failure
  after a republication rethrows a new `ProposalCommittedError` carrying the bit.
- R17-002: the confirmation read, the changed-bytes check and `parseReceipt` all
  move inside one `try`; any failure after a republication rethrows
  `ReceiptCommittedError`. This replaces the narrower branch-only tag.
- R17-003: directory validation and `replaceText` move inside a `try`; a failure
  after `confirmedByRead` rethrows `ReceiptCommittedError`, guarded by
  `hasCommittedWrites` so an already-tagged error is not re-wrapped.
- R17-004: the condition becomes `if (writesCommitted)`. `pruned` is a domain
  outcome, not a write receipt.

## Mutation evidence

Four mutations, one at a time, each restored from a `cp` backup between runs
(not `git checkout`, which silently discarded uncommitted fixes earlier in this
session):

| Mutation | Result |
|---|---|
| proposal confirmation tag removed | **red** |
| receipt read tag removed | **red** |
| `markMaterialized` tag removed | **red** |
| `pruned.length > 0` inference restored | **red** |

## Structural Gate Status

All five bindable gates remain **degraded/unbound** in both the reviewer's and
the coordinator's session. No executable structural evidence exists for any of
them; the mutation table above is not a substitute.

## Verification

- `bun run test`: 3111 passed, 263 files, exit 0.
- `bun run typecheck`, `bun run lint`, `git diff --check`: clean.
- `plan check-artifacts living-memory-fidelity`: GREEN, 12 behaviours, 0 issues,
  0 advisories.
- Live corpus guard before and after:
  `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`, 237 files.
- `lib/memory/retirement-store.ts` unchanged at
  `f064d1db0f26e70ae70d399a85184509b8147ad5b018cd0708def179228b400c`.

## Closing assessment

The round found no high findings and confirmed the previous round's fixes correct
in the success direction, with tests that genuinely pin them. What it found is
the predictable second-order cost: closing axis C created three new commitment
sources, and each reopened axis A at its own error path. Those are now closed by
construction rather than by inspection — every path after a republication carries
the bit out.

Because remediation followed the verdict, D-006 requires another fresh structural
review before this round is closed — recorded at `review-18.md`.
