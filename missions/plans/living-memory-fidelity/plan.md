---
title: 'Living memory: honest measurement, discharge, and reporting'
status: active
createdAt: '2026-09-07T14:06:12.817Z'
updatedAt: '2026-09-07T14:27:42.181Z'
---

## Overview

Close the four open `living-memory` review findings without reopening any closed
ground. The implementation makes the pressure measurement consume the same
render input as combined-context injection, makes source completeness explicit
before absence-dependent work, and preserves every committed-write bit through
error and result reconstruction.

This is architecture-linked planned remediation with **11 behaviors**, within
the project guidance of at most 12. The behavior clusters below are also the
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
  - Decided by: user-directed, 2026-09-07

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
  - Decided by: user-directed, 2026-09-07

- **D-007 - Scope and live-data prohibitions are hard stops**
  - Decision: no live retirement round, no write-capable command against live
    `knowledge/`, no D-026 work, and no edit outside the permitted directories
    and mirrored tests. The exact dry-run/no-model command required by AC-010 is
    read-only evidence and is bracketed by the live corpus hash/count check.
  - Alternatives: opportunistic cleanup or documentation edits; a live
    retirement smoke test; another pathname verification layer.
  - Why: these exclusions are human-ratified ground and protect the already
    closed safety story (`living-memory-fidelity` INV-004).
  - Decided by: user-directed, 2026-09-07

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
- Context: the corpus retrieval boundary warns that one otherwise-current knowledge path could not be read or parsed and omits it from returned records
- Action: `createProjectCorpusConsolidationSource().collect()` converts retrieval output into a source snapshot and the collector aggregates it
- Expected: the warning is retained, the omission is counted, the source and aggregate report `inventoryComplete: false`, and the exact render input still carries every warning injection would render
- Seam: `lib/memory/knowledge-store.ts` result → `lib/memory/consolidation-sources.ts` corpus adapter and collector
- Test: `tests/memory/consolidation-sources.test.ts` > `marks corpus inventory incomplete when retrieval omits a warned record`
- Marker: `@cosmo-behavior plan:living-memory-fidelity#B-004`

### B-005 - Incomplete inventory blocks every absence-dependent seam

- Source: AC-005, AC-009
- Context: a materialized receipt exists for an unchanged valid corpus record while the current source snapshot reports that record unreadable and inventory incomplete
- Action: a configured consolidator runs against the incomplete aggregate
- Expected: it reports the source warning and `source-inventory-incomplete` failure, leaves the receipt present, performs no stale discharge, makes no represented-evidence/no-work conclusion, invokes no judgment/proposal materialization, and attempts no non-empty retirement application
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
- Context: the first stale receipt removal unlinks its file and then fails while syncing the parent, so the thrown durable error carries `writesCommitted: true` before any path is appended to the completed-removals array
- Action: receipt discharge wraps the failure and the consolidator reports it
- Expected: the result is failed with `writesCommitted: true`, the receipt is absent, and the original sync failure remains visible; the existing later-removal regression stays green
- Seam: `lib/memory/durable-files.ts` error contract → `lib/memory/consolidation-receipts.ts` wrapper → `lib/memory/living-memory.ts` failure result
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
- `tests/memory/living-memory.test.ts` ↔ `lib/memory/living-memory.ts`, `lib/memory/consolidation-sources.ts`, `lib/memory/consolidation-receipts.ts`: B-001/B-002/B-005/B-007/B-008 pressure gating, completeness barrier, first-removal committed error, and OR-only source-recovery reporting; preserve the parent B-016 marker/name.
- `tests/memory/interface.test.ts` ↔ `lib/memory/types.ts`, `lib/memory/index.ts`: B-009/B-011 public render/pressure/source/result contracts, exact parent ownership checks, exact result keys, and same-commit full-source SHA-256 re-pin; preserve the parent B-012 marker/name.
- `tests/cli/memory/subcommand.test.ts` ↔ `cli/memory/subcommand.ts`: B-010 real binary composition on the copied corpus and JSON pressure reporting. Production CLI code changes only if needed to expose the public details already serialized; no parallel measurement path is allowed.

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
- **Ratified ground collision.** If any proposed fix reaches retirement pathname
  sequencing, asks for a fifth D-026 verification layer, weakens a parent
  behavior/pin, or needs a file outside scope, halt and escalate. Do not classify
  it as local remediation.

## Quality Contract

Plan-specific assertions:

1. Pressure and injection accept the same required records-plus-warnings value,
   use one canonical query and one renderer, and both round-7 divergence fixtures
   assert byte equality; no private inventory-to-index conversion remains.
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
   before and after every task.
7. Every commit passes project-native tests, lint/static checks, type checks, and
   whitespace/diff checks; no frozen pin, receipt floor, byte authority,
   fail-closed validation, or existing marker is weakened.
