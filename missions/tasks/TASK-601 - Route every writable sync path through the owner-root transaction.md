---
id: TASK-601
title: Route every writable sync path through the owner-root transaction
status: To Do
priority: high
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:harness-adapters'
dependencies: []
createdAt: '2026-08-26T12:27:42.820Z'
updatedAt: '2026-08-26T12:28:43.266Z'
---

## Description

Codex review finding 3 (High). `syncHarnessAsset` in lib/harness-adapters/sync.ts, when called with `check: false`, calls `commitMaterialization` directly: it recursively removes the target and writes the manifest as a separate step, outside any owner-root lock or journal. A concurrent local edit landing between classification and commit can therefore be erased, and a crash between the two writes leaves target and manifest inconsistent. The only production caller (lib/skills/exporter.ts) currently passes `check: true`, so the real `harness sync` path IS transactional — this is a latent hazard on an exported surface rather than active corruption, but it is exported, documented as sync behavior, and exercised as such by tests. Ratified ground: INV-002 (sync never destroys local edits), D-009 (owner-root transaction boundary), B-005, B-007.

<!-- AC:BEGIN -->
- [ ] #1 No exported function can write a target or manifest outside an owner-root transaction; either the write path is routed through `withOwnerRootTransaction`/`applySyncPlanInTransaction`, or the writable entry point is made non-public and callers migrated.
- [ ] #2 A target edited concurrently between classification and commit is preserved, not erased, on every writable path.
- [ ] #3 Target and manifest can never be left inconsistent by a crash between their writes on any writable path.
- [ ] #4 A test proves the previously-unlocked path now honors the lock and journal, and that a concurrent edit survives it.
- [ ] #5 The production `harness sync` and compatibility `skills export` behavior is unchanged; existing B-005/B-007 tests pass under their existing titles and markers.
<!-- AC:END -->

## Implementation Notes

Quality Manager accepted as a structural correctness blocker because the exported writable surface violates D-009 even though the current production caller uses check-only classification. Prefer narrowing/removing the writable export if there is only one real transactional caller rather than building a second transaction orchestration path.
