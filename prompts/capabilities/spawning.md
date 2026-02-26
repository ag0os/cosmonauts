# Agent Spawning and Chains

Tools for delegating work to other agents.

## Orchestration Tools

| Tool | Purpose |
|------|---------|
| `chain_run` | Run a chain of agent stages (e.g. `"planner -> task-manager -> coordinator"`) |
| `spawn_agent` | Spawn a single agent session with a given role and prompt |

Available roles for `spawn_agent`: `planner`, `task-manager`, `coordinator`, `worker`.

## When to Delegate

**Work directly** when:
- The change is small and self-contained (a bug fix, a single function, a config tweak).
- The work can be completed without needing a separate context window.

**Delegate** when:
- The work involves designing a solution across multiple files and components -- spawn a `planner`.
- An approved plan needs to be broken into tasks -- spawn a `task-manager`.
- Multiple tasks need to be implemented by workers -- spawn a `coordinator` or run a chain.
- The task is large enough that a focused worker with a clean context would do better.

**Run a chain** when:
- The full pipeline is needed: plan, create tasks, implement. Use `chain_run` with `"planner -> task-manager -> coordinator"`.
- Part of the pipeline is already done (e.g., plan exists): use a shorter chain like `"task-manager -> coordinator"`.

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

The task-manager creates atomic tasks in `forge/tasks/`.

### Running a full chain

```
chain_run(expression: "planner -> task-manager -> coordinator")
```

Runs the complete pipeline: design, task creation, and implementation.

### Spawning a worker directly

For a single, well-defined task:

```
spawn_agent(role: "worker", prompt: "Implement COSMO-007. [full task content including ACs]")
```
