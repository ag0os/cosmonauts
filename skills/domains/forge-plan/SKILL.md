---
name: forge-plan
description: How to create well-structured implementation plans using the forge plan system.
---

# Forge Plans

Plans are the bridge between a design idea and a set of implementable tasks. A plan scopes the work, describes the approach, and produces tasks that agents can pick up and implement.

## Plan File Format

A plan lives at `forge/plans/<slug>/plan.md`. It is a markdown file with YAML frontmatter.

### Frontmatter

```yaml
---
title: Human-readable plan title
status: active          # active | completed
createdAt: 2026-02-25T00:00:00.000Z
updatedAt: 2026-02-25T00:00:00.000Z
---
```

- `title` — descriptive name for the plan.
- `status` — `active` while work is in progress, `completed` when all tasks are done.
- `createdAt` / `updatedAt` — ISO 8601 timestamps. Set `createdAt` once, update `updatedAt` on changes.

### Body Sections

**Overview** — What this plan accomplishes and why. 2-3 sentences. Every plan needs this.

**Current State** — Where the codebase stands today relative to this work. What exists, what is missing. Useful for plans that build on existing infrastructure.

**Design** — The technical approach. Key data structures, flows, boundaries, and trade-offs. This is the core of most plans.

**Implementation Order** — Numbered list of work stages with dependencies between them. Each stage becomes one or more tasks.

**Risks** — What could go wrong. Scope creep, technical gotchas, dependencies on external factors.

Not every plan needs all sections. A small plan may only need Overview and Design. A large plan benefits from all five.

## When to Use spec.md

An optional companion file at `forge/plans/<slug>/spec.md`. Create one when:

- The feature idea is complex enough that separating "what" from "how" helps clarity.
- The spec might outlive the plan — the problem description stays relevant after the implementation plan is completed and archived.
- Multiple plans might reference the same spec (e.g., a spec for a plugin system, with separate plans for core and for individual plugins).

Most plans do not need a spec. The plan body handles both the problem and the approach. Reach for spec.md only when the separation genuinely helps.

## Slug Naming

The slug is the directory name under `forge/plans/` and the identifier used in labels and tool calls.

- Lowercase, hyphen-separated: `auth-system`, `api-migration`, `forge-lifecycle`
- Match the concept, not the ticket or sprint: `user-profiles` not `sprint-3-work`
- Short but unambiguous. Prefer 2-3 words.

## Scoping a Plan

A well-scoped plan:

- Has a clear boundary — you can state what is in scope and what is not.
- Produces 3-12 tasks. Fewer means just do the work directly. More means split into separate plans.
- Can be completed in one focused push (days, not weeks).
- Changes one area of the system rather than bundling unrelated work.

If you find yourself writing more than 12 tasks, the plan is too broad. Split it along natural seams — separate the infrastructure from the feature, or the core from the integrations.

## Plan-to-Task Flow

Plans produce tasks. Tasks link back to plans via labels.

### Creating tasks from a plan

After creating a plan with `plan_create`, generate tasks using `task_create` with the `plan` parameter:

```
task_create({ title: "Define plan types", plan: "forge-lifecycle" })
```

This auto-adds a `plan:forge-lifecycle` label to the task. The label is the linkage mechanism — tasks stay flat in `forge/tasks/`, not nested under the plan directory.

### Querying tasks by plan

Use `task_list` with label filtering to see all tasks for a plan:

```
task_list --label plan:forge-lifecycle
```

### Completing the cycle

1. Create the plan with `plan_create`.
2. Create tasks with `task_create`, passing the `plan` parameter for each.
3. Implement tasks. Update status as work progresses.
4. When all tasks are Done, mark the plan as completed.
5. Archive with `plan_archive` — moves the plan and associated tasks to `forge/archive/`.
6. Optionally distill learnings into `memory/<slug>.md` (see the `forge-archive` skill).

## Tool Reference

| Tool | Purpose |
|------|---------|
| `plan_create` | Create a new plan directory with `plan.md` and optional `spec.md` |
| `plan_list` | List plans with their status and associated task counts |
| `plan_view` | View full plan content and a summary of associated tasks |
| `plan_archive` | Archive a completed plan and its associated tasks to `forge/archive/` |

## Example

A plan for adding a caching layer:

```
forge/plans/response-cache/
  plan.md
```

```yaml
---
title: HTTP Response Cache
status: active
createdAt: 2026-02-25T00:00:00.000Z
updatedAt: 2026-02-25T00:00:00.000Z
---
```

```markdown
## Overview

Add an in-memory response cache to reduce redundant API calls. Cache by URL with TTL-based expiration.

## Design

LRU cache keyed by normalized URL. Configurable max entries (default 1000) and TTL (default 5 minutes). Cache lives in the API client, transparent to callers.

## Implementation Order

1. Cache data structure with LRU eviction and TTL
2. Integration into API client
3. Cache invalidation on write operations
4. Metrics and logging

## Risks

- Cache invalidation for write-then-read patterns needs careful ordering.
- Memory pressure if max entries is set too high.
```

Tasks generated from this plan would each carry the `plan:response-cache` label.
