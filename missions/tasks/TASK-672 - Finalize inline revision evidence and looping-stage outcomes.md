---
id: TASK-672
title: Finalize inline revision evidence and looping-stage outcomes
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:chain-stage-context'
dependencies:
  - TASK-671
createdAt: '2026-09-10T02:14:09.356Z'
updatedAt: '2026-09-10T02:14:09.356Z'
---

## Description

Implementation Order step 5. Owns behaviors B-007, B-009, and B-013 exclusively. Extend the shared report adapter and inline run state in `lib/orchestration/review-revision.ts`, `lib/orchestration/chain-runner.ts`, and `lib/orchestration/types.ts`, with test-first evidence in `tests/orchestration/chain-runner.test.ts` and the shared runner characterization surface.

Recorded ground: D-004, D-005, D-007, D-009, D-010, and D-011 are derived and may change only through amend-on-record. The ratified acceptance and scope boundary forbids warning-only continuation, arbitrary reviewer-output transport, persistent plan watermarks, and generic runtime changes; encountering such a need requires stop-and-escalate.

<!-- AC:BEGIN -->
- [ ] #1 B-007 is proven by `tests/orchestration/chain-runner.test.ts` > `records a typed review block as an unsuccessful inline chain result`, carrying `@cosmo-behavior plan:chain-stage-context#B-007`: every missing, malformed, multiple, nonterminal, unaddressed, wrong, stale, unsafe, unreadable, or incompletely referenced revision state yields `success:false`, a typed block, a nonempty stable stage error, an unsuccessful chain, aggregated errors, the block event, and no later sequential spawn.
- [ ] #2 A revision report is accepted only as the sole matching last nonblank line with the bound slug/round and allowed `addressed` status, or returns the allowed `unaddressed` status with a reason; unknown keys/status, malformed JSON, and nonpositive/noninteger rounds block.
- [ ] #3 B-009 is proven by `tests/orchestration/chain-runner.test.ts` > `starts task decomposition only for earlier reviewer-bound addressed evidence`, carrying `@cosmo-behavior plan:chain-stage-context#B-009`: matching valid evidence records the reviser's zero-based source index, emits no block, and permits later task-manager execution, including explicit-report rounds with no high/medium findings and no fake edit.
- [ ] #4 Addressed state is accepted only for the reviewer-bound active safe highest round after TASK-670 confirms every high/medium finding reference; mismatched or self-attested revision identity cannot authorize continuation.
- [ ] #5 B-013 is proven by `tests/orchestration/chain-runner.test.ts` > `gates a looping revision stage once after its final iteration`, carrying `@cosmo-behavior plan:chain-stage-context#B-013`: validation occurs exactly once after the final iteration, never between iterations; addressed output authorizes a later task-manager and omitted output creates the typed nonempty-error unsuccessful result.
- [ ] #6 Inline review evidence remains run-local and non-resumable: a fresh process cannot fabricate addressed state and must rerun review.
<!-- AC:END -->
