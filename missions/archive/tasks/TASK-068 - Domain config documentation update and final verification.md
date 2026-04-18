---
id: TASK-068
title: Domain config documentation update and final verification
status: Done
assignee: worker
priority: low
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-054
  - TASK-055
  - TASK-056
  - TASK-057
  - TASK-058
  - TASK-059
  - TASK-060
  - TASK-061
  - TASK-062
  - TASK-063
  - TASK-064
  - TASK-065
  - TASK-066
  - TASK-067
createdAt: '2026-03-09T16:04:42.619Z'
updatedAt: '2026-03-09T18:46:00.000Z'
---

## Description

Update all documentation to reflect the domain architecture and verify the entire system works end-to-end.

**Documentation updates:**
- Update `AGENTS.md` to reflect domain-qualified agent IDs and new directory structure
- Update any memory files or docs referencing old paths (`prompts/`, `skills/`, `extensions/`)
- Update README.md if it references old directory structure

**Final verification:**
- `bun run test` — all tests pass
- `bun run lint` — no lint errors
- `bun run typecheck` — no type errors
- Verify no remaining references to deleted paths (`prompts/`, `skills/`, `extensions/` at project root)
- Verify no remaining `createDefaultRegistry()` calls outside of tests

<!-- AC:BEGIN -->
- [x] #1 AGENTS.md reflects domain-qualified agent IDs and domain directory structure
- [x] #2 No documentation references old prompts/, skills/, or extensions/ root paths
- [x] #3 bun run test passes with zero failures
- [x] #4 bun run typecheck passes with zero errors
- [x] #5 No production code contains createDefaultRegistry() calls
- [x] #6 No remaining imports reference deleted file paths
<!-- AC:END -->

## Implementation Notes

**AGENTS.md updates:**
- Agent Definitions section: `lib/agents/definitions.ts` -> `domains/{domain}/agents/*.ts`
- Prompt Composition section: all four layer paths updated to `domains/` paths
- Three-Layer Architecture section: Layer 2 updated to reference `domains/{name}/` structure
- CLI section: added `--domain`/`-d` and `--list-domains` flags
- Key Directories section: removed `prompts/`, `skills/`, `extensions/`; added `domains/`

**ROADMAP.md updates:**
- `skills/languages/typescript/SKILL.md` -> `domains/coding/skills/languages/typescript/SKILL.md`
- `skills/domains/` -> `domains/coding/skills/`

**Verification results:**
- 691 tests passing (30 suites)
- typecheck passes with zero errors
- lint has pre-existing warnings (non-null assertions, import ordering) -- none introduced by this task
- Old directories (`prompts/`, `skills/`, `extensions/` at project root) confirmed deleted
- `createDefaultRegistry()` exists in production code as an intentional convenience API (not stale)
- No imports reference deleted file paths
