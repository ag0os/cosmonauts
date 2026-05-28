---
id: TASK-331
title: Resume pending source commit finalization before backend work
status: Done
priority: high
assignee: worker
labels:
  - api
  - backend
  - testing
  - 'plan:drive-resilience-state-model'
dependencies:
  - TASK-327
  - TASK-328
  - TASK-329
createdAt: '2026-05-22T19:57:52.647Z'
updatedAt: '2026-05-26T15:43:29.766Z'
---

## Description

Teach CLI resume to handle pending source commit/task-status finalization before spawning backend work, including safe external source commit acceptance. Owns B-005, B-006, and B-007 from source AC-006, AC-007. Seams: `cli/drive/subcommand.ts`, `lib/driver/run-state.ts`, `lib/driver/run-one-task.ts`. Named tests: `tests/cli/drive/run.test.ts` > `resume finalizes pending commit failure before invoking backend work`; `resume accepts changed HEAD as existing commit for pending finalization`; `resume refuses external commit acceptance without changed head evidence`. Tests must carry markers for B-005, B-006, and B-007.

<!-- AC:BEGIN -->
- [x] #1 B-005: `cosmonauts drive run --plan <slug> --resume <runId>` detects commit-phase pending finalization and retries commit plus task-status finalization without invoking `runInline`, `startDetached`, or any backend for that task.
- [x] #2 B-005: Successful pending source finalization clears `pending-finalization.json`, emits the normal task completion evidence, and continues remaining queued tasks only after the worktree is safe.
- [x] #3 B-006: Resume accepts an already-created external source commit only when `headBeforeFinalization` exists, no committable source changes remain, and current `HEAD` differs from the recorded head; accepted evidence is recorded as the commit for task-status finalization.
- [x] #4 B-007: Resume refuses external source commit acceptance when required head evidence is missing, current `HEAD` is unchanged, or dirty source changes cannot be committed, leaving pending state in place and not marking the task Done.
- [x] #5 Detached and inline resumes clear stale `run.completion.json` before continuing after successful pending finalization.
- [x] #6 Resume slicing does not treat `task_finalization_failed` as completion; continuation starts after the task only once `task_done` exists.
<!-- AC:END -->

## Implementation Notes

Implemented CLI resume recovery for pending source commit/task-status finalization before backend continuation. Added B-005/B-006/B-007 coverage in tests/cli/drive/run.test.ts, including stale completion clearing for inline/detached resumes, safe external HEAD acceptance, unsafe evidence refusal, and resume slicing that ignores task_finalization_failed until task_done. Verified with bun run test tests/cli/drive/run.test.ts, bun run typecheck, bun run lint, and bun run test. Artifact conformance for the full active plan still fails on out-of-scope/future behaviors B-008, B-009, B-010, B-011, B-018, B-019, and B-021 missing markers/test file; TASK-331-owned B-005/B-006/B-007 markers are present.
