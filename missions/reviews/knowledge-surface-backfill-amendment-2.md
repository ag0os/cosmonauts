---
kind: knowledge-surface-backfill-amendment
plan: knowledge-surface
amendedAt: '2026-09-09'
ratifiedBy: pending — made by the implementer, awaiting owner ratification
configDigest: e3d93fa1ff7612d86cd4432d7d3b0e8d83bab95b350d9a4c4ddd5fc2de576911
inventoryAmendment:
  archivedPlanSlugsAdded:
    - living-memory
    - living-memory-fidelity
  distilledSlugsAdded:
    - living-memory
    - living-memory-fidelity
---

# Knowledge surface — backfill receipt amendment 2

## What changed and why

Archiving `living-memory` and `living-memory-fidelity` on 2026-09-09 drifted the
world around the frozen Stage 7A backfill receipt, and its tripwire fired exactly
as designed: `tests/scripts/knowledge-surface-backfill.test.ts` failed with
"Backfill halted for an on-record inventory amendment: archived plan directories
no longer match the frozen inventory."

This is the same act, and the same amendment, as amendment 1 for
`harness-adapters`. Both plans were distilled through the live
`propose_knowledge` gate before archiving — ten OKF proposals with full
provenance under `memory/agent/proposals/living-memory-fidelity/` — so they belong
in `distilledSlugs` as well as `archivedPlanSlugs`, and the derived `missingSlugs`
set is **unchanged at 19**. The frozen 19-slug batch that
`knowledge-surface#B-010` pins is therefore preserved, which is the invariant the
tripwire exists to protect.

`.cosmonauts/config.json` is byte-identical to amendment 1's `configDigest`; the
config did not change. `backfill-review.json` and the Stage 7B approval document
are deliberately untouched — they remain frozen receipts of what happened.

Counts after the amendment: `archivedPlanSlugs` 57 → 59, `distilledSlugs` 38 → 40,
`missingSlugs` 19 → 19.

## Provenance

Amendment 1 was ratified by the project owner in the 2026-08-27 backlog triage
session. **This one is not yet ratified.** It was made by the implementer as the
mechanical consequence of an archive the owner directed, and it is recorded here
rather than absorbed silently so the owner can ratify or reverse it. Reversing it
means un-archiving both plans; nothing else in the receipt chain depends on it.

## Note on `.DS_Store`

While diagnosing this, `missions/archive/plans/.DS_Store` (untracked, dated
2026-03-09) was observed in the archive directory. It is correctly excluded:
`listArchivedPlanSlugs` filters on `isDirectory() && !isSymbolicLink()`, so a
stray file cannot enter the inventory. No action taken.
