## Purpose

Living memory shipped verified: 21 behaviours, exact markers, 3050 tests green,
live `knowledge/` byte-identical. Seven independent `codex exec` review rounds
against `main...HEAD` closed the data-safety story — excluding the ratified
D-026 class, no path destroys curated or source bytes, and no unrecoverable
non-terminal record state exists.

Four findings remain open, recorded in
`missions/plans/living-memory/review-rounds.md`. None is a data-safety issue.
They share one defect class: **the pass does not measure or report what it
actually did.** Index pressure diverges from the injection it claims to
measure; receipt discharge mistakes a record it could not read for a record
that is gone; two committed-write bits are lost on the way to the result.

Behaviours B-012, B-016 and B-021 therefore carry their exact markers and named
tests while counterexamples exist, and INV-007 is violated.

Two calibration measurements taken 2026-09-07, before any design:

- **On the live 237-record corpus the two agree exactly today** — injection and
  pressure both render 16,742 bytes over the same 236 records, `targetSatisfied:
  false`, with 146 byte-limit read declines alongside. The healthy corpus is not
  where this breaks.
- **One unparseable record is enough to break it.** In a temp fixture, a single
  malformed knowledge record makes injection render a 331-byte index (0 records,
  1 warning) while the pressure policy measures 0 bytes and reports
  `targetSatisfied: true`.

The divergence therefore appears exactly when something is already wrong with
the corpus. Note the live corpus currently reports the index target **unmet**
(16,742 rendered + 536 headroom against a 7,982-byte guaranteed share).

**What a wrong number can and cannot do today** *(corrected 2026-09-07; an
earlier draft of this section overstated it).* Index pressure is
**reporting-only** in the current implementation: `targetUnmetDeclines`
(`lib/memory/living-memory.ts:2027`) emits a `target-unmet` decline and nothing
else, and retirement candidates are selected from `retire-when` predicates on
the records themselves (`lib/memory/living-memory.ts:319-321`,
`structuredRetireWhen`), never from pressure. A wrong measurement therefore
corrupts a *report*, not a decision. The two directions are also not
symmetrical in consequence: over-measurement reports `target-unmet` pressure
that is not real, while under-measurement — the false fit the 331-versus-0-byte
probe shows — reports a fit that is not real and is, for retirement, the
conservative direction, since nothing in the pass acts on a satisfied target.

This matters for sequencing rather than for safety, and this plan is what
changes it: AC-002 makes an unusable measurement unable to report a fit or
authorize retirement, and INV-001 states that pressure that cannot be trusted
does not authorize retirement at all. The plan is what gives the measurement
authority it does not yet have, which is the reason to make it faithful first.

Two facts set this plan's shape:

- **Finding 1 is the recommended ordering gate on the first live retirement
  round** *(rationale corrected 2026-09-07).* Not because a wrong number could
  destroy something today — it cannot, per the paragraph above — but because
  this plan is what turns the measurement into an authorizer, and because the
  reported figure is what an owner would read to judge whether a first live
  round did the right thing. Make the number faithful before it decides
  anything, and before it is the evidence for a decision. Whether that ordering
  is binding is an owner call, recorded in Open Questions; the plan is written
  so that closing finding 1 is what lifts it.
- **Iterating on the parent branch stopped converging.** Six of the seven review
  rounds' fixes introduced a fresh defect; rounds 6 and 7 each regressed the
  pressure measurement the previous round had just fixed. The round-7 reviewer's
  recommendation — carried forward by the previous session, not yet ratified —
  was to close these as a separate, narrowly-scoped plan with its own review
  budget rather than continue iterating on that branch.

## Intent

Goal: the numbers living-memory acts on and the outcomes it reports are the ones
that actually occurred — measured pressure equals the injection it stands for,
discharge never mistakes non-admission for absence, and a committed write is
never reported as uncommitted.

