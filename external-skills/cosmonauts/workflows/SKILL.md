---
name: cosmonauts-workflows
description: Run cosmonauts named workflows and chain DSL expressions from outside (Claude Code, Codex, Gemini CLI). Use this skill when the user wants to run a multi-agent pipeline (plan-and-build, tdd, verify, etc.), compose a custom chain of agents, or kick off cosmonauts non-interactively. Covers --print mode, completion labels, and profiling.
---

# `cosmonauts --workflow`

Multi-agent pipelines invoked from the cosmonauts top-level command. Either a **named workflow** (e.g. `plan-and-build`) or a **chain DSL expression** (e.g. `planner -> coordinator`).

## Discover what's installed

```bash
cosmonauts --list-workflows --json
```

Output is an array of `{name, description, chain}` rows. Common defaults:

| Workflow | Chain | Use when |
| --- | --- | --- |
| `plan-and-build` | `planner → task-manager → coordinator → workers → integration-verifier → quality-manager` | Greenfield feature from a one-line goal. |
| `tdd` | TDD-discipline variant (test-writer → implementer → refactorer per task) | Test-first workloads. |
| `spec-and-build` | spec-writer → planner → … | You have a vague idea; let cosmonauts write the spec first. |
| `implement` | task-manager → coordinator → workers | You already have a plan; just decompose and execute. |
| `verify` | quality-manager → reviewers → fixers | Run quality checks and remediation on the current diff. |
| `adapt` | adaptation-planner → … | Modify an existing system (vs. greenfield). |

Exact names depend on the project's `.cosmonauts/config.json` and installed domains; always re-check with `--list-workflows --json`.

## Run a named workflow

```bash
cosmonauts --workflow plan-and-build "design an auth system with email + OAuth"
```

Interactive by default — the planner asks clarifying questions, the user confirms the plan, then execution proceeds. For one-shot non-interactive runs add `--print`:

```bash
cosmonauts --workflow plan-and-build --print "design an auth system"
```

`--print` skips the REPL: the agent runs to completion and exits. The chain's final response is printed to stdout. Exit code `0` on success, `1` on failure.

## Chain DSL — custom pipelines

Same `--workflow` flag, but pass an arrow expression instead of a named workflow. The CLI auto-detects DSL syntax.

```bash
# Arrow chain — sequential stages
cosmonauts --workflow "planner -> task-manager -> coordinator" "build feature X"

# Bracket group — parallel stages (all run, then continue)
cosmonauts --workflow "planner -> [task-manager, reviewer] -> coordinator" "design with review"

# Fan-out — N instances of the same agent with the same prompt
cosmonauts --workflow "coordinator -> reviewer[3]" "multi-pass review"

# Combine
cosmonauts --workflow "planner -> [task-manager, reviewer] -> coordinator -> reviewer[2]" "..."
```

Stage identifiers are agent IDs (qualified or unqualified). `--list-agents --json` shows valid IDs. If a stage isn't unique across domains, qualify it (`coding/planner`).

**Fan-out caveat:** `reviewer[3]` spawns three reviewers that each receive the **same prompt**. It does **not** partition work or assign different tasks per instance. Use fan-out for independent parallel passes (e.g. three review angles), not for task distribution.

## Useful top-level flags

| Flag | Purpose |
| --- | --- |
| `-a, --agent <id>` | Override the lead agent for the first stage (rarely needed; the workflow already names stages). |
| `-d, --domain <id>` | Set the domain context for agent resolution (e.g. `-d coding` to prefer `coding/*` IDs). |
| `-m, --model <provider/id>` | Override the default model for all stages. |
| `-t, --thinking <level>` | `off|minimal|low|medium|high|xhigh`. Per-run override. |
| `-p, --print` | Run, output, exit. No REPL. |
| `--completion-label <label>` | Task label scope for loop completion checks (e.g. `--completion-label "plan:auth-system"`). |
| `--profile` | Write chain profiling trace + summary to `missions/sessions/<plan>/_profiles/` (or `_profiles/` if no plan slug). Useful for performance/cost analysis. |
| `--plugin-dir <path>` | Add a session-only domain source directory. Repeatable. |
| `--dump-prompt -a <id>` | Print the composed system prompt for an agent and exit. Use for debugging what an agent actually sees. |

## Sessions during a workflow

Each stage runs as its own Pi session, persisted under
`~/.pi/agent/sessions/--<encoded-cwd>--/<agent>/*.jsonl`. After the run, enumerate them with `cosmonauts session list --json` (most recent first). Multi-stage chains produce one session per stage.

To inspect a specific session:

```bash
cosmonauts session info <id-prefix> --json
cosmonauts session info <id-prefix> --include-text --json  # full transcript
```

## What workflows don't do (yet)

- **No streaming progress events.** `--print` / `--workflow` only surface the final response. Intermediate tool calls, turn boundaries, and stage transitions aren't observable from outside today. The cosmonauts roadmap item `streaming-events` tracks adding an NDJSON event stream for this.
- **No per-stage configuration from the CLI.** You can't pass different `--model` or `--thinking` to different stages from the CLI — the workflow definition controls that. Edit `.cosmonauts/config.json` to change stage-level config.
- **No mid-run pause/inspect.** A running workflow is either interactive (and you respond inline) or `--print` (and you wait). For long autonomous runs that need pause/resume, use `cosmonauts drive` instead — drive supports detached mode and explicit resume.

## Recipes

### Run a full pipeline and capture the result

```bash
cosmonauts --workflow plan-and-build --print \
  "design an HTTP rate limiter with a token bucket strategy" \
  > result.txt 2>chain.log
echo "Exit: $?"
```

`result.txt` gets the final agent response; `chain.log` gets stage-by-stage progress. Inspect later via `cosmonauts session list --json | jq '.[0:3]'`.

### Plan-only run (skip execution)

```bash
cosmonauts --workflow "planner -> plan-reviewer" --print "build feature X"
```

Drops the task-manager → coordinator → workers tail. The planner produces a design, the reviewer critiques it; nothing gets implemented.

### Profile a workflow run

```bash
cosmonauts --workflow plan-and-build --profile "..."
# Look at the written profile:
ls missions/sessions/_profiles/
```

The profile contains per-stage duration, token counts, and tool-call counts.

## See also

- `cosmonauts-plans` and `cosmonauts-tasks` — the artifacts a workflow produces.
- `cosmonauts drive --help` — for long-running autonomous execution of an already-approved plan, with detached mode and resume.
- `cosmonauts --help` and `cosmonauts --list-workflows --json` — discovery from inside any cosmonauts project.
