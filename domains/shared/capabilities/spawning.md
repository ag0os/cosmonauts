# Agent Spawning and Chains

Tools for delegating work to other agents.

## Orchestration Tools

| Tool | Purpose |
|------|---------|
| `chain_run` | Run a chain of agent stages (e.g. `"planner -> task-manager -> coordinator -> quality-manager"`) |
| `spawn_agent` | Spawn a single agent session with a given role and prompt (non-blocking) |

Available roles for `spawn_agent`: `planner`, `task-manager`, `coordinator`, `worker`, `quality-manager`, `reviewer`, `fixer`, `explorer`, `verifier`.

## How spawn_agent Works

`spawn_agent` is **non-blocking**. It returns immediately with:

```json
{ "status": "accepted", "spawnId": "<uuid>" }
```

The child agent runs in the background as a detached process. The tool return value is **not** the agent's result — it is only an acknowledgement that the spawn was accepted.

### Completion messages

When a child agent finishes, the result is delivered to you as a follow-up user message in the next turn:

```
[spawn_completion] spawnId=<id> role=<role> outcome=<success|failed> summary=<brief text>
```

- `spawnId` — matches the ID returned by `spawn_agent`
- `role` — the role of the agent that ran
- `outcome` — `success` if the agent completed normally, `failed` if it errored or was terminated
- `summary` — a brief description of what the agent did or why it failed

Each completion triggers a new turn. You must stay active (do not exit prematurely) until all spawned agents have reported back.

## When to Delegate

**Work directly** when:
- The change is small and self-contained (a bug fix, a single function, a config tweak).
- The work can be completed without needing a separate context window.

**Delegate** when:
- The work involves designing a solution across multiple files and components -- spawn a `planner`.
- An approved plan needs to be broken into tasks -- spawn a `task-manager`.
- Multiple tasks need to be implemented by workers -- spawn a `coordinator` or run a chain.
- A branch needs merge-readiness verification (lint/format/review/fixes) -- spawn a `quality-manager`.
- You need a fresh-context review of current changes -- spawn a `reviewer`.
- You need a focused remediation pass from findings -- spawn a `fixer`.
- You need deep codebase exploration with a clean context -- spawn an `explorer`.
- You need to validate specific claims about the codebase (tests pass, interface exists, etc.) -- spawn a `verifier`.
- The task is large enough that a focused worker with a clean context would do better.

**Run a chain** when:
- The full pipeline is needed: plan, create tasks, implement, and verify. Use `chain_run` with `"planner -> task-manager -> coordinator -> quality-manager"`.
- Part of the pipeline is already done (e.g., plan exists): use `"task-manager -> coordinator -> quality-manager"`.
- You only need final quality/review/remediation for existing changes: use `"quality-manager"`.
- You want parallel steps at the same stage: use bracket groups, e.g., `"planner -> [task-manager, reviewer] -> coordinator"`.
- You want multiple instances of the same role running in parallel: use fan-out, e.g., `"coordinator -> reviewer[3]"`. **Fan-out sends the same prompt to every instance — it does not partition work or assign different tasks to each.**

## How to Delegate

### Spawning a planner

```
spawn_agent(role: "planner", prompt: "Design an authentication system for this Express app. Requirements: JWT tokens, refresh token rotation, bcrypt password hashing.")
```

The planner explores the codebase, designs the solution, and produces a plan document.

### Spawning a task-manager

```
spawn_agent(role: "task-manager", prompt: "Break the following approved plan into tasks:\n\n[paste plan content]")
```

The task-manager creates atomic tasks in `missions/tasks/`.

### Running a full chain

```
chain_run(expression: "planner -> task-manager -> coordinator -> quality-manager")
```

Runs the complete pipeline: design, task creation, implementation, and quality verification.

### Parallel steps with bracket groups

```
chain_run(expression: "planner -> [task-manager, reviewer] -> coordinator")
```

Bracket groups run two or more roles concurrently at the same pipeline stage. All roles in the group must complete before the next stage starts.

### Fan-out: multiple instances of the same role

```
chain_run(expression: "coordinator -> reviewer[3]")
```

Spawns N instances of the same role in parallel. **All instances receive the same prompt — fan-out does not partition work or assign different tasks to each instance.** Use it for independent parallel passes (e.g., redundant review), not for distributing a workload.

### Spawning a worker directly

For a single, well-defined task:

```
spawn_agent(role: "worker", prompt: "Implement COSMO-007. [full task content including ACs]")
```

### Spawning an explorer

For deep codebase exploration without modifying anything:

```
spawn_agent(role: "explorer", prompt: "Explore the authentication module in lib/auth/. Map the module structure, key types, and how sessions are managed.")
```

### Spawning a verifier

For validating specific claims with pass/fail evidence:

```
spawn_agent(role: "verifier", prompt: "Validate these claims:\n1. All tests pass (bun run test)\n2. Lint passes (bun run lint)\n3. Typecheck passes (bun run typecheck)")
```

### Spawning quality-manager directly

For post-implementation quality gates:

```
spawn_agent(role: "quality-manager", prompt: "Run lint/format checks, review against main, and orchestrate fixes until merge-ready.")
```

## Parallel Spawning Pattern

When multiple independent tasks are ready, spawn them all before waiting for any result. Because `spawn_agent` is non-blocking, you can issue all spawns in sequence and they run concurrently:

```
# Wave 1: spawn all ready tasks
result_a = spawn_agent(role: "worker", prompt: "Implement TASK-010...")
# returns { status: "accepted", spawnId: "abc-123" } immediately

result_b = spawn_agent(role: "worker", prompt: "Implement TASK-011...")
# returns { status: "accepted", spawnId: "def-456" } immediately

result_c = spawn_agent(role: "worker", prompt: "Implement TASK-012...")
# returns { status: "accepted", spawnId: "ghi-789" } immediately

# Summarize spawns and wait:
# "Spawned 3 workers (TASK-010/abc-123, TASK-011/def-456, TASK-012/ghi-789). Waiting for completions."

# --- follow-up turn arrives ---
# [spawn_completion] spawnId=abc-123 role=worker outcome=success summary=TASK-010 done, added validation middleware

# Process: verify TASK-010 is Done, check ACs, find newly unblocked tasks, spawn Wave 2...
```

**Key rules for parallel spawning:**
1. Spawn all ready tasks first, summarize, then wait — do not interleave spawning and waiting.
2. Each completion arrives as a separate follow-up turn. Process one at a time.
3. After each completion, re-evaluate the task graph: newly unblocked tasks become the next wave.
4. Stay active until all spawned agents have reported back and all tasks are resolved.
