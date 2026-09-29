---
kind: knowledge-surface-backfill-amendment
plan: knowledge-surface
amendedAt: '2026-09-29'
ratifiedBy: Agustin Calabrese (2026-09-29, round 10, relayed by Shepherd; plan project-health-audit D-041)
configDigest: 0e10af9c9c235ab34b1780482cc9c7cbd692d45d214c80868cf4b3ec3e4d6bd8
---

# Knowledge surface — backfill receipt amendment 4

## What changed and why

Plan `project-health-audit` D-041 changes the `qualityReview` block of
`.cosmonauts/config.json` under the owner's round-10 rulings (2026-09-29,
typed to Shepherd): `checks` gains `reachability` (`bun run check:reachability`,
120 000 ms) so the Quality Manager host resolves it directly, and the QM
timeouts are raised to `panelTimeoutMs: 1200000` and
`assessmentTimeoutMs: 1800000` after QM run 1 on that branch expired the
default 300 000 ms panel budget on a 177-file diff and runs 2-3 needed
640-868 s of assessing. No knowledge-surface setting changed.

Changing the config moves its digest away from the one pinned by the frozen
Stage 7A backfill receipt; `tests/scripts/knowledge-surface-backfill.test.ts`
tripped as designed. This record registers the new legal digest on the same
audit trail as amendments 1-3. The previous ratified digest was
`6a103986e12f5f33f052e58ef95d20d2265a3255b9e087dc2b114ac523828015` (amendment 3).

The receipt's own digests, `backfill-review.json`, and the Stage 7B approval
stay frozen and untouched. The inventory is unchanged by this amendment; the
archive of `project-health-audit` itself is recorded in the plan's closing
note, not here.

## Provenance

**Ratified by the owner on 2026-09-29** (round 10, relayed by Shepherd). The
implementing coordinator made this record as the mechanical consequence of the
ruled config change. Reversing it means restoring the amendment-3 config and
removing this file.
