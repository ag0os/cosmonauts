---
kind: knowledge-surface-promotion
plan: knowledge-adoption
round: 8
promotedBy: Agustin Calabrese
promotedAt: '2026-09-14T00:00:00Z'
selection: stale-citation-repair
ratifiedVia: missions/reviews/knowledge-surface-promotion-8.md
promotedCount: 0
rejectedCount: 0
promotions: []
curatedRecords:
  - knowledge/episodic-log.md
  - knowledge/code-structure-map.md
  - knowledge/durable-backend-step-model.md
  - knowledge/artifact-format-redesign.md
rejections: []
---

# Knowledge surface — curation round

## Decision

No promotions and no rejections. This round records four curated-body edits
that repair dead citations surfaced by the first live
`cosmonauts memory consolidate --dry-run` against this repository's corpus
(2026-09-14). Each edit replaces a path string that no longer resolves with
the path the file actually occupies today; no other prose changed, and no
frontmatter was touched.

| Record | Citation | Corrected to |
| --- | --- | --- |
| `knowledge/episodic-log.md` | `missions/plans/episodic-log-detached-hardening/spec.md` | `missions/archive/plans/…` (plan archived) |
| `knowledge/code-structure-map.md` | `memory/drive-resilience-state-model.md` | `knowledge/drive-resilience-state-model.md` (knowledge-surface migration) |
| `knowledge/code-structure-map.md` | `memory/task-id-system.md` | `knowledge/task-id-system.md` (knowledge-surface migration) |
| `knowledge/durable-backend-step-model.md` | `driver/backends/types.ts` | `lib/driver/backends/types.ts` (missing root segment) |
| `knowledge/artifact-format-redesign.md` | `bundled/coding/coding/skills/tdd/SKILL.md` | `bundled/coding/skills/tdd/SKILL.md` (duplicated segment) |

Two failure classes: three citations rotted when files moved beneath them,
and one carries a duplicated `coding/coding/` segment that was almost
certainly never valid.

## Not in this round

A fifth dead citation — `bundled/coding/coding/prompts/quality-manager.md`
in `knowledge/artifact-format-redesign/0a6f10ef-b44c-4c71-9f73-87d7166e7c99.md`
— is **deliberately left standing**. It lives in the record's `files:`
frontmatter, not its body. The B-003 seed audit forgives recorded body
curation and never forgives metadata drift, because that metadata is the
one-to-one conversion of the frozen legacy bundle
(`tests/fixtures/knowledge-seed-inventory.json`). Correcting it means editing
the frozen inventory, i.e. rewriting ratified migration history to say the
distiller wrote a path it did not write. That needs an owner ruling, not a
curation entry. Tracked with the `living-memory-corpus-findings` item.

Executed by the session agent on the owner's explicit instruction
("yes, fix the five citations"), 2026-09-14.
