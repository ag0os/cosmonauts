---
id: TASK-294
title: Agent-packaging skill for conversational package authoring
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:external-agent-orchestration'
dependencies: []
createdAt: '2026-05-11T21:37:11.133Z'
updatedAt: '2026-05-12T00:55:16.178Z'
---

## Description

Add a new directory-based shared skill that teaches Cosmonauts agents how to guide a human through designing, reviewing, and exporting a safe `AgentPackageDefinition` for use with external runtimes.

Files to create:
- `domains/shared/skills/agent-packaging/SKILL.md`
- `tests/skills/agent-packaging.test.ts`

<!-- AC:BEGIN -->
- [x] #1 domains/shared/skills/agent-packaging/SKILL.md exists as a loadable directory-based skill and contains a YAML frontmatter header identifying it as the agent-packaging skill.
- [x] #2 The skill instructs agents to inspect the source agent definition, identify tools unavailable in the target runtime, and surface those gaps to the human before drafting a prompt (B-014).
- [x] #3 The skill guides the agent to draft an external-safe prompt collaboratively with the human, choose skills and target tool policy declaratively, and write or present a complete AgentPackageDefinition (B-014).
- [x] #4 The skill explicitly warns against blindly exporting internal prompts that mention unavailable Cosmonauts tools such as spawn_agent, chain_run, or drive (B-014).
- [x] #5 The skill describes the cosmonauts export --definition <path> --out <path> command as the final compilation step.
- [x] #6 Tests in tests/skills/agent-packaging.test.ts assert the skill file exists, is non-empty, contains the required guidance sections (source-agent inspection, unavailable-tool identification, external-safe prompt drafting, definition authoring, export command), and contains the raw-export warning.
<!-- AC:END -->

## Implementation Notes

Implemented agent-packaging as a directory-based shared skill with frontmatter and conversational guidance for source-agent inspection, unavailable tool review, external-safe prompt drafting, declarative AgentPackageDefinition authoring, raw internal prompt export warnings, and the final cosmonauts export --definition command. Added tests covering the skill file, guidance sections, export command, and raw-export warning. Verification: targeted test passes; full test/typecheck currently fail on pre-existing unrelated resolveEffectiveProjectSkills export issues in tests/agents/skills.test.ts/lib/agents/skills.ts; full lint also reports unrelated missions/tasks/config.json formatting, while targeted Biome check for this task passes.
