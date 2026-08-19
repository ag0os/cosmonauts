---
id: TASK-565
title: 'Stage 7A: Run the recoverable backfill to machine GREEN'
status: To Do
priority: high
labels:
  - backend
  - testing
  - devops
  - 'plan:knowledge-surface'
dependencies:
  - TASK-564
createdAt: '2026-08-19T18:36:08.683Z'
updatedAt: '2026-08-19T18:36:08.683Z'
---

## Description

Deliver Slice B Stage 7A and own B-010. The Stage 6 scan-cost artifact with `verdict: pass` is a hard dependency. Implement and execute the callable, dependency-injected backfill lifecycle test-first; this task ends at machine GREEN with a digest-complete review index and explicitly does not perform human approval or promotion.

Temporary enablement is the human-ratified D-016 exception and never changes the default-OFF adoption decision. D-026 is fixed: concurrent config edits are never overwritten. D-027 requires cancellation through the real production spawner, not only a fake. D-029 requires no unindexed same-batch proposal to survive failure/cancellation or a rerun. Machine output remains strict OKF markdown under `memory/agent/proposals/`, with human-only promotion and no verbatim content. Preserve every exclusion: no consolidation, working state, episode/explicit-save changes, embeddings/cache, retention, sandbox, arbitrary-target execution, or default enablement. Halt and escalate on collision with this ground.

<!-- AC:BEGIN -->
- [ ] #1 B-010 machine GREEN derives exactly the current 19 missing slugs from archived plans minus the frozen pre-migration inventory, invokes the qualified existing distiller once per slug, and validates 3–15 attributable one-concept OKF proposals per slug under `memory/agent/proposals/`; if the execution-time derivation no longer matches the frozen inventory's missing-slug set, the batch halts for an on-record inventory amendment rather than proceeding against stale counts.
- [ ] #2 Successful completion conditionally restores `.cosmonauts/config.json` byte-for-byte when it still equals the exact temporary literal-true bytes written by the batch, then writes `memory/agent/proposals/backfill-review.json` binding source inputs and every proposal path/digest with aggregate digest and `noPromotion: true`.
- [ ] #3 D-026 failure behavior is tested and satisfied: a concurrent config edit is preserved without overwrite, the pre-run snapshot is saved to `.cosmonauts/config.json.backfill-prerun`, and the batch fails with a conflict report naming both paths.
- [ ] #4 D-027 cancellation is tested through production `createPiSpawner`: `SpawnConfig.signal` interrupts and awaits the running Pi session, `dispose()` is effective, and termination completes before config restoration and batch return; the plan-named pairing `tests/orchestration/agent-spawner.test.ts` ↔ `lib/orchestration/agent-spawner.ts` exists and carries the mid-run abort case at the spawner's own seam; success, injected failure, and fake cancellation also restore unchanged temporary config correctly.
- [ ] #5 D-029 cleanup removes only same-batch machine proposals for slugs that never completed validation before failed/cancelled exit and again before rerunning an unindexed slug, so no proposal absent from a review index survives or accumulates while already indexed sets remain outside that deletion authority.
- [ ] #6 Machine GREEN creates no approval artifact, promotes no proposal, leaves the project gate OFF after the supervised run, and contains the lifecycle in one focused callable seam without a second cancellation path, sandbox, consolidation path, or correctness cache.
- [ ] #7 The B-010 executable test carries `@cosmo-behavior plan:knowledge-surface#B-010`, is run RED before implementation and GREEN after refactor, and its success/failure/cancellation/concurrent-edit/orphan-cleanup/index-digest/no-promotion negatives satisfy Quality Contract assertions 6 and the mutation gate.
- [ ] #8 Before writing the temporary enabled config, the batch persists the pre-run bytes and digest to `.cosmonauts/config.json.backfill-prerun` on disk; on successful conditional restoration the snapshot is removed, and after an induced hard kill between enablement and restoration the surviving on-disk snapshot is sufficient for the documented R-009 manual recovery — tested, not assumed.
<!-- AC:END -->
