---
id: TASK-055
title: Move prompt files to domain directories
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-052
createdAt: '2026-03-09T16:02:15.252Z'
updatedAt: '2026-03-09T16:29:03.433Z'
---

## Description

Relocate all prompt and capability markdown files from the centralized `prompts/` directory to the domain-based layout under `domains/shared/` and `domains/coding/`.

**File moves (content preserved verbatim):**
- `prompts/cosmonauts.md` → `domains/shared/prompts/base.md`
- `prompts/runtime/sub-agent.md` → `domains/shared/prompts/runtime/sub-agent.md`
- `prompts/capabilities/core.md` → `domains/shared/capabilities/core.md`
- `prompts/capabilities/tasks.md` → `domains/shared/capabilities/tasks.md`
- `prompts/capabilities/spawning.md` → `domains/shared/capabilities/spawning.md`
- `prompts/capabilities/todo.md` → `domains/shared/capabilities/todo.md`
- `prompts/capabilities/coding-readwrite.md` → `domains/coding/capabilities/coding-readwrite.md`
- `prompts/capabilities/coding-readonly.md` → `domains/coding/capabilities/coding-readonly.md`
- `prompts/agents/coding/*.md` (8 files) → `domains/coding/prompts/*.md`

**Also:**
- Delete old `prompts/` directory
- Update `PROMPTS_DIR` in `lib/prompts/loader.ts` to point to `domains/shared/prompts` (keeps loadPrompt/loadPrompts working as low-level utilities)
- Update `tests/prompts/loader.test.ts` for new paths

**Reference:** Plan mapping table in "Domain directory layout" section.

<!-- AC:BEGIN -->
- [ ] #1 All prompt files exist at their new domain paths with content preserved verbatim
- [ ] #2 Old prompts/ directory is deleted
- [ ] #3 PROMPTS_DIR in lib/prompts/loader.ts points to domains/shared/prompts
- [ ] #4 loadPrompt and loadPrompts functions still work for shared prompts
- [ ] #5 Prompt loader tests pass with updated paths
<!-- AC:END -->

## Implementation Notes

All prompt files moved to domain directories with content preserved verbatim (git detected as renames with 100% similarity). Old prompts/ directory deleted. PROMPTS_DIR updated to domains/shared/prompts. Loader tests updated for new domain-based paths.\n\nAlso updated agent-spawner.ts to load prompts from the correct domain directories (shared capabilities from domains/shared/capabilities, coding capabilities from domains/coding/capabilities, personas from domains/coding/prompts). The TODO(TASK-058) comment remains for proper four-layer prompt assembly.\n\nPre-existing issues not in scope: typecheck errors in agent-spawner.test.ts (referencing removed 'prompts' property on AgentDefinition), lint warnings in chain-runner.test.ts and todo-extension.test.ts (non-null assertions)."
