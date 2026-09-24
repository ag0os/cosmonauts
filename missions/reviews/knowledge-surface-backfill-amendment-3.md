---
kind: knowledge-surface-backfill-amendment
plan: knowledge-surface
amendedAt: '2026-09-24'
ratifiedBy: Agustin Calabrese (2026-09-24, relayed by Shepherd; plan qm-chain-safety D-030)
configDigest: 2e50c9869693be62d418ef709d4bc9a58d9889bb2781c2d9d40a3c70a2721149
---

# Knowledge surface — backfill receipt amendment 3

## What changed and why

Plan `qm-chain-safety` adds a `qualityReview` block to `.cosmonauts/config.json`.
The block holds the dependency `prepare` step, the host-run `checks`, and the
`diverseReviewerModel`. The plan's Files to Change lists this file. D-019 is
human-ratified on 2026-09-23 and says "This repository configures both", so the
config change is sanctioned ground.

Changing the config moves its digest away from the one pinned by the frozen
Stage 7A backfill receipt. `tests/scripts/knowledge-surface-backfill.test.ts`
tripped as designed during TASK-724. This record registers the new legal digest
on the same audit trail as amendments 1 and 2.

The receipt's own digests, `backfill-review.json`, and the Stage 7B approval
stay frozen and untouched. The inventory is unchanged: no plan was archived or
distilled.

The `qualityReview` block is written across Stages 5–7 (TASK-724..726). Until
the owner ratifies this record, the stage that last changes
`.cosmonauts/config.json` updates `configDigest` above to the file's SHA-256.
Every intermediate digest stays reconstructible from the task commits.

## Provenance

**Ratified by the owner on 2026-09-24** (relayed by Shepherd; plan qm-chain-safety D-030). The implementer made this record as the mechanical
consequence of a config change that the plan and D-019 sanction. It is
recorded here rather than absorbed silently, so the owner can ratify or
reverse it. Reversing it means removing the `qualityReview` block, which
leaves the QM visibly "not configured" (D-019).
