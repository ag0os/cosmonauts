---
id: TASK-476
title: 'Capture task lifecycle through lock-safe manager, Pi, and CLI edges'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:episodic-log'
dependencies:
  - TASK-471
  - TASK-473
createdAt: '2026-07-17T20:07:57.932Z'
updatedAt: '2026-07-17T20:07:57.932Z'
---

## Description

Implementation Order step 5 task-owner branch, parallel with the plan-owner branch after the shared checkpoint. Add optional capture context to the task manager and wire qualified actors plus awaitable warning transport through Pi and CLI create/edit surfaces. This task solely owns B-014 and B-024.

<!-- AC:BEGIN -->
- [ ] #1 B-014 (Sources AC-001, AC-002, and AC-006) is proven with `@cosmo-behavior plan:episodic-log#B-014`: context-carrying managers capture `task.created` only after lock release and one event per real status transition; non-status/same-status edits emit none, capture cannot alter locking/allocation/filename/success, and a context-free manager is valid and intentionally capture-suppressed.
- [ ] #2 B-024 (Sources AC-002 and AC-006) is proven with `@cosmo-behavior plan:episodic-log#B-024`: Pi task tools supply their qualified runtime actor and one awaited model-visible warning edge, while successful tool text/details stay successful and disabled output stays unchanged.
- [ ] #3 CLI task create/edit uses `cosmonauts/cli` provenance when capture is enabled and preserves existing interactive/batch output, ID allocation, files, and exit behavior when capture is disabled or fails.
- [ ] #4 The project-only gate remains OFF by default at every task seam, producing byte-identical manager/tool/CLI behavior and zero project/user episode or induced index files.
- [ ] #5 Task episodes use the sole `recordEpisode` helper after primary persistence; warning failures remain non-fatal and visible exactly once, and Drive-path managers remain context-free so task chatter cannot exceed the run/lifecycle noise budget.
- [ ] #6 Targeted tests catch capture under lock, unconditional or same-status capture, Drive-context leakage, fabricated actors, duplicate warnings, and non-status lifecycle noise.
<!-- AC:END -->
