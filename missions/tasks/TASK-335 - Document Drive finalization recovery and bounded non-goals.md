---
id: TASK-335
title: Document Drive finalization recovery and bounded non-goals
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:drive-resilience-state-model'
dependencies:
  - TASK-329
  - TASK-333
  - TASK-334
createdAt: '2026-05-22T19:58:25.807Z'
updatedAt: '2026-05-26T16:07:55.088Z'
---

## Description

Update operator and agent guidance so users understand finalization recovery, state commits, no-change evidence, completion candidates, and deferred UX/lifecycle follow-ups. Owns B-021 from source AC-011, AC-019. Seams: `lib/driver/README.md`, `domains/shared/skills/drive/SKILL.md`, `tests/prompts/drive-skill.test.ts`. Named test: `tests/prompts/drive-skill.test.ts` > `documents finalization recovery state commits no-change tasks and deferred UX followups`. Tests proving B-021 must carry marker `@cosmo-behavior plan:drive-resilience-state-model#B-021`.

<!-- AC:BEGIN -->
- [x] #1 B-021: Drive README explains `finalization_failed`, `pending-finalization.json`, resume recovery, safe external evidence, and the distinction from behavioral blocked tasks.
- [x] #2 B-021: Drive guidance documents default final state commit behavior and optional `stateCommitPolicy` without implying archive, memory, push, PR, or automatic plan lifecycle automation.
- [x] #3 B-021: Guidance explains verification-only no-source-change finalization evidence and how operators should route recovery from watch/status/list output.
- [x] #4 B-021: `/skill:drive` explicitly defers live-follow UI, generated final summary artifacts, artifact-conformance enforcement in Drive, and automatic plan completion as non-goals.
- [x] #5 The Drive skill prompt test covers the documented guidance and carries the B-021 marker.
<!-- AC:END -->

## Implementation Notes

Documented Drive finalization_failed recovery, pending-finalization resume evidence, default/override stateCommitPolicy behavior, verification-only no-source-change evidence, plan_completion_candidate routing, and deferred Drive UX/lifecycle non-goals. Added B-021 prompt test with exact behavior marker. Verification run: bun run test; bun run lint; bun run typecheck.
