---
name: cosmonauts-chains
description: Run cosmonauts named chains and chain DSL expressions from outside Claude Code, Codex, or another shell-capable agent. Use this skill when the user wants to run a multi-agent pipeline, compose a custom chain of agents, or kick off cosmonauts non-interactively. Covers chain DSL syntax, completion labels, profiling, and how to inspect results.
---

# `cosmonauts run chain`

Multi-agent pipelines are invoked through `cosmonauts run chain`. Pass either a live **named chain** or a **chain DSL expression**.

## Discover what's installed

```bash
cosmonauts run chain list
```

The command emits JSON rows shaped like `{ "name": "...", "description": "...", "chain": "..." }`. When `../references/generated-inventory.md` is present, its named-chain section contains the same sync-time facts. Exact names depend on the current project, so do not rely on an authored list.

## Run a named chain

```bash
cosmonauts run chain <chain-name> "design an auth system with email + OAuth"
```

Chains are non-interactive once launched. They run from first stage to last, do not enter a REPL, and do not pause for plan approval between design and implementation.

Chains emit JSON to stdout with the resolved chain and per-stage outcome summary. The substantive work product usually lands in:

- **Files on disk** — `missions/plans/<slug>/plan.md`, `missions/tasks/<ID>.md`, plus any other artifacts each stage writes.
- **Pi sessions** — one per stage, in `~/.pi/agent/sessions/--<encoded-cwd>--/<agent>/<file>.jsonl`. Inspect via `cosmonauts session list --json` and `cosmonauts session info <id-prefix> --include-text --json`.

If the user expects an approval boundary between design and implementation, split the chain explicitly:

```bash
# Stage 1: design only, then exit.
cosmonauts run chain "planner -> plan-reviewer" "design an auth system"

# Human or external orchestrator reviews the produced plan and tasks.

# Stage 2: execute the approved plan via Drive.
cosmonauts run drive --plan auth-system --backend claude-cli --mode detached
```

Use a discovered execution-oriented chain or a custom expression when you want only the execution half.

## Chain DSL

Pass an arrow expression instead of a named chain:

```bash
# Sequential stages
cosmonauts run chain "planner -> task-manager -> coordinator" "build feature X"

# Bracket group: parallel stages, all complete before the next stage
cosmonauts run chain "planner -> [task-manager, reviewer] -> coordinator" "design with review"

# Fan-out: N instances of the same agent with the same prompt
cosmonauts run chain "coordinator -> reviewer[3]" "multi-pass review"
```

Stage identifiers are agent IDs, qualified or unqualified. Qualify any identifier that is not unique across domains.

**Fan-out caveat:** `reviewer[3]` spawns three reviewers that each receive the same prompt. It does not partition work or assign different tasks per instance. Use fan-out for independent parallel passes, not for task distribution.

## Useful flags

| Flag | Purpose |
| --- | --- |
| `-a, --agent <id>` | Override the lead agent for first-stage resolution when needed. |
| `-d, --domain <id>` | Set the domain context for agent resolution, such as `-d coding`. |
| `-m, --model <provider/id>` | Override the default model for all stages. |
| `-t, --thinking <level>` | `off|minimal|low|medium|high|xhigh`. Per-run override. |
| `-p, --print` | Top-level print mode for a single agent. Do not combine it with chain runs. |
| `--completion-label <label>` | Task label scope for loop completion checks, such as `--completion-label "plan:auth-system"`. |
| `--profile` | Write chain profiling trace and summary to `missions/sessions/<plan>/_profiles/` or `_profiles/`. |
| `--plugin-dir <path>` | Add a session-only domain source directory. Repeatable. |
| `--dump-prompt -a <id>` | Print the composed system prompt for an agent and exit. |

## Sessions during a chain

Each stage runs as its own Pi session, persisted under `~/.pi/agent/sessions/--<encoded-cwd>--/<agent>/*.jsonl`. After the run, enumerate them with:

```bash
cosmonauts session list --json
cosmonauts session info <id-prefix> --include-text --json
```

## What chains don't do

- **No mid-run approval gate.** A launched chain runs straight through every stage. Split design and execution when a review gate matters.
- **No per-stage CLI overrides.** You cannot pass different model or thinking settings to different stages from the CLI; the chain definition controls that.
- **No pause/resume.** For long autonomous runs that need explicit resume and normalized status/event observation, use `cosmonauts run drive` and observe with `cosmonauts run status` / `cosmonauts run watch`.

## Recipes

### Run a full pipeline and read the result

```bash
cosmonauts run chain <chain-name> \
  "design an HTTP rate limiter with a token bucket strategy" \
  2> chain.log
EXIT=$?
echo "Exit: $EXIT"

cosmonauts plan list --json
cosmonauts task list --json
cosmonauts session list --json | jq '.[0:5]'
cosmonauts session info <id-prefix> --include-text --json
```

`chain.log` contains human progress such as stage starts and completions. The actual content lives in `missions/` and the session JSONL files.

### Plan-only run

```bash
cosmonauts run chain "<stage> -> <review-stage>" "build feature X" 2> chain.log
cosmonauts plan list --json
```

This drops the task-manager and coordinator tail. The planner produces a design under `missions/plans/<slug>/`, the reviewer critiques it, and nothing gets implemented.

### Profile a chain run

```bash
cosmonauts --profile run chain <chain-name> "..."
ls missions/sessions/_profiles/
```

The profile contains per-stage duration, token counts, and tool-call counts.

## See also

- `cosmonauts-plans` and `cosmonauts-tasks` — the artifacts a chain produces.
- `cosmonauts run drive --help` — long-running autonomous execution of an already-approved plan, with detached mode and resume.
- `cosmonauts --help` and `cosmonauts run chain list` — discovery from inside any cosmonauts project.
