---
name: forge-task
description: How to create well-structured tasks with acceptance criteria, dependencies, labels, and priorities using the forge task system.
---

# Forge Tasks

Tasks are atomic, persistent work items stored as markdown files in `forge/tasks/`. Each task represents a single-PR scope of work that one agent can complete independently.

## Task File Format

A task lives at `forge/tasks/COSMO-NNN - Title.md`. It is a markdown file with YAML frontmatter.

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

- `id` — Auto-assigned sequential ID in `COSMO-NNN` format.
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

ACs describe **outcomes, not implementation steps**. They tell the implementer what must be true when the task is done — the implementer decides how to get there.

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

See the `forge-plan` skill for the full plan-to-task lifecycle.

## Tool Reference

| Tool | Purpose |
|------|---------|
| `task_create` | Create a new task with title, description, ACs, labels, dependencies |
| `task_list` | List tasks, filter by status/priority/label/ready |
| `task_view` | Read full task details |
| `task_edit` | Update status, check ACs, append implementation notes |
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
