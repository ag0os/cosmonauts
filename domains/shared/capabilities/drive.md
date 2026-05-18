# Drive

Drive runs an approved plan's task set through a mechanical loop: render each task's prompt, run a backend, verify, update task state, emit events, and commit per policy. Chains and Drive overlap — chains are the established path (a bit slower); Drive is newer and adds detached execution and external backends (`codex`, `claude-cli`). **Follow what the user asks for.** If they don't say, prefer a chain.

## Tools

| Tool | Purpose |
|------|---------|
| `run_driver` | Start a plan-linked task run. Returns a `runId` immediately — the run proceeds in the background. |
| `watch_events` | Read a run's events with a cursor; monitor progress and summarize as events arrive. |

## Rules

- Don't start a run until the plan is approved and the task set is clear.
- Don't claim a driver run happened unless `run_driver` returned a `runId`. If the tools are absent, say Drive is unavailable and fall back to `chain_run` or `spawn_agent`.
- Pass ordered `taskIds` when dependency order matters; the default is all non-Done tasks labeled `plan:<slug>`.
- The driver owns task-status transitions, configured postflight verification, event logging, and commits when `commitPolicy` is `driver-commits`. Treat backend success reports as evidence, not proof.
- Choose and pass the real project verification commands. Drive injects the run's commit policy and verification expectations into each rendered prompt; do not rely on generic envelope defaults for package-manager commands.
- Codex and Claude CLI detached backends default to permission-bypassing modes (`--yolo` / `--dangerously-skip-permissions`) so they can perform implementation work. Opt out only when the surrounding environment is not already sandboxed.
- Drive appends generated run expectations plus a mandatory report contract after custom envelope/precondition content so every backend receives the concrete commit, verification, and machine-readable `outcome:` marker instructions.
- Default per-task timeout is 1800000ms (30 minutes); set `taskTimeoutMs` explicitly for unusually long E2E suites or slow external backends.
- Status records are based on run state files: `run.completion.json` for terminal outcomes, `run.pid` for detached activity, and `run.inline.json` for inline activity. Status can be `completed`, `blocked`, `aborted`, `running`, `dead`, or `orphaned`.

Before configuring a run — backend, inline vs. detached, commit policy, envelope path, postflight commands, resume — **load `/skill:drive`**.
