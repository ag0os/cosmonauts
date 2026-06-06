---
id: TASK-293
title: 'Package definition contracts, validation, and compatibility gate'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:external-agent-orchestration'
dependencies: []
createdAt: '2026-05-11T21:37:00.564Z'
updatedAt: '2026-05-12T00:58:47.608Z'
---

## Description

Establish the stable type contracts for the agent-packaging module and implement JSON definition loading, validation, path resolution, agent-id shorthand normalization, and raw source-prompt exportability checks.

Files to create/change:
- `lib/agent-packages/types.ts` — all data contracts
- `lib/agent-packages/definition.ts` — JSON loading, validation, path resolution, shorthand normalization
- `lib/agent-packages/compatibility.ts` — raw source-prompt exportability validator
- `tests/agent-packages/definition.test.ts`
- `tests/agent-packages/compatibility.test.ts`

<!-- AC:BEGIN -->
- [x] #1 lib/agent-packages/types.ts exports all stable data contracts: AgentPackageDefinition, AgentPackage, PackagedSkill, PackagePromptSource, PackageToolPolicy, PackageSkillSelection, TargetPackageOptions, InvocationSpec, MaterializedInvocation, and InvocationWarning. It imports only shared type-level dependencies and does not import CLI, Drive, or chain modules.
- [x] #2 definition.ts reads and validates JSON definitions: rejects missing required fields with clear error messages, resolves prompt.kind:'file' paths relative to the definition file to absolute paths, and strips frontmatter from file prompts on read.
- [x] #3 definition.ts rejects prompt.kind:'source-agent' and skills.mode:'source-agent' when sourceAgent is absent, naming the offending field in the error (B-015).
- [x] #4 definition.ts rejects non-'omit' projectContext values in Phase 1.
- [x] #5 definitionFromAgent() produces a valid AgentPackageDefinition with deterministic package id (domain-id-claude-cli), sourceAgent set to the qualified agent id, prompt.kind:'source-agent', skills.mode:'source-agent', and the source agent's tool preset (B-002 shorthand normalization).
- [x] #6 compatibility.ts rejects raw source-agent prompt export for any source agent with extensions, subagents, or extension-backed capabilities (spawning, tasks, todo, drive), and names all offending features in the error (B-003).
- [x] #7 compatibility.ts does not reject definitions that reference such agents when prompt.kind is 'file' or 'inline' (B-004).
- [x] #8 Future target blocks (codex, gemini-cli, open-code) are accepted by the schema parser without error in Phase 1 (D-011).
- [x] #9 Tests in tests/agent-packages/definition.test.ts and tests/agent-packages/compatibility.test.ts cover all validation paths, path resolution, frontmatter stripping, inline prompts, shorthand normalization, and compatibility rejection/allowance.
<!-- AC:END -->

## Implementation Notes

Implemented package definition contracts, JSON validation/path normalization, prompt reading with frontmatter stripping, source-agent shorthand normalization, and raw source-prompt compatibility gating. Verification: targeted definition/compatibility tests pass; typecheck passes. Full test and lint are currently blocked by unrelated uncommitted TASK-295 package-skill stubs/tests and missions/tasks/config.json formatting in the shared worktree.
