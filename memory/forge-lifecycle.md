---
source: archive
plan: forge-lifecycle
distilledAt: 2026-03-05T15:41:00.000Z
---

# Forge Lifecycle — Plans, Archive, and Memory

## What Was Built

Added a full work lifecycle to the system: plans that group tasks, an archive for completed work, and a project-level memory system for distilled knowledge. Plans are directories under `missions/plans/<slug>/` containing `plan.md` (and optional `spec.md`). Tasks link to plans via a `plan:<slug>` label convention. Completed plans and their tasks are mechanically archived to `missions/archive/`, and an agent-driven distillation skill converts archived materials into concise memory files in `memory/`.

## Key Decisions

- **Plans don't own tasks directly.** Tasks stay flat in `missions/tasks/` and associate via `plan:<slug>` labels rather than nesting inside plan directories. This preserves backward compatibility — standalone tasks without plans work unchanged, and `task_list --label plan:<slug>` provides plan-scoped filtering for free.
- **Archive is mechanical, distillation is agent-driven.** Archiving is a deterministic file-move operation (no LLM). Distillation is a separate, explicitly-triggered step using a Pi skill. This separation means archiving never blocks on AI availability and distillation quality can improve independently.
- **Memory lives outside missions.** Memory files go in `memory/` at the project root, not under `missions/`. They are a project-level resource alongside AGENTS.md and skills — consumed by any agent, not just missions-aware ones. This positions memory as a general knowledge layer that multiple producers (archives, sessions, design reviews) can write to.
- **Single `plan:` label enforced.** Validation rejects tasks with more than one `plan:` prefix label, enforced at both `task_create` and `task_edit`. A task belongs to at most one plan.
- **PlanManager mirrors TaskManager structure.** Separate files for types, file-system operations, and the manager class in `lib/plans/`, following the established pattern from `lib/tasks/`.

## Patterns Established

- **Plan directory convention**: `missions/plans/<slug>/plan.md` (required) + `spec.md` (optional). Frontmatter: title, status (active | completed), createdAt, updatedAt.
- **Label-based linkage**: `plan:<slug>` labels on tasks. The `task_create` tool's `plan` parameter auto-adds the label. Only one `plan:` label per task.
- **Archive path mirroring**: `missions/archive/plans/<slug>/` and `missions/archive/tasks/` mirror active directory structure. Files are preserved unmodified.
- **Skill-based distillation**: The `skills/domains/archive/SKILL.md` skill teaches any agent the distillation procedure. Load via `/skill:archive` when ready to distill.
- **Memory file format**: YAML frontmatter (`source`, `plan`, `distilledAt`) followed by sections: What Was Built, Key Decisions, Patterns Established, Files Changed, Gotchas & Lessons.

## Files Changed

- `lib/plans/` — New module: types, file-system utilities, PlanManager class (CRUD + plan summaries with task counts)
- `extensions/plans/index.ts` — Pi extension registering `plan_create`, `plan_list`, `plan_view`, `plan_archive` tools
- `extensions/tasks/index.ts` — Modified to accept optional `plan` parameter on `task_create`; added `plan:` label validation on `task_create` and `task_edit`
- `skills/domains/archive/SKILL.md` — Distillation skill teaching agents to convert archived plans into memory files
- `skills/domains/plan/SKILL.md` — Plan creation skill teaching agents how to write well-structured plans
- `DESIGN.md` — Updated with forge lifecycle section, plan-task linkage, archive/memory architecture

## Gotchas & Lessons

- **Archive safety check**: `plan_archive` rejects if any associated tasks are not in Done status. All tasks must be completed before archiving — this prevents losing track of in-progress work.
- **The `plan:` label is a convention, not a schema field.** There is no `plan` field on the Task interface. Plan association is entirely label-based, which means any label query works but also means the association is only as reliable as label discipline.
- **Memory directory is created by archive, not by memory consumers.** The `plan_archive` tool creates `memory/` at the project root as a side effect. Distillation assumes it exists.
- **Distillation is not automatic.** After archiving, someone (agent or human) must explicitly load the archive skill and run distillation. There is no trigger or hook — this is by design to keep the system simple, but it means distillation can be forgotten.
