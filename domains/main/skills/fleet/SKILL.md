---
name: fleet
description: Dispatch and monitor plan-linked task fleets with driver primitives, falling back to direct delegation when unavailable.
---

# Fleet

Use `run_driver` for approved plans with ready tasks when the driver tools are available.

1. Confirm the plan slug and target task set.
2. Start the run with `run_driver`.
3. Use `watch_events` to monitor progress and summarize observed state.
4. Escalate blockers to the user or route them to a specialist.

If `run_driver` or `watch_events` is unavailable, say so and fall back to `chain_run` or direct `spawn_agent` delegation. Do not claim fleet execution occurred without a driver run ID.
