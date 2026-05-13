---
name: cosmonauts
description: Drive the cosmonauts agent-orchestration system from outside (Claude Code, Codex, Gemini CLI, or any agent that can shell out). Use this skill when the user asks to use cosmonauts, run a cosmonauts workflow, drive a plan, create cosmonauts tasks, or manage plans/tasks/sessions in a cosmonauts project. Cosmonauts can also drive Claude Code or Codex itself as an execution backend.
---

# Cosmonauts (from outside)

Cosmonauts is an **agent-orchestration system** built on the Pi framework. It runs multi-agent pipelines (planner → task-manager → coordinator → workers → verifier → quality-manager) over a file-based plan/task model, and it can hand work to external coding agents (Claude Code, Codex) as backends. You — the agent reading this skill — call it as a CLI.

## When to reach for it

- The user has a **cosmonauts project** (`missions/` directory exists, or `.cosmonauts/config.json` exists, or they say "this project uses cosmonauts").
- They want a coding task **decomposed and executed** — design → tasks → implementation → verification — without you doing all the orchestration yourself.
- They want to **drive a Claude Code / Codex backend** through a plan-shaped workload (cosmonauts' `drive` command is the layer that does this).
- They want **structured artifacts**: plans on disk, tasks with dependencies and acceptance criteria, session transcripts you can inspect later.

Don't reach for cosmonauts for one-off scripts, quick edits, or work that doesn't benefit from multi-agent decomposition.

## Mental model

Four nouns. Learn these first.

| Noun | What it is | Where it lives |
| --- | --- | --- |
| **Plan** | A design document — what to build and why. Has a stable slug. | `missions/plans/<slug>/plan.md` (+ optional `spec.md`) |
| **Task** | One atomic work item with acceptance criteria and dependencies. | `missions/tasks/<ID>.md` |
| **Drive** | An execution run that pulls tasks from a plan and hands each to a backend until done. | `missions/sessions/<plan>/runs/<runId>/` |
| **Session** | A persisted Pi conversation (one agent, append-only JSONL). | `~/.pi/agent/sessions/--<encoded-cwd>--/<agent>/<file>.jsonl` |

The data flow: **plan → tasks → drive → sessions**. Plans contain the design; task-manager breaks them into tasks; the coordinator (or `drive`) dispatches workers; sessions record what happened.

See `cosmonauts-tasks`, `cosmonauts-plans`, `cosmonauts-workflows` for the CRUD details on each.

## Discovery (always start here)

Before doing anything in an unfamiliar cosmonauts project, introspect what's actually installed:

```bash
cosmonauts --list-domains --json     # which domains are available (e.g. "coding", "shared")
cosmonauts --list-agents --json      # qualified agent IDs (e.g. "coding/planner", "main/cosmo")
cosmonauts --list-workflows --json   # named pipelines you can run
cosmonauts skills list --json        # internal skills the agents can load
```

Every JSON-emitting cosmonauts command accepts `--json` (machine output) or `--plain` (tab-separated, no padding). Use `--json` by default.

## Output conventions

- `--json` on **task**, **plan**, **skills**, **packages**, **session**, **scaffold**, and the top-level `--list-*` flags: parseable JSON to stdout, errors to stderr. Exit code 0 = success, 1 = failure.
- `--plain` on the same set: tab-separated, no headers, no padding. Good for piping.
- Default (neither flag): human-formatted with headers and dashed separators. Don't parse this — use `--json`.
- **`cosmonauts drive` is different.** It emits JSON natively and does **not** accept `--json` / `--plain` — passing them errors with `unknown option '--json'`. Just parse `drive run`, `drive status`, and `drive list` output directly.
- Long-running ops (`cosmonauts drive run`) accept `--mode detached` to fork and return a `runId` immediately; poll status with `drive status <runId>`.

## Common recipes

### Recipe 1 — Run a full pipeline from a one-line prompt

The user says "design and build an auth system." Don't decompose manually:

```bash
cosmonauts --workflow plan-and-build "design an auth system with email and OAuth"
```

`plan-and-build` is a named workflow that chains `planner → task-manager → coordinator → workers → integration-verifier → quality-manager`. **It runs end-to-end non-interactively** — no REPL, no approval prompt between design and implementation. If the user expects a review gate before code is written, split into two calls: a design-only chain (`--workflow "planner -> plan-reviewer"`) first, then `cosmonauts drive run --plan <slug>` once the plan and tasks are reviewed. See `cosmonauts-workflows` for the split-pipeline recipe and the chain DSL syntax.

### Recipe 2 — Run a known plan through an external backend (drive)

You already have an approved plan and want cosmonauts to drive a Claude Code subscription through every task:

```bash
cosmonauts drive run \
  --plan auth-system \
  --backend claude-cli \
  --mode detached \
  --branch feature/auth
# → {"runId":"run-abc","planSlug":"auth-system","workdir":"...","eventLogPath":"..."}

# Poll:
cosmonauts drive status run-abc --plan auth-system
# → {"status":"running"|"completed"|"failed"|"blocked"|"dead", ...}
```

Backends: `codex` (calls `codex exec --full-auto`), `claude-cli` (calls `claude -p`), `cosmonauts-subagent` (internal). See `cosmonauts drive run --help` for the full flag set (commit policies, max cost, resume, etc.).

### Recipe 3 — Inspect what was done

```bash
cosmonauts plan list --json
cosmonauts plan view auth-system --json
cosmonauts task list --status done --json
cosmonauts session list --json          # most recent first
cosmonauts session info <id-prefix>     # 8-char prefix is enough
```

### Recipe 4 — Build a backlog from outside

If you've designed the plan yourself (e.g. you're Claude Code planning a feature), push it into cosmonauts as tasks and let cosmonauts coordinate execution:

```bash
cosmonauts plan create --slug feature-x --title "Feature X" --spec "$(cat spec.md)"

# Either create tasks one-by-one, or batch from a YAML file:
cat > /tmp/tasks.yaml <<EOF
- title: Migrate schema
  priority: high
  labels: [backend, db]
  ac: ["Migration runs forward and backward", "Existing rows preserved"]
- title: Wire API endpoint
  dependencies: [TASK-1]
EOF
cosmonauts task create --from-file /tmp/tasks.yaml --json

cosmonauts drive run --plan feature-x --backend claude-cli --mode detached
```

See `cosmonauts-tasks` for the full YAML schema and field list.

## Sub-skills

Load these for procedure-level detail when you need it:

- **`cosmonauts-tasks`** — Task CRUD, batch creation from YAML, dependency awareness, filter recipes.
- **`cosmonauts-plans`** — Plan CRUD, attaching a spec, archiving.
- **`cosmonauts-workflows`** — Named workflows, chain DSL syntax, `--print` vs interactive, profiling.
- **`cosmonauts-skills`** — How to install ADDITIONAL cosmonauts skills (the internal-agent skills, distinct from this bundle) into your harness.

Two subcommands don't have dedicated sub-skills yet — they're self-documenting via `--help`:

- `cosmonauts drive --help` — driving plans through external backends (recipe 2 above).
- `cosmonauts session --help` — enumerating and inspecting persisted Pi sessions.

## Cosmonauts is bidirectional

A subtle point: cosmonauts can **drive** Claude Code and Codex (via `drive run --backend claude-cli|codex`) and it can **be driven by** them (the use case for this skill). When the user has a Claude Code subscription and wants Claude to do the actual coding under cosmonauts' supervision, that's the first form. When the user wants Claude Code to *use cosmonauts* to organize a multi-agent task, that's the second.

This skill is about the **second** form.

## Things to avoid

- **Don't parse human-formatted output.** Always pass `--json` or `--plain`.
- **Don't shell out to cosmonauts from inside a cosmonauts session.** If you're already running as a cosmonauts internal agent (e.g. `coding/cody`), you have native tools for tasks/plans/drive; use those.
- **Don't assume the project has a coding domain installed.** Check `cosmonauts --list-domains --json` first. If empty, suggest `cosmonauts install coding`.
- **Don't expect a `--workflow` run to pause for approval.** Workflows run from first stage to last without pausing — there is no REPL, no plan-approval gate, no clarifying-question loop in the CLI. If you need a design-review gate, split the pipeline (design-only chain → human/agent review → `cosmonauts drive run --plan <slug>`). See `cosmonauts-workflows` → "Run a named workflow".
- **Don't pass `--json` to `cosmonauts drive` commands.** They emit JSON natively and don't define the flag — commander rejects it. The other subcommands (task, plan, skills, packages, session, scaffold) do accept `--json`.

## Updating this bundle

This skill set is shipped with cosmonauts. To pull a newer version into your harness:

```bash
# Claude Code, project-level:
cp -r "$(npm root)/cosmonauts/external-skills/cosmonauts" .claude/skills/cosmonauts

# Claude Code, user-level:
cp -r "$(npm root -g)/cosmonauts/external-skills/cosmonauts" ~/.claude/skills/cosmonauts

# Codex, project-level:
cp -r "$(npm root)/cosmonauts/external-skills/cosmonauts" .codex/skills/cosmonauts
```

Replace `npm root` with whichever path manager you use; the bundle ships at `external-skills/cosmonauts/` inside the cosmonauts package.