Inherited ground, authoritative and unchanged: the living-memory spec's
INV-001..INV-007 (`missions/plans/living-memory/spec.md`) govern this plan
verbatim. This plan exists to close the standing violation of **INV-007** and to
make **B-012**, **B-016** and **B-021** behaviourally true rather than merely
marked. Where any mechanism designed here collides with an inherited invariant,
the inherited invariant wins.

**D-026 stands.** The ratified check-then-destructive-pathname class is closed
ground: no fifth verification layer, no reopening, no re-litigation. Nothing in
this plan touches retirement's pathname sequencing.

Invariants — mechanism yields to these. **Ratified by the owner 2026-09-07**;
drafted by an agent in the same session, from the sources traced in the plan's
D-011. They are now human ground: an implementing agent may not narrow, widen or
reinterpret them without another human decision.

- INV-001 - Any number that authorizes a mutation is derived from the exact
  artifact it claims to measure. Index pressure is computed over the same record
  set, the same query filter, the same admission decisions and the same renderer
  inputs — warnings included — as combined-context injection, or it does not
  authorize retirement.
- INV-002 - Absence of evidence is never evidence of absence. A record the pass
  could not read, parse or admit is never treated as gone: the inventory it
  feeds is marked incomplete, and no discharge, retirement authorization or
  represented-evidence conclusion may proceed on an inventory that is not known
  complete.
- INV-003 - A reported outcome never understates committed writes. Once bytes
  are durably changed, every downstream result path — success, failure, error
  wrap, or details reconstruction — carries `writesCommitted: true`.
- INV-004 - Closing these findings weakens nothing that stands. No frozen pin
  (byte-pin, doc-pin, source-hash pin), receipt floor, retirement/byte
  authority, fail-closed model-output validation, or existing behaviour marker
  is removed or relaxed; no live retirement round runs; live `knowledge/` is
  never read-modified-written by this work.

## Users

- **The corpus Dropper (machine)** — reads index pressure to judge whether the
  index target is met. Today that judgement is reporting-only: it produces a
  `target-unmet` decline, while retirement candidates come from `retire-when`
  predicates on records. Under this plan pressure gains real authority — an
  unusable measurement blocks retirement (AC-002, INV-001) — which is what makes
  it the consumer whose correctness governs a mutation.
- **The owner running `cosmonauts memory consolidate`** — reads the result to
  decide whether the tree changed and whether to intervene. Reporting that
  understates committed writes sends them to inspect the wrong state.
- **A future autonomy host** — consumes result kinds and exit codes unattended,
  with no operator to notice that a `noop` had in fact pruned episodes.

## User Experience

- The owner runs a dry-run pass before the first live retirement round and the
  reported pressure is the pressure an agent turn would actually feel. Today the
  same corpus can measure over 12 KB against a 364-byte real injection, or
  measure 368 bytes against a 12,358-byte real injection and report a false fit.
- A pass that could not read one corpus record says so and declines the work
  that depends on knowing the corpus completely, instead of silently deleting
  that record's materialized receipt as stale.
- A pass that unlinked a receipt file and then failed reports `writesCommitted:
  true`, so the owner knows the tree changed before they decide what to do next.
- A recovery pass that pruned episodes reports the prunes it made *and* the
  commit that made them, rather than a `noop` alongside a non-empty prune list.

## Acceptance Criteria

Measurement fidelity (finding 1 — HIGH, INV-007 / B-021):

- [ ] AC-001 - Index pressure is measured over what injection renders: the same
  scope set, the same record-type/query filter, the same treatment of
  byte-declined records, and the same renderer inputs. Named regression tests
  reproduce both round-7 divergences — the over-measured (≈12 KB measured
  against a 364-byte injection) and the false fit (368 measured against a 12,358
  byte injection) — and fail against the current implementation.
- [ ] AC-002 - A record the measurement path cannot convert into an index row is
  never silently dropped from the measurement. `toIndexRecords`
  (`lib/memory/living-memory.ts:1067`) currently returns `[]` for any inventory
  record whose metadata is missing one of six fields, while injection still
  renders that record. Either the record measures as injection renders it, or
  the measurement is marked unusable — and an unusable measurement can never
  report `targetSatisfied: true`.
