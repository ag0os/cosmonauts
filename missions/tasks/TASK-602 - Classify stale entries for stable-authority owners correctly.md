---
id: TASK-602
title: Classify stale entries for stable-authority owners correctly
status: Done
priority: medium
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:harness-adapters'
dependencies: []
createdAt: '2026-08-26T12:27:43.254Z'
updatedAt: '2026-08-26T13:55:12.800Z'
---

## Description

Codex review finding 4 (Medium). `classifyStaleEntry` in lib/harness-adapters/sync.ts compares `entry.owner` only against `currentProjectOwner`, so an authority-owned entry (`authority:cosmonauts/core` — the external cosmonauts bundle and both commands) can never match and is always reported `locally-edited (foreign-owner)`. Design section 5 requires "matching stable authority from another cwd/package path" to classify as the SAME owner, and D-016 requires healthy source-removal exits (`source-removed`, `--forget-removed`) to apply to those assets. Today an authority asset whose source disappears from a healthy declared root gets the wrong state and loses its safe removal path. Ratified ground: B-004, B-006, D-013, D-016, Design section 5 grid.

<!-- AC:BEGIN -->
- [x] #1 A stale manifest entry owned by a matching stable authority classifies as the same owner, not `foreign-owner`.
- [x] #2 An authority-owned asset whose source is absent from a healthy still-declared root reports `source-removed` and gets D-016 safe exits (unchanged target plus entry removed; absent target entry removed; edited target preserved pending explicit `--forget-removed`).
- [x] #3 Genuinely foreign owners — a different project owner, or a different authority id — still classify as `foreign-owner` and are never implicit removal candidates.
- [x] #4 Incomplete or undeclared source health still blocks any removal for authority-owned entries, exactly as for project-owned ones.
- [x] #5 Existing B-004/B-006 tests pass under their existing titles and markers; no new behavior marker is added.
<!-- AC:END -->

## Implementation Notes

Quality Manager accepted as B-004/B-006 stable-authority classification defect. Preserve D-013 cross-project authority identity.
