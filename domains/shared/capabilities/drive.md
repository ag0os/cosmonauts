# Drive

Drive runs an approved plan's task set through a mechanical loop: render each task's prompt, run a backend, verify, update task state, emit events, and commit per policy. Chains and Drive overlap — chains are the established path (a bit slower); Drive is newer and adds detached execution and external backends (`codex`, `claude-cli`). **Follow what the user asks for.** If they don't say, prefer a chain.

## Tools

| Tool | Purpose |
|------|---------|
| `run_driver` | Start a plan-linked task run. Returns a `runId` immediately — the run proceeds in the background. |
| `watch_events` | Read a run's events with a cursor; monitor progress and summarize as events arrive. |
| `run_status` | Read normalized durable runtime status for a run record. Observation only. |
| `run_watch` | Page normalized durable runtime events by sequence cursor. Observation only. |

## Rules

- Don't start a run until the plan is approved and the task set is clear.
- Don't claim a driver run happened unless `run_driver` returned a `runId`. If the tools are absent, say Drive is unavailable and fall back to `chain_run` or `spawn_agent`.
- Pass ordered `taskIds` when dependency order matters; the default is all non-Done tasks labeled `plan:<slug>`.
- The driver owns task-status transitions, configured postflight verification, event logging, and commits when `commitPolicy` is `driver-commits`. Treat backend success reports as evidence, not proof.
- Choose and pass the real project verification commands. Drive injects the run's commit policy and verification expectations into each rendered prompt; do not rely on generic envelope defaults for package-manager commands.
- Codex and Claude CLI detached backends default to permission-bypassing modes (`--yolo` / `--dangerously-skip-permissions`) so they can perform implementation work. Opt out only when the surrounding environment is not already sandboxed.
- Drive appends generated run expectations plus a mandatory report contract after custom envelope/precondition content so every backend receives the concrete commit, verification, and machine-readable `outcome:` marker instructions.
- When `mode` is omitted, `run_driver` defaults to `detached` for 4 or more tasks and `inline` for smaller task sets, matching the CLI. Pass `mode` explicitly when needed.
- Default per-task timeout is 1800000ms (30 minutes); set `taskTimeoutMs` explicitly for unusually long E2E suites or slow external backends.
- Chain fallback has separate timeouts: `chain_run.timeoutMs` defaults to 1800000ms total, and `chain_run.spawnTimeoutMs` defaults to 300000ms for waiting on child spawn completions.
- Status records are based on run state files: `run.completion.json` for terminal outcomes, `run.pid` for detached activity, and `run.inline.json` for inline activity. Status can be `completed`, `blocked`, `finalization_failed`, `aborted`, `running`, `dead`, or `orphaned`.
- Durable runtime phase 1 is additive. Drive still writes legacy `events.jsonl` for `watch_events` and resume, and status/list still classify only from `run.completion.json`, `run.pid`, and `run.inline.json`.
- Normalized Drive events are written to `orchestration-events.jsonl` beside the legacy stream, with `run.json.eventsPath` pointing at that sidecar. Use `run_status`/`run_watch` when you explicitly need normalized durable-runtime observation.
- Normalized setup and append failures are isolated from Drive outcomes: legacy event writes remain authoritative, and durable write diagnostics must not be treated as task failure unless legacy Drive state also failed.
- Do not replace `watch_events` with `run_watch`. `watch_events` keeps legacy line-count cursor semantics; `run_watch` uses normalized sequence cursors and reports malformed normalized lines as diagnostics.
- This phase adds no scheduler ownership, backend adapter migration, fabricated normalized backend/step fields, non-canonical terminal event fields, or mutating run controls such as pause, resume, cancel, or intervene.

Before configuring a run — backend, inline vs. detached, commit policy, envelope path, postflight commands, resume — **load `/skill:drive`**.
