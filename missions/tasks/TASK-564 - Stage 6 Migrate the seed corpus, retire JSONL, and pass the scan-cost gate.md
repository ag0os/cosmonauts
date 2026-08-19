---
id: TASK-564
title: 'Stage 6: Migrate the seed corpus, retire JSONL, and pass the scan-cost gate'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:knowledge-surface'
dependencies:
  - TASK-563
createdAt: '2026-08-19T18:35:55.274Z'
updatedAt: '2026-08-19T18:35:55.274Z'
---

## Description

Deliver Slice B Stage 6 and own B-003. Perform the one-to-one content migration and legacy API retirement atomically, then collect the first representative recurring-scan evidence against the real migrated corpus. Tests must be observed RED before implementation, then GREEN, followed by refactoring; no reusable migration program survives beyond the frozen fixture.

AC-002, INV-3, and the scope/default declarations are stop-and-escalate ground: knowledge is OKF markdown only with the four ratified types; this is conversion, not consolidation; user knowledge receives no project seed copy; repo-content migration is ungated and the runtime gate remains OFF by default. Only D-009-permitted distiller/archive/project-context/doc pointer corrections may differ, and any shipped prompt/skill touched must remain stack-agnostic. No consolidation, working state, episode/explicit-save changes, embeddings/cache, retention, sandbox, or default enablement may be added.

<!-- AC:BEGIN -->
- [ ] #1 B-003 is GREEN against the frozen inventory: all 36 markdown distillations and every record/header in the 10 JSONL bundles map one-to-one to canonical OKF destinations, including byte-preserved body/content, `planTitle`, exact non-colliding legacy keys, preserved raw timestamps/`createdAt`, and canonical UTC RFC3339 millisecond timestamps; if execution-time repository state diverges from the frozen inventory (counts or digests), the migration halts and the inventory is re-frozen on the record rather than proceeding against stale counts.
- [ ] #2 The Design §6 field matrix is complete for every destination and `knowledge/index.md` maps every source/record ID; invalid or uninventoried timestamp forms stop the migration rather than inventing data or adding a fifth type.
- [ ] #3 All destinations validate before the 46 legacy files are removed; afterward no root distillation or `.knowledge.jsonl` remains under `memory/`, `lib/sessions/knowledge.ts` and related exports/types/tests are retired, and no active API, instruction, or compatibility reader/writer names JSONL.
- [ ] #4 The migrated project layout contains only human-curated OKF markdown under `knowledge/`; no seed is copied to the user twin, no proposal is promoted, and the literal-true runtime gate remains configured/defaulted OFF despite the ungated content migration.
- [ ] #5 Stage 6 writes `missions/reviews/knowledge-surface-scan-cost.md` from 20 representative enabled turns over the migrated corpus with all planned frontmatter/body inputs and raw per-turn stats; GREEN requires `verdict: pass`, p95 ≤250 ms, max bytes ≤10 MiB, and files/bytes within eligible corpus counts.
- [ ] #6 A threshold breach or `verdict: amend` blocks Stage 6 completion and all backfill work and reopens the design; it is never treated as degradation, and no speculative cache, embedding, registry, or alternate backend is introduced as an implicit fix.
- [ ] #7 The B-003 executable test carries `@cosmo-behavior plan:knowledge-surface#B-003`, is run RED before migration and GREEN after atomic retirement/refactor, and the Quality Contract’s field-deletion, body-change, timestamp, destination, active-JSONL, and allowed-pointer mutations are detectably failing faults.
<!-- AC:END -->
