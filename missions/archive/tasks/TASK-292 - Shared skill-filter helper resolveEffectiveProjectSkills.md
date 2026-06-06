---
id: TASK-292
title: 'Shared skill-filter helper: resolveEffectiveProjectSkills'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:external-agent-orchestration'
dependencies: []
createdAt: '2026-05-11T21:36:46.515Z'
updatedAt: '2026-05-12T00:55:33.975Z'
---

## Description

Extract the project-skill-expansion logic from `lib/agents/session-assembly.ts` into a reusable exported helper in `lib/agents/skills.ts` so both internal sessions and package-time skill resolution share a single implementation.

Files to change:
- `lib/agents/skills.ts` — add `resolveEffectiveProjectSkills()`
- `lib/agents/session-assembly.ts` — replace private shared-skill expansion with the new helper
- `tests/agents/skills.test.ts` — extend coverage

<!-- AC:BEGIN -->
- [x] #1 resolveEffectiveProjectSkills() is exported from lib/agents/skills.ts and computes the effective project skill filter including shared-skill expansion, matching the behavior previously embedded in session-assembly.
- [x] #2 lib/agents/session-assembly.ts uses resolveEffectiveProjectSkills() instead of its own inline shared-skill expansion logic, with no observable change to internal session behavior.
- [x] #3 Tests in tests/agents/skills.test.ts cover: shared skills are preserved under project-level filters, missing shared-skill names do not crash, and the helper returns undefined when no projectSkills config is present.
<!-- AC:END -->

## Implementation Notes

Implemented resolveEffectiveProjectSkills() in lib/agents/skills.ts, replaced session-assembly's inline shared-skill expansion with the helper, and added tests for shared-skill preservation, missing shared skill files, and absent projectSkills. Committed as 7785b76. Full test/lint/typecheck currently fail because unrelated untracked agent-packages test files reference modules not present yet and unrelated formatting issues exist; targeted tests and checks for changed files pass.
