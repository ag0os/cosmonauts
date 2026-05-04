# Fleet Orchestration

Use fleet primitives to dispatch and monitor plan-linked task runs.

## Driver Tools

| Tool | Purpose |
|------|---------|
| `run_driver` | Start a task fleet for a plan using the Cosmonauts driver loop. |
| `watch_events` | Read driver run events and activity logs with cursor support. |

## Operating Rules

- Prefer `run_driver` for approved plans with task sets ready for autonomous execution.
- Use `watch_events` to monitor a run and summarize progress from observed events.
- If `run_driver` or `watch_events` is absent, do not pretend a driver run happened. State that fleet primitives are unavailable and fall back to `chain_run` or direct `spawn_agent` delegation.
- Keep delegation direct: target specialist agents such as `coding/planner`, `coding/task-manager`, `coding/coordinator`, and `coding/worker` rather than routing through a domain lead.
