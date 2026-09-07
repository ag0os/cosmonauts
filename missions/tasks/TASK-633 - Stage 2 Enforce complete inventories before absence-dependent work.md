---
id: TASK-633
title: 'Stage 2: Enforce complete inventories before absence-dependent work'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-632
createdAt: '2026-09-07T15:36:58.891Z'
updatedAt: '2026-09-07T15:36:58.891Z'
---

## Description

Implement only Stage 2, Implementation Order steps 9-11, as one test-first commit so independent RED evidence is followed by GREEN and refactor without committing red. Own B-004, B-005, and B-006 and their executable markers. Owning seams/adapters are the production corpus adapter, episode adapter, and aggregate collector in `lib/memory/consolidation-sources.ts`, plus the post-pressure completeness barrier in `lib/memory/living-memory.ts` before receipt discharge, represented-evidence/no-work conclusion, judgment/proposal materialization, and retirement authorization, with the named source and living-memory tests.

Ratified-ground handling: the common constraints and the spec's INV-002/INV-004 and AC-004..AC-006/AC-009/AC-011 letter are stop-and-escalate ground. D-009's accepted collateral stop has only the human remedy of repairing or removing the visible offending file; no acknowledge-and-continue override, machine quarantine, or broadening of the deliberately open silent-skip residue is permitted.

<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [ ] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [ ] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [ ] #4 (Quality Contract assertion 7; Implementation Order step 11) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [ ] #5 (Quality Contract assertions 7-8; Implementation Order steps 10 and 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [ ] #6 (B-004, B-005, B-006; Quality Contract assertion 3; Implementation Order steps 9-11) The three named independent counterexamples carry only their matching `@cosmo-behavior plan:living-memory-fidelity#B-004`, `#B-005`, and `#B-006` markers and are observed failing for the intended defects before production edits: a warned corpus omission retains every warning in source details and exact render input, increments omission count, and makes source/aggregate `inventoryComplete: false`; an incomplete corpus aggregate reports the warning and `source-inventory-incomplete`, leaves the materialized receipt present, performs no discharge or represented/no-work conclusion, invokes no judgment/proposal materialization, attempts no non-empty retirement, and still reports prior recovery `episodePrunes` with `writesCommitted: true`; and a readable malformed episode retains path and digest in inventory, increments `omitted`, reports its parse warning, and makes source/aggregate completeness false.
- [ ] #7 (Quality Contract assertions 3-6; Implementation Order steps 10-11) Every source snapshot explicitly declares completeness and propagates frozen warnings; aggregate completeness is the AND of source declarations plus rejection of structurally invalid `inventoryComplete: true` claims, while byte-deferred records whose parsed metadata remains inventoried stay complete. The post-pressure barrier preserves measured/unusable pressure and earlier recovery details, fails before every absence-dependent seam, introduces no pending state or override/quarantine, leaves the documented silent ENOENT/ELOOP skip residue open, and after refactor all Stage-1 measurement tests plus exact parent B-016/B-021 regressions pass.
<!-- AC:END -->
