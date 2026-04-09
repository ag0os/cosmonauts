---
name: roadmap
description: How to read, update, and maintain the project roadmap. Use when picking up new work, adding ideas, prioritizing items, or starting a plan from the backlog. Do NOT load for task creation, plan design, or implementation — use the plan and task skills instead.
---

# Roadmap

The roadmap (`ROADMAP.md` at project root) is the single source of truth for "what to build next." It has two sections:

- **Prioritized** (`## Prioritized`): Ordered by priority, top items first. Pick from the top.
- **Ideas** (`## Ideas`): Unordered candidates — things we want to build but haven't prioritized yet. Pick only when directed by the user.

Each item maps to roughly one plan (3-12 tasks).

## Item Format

Each item is a `###` heading with a backtick-wrapped slug, colon, and title, followed by a brief description and outcome bullets:

```markdown
### `slug`: Title

One sentence describing what and why.

- Outcome or requirement
- Outcome or requirement
- Constraint or consideration
```

The slug becomes the plan slug when the item is picked up. Outcomes describe what "done" looks like — enough for a planner to start designing without asking questions.

## Picking Up Work

When starting new work from the roadmap:

1. Read `ROADMAP.md`.
2. Select the top item from the **Prioritized** section (or a specific item from either section if directed by the user).
3. **Remove the item from ROADMAP.md.**
4. Create the plan via `plan_create` using the item's slug.
5. If the item is complex, create a `spec.md` inside the plan directory with detailed requirements (the plan system already supports this).
6. The existing plan → task → implement lifecycle takes over from here.

The item leaves the roadmap the moment a plan is created. The plan replaces it as the source of truth.

## After Completing Work

No roadmap action needed. The item was already removed when the plan was created. The lifecycle continues independently:

- `plan_archive` moves the plan and tasks to `missions/archive/`
- The `archive` skill distills learnings into `memory/<slug>.md`
- The memory file is the permanent historical record

## Adding New Items

1. Write a slug (2-3 word, hyphenated, descriptive).
2. Write a brief description (1 sentence) and 2-5 outcome bullets.
3. Place the item in the appropriate section:
   - **Prioritized**: If the item has a clear priority relative to other work, insert it by priority order (higher = higher in the list).
   - **Ideas**: If the item is a candidate without a clear priority yet, append it to the Ideas section.
4. Each item should be sized for one plan (3-12 tasks). If it is larger, split it into multiple items.

## Granularity

A well-sized roadmap item:

- Can be described in under 10 lines
- Maps to one plan with 3-12 tasks
- Has clear outcomes a planner can design against
- Is self-contained enough to implement without other roadmap items

If an item needs more than 10 lines of requirements, it is either too large (split it) or too detailed (save the detail for the plan's spec.md).

## Common Problems

- **Forgot to remove the item after creating a plan.** The plan and roadmap item are now both "truth." Fix: remove the roadmap item immediately. The plan supersedes it.
- **Item is too large to scope as one plan.** Split it into 2-3 items along natural seams before picking it up. Each item should produce 3-12 tasks.
- **Item outcomes are too vague to plan against.** Add specific, verifiable outcomes before picking it up. If you can't state what "done" looks like, the item isn't ready.

## What NOT to Do

- **Don't keep items that have plans.** Once a plan is created, the item is removed. The plan is the source of truth, not the roadmap.
- **Don't track completed work here.** That's what `memory/` is for. The roadmap only looks forward.
- **Don't add implementation details.** Outcomes and constraints only. The planner decides the approach.
- **Don't create tasks directly from roadmap items.** Always create a plan first. The plan is the design step between "idea" and "implementation."

## Related Skills

- `/skill:plan` — Creating plans from roadmap items
- `/skill:task` — Creating tasks from plans
- `/skill:archive` — Distilling completed plans into memory
