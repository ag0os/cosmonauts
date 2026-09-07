---
title: 'Living memory: honest measurement, discharge, and reporting'
status: active
createdAt: '2026-09-07T14:06:12.817Z'
updatedAt: '2026-09-07T16:45:00.000Z'
---

## Overview

Close the four open `living-memory` review findings without reopening any closed
ground. The implementation makes the pressure measurement consume the same
render input as combined-context injection, makes source completeness explicit
before absence-dependent work, and preserves every committed-write bit through
error and result reconstruction.

This is architecture-linked planned remediation with **12 behaviors**, at the
project guidance ceiling of 12 (B-012 was added 2026-09-07 after review). The behavior clusters below are also the
mandatory remediation/review stages. No stage may add a live retirement run,
change retirement pathname sequencing, or edit outside `lib/memory/`,
`lib/extensions/knowledge-surface/`, `cli/memory/`, and their mirrored tests
under `tests/`.

The end state is: exact injection pressure, explicit unusable/incomplete states,
and monotonic commit reporting, proven by counterexample regressions and the
real CLI composition while preserving every parent behavior, invariant, pin,
and byte boundary.

## Architecture Context

Sources of truth, in precedence order for this plan:

1. `missions/plans/living-memory-fidelity/spec.md` is authoritative for
   AC-001..AC-011, this plan's INV-001..INV-004, inherited-ground ranking,
   scope, and assumptions.
2. `missions/plans/living-memory/review-rounds.md` is authoritative for the four
   open findings, their HIGH/HIGH/MEDIUM/MEDIUM severities, and the seven-round
   trajectory: six fixes introduced a fresh defect; round 6 broke pressure
   measurement and round 7 regressed it in both directions while exposing the
   completeness defect.
3. `missions/plans/living-memory/plan.md` owns its Decision Log, especially
   human-ratified D-026, and the exact parent behaviors:
   - B-012 marker `@cosmo-behavior plan:living-memory#B-012`, test
     `tests/memory/interface.test.ts` >
     `exposes exact living-memory outcomes through configured knowledge consolidate only`;
   - B-016 marker `@cosmo-behavior plan:living-memory#B-016`, test
     `tests/memory/living-memory.test.ts` >
     `rehydrates accepted judgment and persisted evidence then converges to noop`;
   - B-021 marker `@cosmo-behavior plan:living-memory#B-021`, test
     `tests/extensions/architecture-memory.test.ts` >
     `measures index pressure with the exact injection renderer and budget`.

   **The three plan-declared owner tests above are not the only carriers of those
   marker strings** *(enumerated 2026-09-07 after review)*. The repository holds
   six marked tests; the other three are additional carriers, conformant by
   design (marker uniqueness is per behavior within a plan, not per test):
   - `tests/memory/living-memory.test.ts:3242` >
     `retains a live receipt when a later pass exhausts its record limit` (B-016);
   - `tests/memory/living-memory.test.ts:3295` >
     `retains a live receipt when a later pass exhausts its byte allowance` (B-016);
   - `tests/memory/living-memory.test.ts:4668` >
     `measures oversized corpus metadata exactly as combined-context injection` (B-021).

   The last of these is inside Stage 1's blast radius: it calls
   `policy.measure(records)` and `renderKnowledgeIndex(measuredRecords)` with the
   signatures D-001 replaces, and uses the non-canonical warning-free query
   `store.retrieve({...}, {})` as its injection oracle. Stage 1 must update its
   call sites to the canonical query and required render input while preserving
   its marker string, its test name, and the strength of its assertion. B-009's
   ownership contract inspects **all six** carriers, not only the three owner
   tests, so a weakened or deleted extra carrier cannot pass silently.
4. `missions/plans/living-memory/spec.md` supplies inherited INV-001..INV-007
   verbatim. They outrank every mechanism here; in particular byte authority and
   durable representation outrank size pressure, and index pressure binds
   attention rather than disk.
5. `missions/architecture/living-memory.md` supplies the ratified Option C,
   receipts-before-relocation, bounded/lossy, target-size, and D-026 lineage.
6. `missions/architecture/knowledge-and-memory.md` supplies the inward memory
   boundary, proposals-only writes, human promotion/hard deletion, and exact
   injected-index architecture.

Invariant ranking is explicit: inherited `living-memory` INV-001..INV-007 first,
then `living-memory-fidelity` INV-001..INV-004, then derived mechanisms in this
plan. Any collision takes the deviation-protocol route; an implementer does not
pick a weaker promise.

D-026 is consumed exactly as ratified. This plan adds no verification layer,
review item, test, or code change for the check-then-destructive-pathname class.
The retirement store and its pathname sequence are not implementation seams for
this plan.

## Decision Log

- **D-001 - One required render-input contract joins injection and pressure**
  - Decision: introduce one `KnowledgeIndexRenderInput` value containing both
    records and warnings, one canonical knowledge-index query, and one
    `renderKnowledgeIndex(input)` entry point. Combined-context injection and
    pressure both pass that value; warnings are not optional. The production
    corpus source derives its render input from the same bounded retrieval's
    complete parsed metadata inventory plus warnings, while body admission stays
    separately bounded for judgment.
  - Alternatives: share one retrieval call across agent injection and
    consolidation (different lifetimes and body needs); retain two independently
    assembled record arrays held together only by tests; perform a second
    unbounded consolidation scan.
  - Why: the typed value makes record set, query, admission, renderer fields,
    and warnings inseparable without coupling the measured index to judgment
    byte ceilings or adding the duplicate scan excluded with `TASK-623`
    (`living-memory-fidelity` INV-001, inherited INV-007).
  - Decided by: planner-proposed

- **D-002 - Missing exact render input is an unusable measurement**
  - Decision: `KnowledgeIndexPressureResult` becomes a discriminated
    `measured | unusable` result. `unusable` always carries
    `targetSatisfied: false` and a reason; it emits
    `index-pressure-unusable`, is reported in consolidate details, and cannot
    authorize a retirement. A measured result retains the existing record,
    byte, guaranteed-share, and headroom fields.
  - Alternatives: silently omit unconvertible inventory rows; coerce unusable
    to ordinary `target-unmet`; fabricate zero bytes or a default row.
  - Why: absence of a faithful projection is not a fit measurement, and the
    owner must be able to distinguish pressure from inability to measure
    (`living-memory-fidelity` INV-001/INV-002).
  - Decided by: planner-proposed

- **D-003 - Completeness is explicit at each source and blocks all dependent work**
  - Decision: every `ConsolidationSourceSnapshot` states
    `inventoryComplete`; source warnings are propagated. The aggregate is
    complete only when every source is complete. After collection and pressure
    reporting, an incomplete aggregate returns an explicit failed result before
    receipt discharge, represented-evidence filtering/conclusion, judgment or
    proposal materialization, and retirement authorization. Recovery already
    durably completed before collection remains reported rather than undone.
  - Alternatives: block receipt discharge only; infer completeness solely from
    `inventory === undefined && omitted > 0`; continue proposals and retirement
    for admitted records.
  - Why: all three absence-dependent seams consume the same inventory claim;
    allowing any one through leaves the exact AC-004/AC-005/AC-006 defect class
    open (`living-memory-fidelity` INV-002, inherited INV-002/INV-004).
  - Decided by: planner-proposed

