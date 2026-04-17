---
id: TASK-150
title: '[P2] Capture delegated spawn sessions in plan lineage artifacts'
status: Blocked
priority: medium
assignee: worker
labels:
  - review-fix
  - 'review-round:1'
  - orchestration
  - sessions
  - lineage
dependencies: []
createdAt: '2026-04-07T19:40:55.083Z'
updatedAt: '2026-04-07T19:55:42.241Z'
---

## Description

Reviewer finding F-002: `spawn_agent` child sessions currently bypass lineage persistence. Child sessions launched via `domains/shared/extensions/orchestration/spawn-tool.ts` should be captured the same way as top-level spawns so plan session lineage and distillation inputs are complete.

<!-- AC:BEGIN -->
- [ ] #1 Child sessions launched from `spawn_agent` carry plan context when available and persist JSONL + transcript files under `missions/sessions/<planSlug>/`.
- [ ] #2 A manifest entry is appended for each child session using the same record shape as top-level sessions (including outcome, role, and parent/task linkage when available).
- [ ] #3 Existing non-plan spawns continue to work without creating session files or manifest entries.
<!-- AC:END -->

## Implementation Notes

Coordinator blocked (2026-04-07): Two consecutive workers marked this Done with thorough implementation notes but left all 3 AC checkboxes unchecked. The implementation appears complete per the notes (1233 tests pass, all 3 ACs described as satisfied). Human action needed: manually verify each AC against the code and check them off, then set status back to Done.
