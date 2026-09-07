---
id: TASK-641
title: 'Stage 4: Complete the final scope audit and handoff'
status: To Do
priority: high
labels:
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-640
createdAt: '2026-09-07T15:41:34.388Z'
updatedAt: '2026-09-07T15:41:34.388Z'
---

## Description

Perform only Implementation Order step 21 after the final fresh review; behavior ownership is none. Audit the delivered implementation diff against the plan's five Files-to-Change rows and all exclusions. This is a handoff gate, not permission to perform unrelated cleanup or fold findings into a broad final patch.

Ratified-ground handling: the common constraints, spec scope exclusions, and final allowed-file set are stop-and-escalate ground. If the delivered behavior requires a prohibited file, authority change, or D-026 work, halt and draft the appropriate amendment/escalation rather than widening this task.

<!-- AC:BEGIN -->
- [ ] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [ ] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [ ] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [ ] #4 (Quality Contract assertion 7; Implementation Order step 21) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [ ] #5 (Quality Contract assertions 7-8; Implementation Order step 21) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched.
- [ ] #6 (Quality Contract assertions 6-8; Implementation Order step 21) The final implementation diff is confined to the five planned rows and their exact files: `tests/extensions/architecture-memory.test.ts`, `lib/extensions/knowledge-surface/index-policy.ts`, `lib/extensions/knowledge-surface/combined-context.ts`; `tests/memory/consolidation-sources.test.ts`, `lib/memory/knowledge-records.ts`, `lib/memory/consolidation-sources.ts`; `tests/memory/living-memory.test.ts`, `lib/memory/living-memory.ts`, `lib/memory/consolidation-receipts.ts`; `tests/memory/interface.test.ts`, `lib/memory/types.ts`, `lib/memory/index.ts`; and `tests/cli/memory/subcommand.test.ts`, `cli/memory/subcommand.ts`. Every named seam and adapter has its implementing-task evidence and no other implementation file differs.
- [ ] #7 (Quality Contract assertions 5-8; Implementation Order step 21) The final audit finds no change to D-026, retirement ordering/pathname sequencing, receipt-floor or Option C authority, retired-area TTL, explicit-save semantics, configuration, documentation, architecture/parent artifacts, or live `knowledge/`; no frozen pin, byte authority, fail-closed validation, existing marker, or parent test name/strength is weakened, and unexpected complexity is halted for amendment/escalation rather than absorbed into handoff.
- [ ] #8 (D-010; Implementation Order step 21) The `missions/plans/living-memory-fidelity/review-<n>.md` records written by the Stage-1/2/3/4 review rounds are expected additions and are not scope-audit findings. Every other non-implementation file must be unchanged.
<!-- AC:END -->
