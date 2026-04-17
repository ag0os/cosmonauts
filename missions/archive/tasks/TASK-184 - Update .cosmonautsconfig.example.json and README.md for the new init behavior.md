---
id: TASK-184
title: Update .cosmonauts/config.example.json and README.md for the new init behavior
status: Done
priority: low
assignee: worker
labels:
  - backend
  - 'plan:init-command'
dependencies:
  - TASK-180
createdAt: '2026-04-14T13:38:38.711Z'
updatedAt: '2026-04-14T13:46:16.259Z'
---

## Description

Align the checked-in example config and documentation with the implemented behavior.

**Files to change:**

`.cosmonauts/config.example.json` — synchronize with the canonical defaults from `createDefaultProjectConfig()`. Currently the example has `skills: ["typescript"]` but the loader default has `skills: ["typescript", "engineering-principles"]`. After TASK-180, both must match. Update the example file to exactly mirror what `createDefaultProjectConfig()` produces.

`README.md` — update the `cosmonauts init` section (around line 155–165) to describe the new interactive bootstrap behavior:
- `cosmonauts init` launches an interactive session (not a one-shot print command)
- The agent scans the project, asks clarifying questions, then proposes `AGENTS.md` content and skill suggestions before writing anything
- Re-runnable: running it again on an existing project proposes improvements rather than stopping
- Remove or correct the current description ("scans your project and creates an AGENTS.md file")

**Depends on TASK-180** (canonical defaults exist before the example can be aligned).

<!-- AC:BEGIN -->
- [ ] #1 .cosmonauts/config.example.json skills array and workflows object exactly match the object returned by createDefaultProjectConfig()
- [ ] #2 README.md cosmonauts init description accurately describes interactive mode (asks questions, confirms before writing)
- [ ] #3 README.md describes re-run behavior (proposes improvements, does not stop on existing AGENTS.md)
- [ ] #4 No other sections of README.md are changed beyond the init description
<!-- AC:END -->

## Implementation Notes

Updated `.cosmonauts/config.example.json` to match `createDefaultProjectConfig()` exactly for `skills` and `workflows`, and revised only the `cosmonauts init` paragraph in `README.md` to describe the interactive question/confirmation flow plus rerun improvement behavior. Verification: `bun run test`, `bun run lint`, and `bun run typecheck` all passed.
