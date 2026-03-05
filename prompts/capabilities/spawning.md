# Agent Spawning and Chains

Tools for delegating work to other agents.

## Orchestration Tools

| Tool | Purpose |
|------|---------|
| `chain_run` | Run a chain of agent stages (e.g. `"planner -> task-manager -> coordinator -> quality-manager"`) |
| `spawn_agent` | Spawn a single agent session with a given role and prompt |

Available roles for `spawn_agent`: `planner`, `task-manager`, `coordinator`, `worker`, `quality-manager`, `reviewer`, `fixer`.

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
- The task is large enough that a focused worker with a clean context would do better.

**Run a chain** when:
- The full pipeline is needed: plan, create tasks, implement, and verify. Use `chain_run` with `"planner -> task-manager -> coordinator -> quality-manager"`.
- Part of the pipeline is already done (e.g., plan exists): use `"task-manager -> coordinator -> quality-manager"`.
- You only need final quality/review/remediation for existing changes: use `"quality-manager"`.

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

### Spawning a worker directly

For a single, well-defined task:

```
spawn_agent(role: "worker", prompt: "Implement COSMO-007. [full task content including ACs]")
```

### Spawning quality-manager directly

For post-implementation quality gates:

```
spawn_agent(role: "quality-manager", prompt: "Run lint/format checks, review against main, and orchestrate fixes until merge-ready.")
```
