---
id: TASK-658
title: >-
  QM round 3: Carry the source's own cap-deferral count through the snapshot
  contract
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-656
createdAt: '2026-09-08T19:22:13.327Z'
updatedAt: '2026-09-08T19:36:49.326Z'
---

## Description

Bounded remediation opened by finding SR-014 (medium) in
`missions/plans/living-memory-fidelity/review-13.md` (TASK-657). SR-013 is confirmed
closed and SR-010's path parity intact.

SR-014, independently confirmed. TASK-656 added a `deferred` count to
`MemoryConsolidateDetails["sources"]` and drove the `source-deferred` decline from it,
but the collector derives that count at `lib/memory/consolidation-sources.ts:918-920` as

    omitted:  snapshot.omitted + deferred,
    deferred: deferred + (snapshot.inventoryComplete ? snapshot.omitted : 0),

where the local `deferred` counts only the collector's own byte-ceiling deferrals. A
source's own cap deferrals are folded in **only when that source claims completeness**.
An incomplete source therefore has its entire omitted count attributed to integrity, so
its genuine cap deferrals disappear. A production probe recorded
`{"admitted":1,"omitted":2,"deferred":0,"inventoryComplete":false}` — `source-deferred`
suppressed, both omissions misreported as integrity.

Root cause: the source snapshot contract has no field for the source's own cap-deferral
count, so the collector has to infer it from `inventoryComplete`. That inference is
exactly backwards for a mixed-cause source.

**Why this survived thirteen review rounds and TASK-656's own tests:** every behaviour
test injects a fixture source that sets these fields directly, so the production corpus
and episode adapters' failure to populate them is invisible to the suite. This is the
same failure mode the ROADMAP's `deliverable-completeness-gates` entry records, where all
21 parent behaviours reached green while the production corpus adapter did not exist at
all. Marker conformance and fixture-driven behaviour tests cannot see a missing adapter.

Fix direction: add the source's own cap-deferral count to the snapshot contract, have
the production corpus and episode sources report it, and have the collector sum the two
real counts instead of inferring one from `inventoryComplete`. Keep `omitted` meaning
what it means today so no other consumer shifts.

Ratified-ground handling: the five common constraints below and INV-001..INV-004 are
stop-and-escalate ground. Do not weaken the Stage-1 measurement contract, the Stage-2
completeness barrier, the Stage-3/4 committed-write recording, SR-010's path parity, or
SR-013's separation of causes.

<!-- AC:BEGIN -->
- [x] #1 (Quality Contract assertion 7) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit.
- [x] #2 (Quality Contract assertion 6) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. No live `knowledge/` change and no non-dry-run write-capable memory command.
- [x] #3 (Quality Contract assertions 5 and 7) Parent ownership: all six exact parent B-012/B-016/B-021 marker/name carriers remain exact and parent-owned; no frozen pin, receipt floor, retirement/byte authority, fail-closed validation or existing marker is weakened. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the same commit.
- [x] #4 (Quality Contract assertion 7) Gates: `bun run test`, `bun run lint`, `bun run typecheck`, `git diff --check` and `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` all pass, with artifact conformance GREEN. No test is committed red.
- [x] #5 (Quality Contract assertions 7-8; D-026) D-026 is not reopened, retirement pathname sequencing is untouched, and no operation is reordered.
- [x] #6 (SR-014; production adapter) The RED counterexample uses the REAL production corpus source — `createProjectCorpusConsolidationSource()` against a temporary root — not an injected fixture source. It reproduces a mixed-cause source reporting `deferred: 0` with `source-deferred` suppressed, and after the fix reports the genuine cap-deferral count with both diagnostics present. A fixture-only test does not satisfy this criterion, because fixture sources set these fields directly and cannot detect an unwired adapter.
- [x] #7 (SR-014; episode adapter) The production episode source is covered by the same requirement: if it can produce cap deferrals, it reports its own count and a real-source test pins it; if it cannot, the task notes record why.
- [x] #8 (SR-014; no inference) The collector no longer derives a source's cap-deferral count from `inventoryComplete`. It sums the collector's own byte-ceiling deferrals with the count the source reports, so a mixed-cause incomplete source keeps an accurate cap-deferral count.
- [x] #9 (SR-013 preserved) An integrity omission is still never reported as a bounded deferral and a cap deferral is never reported as integrity. All three omission cases — all cap, all integrity, mixed — are pinned against the production source, and `omitted` retains its current meaning so no other consumer shifts.
- [x] #10 (regression) SR-010 path parity is preserved and the pre-SR-001 `observedRetirementCandidates.length` slice pattern does not reappear anywhere in `lib/memory/`.
- [x] #11 (Quality Contract assertions 1-4) The Stage-1 measurement contract, Stage-2 completeness barrier, warning append-only monotonicity and Stage-3/4 committed-write recording are preserved unweakened. The full fidelity pack B-001..B-012, the commit-interleaving tests and the exact parent B-012/B-016/B-021 carrier tests all pass.
<!-- AC:END -->
