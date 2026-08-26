---
id: TASK-594
title: Register link shapes per target and reject unregistered shapes
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-588
createdAt: '2026-08-26T10:42:05.329Z'
updatedAt: '2026-08-26T10:42:05.329Z'
---

## Description

Implements human-ratified D-021 from the Checkpoint B sandbox probe. Extends the existing registry supportedModes mechanism under B-001 and B-005 exactly as D-019 did for command assets; this task adds NO thirteenth behavior and owns no new B-### marker. Seam/files: `lib/harness-adapters/types.ts`, `lib/harness-adapters/registry.ts`, `lib/harness-adapters/render.ts`, `lib/harness-adapters/sync.ts`, `tests/harness-adapters/registry.test.ts`, `tests/harness-adapters/render.test.ts`. Ratified ground: INV-003, INV-006, D-019 precedent, and D-021 itself. Explicit link must never fall back to copy. No live target, native command source, personal bundle, or migration evidence may be written by this task.

<!-- AC:BEGIN -->
- [ ] #1 B-001: the registry records link shapes per target and kind — the Claude skill adapter registers `directory`, `flat-skill`, and `generated-wrapper`; the Codex skill adapter registers only `directory`; command assets remain copy-only per D-019.
- [ ] #2 B-005: a `--link` request whose resolved shape is not registered for the selected target fails before any owner-root, target, or manifest write, with an actionable error naming the asset, the resolved shape, and the shapes that target does register.
- [ ] #3 B-005/INV-006: a rejected link request leaves no provenance entry, no partial target, and no owner-root artifact, and never falls back to copy mode.
- [ ] #4 Copy mode is unchanged for every target and every shape, and direct-directory link remains supported on both Claude and Codex.
- [ ] #5 The existing declared tests `tests/harness-adapters/registry.test.ts` and `tests/harness-adapters/render.test.ts` cover the new rejection under their existing B-001/B-005 titles and markers; no new behavior marker is introduced.
<!-- AC:END -->
