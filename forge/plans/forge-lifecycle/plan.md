---
title: Forge Lifecycle — Plans, Archive, and Memory
status: active
createdAt: '2026-02-25T20:00:00.000Z'
updatedAt: '2026-02-25T20:00:00.000Z'
---

## Overview

Extend the forge system with a full work lifecycle: plans that group tasks, an archive for completed work, and a project-level memory system for distilled knowledge. The goal is to eliminate the manual cleanup problem — after implementation, plans and tasks are archived mechanically, then an agent distills key learnings into memory files that provide context for future work.

## Current State

- Tasks live flat in `forge/tasks/` as markdown files with YAML frontmatter.
- Tasks have no parent concept — they're orphaned files with no grouping.
- After implementation, completed task files hang around and require manual cleanup.
- No system for capturing what was learned during implementation.

## Design

### Three Boundaries

| Concern | Location | Mechanism |
|---------|----------|-----------|
| Active work | `forge/plans/`, `forge/tasks/` | Plan + task tools |
| Completed work | `forge/archive/` | Archive tool (mechanical move) |
| Project knowledge | `memory/` (project root) | Distillation skill (agent-driven) |

Forge owns the work lifecycle. Memory owns the knowledge. Distillation bridges them.

### Plans

A plan is a directory under `forge/plans/<slug>/` containing:

- `plan.md` (required) — the implementation plan with frontmatter (title, status, dates) and sections for overview, approach, scope, risks.
- `spec.md` (optional) — a deeper feature spec or idea document when the plan itself isn't enough.

The system is flexible: sometimes a single plan.md covers everything, sometimes you want a separate spec.

**Plan frontmatter:**

```yaml
---
title: Auth System
status: active          # active | completed
createdAt: 2026-02-25T...
updatedAt: 2026-02-25T...
---
```

### Task-to-Plan Linkage

Tasks stay flat in `forge/tasks/`. Plans link to tasks via a `plan:<slug>` label convention:

```yaml
labels:
  - backend
  - plan:auth-system
```

- `plan:` prefixed labels are reserved for plan association.
- A task can belong to at most one plan (only one `plan:` label).
- Standalone tasks (no plan) continue to work as before.
- The `task_create` tool gains an optional `plan` parameter that auto-adds the `plan:<slug>` label.
- `task_list` already supports `--label` filtering, so `plan:auth-system` works for free.

### Archive

Archiving is a **mechanical, automatic** operation — no LLM involved. It moves completed plans and their associated tasks from active directories into `forge/archive/`, preserving the original file structure.

```
forge/archive/
  plans/
    auth-system/              # moved as-is from forge/plans/
      plan.md
      spec.md
  tasks/
    COSMO-020 - Create user model.md   # moved from forge/tasks/
    COSMO-021 - Add validation.md
```

The archive preserves everything. Files remain readable and browseable. This is a reversible operation — you could move things back if needed.

### Memory (Project-Level)

Memory files live at `memory/` in the project root — outside of forge entirely. They are a project-level resource consumed by agents as context, same category as AGENTS.md or skills.

```
memory/
  auth-system.md              # distilled from forge archive
  api-migration.md            # distilled from forge archive
  session-2026-02-20.md       # distilled from conversation (future)
  design-decisions.md         # distilled from wherever
```

Memory is the output of **distillation** regardless of source. Forge archives are one producer. Future producers include conversation extraction, design reviews, and decision capture. They all land in the same place because they serve the same purpose.

This aligns with the Phase 2 roadmap (memory system, `memory_search`/`memory_save` tools). The `memory/` directory becomes the storage backend. Forge distillation is just one producer.

### Distillation

Distillation is **agent-driven and explicitly triggered**. Implemented as a Pi skill (`skills/domains/forge-archive/SKILL.md`) that teaches any agent how to:

1. Read archived plan documents (plan.md, spec.md)
2. Read all associated archived tasks
3. Extract: what was built, key decisions, patterns established, gotchas and lessons
4. Write a memory file to `memory/<slug>.md`

The skill is source-agnostic — it takes "here are source materials" and produces a memory file. The source could be an archived plan, a session transcript, or anything else.

Any agent can load the skill via `/skill:forge-archive` when it's time to distill. No dedicated archive sub-agent needed.

### Cleanup

After distillation, the original archived files may be deleted. The cleanup policy is TBD:

- Manual: decide per-plan
- Flag on distill: `--cleanup` removes originals after memory is written
- Staged: archive → distill → explicit purge

Not blocking on this decision. Archive and distill work independently of cleanup policy.

## Tool Changes

| Tool | Type | Description |
|------|------|-------------|
| `plan_create` | New | Create `forge/plans/<slug>/plan.md`, optionally `spec.md` |
| `plan_list` | New | List plan directories with status and task counts |
| `plan_view` | New | Read plan docs + associated task summary |
| `plan_archive` | New | Move completed plan + associated tasks to `forge/archive/` |
| `task_create` | Modify | Add optional `plan` param → auto-adds `plan:<slug>` label |
| `task_list` | Existing | Already supports `--label` filtering (no change needed) |

## Skill Changes

| Skill | Type | Description |
|-------|------|-------------|
| `forge-archive` | New | Teaches agents how to distill archived materials into memory files |
| `forge-plan` | New | Teaches agents how to create well-structured plans |

## Chain Integration

The existing workflow maps cleanly:

```
planner (loads forge-plan skill)
  → creates forge/plans/<slug>/plan.md

task-manager
  → reads plan, creates tasks with plan:<slug> label

coordinator → workers
  → implement tasks as usual

(later, explicitly triggered)
any agent (loads forge-archive skill)
  → reads from forge/archive/, distills to memory/, optionally cleans up
```

## Implementation Order

1. Plan infrastructure: directory structure, plan document format, `plan_create`/`plan_list`/`plan_view` tools
2. Task-plan linkage: `plan:` label convention, `plan` parameter on `task_create`
3. Archive infrastructure: `forge/archive/` directory, `plan_archive` tool (mechanical move)
4. Memory directory: `memory/` at project root
5. Distillation skill: `skills/domains/forge-archive/SKILL.md`
6. Plan creation skill: `skills/domains/forge-plan/SKILL.md`
7. Update DESIGN.md with the new lifecycle
8. Update agent prompts (planner, task-manager) to understand plans

## Risks

- **Task tool refactoring scope**: The existing TaskManager is built around a single `forge/tasks/` directory. Archive needs to move files out, which means the manager needs to handle file relocation. Should be straightforward but needs care around config.json and ID counters.
- **Label convention enforcement**: Nothing prevents an agent from adding two `plan:` labels to a task. May need validation in `task_create`/`task_edit`.
- **Memory directory conflicts**: If the Phase 2 memory system has different ideas about `memory/` structure, we may need to reconcile. Starting simple (flat markdown files) keeps options open.
