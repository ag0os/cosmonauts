---
title: 'Living memory: sources, two outlets, and the corpus regulator'
status: active
createdAt: '2026-07-17T13:42:06.390Z'
updatedAt: '2026-09-01T18:36:10.000Z'
---

## Summary

Re-spec of `memory-consolidation` per the ratified living-memory slate
(`missions/architecture/living-memory.md`, A-7; authoritative summary in
`knowledge-and-memory.md` §10.2). Make `consolidate()` real as the
living-memory machine: pluggable sources feed one pump; descriptive output
flows to knowledge proposals under the existing promotion gate;
prescriptive `improve` output converts to the backlog and closes; and the
L4 corpus regulator (corpus-scope Observer→Reflector→Dropper) keeps the
live set minimal under Option C retirement authority — the machine
soft-retires with evidence to `knowledge/retired/`, human ledger rounds
hard-delete or veto. Receipts land before any moving code (A-4). Target
size binds the injected index, not disk (LM-D-002).

This plan is spec-ready and awaits planner design. Depends on the shipped
knowledge surface (corpus + retrieval + frozen-receipt audit); pairs with
`autonomy-host` (its scheduler — manual invocation works without it). The
episodic-log inlet rides behind the same sources seam.

## Scope

The receipt/ledger extension first; proposal kinds `retire`/`merge`/
`improve` with evidence chains and lifecycle; the retired area, retirement
manifest, and soft-retire mechanics with retrieval exclusion; the L4
regulator passes (deterministic checks first, model judgment second;
inbound-reference check mandatory); `gotcha` `retire-when`; the
`consolidate()` seam, dry-run, CLI invocation, and autonomy-host payload
contract; the sources contract with corpus + episodic adapters. No TTL on
the retired area, no L1/OM adoption or fork, no scheduling, no live
retirement round (a separate owner-triggered act), no new OKF types.

## Decision Log

- **D-001 - Ratified ground imported whole**
  - Decision: LM-D-001..008 and slate A-1..A-10 (`living-memory.md`
    §7.1/§9), amended C-1/C-3 (`knowledge-and-memory.md` §9), and the §11
    proposals-area ruling are consumed as ratified ground; the planner
    designs inside them.
  - Alternatives: re-derive or re-open during planning — forbidden;
    reopening is the owner's act alone.
  - Why: the design dialogue already ruled these with alternatives on
    record; re-litigation is drift.
  - Decided by: human, 2026-09-01 ("ratify all")
- **D-002 - Plan slug: rename, not fresh**
  - Decision: `git mv missions/plans/memory-consolidation` →
    `missions/plans/living-memory`; live references updated in the same
    change; archived/historical references stand.
  - Alternatives: fresh directory + superseded stub; keep dir, retitle
    only.
  - Why: A-7 says the re-spec *is* living-memory; one slug everywhere
    beats a ghost directory.
  - Decided by: human, 2026-09-01
- **D-003 - Rollup fold direction: sub-records win**
  - Decision: typed sub-records stay the retrieval/retirement unit; parent
    rollups fold to thin overviews that link, not restate.
  - Alternatives: parents win (retire contained sub-records); defer to the
    first L4 round with per-cluster evidence.
  - Why: matches OKF typing, record-level `retire-when`, and retrieval
    granularity; addresses the 110-record duplication at its cause.
  - Decided by: human, 2026-09-01
- **D-004 - The 9608b54 conflict: edit, not retire**
  - Decision: the ephemeral-session-compaction gotcha gets an edit-narrow
    proposal (keep the across-run claim the OM spike cites; drop the fixed
    within-run half), seeding the first ratified round.
  - Alternatives: retire on code evidence; leave untouched.
  - Why: cause-fixed evidence and inbound citations disagreed — exactly
    the case INV-004's inbound-reference check exists for; narrowing keeps
    the spike's citation valid.
  - Decided by: human, 2026-09-01
