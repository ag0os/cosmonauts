# Task System

Manage the project-level task system (persistent markdown files in `missions/tasks/`).

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
- Task IDs are sequential and human-readable, using the configured prefix plus a numeric suffix with optional zero padding; `COSMO-001` is only an example, not the only valid ID shape.
- New task IDs are allocated from active task frontmatter in `missions/tasks/` plus archived task filenames in `missions/archive/tasks/`, using the next number after the highest matching configured-prefix ID.
- Task IDs are repository-local, not branch-global. Cross-branch duplicate IDs are an accepted caveat when two branches allocate from the same base before merging.
- `cosmonauts task renumber` is only a future reconciliation option for duplicate readable IDs; it is FUTURE-only and not implemented.
- Task statuses: To Do, In Progress, Done, Blocked.
- Dependencies must form a DAG (directed acyclic graph). No circular references.
- Use labels for routing: `backend`, `frontend`, `api`, `database`, `testing`, `devops`.
