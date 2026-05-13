---
name: cosmonauts-plans
description: Create, list, view, edit, delete, and archive cosmonauts plans from outside (Claude Code, Codex, Gemini CLI). Use this skill when the user wants to register a design as a cosmonauts plan, link tasks to it, change its status, or archive a completed plan. Plans live as a directory per slug under missions/plans/.
---

# `cosmonauts plan`

CRUD for cosmonauts plans. All commands accept `--json` (parseable) and `--plain` (tab-separated).

## What a plan is

A plan is a designed unit of work — a stable slug + a markdown design document + (optionally) a `spec.md` with detailed requirements. It is the unit that **drive** runs over and that the planner/task-manager pipeline produces.

On disk:

```
missions/plans/<slug>/
├── plan.md      # the design (frontmatter + body)
└── spec.md      # optional: detailed input spec
```

Frontmatter on `plan.md`:

```markdown
---
slug: auth-system
title: Auth System
status: active           # active | completed
createdAt: 2026-05-01T00:00:00Z
updatedAt: 2026-05-13T00:00:00Z
---

## Goal
…

## Approach
…

## Tasks
- [ ] TASK-001 Wire schema
- [ ] TASK-002 Build endpoint
```

The slug is the stable identifier; everything references the plan by slug.

## Commands

### Create

```bash
cosmonauts plan create \
  --slug auth-system \
  --title "Auth System" \
  --description "Email + OAuth login with refresh tokens" \
  --spec "$(cat spec.md)" \
  --json
```

Required: `--slug` (kebab-case, used as the directory name) and `--title`. `--description` is a short summary; `--spec` is the body that goes into `spec.md`.

### List / view

```bash
cosmonauts plan list --json
cosmonauts plan list --status active --json
cosmonauts plan view auth-system --json
```

`list --json` returns an array of `{slug, status, taskCount, title, ...}` rows. `view <slug>` returns the full plan including parsed task references.

### Edit

```bash
cosmonauts plan edit auth-system --status completed --json
cosmonauts plan edit auth-system --title "Auth System (v2)" --body "$(cat new-body.md)" --json
cosmonauts plan edit auth-system --spec "$(cat updated-spec.md)" --json
```

Flags: `--title`, `--status` (`active`|`completed`), `--body` (replaces plan.md body), `--spec` (replaces spec.md).

### Delete / archive

```bash
cosmonauts plan delete auth-system --force --json   # destructive: wipes the directory
cosmonauts plan archive auth-system --json          # moves to missions/archive/plans/
```

**Archive, don't delete.** Archive preserves the design + the linked task history under `missions/archive/plans/<slug>/` and `missions/archive/tasks/`. Delete throws everything away.

## Lifecycle

The intended lifecycle for a plan:

1. **Create.** Either by hand (`plan create --slug X --title Y --spec "$(cat …)"`) or by a planner agent in a workflow (`cosmonauts --workflow plan-and-build "…"`).
2. **Link tasks via the `plan:<slug>` label.** Cosmonauts associates tasks with a plan by labeling them `plan:<slug>` — `plan view`, `drive run --plan <slug>`, and `plan archive` all use that label as the query. The `task-manager` agent adds it automatically. From outside, set it explicitly: `cosmonauts task create "..." --label "plan:auth-system"`, or on an existing task `cosmonauts task edit <id> --add-label "plan:auth-system"`. (See `cosmonauts-tasks` → "Linking tasks to a plan" for the YAML batch form.) **Do not use `task edit --plan`** — that flag writes free-form implementation notes, it does not link to a plan slug.
3. **Drive execution.** `cosmonauts drive run --plan <slug> --backend claude-cli|codex --mode detached` walks the plan's `plan:<slug>`-labeled tasks in dependency order, dispatching each to the chosen backend.
4. **Verify & complete.** When all tasks are `Done` and acceptance criteria are checked, set status: `cosmonauts plan edit <slug> --status completed`.
5. **Archive.** `cosmonauts plan archive <slug>` moves the plan and its tasks into `missions/archive/`.

## Recipes

### Push a plan you designed elsewhere

You're Claude Code; the user has a markdown design in `~/notes/auth.md`. Push it as a cosmonauts plan and let cosmonauts run it:

```bash
SLUG="auth-system"
cosmonauts plan create \
  --slug "$SLUG" \
  --title "Auth System" \
  --description "Email + OAuth login" \
  --spec "$(cat ~/notes/auth.md)" \
  --json

# Optionally seed the task list (every row needs labels: ["plan:auth-system"]
# so the plan view and the driver can find them):
cosmonauts task create --from-file tasks.yaml --json

# drive emits JSON natively and does NOT accept --json:
cosmonauts drive run --plan "$SLUG" --backend claude-cli --mode detached
```

### Resume a half-built plan

```bash
cosmonauts plan view auth-system --json | jq '.taskCount, .status'

# Tasks belonging to the plan — found by the plan:<slug> label, not a .plan field
cosmonauts task list --status todo --label "plan:auth-system" --json

# drive subcommand emits JSON natively (no --json flag):
cosmonauts drive list | jq '[.runs[] | select(.planSlug == "auth-system")]'
```

If a previous run died (`status: dead`), resume it:

```bash
cosmonauts drive run --plan auth-system --resume <runId>
```

### Archive a finished plan and capture learnings

```bash
cosmonauts plan edit auth-system --status completed --json
cosmonauts plan archive auth-system --json
# Cosmonauts agents will distill memory/<slug>.md from the archived plan + sessions.
# That distillation is internal; you don't need to drive it.
```

## Exit codes

- `0` success.
- `1` validation error (duplicate slug, missing required field, bad status value) or filesystem error.

## See also

- `cosmonauts-tasks` — task CRUD; plans are mostly useful in conjunction with linked tasks.
- `cosmonauts-workflows` — let the planner agent generate the plan for you from a one-line goal, instead of authoring `plan.md` yourself.
- `cosmonauts plan <command> --help` — full flag reference.
- `cosmonauts drive --help` — driving plan-linked task batches through external backends.
