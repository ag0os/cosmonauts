---
name: task
description: How to create well-structured tasks with acceptance criteria, dependencies, labels, and priorities using the task system. Use when creating tasks from a plan, checking task status, updating progress, or scoping work items. Do NOT load for plan design or roadmap management.
---

# Tasks

Tasks are atomic, persistent work items stored as markdown files in `missions/tasks/`. Each task represents a single-PR scope of work that one agent can complete independently.

This skill is a dispatcher for task lifecycle, task file format, task tools, dependency rules, status flow, and acceptance-criteria writing. For artifact-format details, load `/skill:work-artifacts` and the directly linked reference needed for the question. Use `references/workflow-tiers.md` for direct/tactical/planned workflow tiering, `references/plan-format.md` for behavior-first plan shape, and `references/behavior-spine.md` for `B-###` behavior IDs, seams, named tests, and markers. Do not duplicate canonical artifact rules here.

## Task File Format

A task lives at `missions/tasks/<ID> - Title.md`. It is a markdown file with YAML frontmatter. The ID shape comes from task configuration: a configured prefix plus a numeric suffix, with optional zero padding (for example, `TASK-1`, `TASK-001`, or `COSMO-001`).

Task IDs are sequential and human-readable, but they are not branch-global. New IDs are allocated from the highest matching configured-prefix number found in active task frontmatter under `missions/tasks/` and archived task filenames under `missions/archive/tasks/`. Archived task filenames reserve their numbers even after the active task file has moved out of `missions/tasks/`.

Cross-branch duplicate IDs are an accepted caveat: two branches created from the same base can independently allocate the same next readable ID before they merge. Treat that as a manual reconciliation concern. A future `cosmonauts task renumber` command may provide a reconciliation option, but it is FUTURE-only and is not implemented; do not instruct workers to run it.

### Frontmatter

```yaml
---
id: COSMO-001
title: Create user model
status: To Do
priority: high
labels:
  - backend
  - database
dependencies: []
createdAt: 2026-02-09T10:00:00.000Z
---
```

- `id` — Auto-assigned sequential, readable ID using the configured prefix and numeric suffix.
- `title` — Short, descriptive name for the work.
- `status` — Current state: `To Do`, `In Progress`, `Done`, `Blocked`.
- `priority` — Importance level: `high`, `medium`, `low`.
- `labels` — Routing tags for specialist matching.
- `dependencies` — List of task IDs that must be Done before this task can start.
- `createdAt` — ISO 8601 timestamp, set once.

### Body

```markdown
## Description

Create the User model with email and password fields.

<!-- AC:BEGIN -->
- [ ] #1 User model exists with email and password_digest columns
- [ ] #2 Email has uniqueness constraint and index
- [ ] #3 Migration runs cleanly
<!-- AC:END -->
```

The description explains what needs to be done and why. Acceptance criteria are wrapped in `<!-- AC:BEGIN -->` / `<!-- AC:END -->` markers.

## Status Flow

```
To Do → In Progress → Done
  │                    ↑
  └──→ Blocked ───────┘
```

- **To Do** — Not started. Waiting for dependencies or assignment.
- **In Progress** — A worker is actively implementing this task.
- **Done** — All acceptance criteria are met, code is committed.
- **Blocked** — Cannot proceed due to an external issue. Add notes explaining why.

## Scoping Tasks

Each task must be completable in a single PR by a single agent session.

- **1 to 7 acceptance criteria.** Fewer than 1 means the task is trivial — fold it into another task. More than 7 means it should be split.
- If a plan step is too large for one task, split it along natural seams.
- If a plan step is too small, combine it with related work.

Ask: "Can an agent pick this up with no context beyond the task description and the codebase, and deliver a working PR?" If not, the task needs more detail or different boundaries.

## Writing Acceptance Criteria

ACs describe **outcomes, not implementation steps**. They tell the worker what must be true when the task is done — the worker decides how to get there.

**Good ACs (outcomes):**

- "User model exists with email and password_digest columns"
- "API returns 401 for unauthenticated requests"
- "Tests cover all validation error cases"
- "Cache is invalidated on write operations"

**Bad ACs (implementation steps):**

- "Add handleLogin function to auth.ts"
- "Import bcrypt and call hash()"
- "Create file src/models/user.ts"
- "Add if statement to check token expiry"

**Guidelines:**

- Start each AC with a noun or subject, not a verb like "Add" or "Create".
- Each AC should be independently verifiable — you can check it without checking others.
- ACs should be specific enough to test but general enough to allow implementation freedom.

### Beyond outcomes: verification and constraints

Outcome ACs (above) name what must be true when the work is done. A complete AC set also makes two more things explicit:

