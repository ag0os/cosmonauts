---
id: TASK-554
title: Extract POSIX process-group primitives into lib/process
status: Done
priority: high
labels:
  - 'plan:drive-process-reaping'
dependencies: []
createdAt: '2026-08-10T18:47:50.209Z'
updatedAt: '2026-08-10T18:48:49.804Z'
---

## Description

Pure refactor, no behaviour change. Move `processGroupExists` and
`signalPosixProcessGroup` out of
`domains/shared/extensions/project-tools/process-runner.ts` into a new
`lib/process/process-group.ts`, and have `process-runner.ts` import them.

Per D-002 only these two primitives move. The settle/poll machinery in
`process-runner.ts` stays where it is — it is built around
`node:child_process` streams and the driver backends use `Bun.spawn`.

<!-- AC:BEGIN -->
- [ ] #1 lib/process/process-group.ts exports processGroupExists and signalPosixProcessGroup with their current semantics: kill(-pgid, 0) liveness, ESRCH treated as gone, non-ESRCH errors returned rather than thrown.
- [ ] #2 domains/shared/extensions/project-tools/process-runner.ts contains no local copy of either helper and imports both from the new module.
- [ ] #3 tests/extensions/project-tools-process.test.ts passes unchanged, including 'reaps descendants after providers exit naturally or by signal'.
- [ ] #4 bun run test, bun run lint, and bun run typecheck are green with no other source change in the commit.
<!-- AC:END -->
