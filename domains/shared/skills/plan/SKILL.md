---
name: plan
description: Manages Cosmonauts implementation-plan lifecycle, readiness, plan tools, and plan-to-task handoff. Use when designing a feature, scoping work into tasks, or creating a plan from a roadmap item. Do NOT load for task implementation or code changes; use the task skill instead.
---

# Plans

Plans are the lifecycle bridge between a scoped idea and implementable tasks. This skill owns when to create or update a plan, the readiness check before using plan tools, and the handoff from plan stages to tasks.

For artifact shape, behavior spine, and gate rules, load `/skill:work-artifacts` and the directly linked reference needed for the question. Do not duplicate those canonical rules here.

## Artifact Routing

`/skill:plan` coordinates exactly these three work artifacts:

| Artifact | Lifecycle role | Canonical format |
|---|---|---|
| `spec.md` | Product intent: what is being built, who benefits, why it matters, and acceptance criteria. | `/skill:work-artifacts` `references/spec-format.md` |
| `plan.md` | Behavior-first implementation plan: behavior placement, derived design, file ownership, risks, quality gates, and implementation order. | `/skill:work-artifacts` `references/plan-format.md` and `references/behavior-spine.md` |
| `architecture.md` | Active architecture record for durable boundaries, dependency rules, or multi-plan decisions. | `/skill:work-artifacts` `references/architecture-format.md` |

Do not move architecture-of-record content into `plan.md`. If durable architecture context matters, create or link the active architecture record and keep only the relevant `Architecture Context` in the plan.

## Lifecycle

1. Decide the workflow tier. If the work might be a direct fix, tactical bugfix, planned feature/refactor, or architecture-linked change, load `/skill:work-artifacts` `references/workflow-tiers.md`.
2. Pick a slug: lowercase, hyphen-separated, short, and concept-based, for example `auth-system` or `agent-packaging`.
3. Gather codebase context before drafting. Claims about existing files, helpers, commands, and boundaries must come from files actually read.
4. Draft or revise the needed artifact content. For planned feature/refactor work, load `/skill:work-artifacts` `references/spec-format.md`, `references/plan-format.md`, `references/behavior-spine.md`, and `references/gate-contracts.md`.
5. Run the readiness check below before `plan_create` or `plan_edit`.
6. Create or update the plan with the plan tools.
7. Hand the approved implementation order to `/skill:task` and create tasks with the plan slug.

## Behavior-First Plans

Full planned feature/refactor plans require a `## Behaviors` section before task creation. Each behavior entry must include:

- Stable `B-###` ID
- Source `AC-###`
- Context
- Action
- Expected result
- Seam
- Named test
- Marker using `@cosmo-behavior plan:<slug>#B-###`

Treat `## Design` as derived from behavior placement. The design should explain how the behavior seams, tests, and constraints fit together; do not author it as an independent section that could drift away from the behavior spine.

## Plan Readiness Check

Before calling `plan_create` or `plan_edit`, run a short visible readiness check. This is conversational output only; do not persist it as a plan section.

- **Specificity** - The plan names concrete modules, responsibilities, contracts, and files or clearly marked new files.
- **Constraints** - Scope boundaries, dependency direction, existing-feature interactions, non-goals, and invariants are explicit.
- **Context** - Claims about existing code are backed by files you actually read; no guessed names, paths, signatures, or helpers.
- **Behaviors** - Full planned feature/refactor plans have `## Behaviors` entries with context, action, expected result, source `AC-###`, seam, named test, and `@cosmo-behavior plan:<slug>#B-###` marker.
- **Design derivation** - `## Design` follows from behavior placement. If it cannot trace to behavior seams, source criteria, and named tests, revise the behaviors or design before task creation.
- **Quality gates** - The `## Quality Contract` follows `/skill:work-artifacts` gate rules and names abstract gate kinds rather than project-specific tool columns.
- **Iteration policy** - `## Implementation Order` says how stages sequence and how to react if a stage surfaces unexpected complexity.
- **Pivot / abort conditions** - `## Risks` names the conditions under which scope or approach should be revised rather than silently pressed through.

Reject a full planned feature/refactor plan as not ready if any behavior lacks a named test or marker. In interactive mode, pause for correction or an explicit waiver before writing. In autonomous runs, proceed only as narrowly as the run allows and record the gap in Assumptions, Open Questions, Risks, or the Decision Log.

One-sentence test: if you collapse the plan into "`<end state>` verified by `<evidence>` while preserving `<constraints>`; proceed via `<implementation order>`; if `<conditions>` hold, pivot or abort", the sentence should read as a coherent contract. If a clause is hollow, revisit that section.

## Tool Reference

| Tool | CLI Equivalent | Purpose |
|---|---|---|
| `plan_create` | `cosmonauts plan create --slug <s> --title <t>` | Create a new plan directory with `plan.md` and optional `spec.md`. |
| `plan_list` | `cosmonauts plan list` | List plans with status and associated task counts. |
| `plan_view` | `cosmonauts plan view <slug>` | View full plan content and associated task summary. |
| `plan_edit` | `cosmonauts plan edit <slug>` | Update plan fields, status, body, or spec content. |
| `plan_archive` | `cosmonauts plan archive <slug>` | Archive a completed plan and associated tasks. |

Use `plan_create` for new plan directories and `plan_edit` for living-plan updates. Do not hand-edit persisted plan files when the plan tools are available in the session.

## Plan-To-Task Handoff

Plans produce tasks. Tasks link back to plans via the `plan:<slug>` label.

After `plan_create`, create tasks using `task_create` with the `plan` parameter:

```text
task_create({ title: "Define plan types", plan: "forge-lifecycle" })
```

This auto-adds the `plan:<slug>` label. Tasks stay flat in `missions/tasks/`; they are not nested under the plan directory.

Before creating tasks:

- Confirm each task owns one coherent slice of the implementation order.
- Preserve behavior ownership by carrying relevant `B-###` IDs, source acceptance criteria, named tests, seams, and markers into task acceptance criteria.
- Keep task count in the normal 3-12 range for a plan. If the plan naturally produces more, split the plan along a real boundary.
- Load `/skill:task` for task lifecycle, task acceptance criteria, and task tools.

Completion loop:

1. Create or update the plan.
2. Create linked tasks with `task_create`.
3. Implement tasks and update statuses as work progresses.
4. When all tasks are done, mark the plan completed.
5. Archive with `plan_archive`.
6. Optionally distill completed learnings with `/skill:archive`.

## Common Problems

- **Artifact-rule duplication.** The plan skill copies format sections, examples, or gate tables. Route to `/skill:work-artifacts` instead.
- **Independent design prose.** `## Design` reads like a standalone architecture essay. Rework it so it is derived from behavior placement.
- **Missing proof.** Behaviors omit named tests or markers. The plan is not ready for task creation.
- **Architecture stuffing.** Durable boundary decisions are embedded in `plan.md`. Move architecture-of-record content to `architecture.md` and link it from `Architecture Context`.
- **Task drift.** Tasks lose behavior ownership. Carry the behavior IDs, seams, named tests, and markers into task acceptance criteria.

## Related Skills

- `/skill:work-artifacts` - canonical artifact format, behavior spine, Quality Contract, and gate rules.
- `/skill:roadmap` - where plan items originate.
- `/skill:task` - creating and managing tasks from plans.
- `/skill:architecture` - architecture-record authoring dispatcher.
- `/skill:archive` - archiving completed plans and distilling learnings.
