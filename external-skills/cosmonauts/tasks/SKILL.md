---
name: cosmonauts-tasks
description: Create, list, view, edit, delete, and search cosmonauts tasks from outside (Claude Code, Codex, Gemini CLI). Includes batch creation from YAML. Use this skill when the user wants to manage cosmonauts tasks via the CLI, populate a backlog, change task status, or find unblocked work. Tasks live as markdown files with YAML frontmatter under missions/tasks/.
---

# `cosmonauts task`

CRUD for cosmonauts tasks. All commands accept `--json` (parseable) and `--plain` (tab-separated). Default human output is for terminals — never parse it.

## The task file

Tasks are markdown files with YAML frontmatter at `missions/tasks/<ID>.md`. The ID format is configured by `cosmonauts scaffold missions -p <PREFIX>` (default `TASK-`).

```markdown
---
id: TASK-007
title: Wire OAuth provider
status: To Do            # To Do | In Progress | Done | Blocked
priority: high           # high | medium | low
assignee: alice
labels: [backend, auth]
dependencies: [TASK-006]
dueDate: 2026-06-01
---

## Description
Hook the GitHub OAuth flow up to the new /auth/callback route.

- [ ] #1 OAuth state parameter validated server-side
- [ ] #2 Refresh tokens stored encrypted
```

The acceptance criteria checklist (`- [ ] #N text`) is parsed structurally. Use `--check-ac N` / `--uncheck-ac N` on `task edit` to toggle them.

## Commands

### Create one

```bash
cosmonauts task create "Wire OAuth provider" \
  --description "GitHub OAuth callback" \
  --priority high \
  --assignee alice \
  --label backend --label auth \
  --due 2026-06-01 \
  --depends-on TASK-006 \
  --ac "OAuth state parameter validated server-side" \
  --ac "Refresh tokens stored encrypted" \
  --parent TASK-005 \
  --json
```

All flags except the positional `<title>` are optional. `--label`, `--depends-on`, and `--ac` are repeatable. Output (`--json`) is the full Task object including the allocated ID.

### Create many — `--from-file` (YAML)

For backlogs, push a YAML array instead of N CLI calls:

```yaml
# tasks.yaml
- title: Migrate schema
  description: Add the oauth_tokens table
  priority: high
  labels: [backend, db]
  ac:
    - Migration runs forward and backward
    - Existing rows preserved
  due: 2026-06-01            # unquoted YAML dates work (parsed as Date)
- title: Wire OAuth provider
  dependencies: [TASK-1]
  parent: TASK-0
```

```bash
cosmonauts task create --from-file tasks.yaml --json
```

YAML field names match the on-disk frontmatter: `title` (required), `description`, `priority`, `assignee`, `labels`, `due`, `dependencies`, `ac`, `parent`.

Rules:

- `--from-file` cannot be combined with the positional `<title>` or per-task flags (`--priority`, `--label`, etc.) — put those in the YAML rows instead.
- Validation is per-row. The first invalid row aborts the whole batch (no partial writes); the error includes the row index (`row 3: ...`).
- Created in file order; later rows can reference IDs minted by earlier rows.
- Quoted dates (`due: "2026-06-01"`) and unquoted YAML timestamps both work.

### List & filter

```bash
cosmonauts task list --json
cosmonauts task list --status todo --json
cosmonauts task list --status in-progress --priority high --json
cosmonauts task list --label backend --assignee alice --json
cosmonauts task list --ready --json   # only tasks with no open dependencies
```

Status values: `todo`, `in-progress`, `done`, `blocked` (the CLI normalizes these to the title-case form on disk).

### View / edit / delete / search

```bash
cosmonauts task view TASK-007 --json

cosmonauts task edit TASK-007 \
  --status in-progress \
  --append-notes "Implementation started 2026-05-13" \
  --add-label review-needed \
  --remove-dep TASK-006 \
  --check-ac 1 \
  --json

cosmonauts task delete TASK-007 --force --json
cosmonauts task search "oauth" --json
```

`task edit` flags accept add/remove/append variants for repeatable fields: `--add-label`, `--remove-label`, `--add-dep`, `--remove-dep`, `--add-ac`, `--remove-ac`, `--check-ac N`, `--uncheck-ac N`, `--append-plan`, `--append-notes`. All are repeatable. Use `--title`, `--description`, `--status`, `--priority`, `--assignee`, `--due`, `--plan`, `--notes` to set entire fields.

## Recipes

### Find the next thing to work on

```bash
cosmonauts task list --status todo --ready --priority high --json | jq '.[0]'
```

`--ready` filters out tasks whose dependencies aren't `Done`. Sorting/picking is up to the caller.

### Convert a plan's section into tasks

You have a plan with a "## Tasks" section listing work items. Convert to a YAML batch and create:

```bash
# (Convert your plan section to YAML however; example minimal:)
cat > /tmp/tasks.yaml <<EOF
- title: Schema migration
  priority: high
- title: API endpoint
  dependencies: [TASK-1]
- title: Frontend wiring
  dependencies: [TASK-2]
EOF
cosmonauts task create --from-file /tmp/tasks.yaml --json
```

The minted IDs are sequential (TASK-1, TASK-2, TASK-3 in this example, assuming an empty board) so dependency references are predictable.

### Mark progress and unblock dependents

```bash
cosmonauts task edit TASK-006 --status done --check-ac 1 --check-ac 2 --json
cosmonauts task list --ready --json   # TASK-007 should now appear if it depended on TASK-006
```

## Linking tasks to a plan

The CLI doesn't yet have a structured `task --plan` flag at create time. Two patterns:

1. **`task edit <id> --plan <slug>`** after creation — records the plan slug in the task's plan field.
2. **Manual frontmatter** — add `plan: <slug>` to the YAML row, or edit the file afterward.

When tasks reference a plan, `cosmonauts drive run --plan <slug>` enumerates them automatically.

## Exit codes & errors

- `0` on success.
- `1` on validation errors (invalid priority, missing title, malformed YAML, etc.) or filesystem errors.
- Errors print to stderr; `--json` puts the message under `{"error": "..."}` on stdout for parse-ability.

## See also

- `cosmonauts-plans` — link tasks to plan slugs, archive completed plan workloads.
- `cosmonauts-workflows` — let the planner+task-manager pair generate tasks for you instead of writing them yourself.
- `cosmonauts task <command> --help` — exhaustive flag reference for any subcommand.