- [ ] AC-003 - Retrieval warnings count toward measured bytes whenever injection
  renders them. `renderKnowledgeIndex` is called with warnings by injection
  (`lib/extensions/knowledge-surface/combined-context.ts:205`) and without them
  by the pressure policy (`lib/extensions/knowledge-surface/index-policy.ts:44`).
  Reproduced 2026-09-07 in a temp fixture holding one unparseable knowledge
  record: injection renders a 331-byte index carrying the warning, the pressure
  policy measures **0 bytes** and reports **`targetSatisfied: true`**.

Completeness before discharge (finding 2 — HIGH, B-016):

- [ ] AC-004 - A source that omits a record it could not read, parse or admit
  marks the collected inventory incomplete. `collectConsolidationSources`
  currently sets `inventoryComplete = false` only when a source supplies no
  inventory at all (`lib/memory/consolidation-sources.ts:741-743`), and the
  corpus adapter discards `retrieved.warnings` entirely
  (`lib/memory/consolidation-sources.ts:193`) even though the knowledge store
  emits one warning and skips the path for every unreadable or unparseable
  record (`lib/memory/knowledge-store.ts:227,247`).
- [ ] AC-005 - Receipt discharge never runs against an inventory that is not
  known complete. A probe that makes one unchanged, valid corpus record
  temporarily unreadable leaves its materialized receipt in place and the pass
  declines the dependent work, instead of discharging the receipt as stale
  (`lib/memory/living-memory.ts:191-199` →
  `lib/memory/consolidation-receipts.ts:110-125`).
- [ ] AC-006 - An episode whose OKF parse fails is inventoried or counted as
  omitted rather than vanishing from both the record list and the inventory
  (`lib/memory/consolidation-sources.ts:367` — `if (!parsed.ok) continue;`
  currently increments neither). This is the same class as AC-004 on the
  episodic side; leaving it open would leave INV-002 violated by a second path.

Truthful commit reporting (findings 3 and 4 — MEDIUM, B-012):

- [ ] AC-007 - A discharge failure that follows a durable removal reports
  committed writes. `ReceiptDischargeError` is constructed with `removed.length
  > 0` (`lib/memory/consolidation-receipts.ts:130`), which discards the
  committed bit that `removeFile` itself carries
  (`lib/memory/durable-files.ts:54`); a probe whose *first* removal unlinks and
  then fails to sync must still report `writesCommitted: true`.
- [ ] AC-008 - Source-recovery committed writes survive the details
  reconstruction. `lib/memory/living-memory.ts:189` overwrites `writesCommitted`
  with retirement-recovery state only, discarding the OR performed at
  `lib/memory/living-memory.ts:122-123`; a probe returning a non-empty
  `episodePrunes` list must never report `writesCommitted: false`, and a pass
  whose only committed work was episode recovery must not return `noop`.

Gates and evidence:

- [ ] AC-009 - B-012, B-016 and B-021 keep their exact existing markers and
  plan-declared test names with one owner each. Each gains regression coverage
  that encodes the *counterexample*, not a restatement of the marker test, and
  that fails against the current implementation before the fix.
- [ ] AC-010 - The real composition root is exercised against real project data:
  `bun bin/cosmonauts memory consolidate --dry-run --no-model --json` run from
  the repo root against the live 237-record corpus reports `ran` or `noop`,
  `recovery: none`, `writesCommitted: false`, and a pressure figure that matches
  the bytes a real injection would render for the same corpus. Live `knowledge/`
  is verified byte-identical
  (`adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`, 237
  files) before and after every task.
- [ ] AC-011 - Full suite, `lint`, `typecheck` and `git diff --check` pass at
  every commit; no frozen pin, receipt floor, byte authority, fail-closed
  validation or existing marker is weakened (INV-004); every commit that changes
  `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks
  seam test in the same commit.

## Scope

Included:

- The four open findings recorded in `missions/plans/living-memory/review-rounds.md`,
  and the one sibling instance of finding 2's class in the episodic source
  (AC-006).
- Regression tests that encode each counterexample, and the real-composition-root
  evidence run (AC-010).
- Whatever narrow refactor the planner judges necessary to make measurement and
  injection share one definition — confined to `lib/memory/`,
  `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests.

