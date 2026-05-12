# Agent Spawning and Chains

Delegate when a fresh context or a multi-role pipeline does better than handling the work inline. Small, self-contained changes — a bug fix, one function, a config tweak — you do yourself.

## Tools

| Tool | Purpose |
|------|---------|
| `spawn_agent` | Spawn one agent (role + prompt). **Non-blocking** — returns a `spawnId`; the child runs detached; its result arrives as a `[spawn_completion] spawnId=… role=… outcome=… summary=…` follow-up turn. Stay active until every spawn has reported back. |
| `chain_run` | Run a pipeline of roles via the chain DSL — sequential (`a -> b -> c`), bracket groups (`a -> [b, c] -> d`), fan-out (`a -> b[3]`, same prompt to every instance). Returns per-stage outcomes, not the work product. |

Roles: `planner`, `spec-writer`, `plan-reviewer`, `task-manager`, `coordinator`, `worker`, `reviewer`, `security-reviewer`, `performance-reviewer`, `ux-reviewer`, `fixer`, `quality-manager`, `explorer`, `verifier`, `integration-verifier`, `refactorer`, `distiller`.

## When to delegate

- Designing across multiple files → `planner`. Approved plan → tasks → `task-manager`. Implementing a task set → `coordinator` or a chain. Merge-readiness gates → `quality-manager`. Fresh-context review → `reviewer` (+ `security-reviewer` / `performance-reviewer` / `ux-reviewer` for targeted lenses). Remediation from findings → `fixer`. Codebase mapping → `explorer`. Validating specific claims → `verifier` / `integration-verifier`. Structural changes → `refactorer`. Knowledge extraction → `distiller`.
- Named workflows wrap the common pipelines (`plan-and-build`, `implement`, `verify`, `spec-and-build`, `adapt`) — prefer them over hand-writing a chain expression. `cosmonauts --list-workflows` for the live list including project overrides.

## After a chain or spawn

A chain returns stage outcomes (and a cost summary), not the changes themselves. To know the final state — what the quality-manager changed, whether gates passed, which tasks are Done — check `task_list` and `git log`. Don't re-run a stage on a hunch that it didn't run; verify first.

For the parallel-spawning protocol, per-role prompt patterns, and chain DSL details, **load `/skill:spawning`**.
