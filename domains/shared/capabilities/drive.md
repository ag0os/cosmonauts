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
- The driver — not you — owns task-status transitions, postflight verification, event logging, and commits. Treat backend success reports as evidence, not proof.
- Drive appends a mandatory report contract after custom envelope/task content so every backend receives machine-readable `outcome:` marker instructions.
- Default per-task timeout is 1800000ms (30 minutes); set `taskTimeoutMs` explicitly for unusually long E2E suites or slow external backends.
- Status records are based on run state files: `run.completion.json` for terminal outcomes, `run.pid` for detached activity, and `run.inline.json` for inline activity. Status can be `completed`, `blocked`, `aborted`, `running`, `dead`, or `orphaned`.

Before configuring a run — backend, inline vs. detached, commit policy, envelope path, postflight commands, resume — **load `/skill:drive`**.
