# Task System

Manage the project-level task system (persistent markdown files in `forge/tasks/`).

## Task Tools

| Tool | Purpose |
|------|---------|
| `task_create` | Create a new task with title, description, ACs, labels, dependencies |
| `task_list` | List tasks, filter by status/priority/label/ready |
| `task_view` | Read full task details |
| `task_edit` | Update status, check ACs, append notes |
| `task_search` | Search tasks by text |

## Task Conventions

- Tasks are atomic, single-PR scope work items with 1-7 outcome-focused acceptance criteria.
- Task IDs follow the pattern `COSMO-NNN`.
- Task statuses: To Do, In Progress, Done, Blocked.
- Dependencies must form a DAG (directed acyclic graph). No circular references.
- Use labels for routing: `backend`, `frontend`, `api`, `database`, `testing`, `devops`.
