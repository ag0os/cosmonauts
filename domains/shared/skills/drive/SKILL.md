---
name: drive
description: Dispatch and monitor Cosmonauts driver runs. Use when running approved plan-linked task batches with run_driver, watch_events, or cosmonauts drive; choosing inline vs detached, backend, commit policy, resume, status, or list. Do NOT load for ordinary chain/spawn delegation, plan writing, or one-off coding tasks.
---

# Drive

Use Drive for approved plan-linked task batches where a mechanical loop should render prompts, run a backend, verify, update task state, emit events, and commit according to policy.

## Rules

- Do not start Drive until the plan is approved and the task set is clear.
- Do not claim Drive execution happened unless `run_driver` or `cosmonauts drive` returns a `runId`.
- Pass ordered `taskIds` when dependency order matters. The default task selection is all non-Done tasks labeled `plan:<slug>`.
- Keep runs observable: record the `runId`, `planSlug`, `workdir`, and `eventLogPath`; monitor with `watch_events` or `cosmonauts drive status`.
- Backends execute prompts; the driver owns task status transitions, event logging, configured postflight verification, and commits when `commitPolicy` is `driver-commits`.
- Drive injects run expectations into each prompt: backend, branch, commit policy, preflight commands, and postflight commands. These expectations are the authority for what the backend should verify and whether it should commit.
- Drive appends a mandatory report contract after the envelope/task content so custom envelopes cannot omit the machine-readable `outcome:` marker instructions.
- Treat backend success reports as evidence, not proof. Prefer postflight checks — whatever verification commands the project actually has (tests, static checks, build, dead-code gates — only those that exist for this stack). If a backend emits only prose, Drive can infer success from passing postflight checks; without those objective checks it blocks as `report outcome unknown`.
- Default per-task timeout is 1800000ms (30 minutes). For unusually long cold E2E suites, slow external backends, or tasks expected to iterate on multiple failures, set `taskTimeoutMs` / `--task-timeout` explicitly higher (for example 3600000ms / 60 minutes).
- Use `driver-commits` unless there is a concrete reason for `backend-commits` or `no-commit`.

## Choose the Frontend

| Frontend | Use When |
|----------|----------|
| `run_driver` | You are inside an agent session with the orchestration tool available. |
| `watch_events` | You need to inspect or resume monitoring an existing run from its JSONL event log. |
| `cosmonauts drive` | A human or external agent is launching or managing runs from the shell. |

If the tools are unavailable, say so and fall back to `chain_run` or direct `spawn_agent` delegation.

## Choose Mode and Backend

| Context | Recommended Choice |
|---------|--------------------|
| Short in-session run with Cosmonauts agents | `backend: "cosmonauts-subagent"`, `mode: "inline"` |
| External CLI agent run | `backend: "codex"` or `"claude-cli"`, usually `mode: "detached"` |
| Long-running or self-modifying repository work | `mode: "detached"` so the frozen runner survives session death and source edits |

`cosmonauts-subagent` is not supported in detached mode. In the Pi tool path, external backends are for detached mode. Detached runs copy `bin/cosmonauts-drive-step` when present; otherwise they compile a frozen per-run binary from the Cosmonauts package source.

## Agent Tool Workflow

1. Confirm `planSlug`, ready task IDs, target branch, backend, mode, and commit policy.
2. Identify the repository's actual verification commands — whichever the project uses (e.g. tests, static-analysis, build/e2e split, format/lint check). Pass those exact commands as `postflightCommands`; do not rely on the default envelope to guess them, and don't add commands for steps the project doesn't have.
3. Omit `envelopePath` to use the bundled codebase-agnostic coding envelope shipped with Cosmonauts. Pass `envelopePath` (relative to the project root, or absolute) only when the project ships its own envelope — never pass the `bundled/...` path yourself; that directory lives inside the Cosmonauts package, not the project.
4. Start the run with `run_driver`.
5. Monitor with `watch_events({ planSlug, runId, since })`; preserve the returned cursor.
6. If the run blocks or aborts, summarize the observed event and route the next action to the right specialist.

Example:

```ts
run_driver({
  planSlug: "auth-system",
  taskIds: ["COSMO-010", "COSMO-011"],
  backend: "codex",
  mode: "detached",
  branch: "feature/auth",
  commitPolicy: "driver-commits",
  // envelopePath omitted — uses the bundled codebase-agnostic envelope
  // Replace these placeholders with the target repo's actual verification commands.
  postflightCommands: ["<test command>", "<static-analysis command>"],
  partialMode: "stop",
  taskTimeoutMs: 3600000 // 60 minutes for unusually long E2E or slow external backends
})
```

## CLI Workflow

```bash
cosmonauts drive run --plan auth-system --backend codex --mode detached --branch feature/auth
cosmonauts drive status run-abc --plan auth-system
cosmonauts drive list
cosmonauts drive run --plan auth-system --resume run-abc
```

The CLI emits JSON natively; do not pass `--json`. Status values are `completed`, `blocked`, `aborted`, `running`, `dead`, or `orphaned`. A run directory contains `spec.json`, `task-queue.txt`, `events.jsonl`, and state files: `run.completion.json` for terminal outcomes, `run.pid` for detached activity, and `run.inline.json` for inline activity. Resume reuses the previous workdir and refuses a dirty worktree unless `--resume-dirty` is passed.

Codex runs as `codex --yolo exec ...` by default so Drive backends can use the network, bind local ports, and modify the worktree. Set `COSMONAUTS_DRIVER_CODEX_YOLO=0` to opt back into Codex's sandboxed `codex exec --full-auto` mode. Advanced pass-through is also available with `COSMONAUTS_DRIVER_CODEX_ARGS` for top-level Codex args before `exec` and `COSMONAUTS_DRIVER_CODEX_EXEC_ARGS` for args after `exec`. Both env vars accept shell-style words or a JSON string array.

Claude runs as `claude --dangerously-skip-permissions -p` by default for the same reason. Set `COSMONAUTS_DRIVER_CLAUDE_SKIP_PERMISSIONS=0` to opt out, or use `COSMONAUTS_DRIVER_CLAUDE_ARGS` for pass-through before `-p`. The env var accepts shell-style words or a JSON string array.

## Common Problems

- **Active run already exists.** Monitor the existing `runId`; do not start a competing run for the same plan.
- **Preflight or postflight failed.** Stop, summarize the failing command and stderr, then fix or route remediation before resuming.
- **Report outcome unknown.** The backend did not emit the structured JSON/`OUTCOME:` marker. If postflight checks were configured and passed, Drive may infer success; otherwise inspect the worktree and rerun with a prompt override that asks for the final marker, or manually update the task when you have independent evidence.
- **Partial task result.** Treat it as blocked progress. Add a focused prompt override or split the remaining work before rerunning.
- **Detached backend rejected.** Use `codex` or `claude-cli`; `cosmonauts-subagent` is inline-only.
- **Codex sandbox blocks e2e/build gates.** Codex defaults to YOLO in Drive. If you opted out with `COSMONAUTS_DRIVER_CODEX_YOLO=0`, `--full-auto` is still sandboxed and may block sockets/network; re-enable YOLO or move incompatible checks to host-side verification.
- **Status says `dead` or `orphaned`.** Inspect `events.jsonl` and resume with `--resume <runId>` after deciding whether the worktree is safe. Pass `--resume-dirty` only when the local changes are expected.

## Related Skills

- `/skill:task` — task status and acceptance criteria discipline
- `/skill:plan` — plan lifecycle and approval expectations
