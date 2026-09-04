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

## Suggested disposition

The four open findings are well-localised and independently fixable. Because
each remediation round in this area has reliably introduced a fresh defect, the
recommendation is to address them as a separate, narrowly-scoped plan with its
own review budget rather than by continuing to iterate on this branch — and to
treat any live retirement round as gated on finding 1 in particular, since a
wrong pressure reading is what would drive the Dropper to act.
