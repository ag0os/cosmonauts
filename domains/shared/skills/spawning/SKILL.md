---
name: spawning
description: Delegating work to other agents — spawn_agent mechanics, the parallel-spawning protocol, chain DSL (sequential, bracket groups, fan-out), per-role prompt patterns, and how to read what a chain ran. Use when spawning a planner/worker/reviewer/etc., running or designing a chain, fanning out parallel work, or making sense of a chain's result. Do NOT load for ordinary one-off coding tasks or Drive runs (see /skill:drive).
---

# Spawning and Chains

Two tools, `spawn_agent` (one agent, fire-and-forget) and `chain_run` (a pipeline of roles in one call). Named workflows wrap the common chains — prefer `cosmonauts --workflow <name>` or `chain_run` with a workflow's expression over hand-writing topology.

## How spawn_agent works

`spawn_agent` is **non-blocking**. It returns immediately with `{ "status": "accepted", "spawnId": "<uuid>" }` — an acknowledgement, not the agent's result. The child runs in the background as a detached process.

When the child finishes, the result is delivered to you as a follow-up user message in the next turn:

```
[spawn_completion] spawnId=<id> role=<role> outcome=<success|failed> summary=<brief text>
```

- `spawnId` — matches the ID returned by `spawn_agent`
- `role` — the role of the agent that ran
- `outcome` — `success` if it completed normally, `failed` if it errored or was terminated
- `summary` — what the agent did, or why it failed

Each completion triggers a new turn. Stay active — do not exit — until every spawn has reported back.

## When to work directly vs. delegate

**Directly** when the change is small and self-contained (a bug fix, a single function, a config tweak) and doesn't need a separate context window. You can also do *small* reviewing, planning, or fixing yourself — delegation is about scale and clean context, not role purity.

**Delegate** when:
- Designing a solution across multiple files → `planner`
- An approved plan needs breaking into tasks → `task-manager`
- Multiple tasks need implementing → `coordinator`, or a chain
- A branch needs merge-readiness verification (lint/format/review/fixes) → `quality-manager`
- You need a fresh-context review of current changes → `reviewer` (or a targeted lens: `security-reviewer`, `performance-reviewer`, `ux-reviewer`)
- You need a focused remediation pass from findings → `fixer`
- You need deep codebase exploration with a clean context → `explorer`
- You need pass/fail evidence on specific claims → `verifier` / `integration-verifier`
- You need a structural-only change → `refactorer`
- You need knowledge extracted from completed work → `distiller`
- The task is large enough that a focused worker with a clean context would do better

## Chain DSL

```
chain_run(expression: "planner -> task-manager -> coordinator -> integration-verifier -> quality-manager")
```

Pure topology — it declares which roles run in what order. Loop behavior is intrinsic to each role (`coordinator` loops until all tasks are Done; others run once).

**Bracket groups** — two or more roles run concurrently at the same stage; all must finish before the next stage starts:

```
chain_run(expression: "planner -> [task-manager, reviewer] -> coordinator")
```

**Fan-out** — N instances of one role in parallel. **All instances get the same prompt** — it does not partition work. Use it for independent parallel passes (e.g. redundant review), not for distributing a workload:

```
chain_run(expression: "coordinator -> reviewer[3]")
```

Optional `prompt` injects a user objective into the first stage; `completionLabel` (e.g. `plan:my-plan`) scopes the chain's completion checks; `thinkingLevel` sets a chain-wide default.

Safety caps are global, not per-stage: `maxTotalIterations` (default 50), `timeoutMs` (default 30 min). For implementation batches of roughly four or more tasks, prefer `/skill:drive`; long coordinator loops can exhaust the shared chain deadline while waiting on worker dispatches.

### Named workflows

| Name | Chain | When |
|------|-------|------|
| `plan-and-build` | `planner → plan-reviewer → planner → task-manager → coordinator → integration-verifier → quality-manager` | Full pipeline with adversarial plan review |
| `implement` | `task-manager → coordinator → integration-verifier → quality-manager` | From an existing approved plan |
| `verify` | `quality-manager` | Review + remediation on existing changes |
| `spec-and-build` | `spec-writer → planner → plan-reviewer → planner → task-manager → coordinator → integration-verifier → quality-manager` | Interactive spec capture then reviewed build |
| `adapt` | `planner → task-manager → coordinator → integration-verifier → quality-manager` | Planner studies a reference codebase path and adapts patterns |

`cosmonauts --list-workflows` shows the live list including project-level overrides.

## Per-role prompt patterns

Give each spawned agent everything it needs in the prompt — it starts with a clean context.

```
spawn_agent(role: "planner", prompt: "Design an authentication system for this Express app. Requirements: JWT tokens, refresh token rotation, bcrypt password hashing.")

spawn_agent(role: "task-manager", prompt: "Break the following approved plan into tasks:\n\n[paste plan content]")

spawn_agent(role: "worker", prompt: "Implement COSMO-007. [full task content including ACs]")

spawn_agent(role: "explorer", prompt: "Explore the authentication module in lib/auth/. Map the module structure, key types, and how sessions are managed.")

spawn_agent(role: "verifier", prompt: "Validate these claims:\n1. All tests pass (bun run test)\n2. Lint passes (bun run lint)\n3. Typecheck passes (bun run typecheck)")

spawn_agent(role: "quality-manager", prompt: "Run lint/format checks, review against main, and orchestrate fixes until merge-ready.")
```

## Parallel-spawning protocol

When multiple independent tasks are ready, spawn them all before waiting for any result — `spawn_agent` is non-blocking, so the spawns run concurrently:

```
# Wave 1: spawn all ready tasks
spawn_agent(role: "worker", prompt: "Implement TASK-010...")   # → { status: "accepted", spawnId: "abc-123" }
spawn_agent(role: "worker", prompt: "Implement TASK-011...")   # → { status: "accepted", spawnId: "def-456" }
spawn_agent(role: "worker", prompt: "Implement TASK-012...")   # → { status: "accepted", spawnId: "ghi-789" }

# Summarize and wait:
# "Spawned 3 workers (TASK-010/abc-123, TASK-011/def-456, TASK-012/ghi-789). Waiting for completions."

# --- follow-up turn ---
# [spawn_completion] spawnId=abc-123 role=worker outcome=success summary=TASK-010 done, added validation middleware
# Verify TASK-010 is Done, check ACs, find newly unblocked tasks, spawn Wave 2...
```

Rules:
1. Spawn all ready tasks first, summarize, then wait — don't interleave spawning and waiting.
2. Each completion arrives as a separate follow-up turn. Process one at a time.
3. After each completion, re-evaluate the task graph: newly unblocked tasks become the next wave.
4. Stay active until all spawns have reported back and all tasks are resolved.

## Reading what a chain ran

`chain_run` returns **stage outcomes**, not the work product — e.g. `Chain completed (…) — task-manager: ok, coordinator: ok, integration-verifier: ok, quality-manager: ok`, plus a cost summary. It does not tell you what the quality-manager changed or what a reviewer found. To learn the final state, inspect it directly: `task_list` for task statuses and ACs, `git log` / `git diff` for what landed, task notes for per-task detail. Don't re-spawn a stage because the result looked terse — verify it didn't run before assuming so.

## Related skills

- `/skill:drive` — the Drive loop (`run_driver`), backends, commit policy, detached runs
- `/skill:task` — task status and acceptance-criteria discipline
- `/skill:plan` — plan lifecycle and approval expectations
