---
id: TASK-640
title: 'Stage 4: Final fresh structural review of the complete remediation'
status: Blocked
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-639
createdAt: '2026-09-07T15:40:58.801Z'
updatedAt: '2026-09-08T00:48:10.310Z'
---

## Description

Perform only the final fresh structural review in Implementation Order step 20; behavior ownership is none. Review the entire permitted implementation diff in a fresh context, supplied with the complete seven-round parent trajectory and every Stage-1/2/3 `review-<n>.md` verdict. This review inspects all named contracts, seams, adapters, and permanent counterexamples rather than only current failures, and records its own fresh verdict under D-010.

Ratified-ground handling: the common constraints and zero-high/medium final-review threshold are stop-and-escalate ground. Every high or medium finding requires a bounded remediation in the owning stage and another fresh final review; the reviewer cannot self-accept a fix or widen scope.

<!-- AC:BEGIN -->
- [x] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`, plus this plan's own review record at `missions/plans/living-memory-fidelity/review-<n>.md`, which is the sole permitted non-implementation addition (D-010). No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [x] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [x] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [x] #4 (Quality Contract assertion 7; Implementation Order step 20) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [x] #5 (Quality Contract assertions 7-8; Implementation Order steps 20-21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [x] #6 (B-001 through B-012 review evidence; Quality Contract assertions 1-8; Implementation Order step 20) A fresh reviewer receives the complete seven-round trajectory and every Stage-1/2/3 review record, inspects the entire permitted diff across the shared public/query/render contract, production corpus and episode adapters, combined-context renderer, pressure/retirement gate, completeness barrier, receipt wrapper/materialization transition, OR-only details assembly, interface ownership pins, and real CLI composition, reruns the permanent B-001/B-002/B-003 plus parent B-021 measurement pack, and explicitly inspects completeness and committed-write monotonicity.
- [ ] #7 (Quality Contract assertion 8; Implementation Order step 20) The final fresh verdict is recorded in `missions/plans/living-memory-fidelity/review-<n>.md` and referenced in task evidence, with zero unresolved high or medium findings; any such finding is resolved only by another bounded remediation plus another fresh structural review before final scope audit.
- [x] #8 (D-010) `<n>` in the review record filename is the next unused integer greater than every existing `review-*.md` in the plan directory — the Stage-1 round is `review-2.md`, since `review-1.md` is the plan's own design review. No existing review record may be overwritten, renamed or deleted, and each additional remediation round within a stage takes its own next integer.
- [x] #9 (Plan ## Risks, structural-analysis entry; Quality Contract gate table rows 3-7) The five bindable gates (`mutation`, `duplication`, `complexity`, `boundary-conformance`, `dead-code`) are reported as **degraded/unbound**, never as clean. The review verdict states explicitly that no executable structural evidence exists for them and that the reviewer inspected the permitted diff by hand; absence of tool findings is never recorded as a passing structural result.
<!-- AC:END -->

## Implementation Notes

task failed