8. Every remediation round receives a fresh structural re-review covering the
   full permitted diff and permanent measurement pack; no unresolved high or
   medium finding advances to the next stage.

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | All behavior tests, parent regressions, full project checks, live-byte guards, and plan assertions pass at every required boundary | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Required behavior fields, root-relative existing test files, exact fidelity markers, and preserved parent marker/name ownership pass | artifact evidence | hard fail; markers become present during RED before production edits |
| 3 | `mutation` | bindable | unbound | Targeted negative controls fail on the current defects and pass only after each fix | pending | unbound, not enforced mechanically; fresh reviewer judges counterexample strength |
| 4 | `duplication` | bindable | unbound | No second index query, renderer, render-input reconstruction, or commit accumulator is introduced | pending | unbound, not enforced; structural reviewer inspection required |
| 5 | `complexity` | bindable | unbound | The completeness barrier and commit fold remain explicit, with no new cross-cutting state machine | pending | unbound, not enforced; structural reviewer inspection required |
| 6 | `boundary-conformance` | bindable | unbound | `lib/memory` owns data contracts, the extension depends inward and owns rendering, and CLI only composes; no edit leaves the permitted directories/tests | pending | unbound, not enforced; diff/import inspection required |
| 7 | `dead-code` | bindable | unbound | Removed `toIndexRecords` and superseded call forms have no remaining use; no unrelated exports are demoted | pending | unbound, not enforced; scoped reviewer judgment only, no repo-wide sweep |

## Implementation Order

### Stage 0 - Freeze baseline and parent ownership

1. Before **every task**, reproduce the spec's live-corpus calibration: 237 files
   and tree SHA-256
   `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`.
   Record the deterministic calculation in task evidence. If the exact baseline
   cannot be reproduced, stop before editing; do not invent a replacement hash.
2. Record the allowed path set and the exact B-012/B-016/B-021 marker/name pairs
   from Architecture Context in every task acceptance criteria. Verify the
   working diff is inside that set before and after the task.
3. Add B-009's ownership contract and the B-011 result/pin expectations. Preserve
   the existing parent tests in place. If `types.ts` changes later, re-pin all of
   its full-source hash assertions in the same commit.

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
   fresh review.

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

### Stage 3 - Truthful committed-write reporting

13. RED B-007/B-008: the first removal unlinks then throws its committed sync
    error, and source recovery is the pass's only committed work.
14. GREEN the receipt wrapper's nested committed-bit propagation and replace
    details overwrites with explicit OR accumulation. Audit every
    `writesCommitted` assignment in `living-memory.ts` within this scope; do not
    refactor retirement transactions.
15. REFACTOR after green, then rerun B-001..B-008 and the exact parent
    B-012/B-016/B-021 tests. Run the four full project checks and live corpus
    hash/count.
16. Fresh structural review round: tell the reviewer that Stage 2 added an early
    failure path after recovery and that the original findings lost committed
    bits in both an error wrapper and later details reconstruction. The reviewer
    checks success, failure, no-work, and incomplete-inventory returns for
    monotonic state. Any high/medium finding starts a new Stage-3 remediation
    round and fresh review.

### Stage 4 - Real composition, final gates, and handoff

17. RED/GREEN B-010 through the real binary against a temporary byte-for-byte
    corpus copy and temporary home. Assert measured bytes equal the copied
    combined-context render and all copied bytes remain unchanged. Complete
    B-009/B-011 and re-pin `types.ts` in the same commit if changed.
18. Run B-001..B-011 together, the exact parent B-012/B-016/B-021 named tests,
    then the full project checks. No commit is accepted unless all pass.
19. With the live hash/count freshly verified, run exactly from repository root:
    `bun bin/cosmonauts memory consolidate --dry-run --no-model --json`.
    Require `ran` or `noop`, `recovery: "none"`, `writesCommitted: false`, and a
    measured pressure figure equal to the bytes the real combined-context
    knowledge renderer produces for the same corpus. Immediately re-run the live
    hash/count and require the exact baseline. Do **not** run a non-dry command or
    a live retirement round.
20. Final fresh structural review of the entire permitted diff, supplied with the
    complete seven-round trajectory and each remediation/review result. It must
    rerun the permanent measurement pack and inspect completeness and commit
    monotonicity rather than only current test failures. Resolve every high and
    medium finding through another bounded remediation plus another fresh review.
21. Final scope audit: only the five Files-to-Change rows may differ; no D-026,
    retirement ordering/pathname, receipt-floor, Option C authority, TTL,
    explicit-save, config, documentation, parent artifact, or live-knowledge
    change is present. If unexpected complexity requires any of those, halt and
    amend/escalate rather than widening the task.
