---
kind: knowledge-surface-backfill-amendment
plan: knowledge-surface
amendedAt: '2026-09-30'
ratifiedBy: Agustin Calabrese (2026-09-30, lean-coding-domain OD-2, relayed by Shepherd; decision D-5 of missions/architecture/spikes/lean-coding-domain/README.md)
configDigest: ca75a60007221f009d1c4026d40e87960d66d1033424d6feb95696984d363b03
---

# Knowledge surface — backfill receipt amendment 5

## What changed and why

The lean coding domain (`missions/architecture/lean-coding-domain-brief.md`,
coordinated out of band; ratified decision D-5 in the spikes README) adds
`git-workflow` and `contract` to the `skills` allowlist of
`.cosmonauts/config.json`, so lean agents can load the shared git-workflow
skill and the lean `contract` skill by name in this repository. No
knowledge-surface setting changed.

Changing the config moves its digest away from the one pinned by the frozen
Stage 7A backfill receipt; `tests/scripts/knowledge-surface-backfill.test.ts`
tripped as designed. This record registers the new legal digest on the same
audit trail as amendments 1-4. The previous ratified digest was
`0e10af9c9c235ab34b1780482cc9c7cbd692d45d214c80868cf4b3ec3e4d6bd8` (amendment 4).

The receipt's own digests, `backfill-review.json`, and the Stage 7B approval
stay frozen and untouched. The inventory is unchanged by this amendment.

## Provenance

**Ratified by the owner on 2026-09-30** (lean-coding-domain open decision
OD-2, relayed by Shepherd). Shepherd made this record as the mechanical
consequence of the ruled config change. Reversing it means restoring the
amendment-4 config and removing this file.