Excluded:

- **Any live retirement round against `knowledge/`.** It stays a separate
  owner-triggered act, gated on this plan's finding 1.
- **The D-026 class.** No further verification layer for check-then-destructive
  pathname races, and no reopening of the ruling.
- Any change to retirement ordering, the receipt floor, Option C authority, the
  retired-area TTL (still DEFERRED), or explicit-save semantics.
- New behaviours beyond making B-012, B-016 and B-021 true; no new OKF types, no
  new proposal kinds, no new config gates.
- `TASK-623` (duplicate evidence scans, PF-003) — a separate performance task on
  the parent plan, not part of this backlog.
- Any edit outside the named directories. Repo-wide dead-code sweeps,
  export demotions and unrelated API cleanups are out of scope by construction:
  a prior remediation task without a directory boundary went 18 files wide and
  was fully reverted.
- OM adoption, scheduling/trigger execution, user-scope L4 mutation.

## Assumptions

- Ratified ground is consumed, not re-litigated: D-026 (including its 2026-09-03
  broadening to the class), LM-D-001..LM-D-008, Option C, receipts-before-
  relocation (INV-003, verified: `d9c6fe1` precedes `2fe6cde`), and the
  living-memory Decision Log entries.
- `missions/plans/living-memory/review-rounds.md` is authoritative for what is
  open. The seven rounds' verdicts are inputs; the plan does not re-derive them.
- **Fixes in this code reliably introduce regressions** — six of seven rounds.
  Re-review after every remediation round is mandatory, and the reviewer must be
  told which regression the previous round's fix introduced; doing so measurably
  sharpened rounds 5-7. The plan budgets for this rather than assuming one pass.
- **Byte ceilings bound judgment memory, not the measured index.** That
  distinction is the conceptual error behind both the round-6 and round-7
  pressure regressions, and any design that re-couples them will regress again.
- **A green suite proves nothing about real input here.** Every behaviour test
  injects fixture sources; the production corpus adapter was once entirely
  missing while all 21 behaviours were green. AC-010 exists because of this.
- Every remediation task carries an explicit directory-boundary acceptance
  criterion. Tasks that carried one stayed in scope; the one that did not, did
  not.
- AC-006's episode-parse instance was found by the coordinator while pinning
  file:line evidence for AC-004, not by a review round. It is the same defect
  class and is included so INV-002 is closed on both sources at once.
- The `knowledgeSurface` gate stays enabled throughout; all testing runs against
  temp fixtures or copies, never live `knowledge/`.

## Open Questions

- Should measurement and injection share **one retrieval call site**, or keep two
  calls held together by a contract test? One call site is the obvious fix, but
  the consolidation pass needs record bodies and byte limits that injection does
  not — and the round-6/7 regressions came from parameterizing the shared
  knowledge reader. (Planner.)
- When a measurement is unusable (AC-002), is `target-unmet` the right decline,
  or does it need a distinct decline code so the owner can tell "the index does
  not fit" from "I could not tell"? (Planner.)
- ~~Does an incomplete inventory block discharge only, or also retirement
  candidate authorization and the represented-evidence conclusion?~~ **Settled
  2026-09-07** by the owner's ratification of INV-002 as written: all three.
  Note this does *not* settle the plan's D-003, which additionally blocks
  judgment and proposal materialization — two seams INV-002 does not name. That
  extension stays planner-derived and amendable on record; its recorded cost is
  D-009 (one malformed episode also suspends pruning of unrelated,
  fully-represented episodes).
- Is the first live retirement round gated on this plan alone, or also on the
  confirm-round cadence ruling that the deferred retired-area TTL waits on?
  (Owner.)
