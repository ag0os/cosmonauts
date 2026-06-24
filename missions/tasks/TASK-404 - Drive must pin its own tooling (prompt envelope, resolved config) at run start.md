---
id: TASK-404
title: 'Drive must pin its own tooling (prompt envelope, resolved config) at run start'
status: To Do
priority: high
labels:
  - orchestration
  - drive
  - robustness
dependencies: []
createdAt: '2026-06-24T17:30:31.316Z'
updatedAt: '2026-06-24T17:30:31.316Z'
---

## Description

PROBLEM (observed): during a run that migrated the `coding` domain layout, the
Drive's default prompt-envelope path was re-resolved from the LIVE working tree
each run via `resolveDefaultEnvelopePath()` and pointed at a file a task had
moved (`bundled/coding/coding/drivers/templates/envelope.md` -> moved). A fresh
run could no longer start. A Drive run must be immune to tasks that move or edit
the driver's own dependencies (self-referential migration hazard).

WHERE:
- `cli/drive/subcommand.ts` — `resolveDefaultEnvelopePath`, run spec assembly.
- `lib/driver/types.ts` — `DriverRunSpec` (where the envelope path/content is
  carried).
- `lib/driver/prompt-template.ts` — where per-task prompt assembly reads the
  envelope (`promptLayers.envelopePath`).
- `lib/driver/run-state.ts` — run state persisted for resume.

WHAT TO DO:
Resolve and SNAPSHOT the driver's tooling inputs ONCE at run launch — at minimum
the prompt envelope CONTENT (not just its path) — persist them into the run
spec/run state, and have every task read from the snapshot rather than
re-resolving from the live filesystem. A task that moves or edits these files
mid-run must not affect the in-flight run. On resume, reuse the persisted
snapshot.

CONSTRAINTS: keep backwards compatibility with an explicit `--envelope` path;
additive to the run spec. Never leave the build broken between commits.


<!-- AC:BEGIN -->
- [ ] #1 The prompt envelope is resolved once at run launch and its content persisted into the run spec/state; per-task prompt assembly uses the snapshot, not a live filesystem lookup.
- [ ] #2 A regression test moves/edits the envelope file mid-run and the in-flight run still completes using the snapshot.
- [ ] #3 Resume reuses the persisted envelope snapshot rather than re-resolving.
- [ ] #4 typecheck, lint, and the full test suite pass.
<!-- AC:END -->
