---
id: TASK-089
title: Pi capabilities skill (SKILL.md)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:observability'
dependencies: []
createdAt: '2026-03-11T13:21:57.053Z'
updatedAt: '2026-03-11T13:41:08.022Z'
---

## Description

Create a comprehensive Pi framework skill file at `domains/shared/skills/pi/SKILL.md` that teaches agents how to use Pi's full API surface — sessions, tools, extensions, events, compaction, cost tracking, etc. Update `domains/coding/agents/planner.ts` to add `"pi"` to its `skills` array (worker/fixer/cosmo have `skills: undefined` so already inherit all skills).

Reference existing skill files for format: `domains/shared/skills/task/SKILL.md`, `domains/shared/skills/plan/SKILL.md`, etc. Single file, reference-style with code examples.

<!-- AC:BEGIN -->
- [ ] #1 SKILL.md exists at domains/shared/skills/pi/SKILL.md with valid frontmatter (name, description)
- [ ] #2 Skill covers: session creation, tool registration, extension authoring, lifecycle event catalog, system prompt composition, skill system, session management, compaction, cost tracking (SessionStats), model control, execution modes, AgentSession methods
- [ ] #3 Content is reference-style with code examples — a lookup resource, not a tutorial
- [ ] #4 Planner agent definition in domains/coding/agents/planner.ts includes "pi" in its skills array
- [ ] #5 Skill follows single-file pattern matching existing skills (task, plan, archive, roadmap)
<!-- AC:END -->

## Implementation Notes

All ACs met. Created domains/shared/skills/pi/SKILL.md (~670 lines) covering the full Pi API surface: session creation, AgentSession methods, tool registration, extension authoring with ExtensionAPI method table, complete lifecycle event catalog (30+ events), system prompt composition, DefaultResourceLoader, skills system, compaction, SessionStats/cost tracking, SettingsManager, execution modes (interactive/print/RPC), session branching, auth storage, model registry, and package system. Updated planner from skills: undefined to skills: [\"pi\"] and fixed corresponding test. All 784 tests pass."
