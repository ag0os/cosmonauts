---
id: TASK-295
title: 'Package-time skill discovery, filtering, and full markdown materialization'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:external-agent-orchestration'
dependencies:
  - TASK-292
createdAt: '2026-05-11T21:37:20.992Z'
updatedAt: '2026-05-12T01:02:31.038Z'
---

## Description

Implement runtime skill discovery and embedding for the packaging pipeline. Skills must be resolved from `skillPaths` using the same rules as internal sessions (flat `.md` at the root and directory `SKILL.md`), deduplicated, and returned as full markdown bodies with frontmatter stripped.

Files to create:
- `lib/agent-packages/skills.ts`
- `tests/agent-packages/skills.test.ts`

Depends on: TASK-292 (uses `resolveEffectiveProjectSkills`)

<!-- AC:BEGIN -->
- [x] #1 lib/agent-packages/skills.ts discovers flat .md skills at the root of each skillPath and recursive directory skills containing SKILL.md, matching Pi/Cosmonauts discovery rules.
- [x] #2 Full markdown body with YAML frontmatter stripped is returned for each selected skill; the raw content used for embedding is not just a skill index (B-005, D-004).
- [x] #3 skills.mode:'allowlist' embeds exactly the named skills; any name not found in skillPaths produces a clear diagnostic error rather than silent omission (B-005).
- [x] #4 skills.mode:'source-agent' uses resolveEffectiveProjectSkills() plus buildSkillsOverride() semantics so shared skills are preserved under project-level filters, matching internal session behavior (B-006).
- [x] #5 skills.mode:'none' returns an empty collection.
- [x] #6 Duplicate skill names are deduped by first match in skillPaths order (B-005).
- [x] #7 Tests in tests/agent-packages/skills.test.ts cover all three modes, flat vs directory skill discovery, frontmatter stripping, deduplication, and missing-skill errors using fixture skill paths.
<!-- AC:END -->

## Implementation Notes

Implemented package-time skill discovery and materialization in lib/agent-packages/skills.ts with tests in tests/agent-packages/skills.test.ts. Covers flat root markdown, directory SKILL.md discovery, root skill directories, frontmatter stripping, allowlist/none/source-agent modes, missing-skill diagnostics, first-match dedupe by resolved skill name, and source-agent project/shared skill filter parity. Verification: targeted agent-package/agent skill tests pass; full test/lint/typecheck currently fail on unrelated in-progress claude-binary-runner files/tests and task metadata formatting outside this task.
