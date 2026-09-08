---
id: TASK-656
title: 'QM round 2: Report cap deferrals and integrity omissions together'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-654
createdAt: '2026-09-08T03:08:19.509Z'
updatedAt: '2026-09-08T03:19:19.435Z'
---

## Description

Bounded remediation opened by finding SR-013 (medium) in
`missions/plans/living-memory-fidelity/review-12.md` (TASK-655). SR-010 and SR-012 are
confirmed closed by that review's twelve-behaviour path-parity pass.

SR-013 is a regression introduced by TASK-654's own SR-011 fix. That fix gated the
bounded-deferral decline on source completeness at `lib/memory/living-memory.ts:219`:

    .filter((source) => source.inventoryComplete && source.omitted > 0)

A source can legitimately have both at once — some records deferred by a genuine
record/byte/aggregate cap, and others omitted by a read/parse/inventory failure. Such a
source is incomplete, so the filter now suppresses its cap-deferral decline entirely.
The probe recorded one mixed source with `admitted: 1`, `omitted: 2`,
`inventoryComplete: false`, whose declines contained only `source-inventory-incomplete`;
its genuine record-cap deferral was not reported at all.

Root cause: `MemoryConsolidateDetails["sources"]` carries a single `omitted` count that
aggregates both causes, so the decline builder cannot report them independently. The
collector already tracks cap deferrals separately — `consolidation-sources.ts` maintains
a local `deferred` counter alongside `admitted` — but does not surface it.

Fix direction: surface the cap-deferred count in the source row and drive the
bounded-deferral decline from that count rather than from `omitted` gated on
completeness. Both diagnostics must then be able to appear for the same source, each
with an accurate count. Keep the change minimal and do not re-merge integrity omissions
into the deferral diagnostic — that is the SR-011 defect this must not reintroduce.

Ratified-ground handling: the five common constraints below and INV-001..INV-004 are
stop-and-escalate ground. Do not weaken the Stage-1 measurement contract, the Stage-2
completeness barrier, the Stage-3/4 committed-write recording, or the SR-010 path
parity.

<!-- AC:BEGIN -->
- [x] #1 (Quality Contract assertion 7) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit.
- [x] #2 (Quality Contract assertion 6) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. No live `knowledge/` change and no non-dry-run write-capable memory command.
- [x] #3 (Quality Contract assertions 5 and 7) Parent ownership: all six exact parent B-012/B-016/B-021 marker/name carriers remain exact and parent-owned; no frozen pin, receipt floor, retirement/byte authority, fail-closed validation or existing marker is weakened. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the same commit.
- [x] #4 (Quality Contract assertion 7) Gates: `bun run test`, `bun run lint`, `bun run typecheck`, `git diff --check` and `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` all pass, with artifact conformance GREEN. No test is committed red.
- [x] #5 (Quality Contract assertions 7-8; D-026) D-026 is not reopened, retirement pathname sequencing is untouched, and no operation is reordered.
- [x] #6 (SR-013) A RED counterexample reproduces SR-013 before any production edit: one source reports both a genuine cap deferral and an integrity omission, and the result is shown to contain only `source-inventory-incomplete` with the cap deferral unreported. After the fix both diagnostics appear for that source, each with an accurate count.
- [x] #7 (SR-013; no reintroduction of SR-011) An integrity omission is still never reported as a bounded deferral. A source whose omissions are ALL integrity failures emits no bounded-deferral decline, and a source whose omissions are ALL cap deferrals emits no integrity decline. Both single-cause cases are pinned by tests alongside the mixed case.
- [x] #8 (SR-013; counts) The counts reported in each diagnostic are accurate for that cause rather than the aggregate `omitted` total, so a consumer reading the mixed-source result can tell how many records were cap-deferred and how many were unavailable.
- [x] #9 (regression) SR-010 path parity is preserved: pressure-blocked retirement diagnostics remain identical between the deterministic fast path and the judgment path, and the pre-SR-001 `observedRetirementCandidates.length` slice pattern does not reappear anywhere in `lib/memory/`.
- [x] #10 (Quality Contract assertions 1-4) The Stage-1 measurement contract, Stage-2 completeness barrier, warning append-only monotonicity and Stage-3/4 committed-write recording are preserved unweakened. The full fidelity pack B-001..B-012, the commit-interleaving tests and the exact parent B-012/B-016/B-021 carrier tests all pass.
<!-- AC:END -->