- **D-004 - Committed-write state is monotonic**
  - Decision: every details reconstruction ORs prior `writesCommitted` state
    with the new phase. Receipt discharge preserves both prior successful
    removals and a thrown removal error's own committed bit. Source recovery's
    `episodePrunes` and committed bit survive later recovery/details assembly;
    committed maintenance with no newly selected records returns `ran`, never
    `noop`.
  - Alternatives: derive the bit from returned path-array length; overwrite it
    from the most recent subsystem; infer commits from final result kind.
  - Why: durable bytes, not control-flow shape, determine the report
    (`living-memory-fidelity` INV-003, parent B-012).
  - Decided by: planner-proposed

- **D-005 - Parent markers remain parent-owned**
  - Decision: preserve the three exact parent marker strings and their
    plan-declared test names in place. Counterexample tests added by this plan
    carry only `@cosmo-behavior plan:living-memory-fidelity#B-###`; no fidelity
    behavior reuses or replaces a parent marker.
  - Alternatives: move the parent markers to stronger regression tests;
    renumber the parent behaviors here; place both plan markers on each new test.
  - Why: the parent behaviors are durable parent-plan contracts; this plan adds
    proof without changing ownership (AC-009, `living-memory-fidelity` INV-004).
  - Decided by: restates spec AC-009 *(provenance corrected 2026-09-07 — this
    entry previously read `user-directed`; see D-011)*. Ratified by inheritance
    from that acceptance criterion's letter, not by a separate human decision.

- **D-006 - Every remediation stage has a fresh structural re-review**
  - Decision: measurement, completeness, and commit-reporting each form a
    separate remediation stage. A stage cannot hand off until a fresh reviewer
    checks the whole permitted boundary, is told the previous fix and the
    regression it introduced, reruns the permanent counterexample pack, and
    finds no unresolved high/medium issue. A review-driven fix starts a new
    remediation round and therefore requires another fresh review.
  - Alternatives: one review after all fixes; let the fixer self-accept; rerun
    only tests local to the finding.
  - Why: six of seven prior fixes regressed behavior, and rounds 6 and 7 each
    broke the pressure measurement the preceding round addressed. Review is part
    of the implementation structure, not a terminal ceremony.
  - Decided by: handoff-recommended (a previous session's agent), plan-adopted
    *(provenance corrected 2026-09-07 — this entry previously read
    `user-directed`; see D-011)*. **Derived**, and therefore amendable on record
    by an implementing agent that preserves the Intent. The regression rate it
    responds to is real; the specific one-review-per-stage cadence is a
    proposal, not human ground.

- **D-007 - Scope and live-data prohibitions are hard stops**
  - Decision: no live retirement round, no write-capable command against live
    `knowledge/`, no D-026 work, and no edit outside the permitted directories
    and mirrored tests. The exact dry-run/no-model command required by AC-010 is
    read-only evidence and is bracketed by the live corpus hash/count check.
  - Alternatives: opportunistic cleanup or documentation edits; a live
    retirement smoke test; another pathname verification layer.
  - Why: these exclusions are human-ratified ground and protect the already
    closed safety story (`living-memory-fidelity` INV-004).
  - Decided by: derived from ratified ground *(provenance corrected 2026-09-07 —
    this entry previously read `user-directed`; see D-011)*. Its components trace
    to this spec's Scope exclusions and the parent `living-memory` spec's
    exclusion of a live retirement round (scope exclusions are ratified by the
    artifact contract), and to the parent plan's human-ratified D-026 — not to a
    separate instruction. Ratified by inheritance from those sources.

- **D-026 - The parent's ratified pathname-race acceptance is inherited verbatim** *(Recorded 2026-09-07 after review; not re-decided here)*
  - Decision: `missions/plans/living-memory/plan.md` D-026 — check-then-
    destructive-pathname races that no portable primitive can close are an
    accepted, recorded limitation — governs this plan unchanged. It keeps the
    parent's number so citations read the same in both plans; this entry
    declares the inheritance, it does not re-decide the question. No work in
    this plan may add a verification layer for that class, and any fix that
    reaches retirement pathname sequencing halts and escalates.
  - Alternatives: cite the parent entry without declaring it locally (leaves
    every `D-026` citation here unresolved against the artifact contract);
    renumber it locally (breaks the shared vocabulary between the two plans and
    invites two divergent readings of one ruling).
  - Why: the ruling is load-bearing for this plan's scope and is cited
    throughout it, so a reader of this plan alone must be able to resolve it.
  - Decided by: human, 2026-09-03, in the parent plan (ratified; inherited here)

- **D-008 - The canonical descriptor covers retrieval, not only the render input** *(Added 2026-09-07 after review)*
  - Decision: the frozen canonical export in `lib/memory/knowledge-records.ts`
    carries the complete knowledge-index retrieval descriptor both producers
    must use — the query (`text: ""`, `recordTypes: KNOWLEDGE_RECORD_TYPES`),
    the scope set (`["project", "user"]`), the rule for resolving the
    user-scope root, and the admission-to-render projection (render input is
    built from the complete parsed metadata inventory plus retrieval warnings,
    never from the byte-admitted body set). Quality Contract assertion 1 binds
    injection/pressure parity across all four, not only the renderer argument.
  - Alternatives: pin only the query and the render-input type, leaving scope
    and user root to convention (the original D-001 shape); assert parity in
    tests alone; share one live retrieval between the agent turn and the pass.
  - Why: both review channels converged here. `KnowledgeIndexRenderInput`
    carries `records` and `warnings` only, while scopes live in
    `MemoryScopeContext` and admission in a third argument — so two well-typed
    producers could still resolve different corpora and satisfy every declared
    fixture. The two known divergence directions would stay closed while the
    next producer-side change reopened the class. Scope parity holds today
    (`combined-context.ts:63` and `consolidation-sources.ts:183` both pass
    `["project","user"]`; both stores default the user root to
    `join(homedir(), ".cosmonauts")`), so this is hardening by construction,
    not a live defect.
  - Decided by: review-synthesis (plan-reviewer PR-001 + independent
    spec-fidelity lens), amend-on-record

- **D-009 - The completeness barrier's collateral scope and its human remedy are recorded** *(Added 2026-09-07 after review)*
  - Decision: state plainly that the barrier is broader than inherited INV-002's
    letter. INV-002 names discharge, retirement authorization and
    represented-evidence conclusion; D-003 additionally blocks judgment and
    proposal materialization, which also stops `finalize(represented)` — so one
    malformed episode also suspends pruning of unrelated, fully-represented
    episodes. That collateral scope is accepted, and the only exit is a human
    one: the owner repairs or removes the offending file, whose path, digest and
    parse warning B-006 keeps visible. No acknowledge-and-continue override and
    no machine quarantine of the offending path may be designed.
  - Alternatives: an override flag (contradicts inherited INV-002 directly); a
    machine quarantine that renames or unlinks the offending file (a
    check-then-destructive pathname operation, D-026-adjacent ground);
    restricting the barrier to INV-002's three named seams (leaves proposal
    materialization running on an inventory known to be incomplete).
  - Why: a stop with no recorded exit reads as a design hole to every later
    reviewer. Recording the exit as human, and why the machine exits are
    forbidden, converts it into an accepted trade-off — the same move D-026 made.
  - Decided by: review-synthesis (independent design-attack lens), amend-on-record

