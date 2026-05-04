---
id: TASK-251
title: 'Plan 1: Prompt template'
status: To Do
priority: medium
labels:
  - backend
  - 'plan:driver-primitives'
dependencies:
  - TASK-248
createdAt: '2026-05-04T17:32:35.936Z'
updatedAt: '2026-05-04T18:25:57.795Z'
---

## Description

Implement `lib/driver/prompt-template.ts` and `tests/driver/prompt-template.test.ts`.

See **Implementation Order step 3**, **Design > Module structure** (`prompt-template.ts` entry) in `missions/plans/driver-primitives/plan.md`.

Renders the per-task prompt by composing envelope + optional precondition + optional per-task override, then persists the result to `spec.workdir/prompts/<taskId>.md` so the backend reads it by path.

<!-- AC:BEGIN -->
- [ ] #1 renderPromptForTask(taskId: string, layers: PromptLayers, taskManager: TaskManager): Promise<string> is exported from lib/driver/prompt-template.ts.
- [ ] #2 Reads envelope file from layers.envelopePath; incorporates optional preconditionPath content when present.
- [ ] #3 Applies per-task override from layers.perTaskOverrideDir/<taskId>.md when that file exists; skips gracefully when absent.
- [ ] #4 Persists the fully rendered prompt to spec.workdir/prompts/<taskId>.md before returning (backend receives a file path, not the prompt string directly).
- [ ] #5 tests/driver/prompt-template.test.ts covers envelope-only, envelope+precondition, and envelope+per-task-override paths; bun run test passes.
<!-- AC:END -->

## Implementation Notes

Reset from false Done to To Do. Provider failure during chain run on 2026-05-04 — openai-codex/gpt-5.5 returned empty responses; coordinator confabulated success. No implementation landed. Retry pending.
