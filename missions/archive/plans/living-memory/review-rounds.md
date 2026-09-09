---
title: 'Living memory: independent review rounds and open findings'
plan: living-memory
status: open
date: '2026-09-04'
rounds: 7
reviewer: codex exec (independent, read-only)
---

# Independent review rounds — living-memory implementation

Seven independent `codex exec` review rounds ran against `main...HEAD`. This
record exists so the open findings survive the session that produced them.

## Trajectory

| Round | Worst finding | Class |
|---|---|---|
| 1 | Retirement could unlink concurrently replaced human-curated bytes; rollforward mistook visibility for durability | **data destruction** |
| 2 | Residual check-then-unlink TOCTOU; whole-pass lock made every successful consolidate exit 1 | **data destruction** + regression |
| 3 | Tombstone restore could clobber a concurrently recreated file (`lstat`-then-`rename`) | **data destruction** |
| 4 | Crash mid-restore left both paths linked and recovery treated it as permanently irresolvable | liveness |
| 5 | Episode negative judgments did not converge; inlet and judgment bytes unbounded | bounds / convergence |
| 6 | Pressure stopped measuring what injection includes (regression from round 5's fix) | measurement |
| 7 | Pressure diverges in both directions (regression from round 6's fix); discharge treats unreadable as absent | measurement / reporting |

Rounds 5, 6 and 7 each independently confirmed that, excluding the ratified
D-026 class, no path destroys curated or source bytes other than the verified
manifested/represented object, and no unrecoverable non-terminal record state
exists. The data-safety story is closed; what remains is measurement, reporting
and convergence.

Six of the seven rounds' fixes introduced a new defect. That did not converge,
which is why round 7 was made the last by agreement with the owner.

## Open findings (not fixed)

Severity as classified by the round-7 reviewer. None is a data-safety issue.

1. **HIGH — INV-007 / B-021, measurement.** Index pressure and actual
   combined-context injection can disagree in both directions: a probe measured
   over 12 KB against a 364-byte actual injection, and the inverse arrangement
   produced a false fit (368 measured vs 12,358 injected). Injection also renders
   retrieval warnings that the corpus adapter discards before measurement.
   Consequence: the regulator can wrongly believe the index target fits, or
   wrongly believe it does not. Introduced by round 7's own fix to round 6's
   finding.
2. **HIGH — B-016, convergence.** Receipt discharge can still mistake
   non-admission for absence. A read failure becomes a warning and a skipped
   scan without marking the inventory incomplete, so an empty supplied inventory
   authorizes discharge. A probe made an unchanged valid record temporarily
   unreadable and its materialized receipt was deleted. Source bytes remained
   intact; the record can later be re-judged.
3. **MEDIUM — B-012, reporting.** A committed receipt removal can still report
   `writesCommitted: false`: durable removal marks unlink-then-failed-sync as
   committed, but discharge wraps that error using only the count of previously
   completed removals, so a failure after the first unlink loses the committed
   bit.
4. **MEDIUM — B-012, reporting.** Episode-recovery commits are erased from
   reporting: recovery folds `writesCommitted` into details, but the later
   details reconstruction overwrites it with retirement recovery state only. A
   probe returned `noop` with a non-empty `episodePrunes` list and
   `writesCommitted: false`.

Behaviours B-012, B-016 and B-021 therefore carry their exact markers and named
tests but are not behaviourally satisfied; the marker tests pass while
counterexamples exist. INV-007 remains violated. INV-001, INV-002, INV-003,
INV-004, INV-005 and INV-006 hold outside the D-026 class.

## Confirmed clean across the final rounds

- No destruction of curated or source bytes outside the ratified D-026 class.
- Retirement ordering intact: journal → retired link → manifest commit → live
  tombstone removal; recovery rolls committed journals forward, uncommitted
  back, and retains conflicted journals.
- Receipts-before-relocation sequencing: `d9c6fe1` precedes `2fe6cde` (INV-003).
- Model output confined to `memory/agent/`; nothing model-authored enters
  `knowledge/` (INV-006).
- No forbidden imports into `lib/memory`; no unused exports in `lib/memory`,
  `lib/extensions/knowledge-surface`, or `cli/memory`.
- Full suite 3050/3050, lint, typecheck, `git diff --check` all pass; worktree
  clean; live `knowledge/` byte-identical throughout.

## Also open: one inherited performance task

A Quality-Manager round created three remediation tasks before its chain died.
`TASK-621` and `TASK-622` (bound source and judgment bytes, PF-002) are closed —
`TASK-622`'s six criteria were independently satisfied by the later `TASK-626`
and `TASK-628` work: per-record and aggregate corpus/episode byte ceilings and a
serialized judgment request ceiling now exist in the core limits contract, the
citation inventory enforces both a per-record and a remaining-aggregate ceiling,
and 23 regression assertions cover them.

`TASK-623` (remove duplicate living-memory evidence scans, PF-003) remains **To
Do** and is a genuine open item. It is a performance concern, not correctness: a
non-dry pass invokes retirement apply with an empty candidate list yet still
folds receipts and scans citations, proposal evidence and materializations parse
the same directory independently, and receipt histories are folded repeatedly.
Its own acceptance criteria require preserving mandatory fresh under-lock
revalidation, so it must not be treated as a licence to cache across mutation
boundaries.

## Suggested disposition

The four open findings are well-localised and independently fixable. Because
each remediation round in this area has reliably introduced a fresh defect, the
recommendation is to address them as a separate, narrowly-scoped plan with its
own review budget rather than by continuing to iterate on this branch — and to
treat any live retirement round as gated on finding 1 in particular, since a
wrong pressure reading is what would drive the Dropper to act.

## Note added 2026-09-07 — the disposition's mechanism claim, checked

The recommendation above stands and was acted on: the four findings became plan
`living-memory-fidelity` with its own review budget, backlog `TASK-630..641`.

Its closing clause — "a wrong pressure reading is what would drive the Dropper
to act" — was checked against the implementation while writing that plan's spec,
and does not hold for the code as it stands. Index pressure is reporting-only:
`targetUnmetDeclines` (`lib/memory/living-memory.ts:2027`) emits a `target-unmet`
decline and nothing else, and retirement candidates are selected from
`retire-when` predicates on the records themselves
(`lib/memory/living-memory.ts:319-321`, `structuredRetireWhen`), never from
pressure. A wrong measurement corrupts a report, not a decision.

The two divergence directions are also not symmetrical. Over-measurement reports
`target-unmet` pressure that is not real; under-measurement — finding 1's false
fit — reports a fit that is not real, which for retirement is the conservative
direction, because nothing in the pass acts on a satisfied target.

The gate on a first live retirement round is therefore an **ordering** argument
rather than a safety one: `living-memory-fidelity` is what turns the measurement
into an authorizer (its AC-002 and INV-001), and the reported figure is what an
owner would read to judge whether a first live round did the right thing. The
corrected analysis lives in `missions/plans/living-memory-fidelity/spec.md`
(Purpose, "What a wrong number can and cannot do today").

The round-7 text above is left unaltered: it records what that review round
found and recommended, and its four findings are unaffected — this note corrects
one mechanism claim in the disposition, not the findings.