- **D-010 - Each remediation round's review result has a recorded home** *(Added 2026-09-07 after review)*
  - Decision: every fresh structural review round writes
    `missions/plans/living-memory-fidelity/review-<n>.md` (the versioned
    convention this plan's own first review round already used) and the round's
    verdict is additionally recorded in the task evidence for the stage. Step 20
    is supplied from those files.
  - Alternatives: task evidence only; a single terminal review record; no
    recorded surface (the status quo, which forced the parent plan to write
    `review-rounds.md` retroactively so four open findings would survive the
    session that produced them).
  - Why: D-006 calls review part of the implementation structure. Step 20
    demands every prior round's result while steps 8, 12 and 16 named no surface
    to record one, making "no unresolved high or medium finding advanced"
    unfalsifiable after the fact.
  - Decided by: review-synthesis (independent scope/sequencing lens), amend-on-record

- **D-011 - This plan's ratified ground, and where it came from** *(Added 2026-09-07 after review; ratified by the owner the same day)*
  - Decision *(materially corrected 2026-09-07)*: D-005, D-006 and D-007 were
    originally marked `user-directed` on the belief that their substance came
    from the owner. It did not. It came from the session-opening handoff prompt,
    which the owner has since confirmed was **written by a previous session's
    agent using the handoff skill** — a recommendation, not human ground. Their
    provenance is corrected in place: D-005 inherits ratification from spec
    AC-009, D-007 from this spec's and the parent spec's scope exclusions plus
    the parent's human-ratified D-026, and **D-006 is derived**, with no ratified
    source behind its specific cadence. Treat no other constraint as human ground
    merely because the handoff stated it. The spec's `## Intent` invariants
    INV-001..INV-004 are ratified
    ground by definition of the artifact contract. They were drafted by an agent
    and **the owner ratified them explicitly on 2026-09-07**, after being shown
    the derivation: INV-001, INV-002 and INV-003 are generalizations of the four
    recorded findings (INV-002's concept is the round-7 reviewer's wording,
    though its three-seam blast radius was the drafting agent's choice, and
    INV-001's "same scope set" clause was added with no finding behind it — the
    divergence that produced D-008); INV-004 restates the handoff's do-not list,
    which is agent-authored and carries no independent authority. All four are
    human ground **by that explicit ratification alone**, not by anything the
    handoff asserted. Both facts are recorded here rather than left to
    provenance defaults.
  - Alternatives: relabel D-005..D-007 as `planner-proposed` (understates the
    owner's actual instruction); leave the spec's ratification status implicit
    (the deviation protocol would then treat agent-drafted text as human ground
    with no record of the gap).
  - Why: mutability defaults are read off `Decided by:`. An implementer must be
    able to tell which constraints trace to a human and which are awaiting one.
  - Decided by: review-synthesis, amend-on-record

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

## Behaviors

### B-001 - Pressure matches injection in both round-7 divergence directions

- Source: AC-001, AC-009
- Context: one fixture's bounded judgment inventory would over-measure a small injected index and a second fixture would under-measure a large injected index into a false fit
- Action: the production-shaped corpus source supplies its exact knowledge render input and the pressure policy measures it through the shared renderer
- Expected: in both fixtures `renderedBytes` equals the UTF-8 bytes of the warning-aware index that combined-context injection renders; neither the approximately 12 KB versus 364-byte over-measurement nor the 368-byte versus 12,358-byte false fit survives
- Seam: `lib/memory/consolidation-sources.ts` render-input handoff → `lib/extensions/knowledge-surface/index-policy.ts`; injection comparison at `lib/extensions/knowledge-surface/combined-context.ts`
- Test: `tests/memory/living-memory.test.ts` > `matches pressure to injection for both round-7 divergence directions`
- Marker: `@cosmo-behavior plan:living-memory-fidelity#B-001`

### B-002 - Lossy index conversion is reported unusable

- Source: AC-002, AC-009
- Context: a knowledge-contributing source supplies an inventory row that cannot be losslessly converted to all renderer fields and supplies no exact render input
- Action: consolidation resolves index pressure before any retirement decision
- Expected: details report `kind: "unusable"`, `targetSatisfied: false`, and an `index-pressure-unusable` decline; no non-empty retirement application is attempted and no row is silently dropped into a successful fit
- Seam: `lib/memory/consolidation-sources.ts` aggregate render-input contract → `lib/memory/living-memory.ts` pressure/retirement gate
- Test: `tests/memory/living-memory.test.ts` > `marks pressure unusable instead of reporting a false fit without an exact render input`
- Marker: `@cosmo-behavior plan:living-memory-fidelity#B-002`

### B-003 - Retrieval warnings are measured exactly as injected

- Source: AC-003, AC-009
- Context: a temporary knowledge corpus contains one unparseable record, producing zero records and one retrieval warning
- Action: combined-context injection and the pressure policy render the same required records-plus-warnings input
- Expected: both paths produce the same warning-bearing index bytes (including the calibrated approximately 331-byte artifact), and pressure no longer reports zero rendered bytes for the artifact injection exposes
- Seam: `lib/extensions/knowledge-surface/combined-context.ts` + `lib/extensions/knowledge-surface/index-policy.ts`
- Test: `tests/extensions/architecture-memory.test.ts` > `counts injected knowledge warnings in measured index bytes`
- Marker: `@cosmo-behavior plan:living-memory-fidelity#B-003`

### B-004 - Corpus retrieval omissions make inventory incomplete

- Source: AC-004, AC-009
- Context: the corpus retrieval boundary warns that one otherwise-current knowledge path could not be read or parsed and omits it from returned records — `lib/memory/knowledge-store.ts` emits that warning and skips the path today, and is consumed unchanged by this plan
- Action: `createProjectCorpusConsolidationSource().collect()` converts retrieval output into a source snapshot and the collector aggregates it
- Expected: the warning is retained, the omission is counted, the source and aggregate report `inventoryComplete: false`, and the exact render input still carries every warning injection would render
- Seam: `lib/memory/consolidation-sources.ts` corpus adapter and collector
- Test: `tests/memory/consolidation-sources.test.ts` > `marks corpus inventory incomplete when retrieval omits a warned record`
- Marker: `@cosmo-behavior plan:living-memory-fidelity#B-004`

### B-005 - Incomplete inventory blocks every absence-dependent seam

- Source: AC-005, AC-009
- Context: a materialized receipt exists for an unchanged valid corpus record while the current source snapshot reports that record unreadable and inventory incomplete
- Action: a configured consolidator runs against the incomplete aggregate
- Expected: it reports the source warning and `source-inventory-incomplete` failure, leaves the receipt present, performs no stale discharge, makes no represented-evidence/no-work conclusion, invokes no judgment/proposal materialization, and attempts no non-empty retirement application; when a source recovery already committed durable work in the same pass, the failed return still carries that recovery's `episodePrunes` and `writesCommitted: true` *(added 2026-09-07 after review: Design section 3 promises this interaction and no behavior owned it)*
- Seam: `lib/memory/living-memory.ts` post-collection completeness barrier before `lib/memory/consolidation-receipts.ts`, represented-evidence filtering, and retirement authorization
- Test: `tests/memory/living-memory.test.ts` > `keeps receipts and blocks dependent work when corpus inventory is incomplete`
- Marker: `@cosmo-behavior plan:living-memory-fidelity#B-005`

### B-006 - Malformed episodes remain visible as omissions

- Source: AC-006, AC-009
- Context: the episodic directory contains a regular file whose bytes are readable but whose OKF episode parse fails
- Action: the production episode source collects the directory and consolidation aggregates its snapshot
- Expected: the path and digest remain in inventory, `omitted` increments, a parse warning is reported, and source/aggregate completeness is false rather than the file vanishing from both records and inventory
- Seam: `lib/memory/consolidation-sources.ts` episode adapter and aggregate completeness contract
- Test: `tests/memory/consolidation-sources.test.ts` > `counts malformed episodes as omitted incomplete inventory`
- Marker: `@cosmo-behavior plan:living-memory-fidelity#B-006`

### B-007 - First-removal sync failure preserves its committed bit

- Source: AC-007, AC-009
- Context: the first stale receipt removal unlinks its file and then fails while syncing the parent, so the thrown durable error carries `writesCommitted: true` before any path is appended to the completed-removals array — that error contract is `lib/memory/durable-files.ts`'s and is consumed unchanged by this plan
- Action: receipt discharge wraps the failure and the consolidator reports it
- Expected: the result is failed with `writesCommitted: true`, the receipt is absent, and the original sync failure remains visible; the existing later-removal regression stays green
- Seam: `lib/memory/consolidation-receipts.ts` wrapper → `lib/memory/living-memory.ts` failure result
- Test: `tests/memory/living-memory.test.ts` > `reports a committed first receipt removal when its directory sync fails`
- Marker: `@cosmo-behavior plan:living-memory-fidelity#B-007`

### B-008 - Source-recovery commits survive details reconstruction

- Source: AC-008, AC-009
- Context: a source recovery returns a non-empty `episodePrunes` list and `writesCommitted: true`, with no newly admitted consolidation work and no retirement recovery commit
- Action: the consolidator collects sources and reconstructs final details
- Expected: the prune list remains present, `writesCommitted` remains true, and the pass returns `ran` rather than `noop`
- Seam: `lib/memory/living-memory.ts` source-recovery fold, post-collection details assembly, and no-selected-record result branch
- Test: `tests/memory/living-memory.test.ts` > `preserves source-recovery episode prunes and committed writes in the final result`
- Marker: `@cosmo-behavior plan:living-memory-fidelity#B-008`

### B-009 - Parent behavior ownership remains exact

- Source: AC-009
- Context: the parent plan and executable tests own B-012, B-016, and B-021 while this plan adds counterexample regressions
- Action: a content contract inspects the exact parent marker/name pairs and the fidelity regression markers
- Expected: all three parent marker strings and plan-declared test names remain unchanged and parent-owned, while every regression named by this plan carries only its matching `living-memory-fidelity` marker
- Seam: parent marker/name pairs in `tests/memory/interface.test.ts`, `tests/memory/living-memory.test.ts`, and `tests/extensions/architecture-memory.test.ts`
- Test: `tests/memory/interface.test.ts` > `keeps living-memory behavior ownership while fidelity regressions use fidelity markers`
- Marker: `@cosmo-behavior plan:living-memory-fidelity#B-009`

### B-010 - Real CLI composition reports real-corpus pressure faithfully

- Source: AC-010
- Context: the repository's 237-file knowledge corpus is copied byte-for-byte to a temporary project and the production CLI composition uses a temporary home
- Action: the real binary runs `memory consolidate --dry-run --no-model --json`, and the same copied corpus is rendered through the combined-context knowledge path
- Expected: JSON reports `ran` or `noop`, `recovery: "none"`, `writesCommitted: false`, and a measured pressure byte count equal to the real injection renderer; source and copy hashes remain unchanged
- Seam: `cli/memory/subcommand.ts` production factory → corpus source → shared pressure policy; comparison to `lib/extensions/knowledge-surface/combined-context.ts`
- Test: `tests/cli/memory/subcommand.test.ts` > `matches real-corpus injection pressure through the CLI composition root on a copy`
- Marker: `@cosmo-behavior plan:living-memory-fidelity#B-010`

### B-011 - Public result and frozen contracts remain pinned

- Source: AC-011
- Context: pressure reporting and source snapshot types change the shared `lib/memory/types.ts` surface while all frozen living-memory authority remains in force
- Action: the interface seam test inspects the result shape, full-source hash pin, and preserved authority/marker contracts
- Expected: `MemoryConsolidateDetails` exposes the measured-or-unusable pressure result, the full-source SHA-256 is re-pinned in the same commit, and no frozen pin, receipt floor, byte authority, fail-closed validation, or existing marker assertion is removed or relaxed
- Seam: `lib/memory/types.ts` + `lib/memory/index.ts` with the profile-playbooks seam in `tests/memory/interface.test.ts`
- Test: `tests/memory/interface.test.ts` > `re-pins the memory contract without weakening living-memory authority`
- Marker: `@cosmo-behavior plan:living-memory-fidelity#B-011`

### B-012 - A materialization-only pass reports its committed receipt transition

*(Added 2026-09-07 after review — plan-reviewer PR-003.)*

Note the deliberate name collision: this is `living-memory-fidelity#B-012`, and
it supplies the counterexample the parent's `living-memory#B-012` truthfulness
contract lacks. The parent behavior stays parent-owned.

- Source: AC-008, AC-009, this plan's INV-003
- Context: a retry pass finds an existing `accepted` receipt and an already-written proposal, durably replaces the receipt with `materialized`, and performs no episode prune, no proposal write, and no retirement write
- Action: the consolidator assembles its final details
- Expected: `writesCommitted` is true because the receipt transition wrote durable bytes, and the pass does not return `noop`; the accumulator ORs the materialization bit rather than deriving commitment from proposal, prune, or retirement writes alone
- Seam: `lib/memory/consolidation-receipts.ts` `markMaterialized()` durable transition → `lib/memory/living-memory.ts` final details assembly
- Test: `tests/memory/living-memory.test.ts` > `reports committed writes for a materialization-only retry pass`
- Marker: `@cosmo-behavior plan:living-memory-fidelity#B-012`

## Design

### 1. Shared render input, not shared retrieval lifetime

The stable memory layer owns the data/query contract; the extension owns
presentation and pressure policy. Dependencies remain inward:

```ts
// lib/memory/types.ts
interface KnowledgeIndexRenderInput {
  readonly records: readonly RetrievedMemoryRecord[];
  readonly warnings: readonly MemoryWarning[];
}

type KnowledgeIndexPressureResult =
  | {
      readonly kind: "measured";
      readonly targetSatisfied: boolean;
      readonly recordCount: number;
      readonly maxRecords: number;
      readonly renderedBytes: number;
      readonly guaranteedBytes: number;
      readonly headroomBytes: number;
    }
  | {
      readonly kind: "unusable";
      readonly targetSatisfied: false;
      readonly reason: string;
    };

interface KnowledgeIndexPressurePolicy {
  measure(input: KnowledgeIndexRenderInput): Extract<
    KnowledgeIndexPressureResult,
    { readonly kind: "measured" }
  >;
}
```

`lib/memory/knowledge-records.ts` exports one frozen canonical query equivalent
to the current injection request (`text: ""`, scopes supplied by the caller,
`recordTypes: KNOWLEDGE_RECORD_TYPES`). Both combined context and the project
corpus adapter import it through `lib/memory/index.ts`; `lib/memory` never imports
an extension.

`renderKnowledgeIndex` changes from optional positional warnings to one required
`KnowledgeIndexRenderInput`. `createKnowledgeIndexPressurePolicy().measure`
calls that renderer directly. `combined-context.ts` constructs the same input
from `MemoryRetrieveResult.records` and `.warnings`; there is no warnings-free
call form to drift back to.

The corpus adapter keeps one bounded retrieval. Its judgment `records` remain
subject to `maxCorpusRecordBytes`/`maxCorpusBytes`; its knowledge render input is
built from `inventoryRecords.map(({record}) => record)` plus the retrieval
warnings. Those inventory records already preserve parsed metadata for
byte-declined files, so the measured index is independent of judgment-body
ceilings without a second scan. The two runtime retrievals (agent turn and
consolidation pass) remain separate in time but have the same query, parser,
render-input type, and renderer.

`ConsolidationSourceSnapshot` has an optional `knowledgeIndex` contribution.
The production corpus source supplies exactly one, episode and non-index sources
supply none, and `collectConsolidationSources` rejects multiple providers. If a
pass has knowledge inventory but no exact contribution, the collector returns
an unusable pressure input rather than reconstructing rows. The private
`toIndexRecords` conversion is removed. A pass containing no corpus provider may
continue non-retirement episode/proposal work, but its reported pressure is
unusable and no retirement candidate may be applied.

After collection, `MemoryConsolidateDetails.indexPressure` reports the
`measured | unusable` result. It is optional only for failures that occur before
source collection; every post-collection return carries it. JSON output needs no
parallel DTO because `cli/memory/subcommand.ts` already serializes the public
result.

### 2. Completeness is source-owned and aggregate-enforced

The source contract becomes:

```ts
interface ConsolidationSourceSnapshot {
  readonly records: readonly ConsolidationSourceRecord[];
  readonly inventory?: readonly ConsolidationSourceInventoryRecord[];
  readonly inventoryComplete: boolean;
  readonly knowledgeIndex?: KnowledgeIndexRenderInput;
  readonly omitted: number;
  readonly declines?: readonly ConsolidationSourceDecline[];
  readonly warnings?: readonly MemoryWarning[];
}
```

The collector validates the declaration: `inventoryComplete: true` is invalid
when a source reports omitted records without a supplied inventory capable of
representing them. Aggregate completeness is the AND of source declarations and
that structural check. Source warnings are frozen and surfaced in
`MemoryConsolidateDetails.warnings`.

The corpus adapter sets completeness false whenever retrieval warns about a
path omitted by read/parse/admission, keeps the warnings in both the source
report and exact knowledge render input, and counts omitted project paths. Byte
limit declines whose parsed metadata remains in `inventoryRecords` are bounded
judgment deferrals, not index omissions and not by themselves incomplete.

The episode adapter handles `!parsed.ok` by adding the path/digest minimal
inventory row, incrementing `omitted`, appending the parser warning, and setting
`inventoryComplete: false`. Readable-but-invalid bytes therefore cannot vanish
from receipt liveness.

The consolidator orders the seam as: durable recovery → read-only persisted
evidence → collect → assemble warnings and pressure → completeness barrier →
discharge/representation/observation/judgment/retirement. This preserves prior
recovery commits while ensuring no absence-dependent operation runs on an
incomplete snapshot.

State-space outcomes are fully defined:

| Aggregate inventory | Pressure | Outcome |
|---|---|---|
| complete | measured, target satisfied | Existing evidence-authorized non-pressure behavior may continue; no pressure decline |
| complete | measured, target unmet | Existing bounded pass continues and reports/applies only already-authorized work plus `target-unmet` when pressure remains |
| complete | unusable | Report `index-pressure-unusable`; proposal/episode work may continue, but every retirement is blocked |
| incomplete | measured, either target state | Report the measured artifact (including warnings), then fail before discharge, represented-evidence conclusion, proposal materialization, or retirement |
| incomplete | unusable | Report both facts, then fail at the same completeness barrier |

No new pending state is persisted. Existing states keep their parent-plan exits:
accepted receipts materialize or discharge only when fully stale; episode and
retirement recovery complete or remain explicitly pending; this plan adds only
per-pass discriminated observations.

### 3. Commit reporting is an OR-only accumulator

`writesCommitted` is a monotonic accumulator across retirement recovery, source
recovery, receipt discharge, accepted receipts, proposals, episode pruning, and
retirement application. Later details objects spread prior details and OR new
bits; no phase assigns from only its local subsystem.

`consolidation-receipts.ts` preserves a failed `removeFile` error's own committed
bit in addition to `removed.length > 0`. A small local type guard is preferred
to a new cross-file abstraction: there are only two owning modules and this
change does not justify a new utility.

For source recovery, the fields written are exactly `episodePrunes` and
`writesCommitted`; the post-collection reconstruction preserves both. A
committed recovery followed by no admitted/selected work is `ran`. A later
incomplete-inventory failure remains `failed` but still reports the prior prune
and committed bit.

The accepted-to-materialized receipt transition is a durable write and is folded
in on the same terms *(added 2026-09-07 after review)*. `markMaterialized()`
replaces an `accepted` receipt with a `materialized` one on disk; final assembly
must OR that bit rather than infer commitment from proposal, prune, or
retirement writes. B-012 owns the counterexample: a retry whose only durable act
is that transition. "Audit every assignment" is a procedure, not an owner —
every promise in this section has a named test.

### 4. Parent contracts and regression placement

The parent B-012/B-016/B-021 tests remain named and marked exactly as recorded in
Architecture Context. B-012's exact details-key assertion is extended for
`indexPressure` without changing its name, marker, or expected parent outcome.
B-016 and B-021 are not renamed or re-owned. New counterexamples are separate
`living-memory-fidelity` tests near the relevant executable seam.

Every new test must be observed RED against the current implementation for the
specific counterexample before production code changes. Weakening a parent
assertion to get green is a snap-back under the deviation protocol.

### 5. Real composition and trust boundary

The automated production-composition test copies the repository corpus to a
temporary project and gives the process a temporary home; it never writes the
live corpus. It invokes the real binary and compares returned pressure with the
same copied records rendered through combined context.

Final evidence additionally runs the exact AC-010 command from the repository
root. `--dry-run --no-model` is load-bearing: it supplies no model, performs no
retirement, and may not be shortened or replaced by a write-capable smoke test.
The live tree is hashed and counted immediately before and after. The command
reads project-controlled markdown as data but executes no project-controlled
command; explicit owner invocation is the consent boundary already ratified by
the parent plan.

### 6. Capability evidence

Runtime capability inspection reported package-native bindings but all structural
capabilities unbound because execution was not consented. Direct attempts yielded
no evidence for cognitive complexity, duplication, boundary conformance, or the
`createLivingMemoryConsolidator` trace. This is uncertainty, not a clean
baseline. The design therefore uses explicit contracts and mandatory fresh
structural review; the Quality Contract records every unavailable bindable gate
as degraded.

## Files to Change

- `tests/extensions/architecture-memory.test.ts` ↔ `lib/extensions/knowledge-surface/index-policy.ts`, `lib/extensions/knowledge-surface/combined-context.ts`: B-001/B-003 required records-plus-warnings renderer input, canonical query use, both divergence directions, and warning-byte parity; preserve the parent B-021 marker/name.
- `tests/memory/consolidation-sources.test.ts` ↔ `lib/memory/knowledge-records.ts`, `lib/memory/consolidation-sources.ts`: B-004/B-006 canonical index query, exact corpus render contribution, explicit completeness/warnings, and malformed-episode inventory.
- `tests/memory/living-memory.test.ts` ↔ `lib/memory/living-memory.ts`, `lib/memory/consolidation-sources.ts`, `lib/memory/consolidation-receipts.ts`: B-001/B-002/B-005/B-007/B-008/B-012 pressure gating, completeness barrier, first-removal committed error, OR-only source-recovery reporting, and the materialization-only committed transition; preserve the parent B-016 marker/name on its owner test at `:2889` and on the two additional B-016 carriers at `:3242` and `:3295`, and preserve the parent B-021 marker/name on the additional carrier at `:4668` whose call sites Stage 1 must move to the canonical query and required render input.
- `tests/memory/interface.test.ts` ↔ `lib/memory/types.ts`, `lib/memory/index.ts`: B-009/B-011 public render/pressure/source/result contracts, exact parent ownership checks, exact result keys, and same-commit full-source SHA-256 re-pin; preserve the parent B-012 marker/name.
- `tests/cli/memory/subcommand.test.ts` ↔ `cli/memory/subcommand.ts`: B-010 real binary composition on the copied corpus and JSON pressure reporting. Production CLI code changes only if needed to expose the public details already serialized; no parallel measurement path is allowed.

- `lib/memory/knowledge-store.ts` *(added on record 2026-09-07 during Stage 1; see
  D-012)*: user-root resolution routed through `KNOWLEDGE_INDEX_RETRIEVAL` so the
  store resolves the same root as injection and measurement. Required by AC-001's
  scope-set parity per D-008; the original file list did not anticipate it.

No other file is planned. In particular `lib/memory/retirement-store.ts`, all
documentation, architecture records, domains, configuration, `knowledge/`, and
parent plan/spec files are outside implementation scope.

## Risks

- **A shared type can still be bypassed by reconstructing it.** The required
  single-argument renderer, canonical query, removal of `toIndexRecords`, and
  structural re-review prohibit local renderer/record-array reconstruction. If
  the policy cannot consume the source's exact render input without importing
  extension code into `lib/memory`, stop and redesign the contract rather than
  reverse dependency direction.
- **Warnings may conservatively stop a pass.** This trades availability for the
  required absence safety. The owner receives exact warnings plus
  `source-inventory-incomplete`; silently continuing is forbidden. If a warning
  is shown not to represent an omission, classify it explicitly at the source
  rather than weakening the aggregate rule.
- **Shared type edits have a frozen hash pin.** Any commit changing
  `lib/memory/types.ts` must update every existing full-source SHA-256 assertion
  in `tests/memory/interface.test.ts` in that same commit. If a frozen authority
  assertion would need removal, halt and escalate.
- **A live-root dry run is still a trust-boundary exercise.** Only the exact
  `--dry-run --no-model --json` command is allowed. A corpus hash/count mismatch,
  any created retirement artifact, or any live byte change is an immediate hard
  stop and revert; no retirement round follows.
- **Review churn is expected.** A remediation finding does not get folded into
  the next stage. It receives a counterexample, a bounded fix, all gates, and a
  new fresh structural review before work resumes.
- **Structural analysis has no executable evidence.** Complexity, duplication,
  boundary, trace, changed-scope, and dead-code capabilities are unbound due to
  execution not being consented. Reviewers must inspect the exact permitted
  diff; absence of tool findings must never be reported as a clean result.
- **An omission can be silent, and that residue stays open.** *(Recorded
  2026-09-07 after review.)* Corpus completeness is warning-driven, but
  `scanKnowledgeFile` returns `{ kind: "skipped" }` with no warning for
  ENOENT/ELOOP (`lib/memory/knowledge-store.ts:543`), and the caller's
  `if (scan.kind === "skipped") continue` precedes every tally. A previously
  inventoried record that becomes momentarily unavailable, or whose file type
  changes between passes, is therefore omitted with no warning, no `omitted`
  increment, and no designed detection. Blast radius is bounded: `dischargeStale`
  removes a receipt only when *every* input evidence is absent, so the cost is
  re-judgment of a single-input receipt, and an under-measured index is
  conservative (fewer bytes, target satisfied, no retirement). It is not closed
  here because the obvious fix — marking incompleteness on any listed-but-
  unscanned path — would wedge the pass permanently for any corpus containing a
  symlinked or non-regular `.md`, since dirent-level exclusion is a policy
  refusal rather than a transient failure. The warned/unwarned line is a
  deliberate transient-versus-policy boundary. Do not close this by widening the
  rule without a ruling.
- **The barrier suspends more than the record that caused it.** See D-009: one
  malformed episode also suspends pruning of unrelated, fully-represented
  episodes, and the exit is a human repairing or removing the offending file.
  Machine quarantine of that path is forbidden ground.
- **Ratified ground collision.** If any proposed fix reaches retirement pathname
  sequencing, asks for a fifth D-026 verification layer, weakens a parent
  behavior/pin, or needs a file outside scope, halt and escalate. Do not classify
  it as local remediation.

## Quality Contract

Plan-specific assertions:

1. Pressure and injection accept the same required records-plus-warnings value,
   use one canonical query and one renderer, and both round-7 divergence fixtures
   assert byte equality; no private inventory-to-index conversion remains. Parity
   is asserted across all four AC-001 dimensions — scope set, query, admission
   projection, renderer inputs — per D-008, not only the renderer argument.
2. A malformed knowledge record contributes identical warning bytes to injection
   and pressure, while an absent exact render input is explicitly unusable and
   cannot report a fit or authorize retirement.
3. Corpus warning omissions and episode parse failures make the aggregate
   incomplete; incomplete inventory leaves receipts present and prevents all
   discharge, represented-evidence conclusion, model/proposal materialization,
   and retirement authorization.
4. A first unlink-then-sync failure and a source-recovery-only pass both report
   committed writes; every details reconstruction is OR-monotonic and a committed
   recovery never returns `noop`.
5. Parent B-012/B-016/B-021 markers and plan-declared test names remain exact and
   parent-owned; every new behavior has one matching fidelity marker on its named
   counterexample test.
6. The copied-corpus CLI test and live-root evidence agree with combined-context
   bytes; live `knowledge/` remains exactly 237 files at SHA-256
   `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`
   before and after every task, computed by the exact command recorded in
   Implementation Order step 1 — a bare digest is not a reproducible gate.
7. Every commit passes project-native tests, lint/static checks, type checks, and
   whitespace/diff checks; no frozen pin, receipt floor, byte authority,
   fail-closed validation, or existing marker is weakened.
8. Every remediation round receives a fresh structural re-review covering the
   full permitted diff and permanent measurement pack; no unresolved high or
   medium finding advances to the next stage. Each round's verdict is written to
   `missions/plans/living-memory-fidelity/review-<n>.md` and referenced from the
   stage's task evidence (D-010), so the claim is falsifiable after the fact.

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | All behavior tests, parent regressions, full project checks, live-byte guards, and plan assertions pass at every required boundary | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Required behavior fields, root-relative existing test files, exact fidelity markers, and preserved parent marker/name ownership pass | artifact evidence | hard fail; markers become present during RED before production edits |
| 3 | `mutation` | bindable | unbound | Targeted negative controls fail on the current defects and pass only after each fix | pending | unbound, not enforced mechanically; fresh reviewer judges counterexample strength |
| 4 | `duplication` | bindable | unbound | No second index query, renderer, render-input reconstruction, or commit accumulator is introduced | pending | unbound, not enforced; structural reviewer inspection required |
| 5 | `complexity` | bindable | unbound | The completeness barrier and commit fold remain explicit, with no new cross-cutting state machine | pending | unbound, not enforced; structural reviewer inspection required |
| 6 | `boundary-conformance` | bindable | unbound | `lib/memory` owns data contracts, the extension depends inward and owns rendering, and CLI only composes; no edit leaves the permitted directories/tests | pending | unbound, not enforced; diff/import inspection required |
| 7 | `dead-code` | bindable | unbound | Removed `toIndexRecords` and superseded call forms have no remaining use; no unrelated exports are demoted | pending | unbound, not enforced; scoped reviewer judgment only, no repo-wide sweep |

- **D-012 - Two file-scope amendments, recorded rather than absorbed** *(Added 2026-09-07 during implementation; derived, amendable on record)*
  - Context: Implementation Order step 21 audits that "only the five
    Files-to-Change rows may differ". Stage 1 changed a sixth production file,
    `lib/memory/knowledge-store.ts`, which no Files-to-Change row names. Three
    fresh reviews passed it because the tasks' directory-boundary criterion
    permits `lib/memory/`; the stricter final audit would not.
  - Decision: amend the file list on record rather than revert the change or let
    the final audit fail. The change is load-bearing — it routes user-root
    resolution through the canonical descriptor so the store cannot resolve a
    different user root than the injection and measurement paths, which is what
    AC-001's scope-set dimension and D-008 require. Reverting it would reopen
    the parity D-008 exists to close.
  - Second amendment, conditional: closing SR-004 may require tagging a
    committed-write error inside `lib/memory/durable-files.ts`, where the
    rename-then-sync sequence lives and where `DurableFileCommittedError` is
    already defined. That file is likewise unnamed by any row. It is
    pre-authorized for the SR-004 remediation **only** for the purpose of
    carrying an already-committed bit out of a failed write, and only if the fix
    cannot be made at the call site. It is not authorized for any change to
    retirement pathname sequencing, which D-026 closes.
  - Decided by: derived (coordinator, during implementation). Amendable on
    record. This entry widens no invariant: INV-001..INV-004 and the D-026
    exclusion are untouched, and `lib/memory/retirement-store.ts` remains out of
    scope.

## Implementation Order

### Stage 0 - Freeze baseline and parent ownership

1. Before **every task**, reproduce the spec's live-corpus calibration: 237 files
   and tree SHA-256
   `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`.
   The calculation is **exactly this command, run from the repository root**
   *(recorded 2026-09-07 after review; the gate was previously a value with no
   defined algorithm)*:

   ```sh
   find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256
   find knowledge -type f | wc -l
   ```

   Every element is load-bearing. `shasum` emits `<digest>  <path>`, so the paths
   are inside the hashed stream: running the same command with an absolute
   `find` root produces a **different digest over byte-identical files**. This
   was observed while pinning the baseline and briefly read as corpus mutation.
   Relative `knowledge`, `sort` before hashing, and no `--` rewriting are
   therefore part of the gate, not incidental shell style. `index.md` is included
   like any other file; nothing is excluded. If the exact baseline cannot be
   reproduced with this command, stop before editing; do not invent a
   replacement hash and do not adjust the expected value.
2. Record the allowed path set and the exact B-012/B-016/B-021 marker/name pairs
   from Architecture Context in every task acceptance criteria. Verify the
   working diff is inside that set before and after the task.
3. Add B-009's ownership contract and the B-011 result/pin expectations as
   **green-today assertions over current state**, and defer the parts that
   cannot be true until later stages. Explicitly *(clarified 2026-09-07 after
   review — plan-reviewer PR-002 read this step as scheduling a permanently red
   test)*:
   - **Lands at Stage 0, green immediately:** B-009 asserts the exact marker
     strings and test names of all six parent carriers enumerated in
     Architecture Context; B-011 pins the current `lib/memory/types.ts`
     full-source SHA-256 and asserts that today's frozen authority, receipt
     floor, byte authority and fail-closed validation assertions are present.
   - **Completes at Stage 4 (step 17):** B-009's assertion that every
     `living-memory-fidelity#B-001..B-012` marker is present on its named test,
     and B-011's assertion that `MemoryConsolidateDetails` exposes the
     `measured | unusable` pressure result. Both depend on code later stages
     create.
   - **No test may be committed red.** Gate 1 is a hard fail at every commit
     boundary, so a Stage-0 assertion about a Stage-4 artifact is a sequencing
     error, not a pending state. If the split above cannot keep Stage 0 green,
     halt and amend the Implementation Order rather than committing red or
     writing placeholder markers — placeholder markers on non-executable tests
     violate the behavior-spine requirement.
   - If `types.ts` changes in any later stage, re-pin **all** of its full-source
     hash assertions in that same commit.

### Stage 1 - Measurement fidelity remediation

4. RED B-001 with both round-7 directions, B-002 with missing exact render input,
   and B-003 with the malformed-record warning fixture. Run each against the
   current implementation and retain evidence that it fails for the intended
   divergence, not setup or type errors.
5. GREEN the smallest shared contract: canonical query, required
   `KnowledgeIndexRenderInput`, corpus snapshot contribution, one-argument
   renderer/policy, measured-or-unusable result, details reporting, and removal
   of `toIndexRecords`. Do not add a second corpus retrieval or couple pressure
   to body ceilings.
6. REFACTOR only after all three tests and parent B-021 are green. Then run the
   permanent measurement pack containing B-001/B-002/B-003 plus the exact parent
   B-021 test.
7. Run full project verification at the commit boundary:
   `bun run test`, `bun run lint`, `bun run typecheck`, and `git diff --check`.
   Recheck the live corpus hash/count.
8. Fresh structural review round: tell the reviewer that round 6 stopped
   measuring injection and round 7's attempted fix diverged in both directions
   and dropped warnings. The reviewer must inspect the complete permitted diff
   for one query, one required render input, one renderer, no local conversion,
   and no body-ceiling coupling, then rerun the permanent pack. Any high/medium
   finding starts a new Stage-1 remediation round from RED and requires another
   fresh review. Write the round's verdict to
   `missions/plans/living-memory-fidelity/review-<n>.md` (D-010).

### Stage 2 - Completeness before absence-dependent work

9. RED B-004/B-005/B-006 independently: corpus warning omission, retained receipt
   under incomplete corpus inventory, and readable malformed episode. The B-005
   spy evidence must cover discharge, represented/no-work conclusion,
   model/proposal materialization, and non-empty retirement application.
10. GREEN explicit source completeness/warnings and the post-pressure aggregate
    barrier. Preserve prior recovery details on the failed path. Do not alter
    retirement-store pathname code or D-026 tests.
11. REFACTOR after green, then rerun all Stage-1 measurement tests and parent
    B-016/B-021 as mandatory cross-stage regressions. Run the four full project
    checks and live corpus hash/count.
12. Fresh structural review round: tell the reviewer the Stage-1 fix replaced
    lossy reconstruction with the exact render input, and the prior round-7 fix
    still treated warned omissions as absence. Review every source outcome
    (healthy, byte-deferred-but-inventoried, warned corpus omission, malformed
    episode, contract-invalid custom source) and every barrier seam. Any
    high/medium finding starts a new Stage-2 remediation round and fresh review.
    Write the round's verdict to
    `missions/plans/living-memory-fidelity/review-<n>.md` (D-010).

### Stage 3 - Truthful committed-write reporting

13. RED B-007/B-008/B-012: the first removal unlinks then throws its committed
    sync error, source recovery is the pass's only committed work, and a retry
    whose only durable act is the accepted-to-materialized receipt transition
    must still report committed writes.
14. GREEN the receipt wrapper's nested committed-bit propagation and replace
    details overwrites with explicit OR accumulation. Audit every
    `writesCommitted` assignment in `living-memory.ts` within this scope; do not
    refactor retirement transactions.
15. REFACTOR after green, then rerun B-001..B-008 plus B-012 and the exact parent
    B-012/B-016/B-021 tests. Run the four full project checks and live corpus
    hash/count.
16. Fresh structural review round: tell the reviewer that Stage 2 added an early
    failure path after recovery and that the original findings lost committed
    bits in both an error wrapper and later details reconstruction. The reviewer
    checks success, failure, no-work, and incomplete-inventory returns for
    monotonic state — including the accepted-to-materialized transition B-012
    owns. Any high/medium finding starts a new Stage-3 remediation round and
    fresh review. Write the round's verdict to
    `missions/plans/living-memory-fidelity/review-<n>.md` (D-010).

### Stage 4 - Real composition, final gates, and handoff

17. RED/GREEN B-010 through the real binary against a temporary byte-for-byte
    corpus copy and temporary home. Assert measured bytes equal the copied
    combined-context render and all copied bytes remain unchanged. Complete
    B-009/B-011 per the Stage-0 split (B-009's fidelity-marker assertion over
    B-001..B-012, B-011's `measured | unusable` result assertion) and re-pin
    `types.ts` in the same commit if changed.
18. Run B-001..B-012 together, the exact parent B-012/B-016/B-021 named tests
    and the three additional parent marker carriers, then the full project checks. No commit is accepted unless all pass.
19. With the live hash/count freshly verified, run exactly from repository root:
    `bun bin/cosmonauts memory consolidate --dry-run --no-model --json`.
    Require `ran` or `noop`, `recovery: "none"`, `writesCommitted: false`, and a
    measured pressure figure equal to the bytes the real combined-context
    knowledge renderer produces for the same corpus. Immediately re-run the live
    hash/count and require the exact baseline. Do **not** run a non-dry command or
    a live retirement round.
20. Final fresh structural review of the entire permitted diff, supplied with the
    complete seven-round trajectory and every
    `missions/plans/living-memory-fidelity/review-<n>.md` recorded by steps 8,
    12 and 16 (D-010). It must
    rerun the permanent measurement pack and inspect completeness and commit
    monotonicity rather than only current test failures. Resolve every high and
    medium finding through another bounded remediation plus another fresh review.
21. Final scope audit: only the five Files-to-Change rows may differ; no D-026,
    retirement ordering/pathname, receipt-floor, Option C authority, TTL,
    explicit-save, config, documentation, parent artifact, or live-knowledge
    change is present. If unexpected complexity requires any of those, halt and
    amend/escalate rather than widening the task.
