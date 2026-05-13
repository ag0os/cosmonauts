---
name: cosmonauts-workflows
description: Run cosmonauts named workflows and chain DSL expressions from outside (Claude Code, Codex, Gemini CLI). Use this skill when the user wants to run a multi-agent pipeline (plan-and-build, tdd, verify, etc.), compose a custom chain of agents, or kick off cosmonauts non-interactively. Covers chain DSL syntax, completion labels, profiling, and how to inspect results (workflows produce file artifacts and sessions, not stdout output).
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

**Workflows are always non-interactive.** `--workflow` routes through `handleWorkflowMode` → `runChain`; it never enters a REPL, never pauses for plan approval, and `--print` does not gate execution (when both `--workflow` and `--print` are passed, workflow mode takes precedence and `--print` is ignored).

**Workflows do not write to stdout.** The chain event logger emits per-stage progress to **stderr**; the chain's final response is **not** echoed anywhere on stdout. What you get is:

- **Files on disk** — `missions/plans/<slug>/plan.md`, `missions/tasks/<ID>.md`, plus any other artifacts each stage writes.
- **Pi sessions** — one per stage, in `~/.pi/agent/sessions/--<encoded-cwd>--/<agent>/<file>.jsonl`. Inspect via `cosmonauts session list --json` (most recent first) and `cosmonauts session info <id-prefix> --include-text --json`.

Exit code `0` on success, `1` on failure.

If the user expects an approval boundary between "design" and "implement", split the chain explicitly:

```bash
# Stage 1: design only — output the plan, exit.
cosmonauts --workflow "planner -> plan-reviewer" "design an auth system"

# Human (or external orchestrator) reviews the produced plan and any tasks
# written to missions/plans/<slug>/ and missions/tasks/.

# Stage 2: execute the approved plan via drive (long-running, observable):
cosmonauts drive run --plan auth-system --backend claude-cli --mode detached
```

Use the `implement`-style workflow names (or a custom chain like `task-manager -> coordinator -> workers`) when you want the execution half without re-running the planner.

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
| `-p, --print` | Top-level print mode (run a single agent, print to stdout, exit). **Ignored when `--workflow` is set** — workflow mode always takes precedence. |
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

- **No stdout output.** `--workflow` writes nothing to stdout — neither progress nor the final response. Per-stage progress is logged to **stderr** via `cli/chain-event-logger.ts`; everything substantive lives in on-disk artifacts (`missions/plans/`, `missions/tasks/`) and per-stage Pi sessions. Use `cosmonauts session list --json` + `session info <id> --include-text --json` to read the actual outputs.
- **No structured streaming event API.** The stderr log is human-formatted and may include lifecycle, turn, and tool lines such as stage starts/ends, `Turn event: ...`, and `Tool event: ...`. It is useful for watching progress, but it is not a stable machine-readable event stream. The roadmap item `streaming-events` tracks adding an NDJSON event stream for this.
- **No per-stage configuration from the CLI.** You can't pass different `--model` or `--thinking` to different stages from the CLI — the workflow definition controls that. Edit `.cosmonauts/config.json` to change stage-level config.
- **No mid-run pause/inspect.** A running workflow runs straight through every stage. For long autonomous runs that need pause/resume, use `cosmonauts drive` instead — drive supports detached mode (`--mode detached` returns a `runId` immediately) and explicit resume (`--resume <runId>`).

## Recipes

### Run a full pipeline and read the result

Workflows don't print to stdout (see "What workflows don't do"), so `> result.txt` captures nothing. The correct pattern is: log stderr for progress, then read artifacts and sessions afterward.

```bash
cosmonauts --workflow plan-and-build \
  "design an HTTP rate limiter with a token bucket strategy" \
  2> chain.log
EXIT=$?
echo "Exit: $EXIT"

# What landed on disk:
cosmonauts plan list --json
cosmonauts task list --json

# Per-stage transcripts (each stage runs as its own Pi session):
cosmonauts session list --json | jq '.[0:5]'             # 5 most recent
cosmonauts session info <id-prefix> --include-text --json   # full text for one
```

`chain.log` contains stage start/end lines (`[chain] Starting: ...`, `[stage] Completed (..ms)`) — useful for seeing which stage ran when. The actual *content* lives in `missions/` and the session JSONL files.

### Plan-only run (skip execution)

```bash
cosmonauts --workflow "planner -> plan-reviewer" "build feature X" 2> chain.log
cosmonauts plan list --json
```

Drops the task-manager → coordinator → workers tail. The planner produces a design (written to `missions/plans/<slug>/`), the reviewer critiques it; nothing gets implemented. Read the produced plan from disk (`cosmonauts plan view <slug> --json`) or the reviewer's session.

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