- **Verification surface** — how the worker (or Drive's postflight commands) proves each AC is met. Often implicit ("tests cover X" → the tests *are* the surface). When the proof isn't obvious, name it: "the existing OAuth flow still completes end-to-end", "no source files outside the in-scope directories are modified", "the project's configured verification commands pass". Refer to project gates by intent ("the test step", "the static-analysis step the project uses") rather than by command, and only when you're confident the project actually has one — different languages and frameworks expose different verification surfaces.
- **Constraints to preserve** — invariants the work must NOT break. Public contracts, neighbouring features, in-flight migrations. Phrase as positive ACs ("Existing `/api/users` responses keep the same shape") rather than negative warnings. If a constraint is only known to the human (not verifiable from the codebase), call it out in the Description, not as an AC.

**One-sentence test:** if you can rephrase the task as *"`<desired end state>` verified by `<specific evidence>` while preserving `<constraints>`"* and the sentence reads as a contract a worker could deliver against, the AC set is well-shaped. If a clause feels hollow, that's the gap to fill before handing the task off.

## Planned Behavior Ownership

When creating tasks from a behavior-first plan, task acceptance criteria preserve planned behavior ownership.

- Every `B-###` behavior or behavior cluster from the plan must be assigned to at least one task.
- Task ACs that own planned behavior must name the owned `B-###` IDs.
- Carry the worker's marker expectation into the task context: tests for planned behaviors carry `@cosmo-behavior plan:<slug>#B-###` near the executable test.
- Keep behavior clusters coherent. A task may own several related behaviors, but do not split one behavior across tasks unless one task clearly owns the executable proof and the other is a dependency.
- Do not ask workers to invent missing artifact architecture, behavior IDs, seams, tests, or markers. If the source plan lacks those details, route the plan back through readiness instead of burying discovery work in the implementation task.

Behavior ownership belongs in the ACs as deliverable outcomes, not as loose notes. A good planned-work AC reads like: "`B-006` task ACs preserve behavior IDs and marker expectations for worker handoff." The worker can then read the plan for the full context/action/expected-result details and implement test-first against the named behavior.

## Tactical Bugfix Tasks

Tactical bugfix tasks need enough persistence for handoff, but they do not need the full planned-work artifact stack.

- The regression test is the behavior record.
- Do not require a full `spec.md`, `plan.md`, or `architecture.md` stack for a tactical bugfix.
- No `B-###` behavior ID or marker is required unless the bugfix belongs to an active plan.
- Write ACs around the observed regression, expected fixed behavior, and preservation of adjacent behavior.
- If the bug reveals a durable boundary decision or multi-plan design issue, route to `/skill:work-artifacts` `references/workflow-tiers.md` before expanding scope.

## Labels

Labels route tasks to the right specialist and indicate which domain skills are relevant.

| Label | When to use |
|-------|-------------|
| `backend` | Server-side logic, services, business rules |
| `frontend` | UI components, client-side logic, styling |
| `api` | HTTP endpoints, request/response handling, middleware |
| `database` | Migrations, models, schema changes, queries |
| `testing` | Test suites, test infrastructure, coverage |
| `devops` | CI/CD, deployment, infrastructure, configuration |

A task can have multiple labels. A migration task might be `["backend", "database"]`. An API endpoint with tests might be `["api", "testing"]`.

## Dependencies

Dependencies form a **DAG** (directed acyclic graph). No circular references allowed.

**Rules:**

- A task can only depend on tasks that already exist. No forward references.
- Ask: "Can a worker start this task without the other task being done?" If yes, no dependency needed. Don't over-constrain.
- Keep dependency chains short. Deep chains serialize work unnecessarily.

**Common patterns:**

- Data model → service/logic that uses it
- Service → API endpoint that exposes it
- Core library → consumers of that library
- Schema/migration → anything that reads/writes that data

## Priority

- `high` — Blocks other work or is on the critical path. Do these first.
- `medium` — Standard implementation work. The default for most tasks.
- `low` — Nice-to-have, polish, or non-blocking improvements.

## Plan Association

Tasks can be linked to a plan via labels. When creating tasks from a plan, pass the `plan` parameter to `task_create`:

```
task_create({ title: "Define cache types", plan: "response-cache" })
```

This auto-adds a `plan:response-cache` label. Query plan tasks with:

```
task_list({ label: "plan:response-cache" })
```

See the `plan` skill for the full plan-to-task lifecycle.

## Tool Reference

| Tool | Purpose |
|------|---------|
| `task_create` | Create a new task with title, description, ACs, labels, dependencies |
| `task_list` | List tasks, filter by status/priority/label/ready |
| `task_view` | Read full task details |
| `task_edit` | Update status, check/uncheck ACs by index, append implementation notes |
| `task_search` | Search tasks by text |

## Example

A well-structured task:

```yaml
---
id: COSMO-003
title: Add JWT token validation middleware
status: To Do
priority: high
labels:
  - backend
  - api
dependencies:
  - COSMO-001
  - COSMO-002
createdAt: 2026-02-09T10:00:00.000Z
---
```

```markdown
## Description

Add Express middleware that validates JWT access tokens on protected routes.
The middleware should extract the token from the Authorization header,
verify it against the signing key, and attach the decoded payload to the request.

<!-- AC:BEGIN -->
- [ ] #1 Middleware rejects requests without an Authorization header with 401
- [ ] #2 Middleware rejects expired or malformed tokens with 401
- [ ] #3 Valid token payload is available on the request object for downstream handlers
- [ ] #4 Token validation errors include a descriptive error message in the response
- [ ] #5 Tests cover valid, expired, malformed, and missing token cases
<!-- AC:END -->
```

## Common Problems

- **Task is blocked with no resolution path.** Add a note explaining the blocker as a triad — *what was tried, what's still unknown, what would unblock it* — then either: (a) create a new task to resolve the blocker, or (b) restructure the blocked task to work around it. Don't leave tasks in `Blocked` indefinitely without that triad, and don't replace it with vague "stuck" notes.
- **Acceptance criteria turn out to be wrong mid-implementation.** Update the ACs via `task_edit` before continuing. ACs are a contract — changing them is fine, but working against outdated ACs wastes effort.
- **Task is too large once implementation starts.** Split it. Create new tasks for the overflow, link them to the same plan, and update dependencies. Finish the original task with its reduced scope.
- **Dependency chain is too deep.** If a task is blocked by 3+ levels of dependencies, look for opportunities to parallelize. Often tasks that seem sequential can be split into independent parts.

## Related Skills

- `/skill:plan` — Creating plans that produce tasks
- `/skill:roadmap` — Where plan items originate
- `/skill:archive` — Archiving completed tasks with their plans
