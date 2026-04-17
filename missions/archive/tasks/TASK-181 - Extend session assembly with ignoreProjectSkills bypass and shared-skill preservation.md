---
id: TASK-181
title: >-
  Extend session assembly with ignoreProjectSkills bypass and shared-skill
  preservation
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:init-command'
dependencies: []
createdAt: '2026-04-14T13:38:00.527Z'
updatedAt: '2026-04-14T13:43:44.702Z'
---

## Description

Implement two related behaviors in `lib/agents/session-assembly.ts` (and its interface in `cli/session.ts`):

1. **Shared-skill preservation (normal sessions):** When `projectSkills` is defined, compute the effective allowlist as `sharedSkillNames ∪ projectSkills` before calling `buildSkillsOverride(...)`. Shared skill names are enumerated from the `shared/skills/` subdirectory of `domainsDir` (or resolver's shared domain path). This prevents an init-created `skills` array from hiding `/skill:plan`, `/skill:init`, etc.

2. **Init-only bypass:** When `ignoreProjectSkills: true` is passed, treat project skills as `undefined` so wildcard agents see the full unfiltered skill catalogue.

**Files to change:**
- `lib/agents/session-assembly.ts` — add `ignoreProjectSkills?: boolean` to `BuildSessionParamsOptions`; implement the two behaviors described above
- `cli/session.ts` — add `ignoreProjectSkills?: boolean` to `CreateSessionOptions` and forward it to `buildSessionParams`
- `tests/agents/session-assembly.test.ts` — add coverage for: shared-skill names appear in filtered sessions, project-only skills are also present, `ignoreProjectSkills: true` returns `undefined` skillsOverride regardless of projectSkills

**Key contracts:**
```ts
// BuildSessionParamsOptions
ignoreProjectSkills?: boolean;

// CreateSessionOptions
ignoreProjectSkills?: boolean;
```
Behavior:
- `ignoreProjectSkills: true` → `buildSkillsOverride(def.skills, undefined)` (full catalogue)
- default + `projectSkills` defined → `buildSkillsOverride(def.skills, sharedSkillNames ∪ projectSkills)`
- default + no `projectSkills` → existing behavior unchanged

<!-- AC:BEGIN -->
- [ ] #1 BuildSessionParamsOptions and CreateSessionOptions each have an optional ignoreProjectSkills boolean field
- [ ] #2 When ignoreProjectSkills is true, buildSessionParams produces an undefined skillsOverride for a wildcard-skills agent regardless of projectSkills value
- [ ] #3 When projectSkills is defined and ignoreProjectSkills is absent/false, the resulting skillsOverride allows both shared-domain skills and project skills through (union semantics)
- [ ] #4 When projectSkills is absent, existing behavior is unchanged (no skillsOverride for wildcard agents)
- [ ] #5 New tests in tests/agents/session-assembly.test.ts cover all three behavioral branches
- [ ] #6 bun run test passes with no regressions
<!-- AC:END -->

## Implementation Notes

Implemented all TASK-181 acceptance criteria. Added ignoreProjectSkills?: boolean to lib/agents/session-assembly.ts and cli/session.ts, forwarded the option through createSession, and updated session assembly so project filtering uses shared-skill names ∪ projectSkills unless ignoreProjectSkills is true (which now leaves wildcard agents unfiltered). Added session-assembly tests for the three branches: no projectSkills unchanged, shared+project union filtering, and ignoreProjectSkills bypass. Verification: bun run test, bun run lint, and bun run typecheck all pass. Commit: 0b9c156 (TASK-181: Preserve shared skills in session assembly).
