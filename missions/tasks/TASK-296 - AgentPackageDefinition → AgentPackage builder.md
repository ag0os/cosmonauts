---
id: TASK-296
title: AgentPackageDefinition → AgentPackage builder
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:external-agent-orchestration'
dependencies:
  - TASK-292
  - TASK-293
  - TASK-295
createdAt: '2026-05-11T21:37:31.707Z'
updatedAt: '2026-05-12T01:03:05.705Z'
---

## Description

Implement the core compilation step that turns a validated `AgentPackageDefinition` into a serializable `AgentPackage` by resolving prompt source, materializing skills, carrying source-agent metadata, and assembling the final system prompt.

Files to create:
- `lib/agent-packages/build.ts`
- `tests/agent-packages/build.test.ts`

Depends on: TASK-292, TASK-293, TASK-295

<!-- AC:BEGIN -->
- [ ] #1 lib/agent-packages/build.ts builds a complete AgentPackage from an AgentPackageDefinition and a target, accepting agentRegistry, domainContext, domainsDir, resolver, projectSkills, skillPaths, and target options.
- [ ] #2 prompt.kind:'source-agent' assembles the prompt with assemblePrompts(), runs compatibility validation, and fails for nonportable agents (B-003); prompt.kind:'file' reads the absolute path and strips frontmatter; prompt.kind:'inline' uses content as-is (B-001).
- [ ] #3 Selected skills are appended inline under a '# Packaged Skills' heading in the final system prompt; skill content includes full markdown bodies (B-005).
- [ ] #4 A runtime identity/provenance marker (package id and optional source agent id) is appended to the final system prompt.
- [ ] #5 Source agent model and thinkingLevel metadata are carried into the package when a sourceAgent resolves; missing source agents for source-agent prompt/skill modes fail with a clear error.
- [ ] #6 projectContext is always 'omit' on the output package.
- [ ] #7 Tests in tests/agent-packages/build.test.ts cover all three prompt modes, skill embedding variants, source-agent metadata, domain-context resolution, and nonportable source-agent shorthand rejection.
<!-- AC:END -->

## Implementation Notes

Implemented buildAgentPackage in lib/agent-packages/build.ts and tests in tests/agent-packages/build.test.ts. Covers inline/file/source-agent prompt modes, compatibility rejection, skill embedding for allowlist and source-agent modes, source metadata, domain-context source resolution, projectContext omission, and provenance marker. Verification: targeted package/skills tests passed; scoped lint and scoped typecheck passed. Full bun run test/typecheck/lint were attempted but currently fail on unrelated untracked TASK-298 claude-binary-runner files and missions/tasks formatting.
