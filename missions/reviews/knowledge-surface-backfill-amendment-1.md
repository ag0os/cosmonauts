---
kind: knowledge-surface-backfill-amendment
plan: knowledge-surface
amendedAt: '2026-08-27'
ratifiedBy: Agustin Calabrese
configDigest: e3d93fa1ff7612d86cd4432d7d3b0e8d83bab95b350d9a4c4ddd5fc2de576911
inventoryAmendment:
  archivedPlanSlugsAdded:
    - harness-adapters
  distilledSlugsAdded:
    - harness-adapters
---

# Knowledge surface — backfill receipt amendment 1

## What changed and why

Two deliberate, on-record acts on 2026-08-26 (commit `1e4567d`) drifted the
world around the frozen Stage 7A backfill receipt, exactly as its tripwires
anticipated ("Backfill halted for an on-record inventory amendment"):

1. **`knowledgeSurface.enabled: true`** was set in `.cosmonauts/config.json` —
   the knowledge-adoption dogfooding decision recorded on the ROADMAP. The
   enabled config is byte-identical to the backfill's `temporaryConfigDigest`
   (the config the run itself operated under before restoring). The
   `configDigest` above records the new legal current state; the receipt's own
   digests stay frozen and historical.
2. **`harness-adapters` was archived** after being distilled through the live
   `propose_knowledge` gate (13 proposals, full provenance). It is added to the
   frozen inventory's `archivedPlanSlugs` and `distilledSlugs`; the derived
   `missingSlugs` set is unchanged at 19.

This amendment was ratified by the project owner in the 2026-08-27 backlog
triage session (see `knowledge-proposal-backlog-analysis.md`, ratification
note). `backfill-review.json` and the Stage 7B approval document are
deliberately untouched — they remain frozen receipts of what happened.
