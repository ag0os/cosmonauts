---
title: Drive smoke-test fixes (2026-05-12)
status: active
createdAt: '2026-05-12T19:33:13.887Z'
updatedAt: '2026-05-12T19:33:13.887Z'
---

## Overview

A downstream smoke test (billio, 2026-05-12) surfaced three Drive defects. This plan
fixes all three, each with regression coverage that would have caught the bug. None of
the fixes change a tool's parameter schema; one enriches `watch_events`' text output
(the structured `details` payload is unchanged).

## Current State

- **Task IDs** — `TaskManager.createTask` reads all task files, calls `generateNextId`
  (max + 1), then writes the new file, with no lock. Two `createTask` calls interleaving
  (e.g. a parallel `task_create` tool batch) both observe the same max and allocate the
  same ID. Confirmed by reading `lib/tasks/task-manager.ts:96-151` + `lib/tasks/id-generator.ts`.
- **watch_events** — `tailEvents` already returns `{ events, cursor }` and the tool puts
  it in `details`, but the model-visible `content` text is only
  `"Read N driver event(s); cursor M"`. Pi surfaces `content`, not `details`, to the
  model, so the driving agent sees counts only and cannot summarize progress as the
  system prompt asks. Confirmed in `domains/shared/extensions/orchestration/watch-events-tool.ts`.
- **External backends' cwd** — `runBackend` (`lib/driver/run-one-task.ts:258-268`) passes
  `workdir: spec.workdir` to `backend.run` and never passes `projectRoot`. `claude-cli`
  and `codex` spawn with `cwd: invocation.workdir`, i.e. the run-artifacts dir
  `missions/sessions/<plan>/runs/<runId>/` — not the repo. So `cat design/README.md`,
  `git ls-files design/`, and `git status` all run scoped to that subdir and legitimately
  report "no design/ directory" — the model's claim was true relative to its (wrong) cwd,
  not a hallucination. `cosmonauts-subagent` spawns with `cwd: deps.cwd` (the project
  root), which is why it was unaffected. Confirmed in `lib/driver/backends/{claude-cli,codex,cosmonauts-subagent}.ts`.

## Design

### Issue 1 — Atomic task ID allocation

Wrap the create critical section (load tasks → allocate ID → write file → bump
`lastIdNumber` in config) in a process-and-filesystem lock. Reuse the existing
`tryCreateLock`/lock-file pattern from `lib/driver/lock.ts` (extract a small generic
`withLock(lockPath, fn)` helper, or add `acquireTaskCreateLock`) rather than inventing a
new mechanism. The lock file lives at `missions/tasks/.create.lock` (or
`.cosmonauts/task-create.lock`). An in-process async mutex alone would fix the realistic
parallel-tool-batch case but not cross-process; the file lock covers both. After taking
the lock, re-read tasks so the allocation sees any task another writer just created.

Regression test: fire N (e.g. 8) `createTask` calls concurrently against one TaskManager
(and a second test with N separate TaskManager instances over the same dir), assert N
distinct IDs and N task files.

### Issue 2 — watch_events returns event payloads in its text output

Change the tool's `content` text to include the events themselves, capped: render up to
K (e.g. 30) most recent events as compact one-liners (`type` + key fields:
`task_blocked`→`reason`, `driver_activity`→`activity.summary`/`toolName`, `preflight`/
`verify`→`status`+`command`, `commit_made`→`sha`+`subject`, etc.), with a
`(+M earlier events; pass since=<cursor-before-window> to see them)` note when truncated.
Keep `details` exactly as is (no API shape change) and keep the cursor line. Update the
tool `description` to say it returns event payloads.

Regression test: write a JSONL log with a mix of event types including `task_blocked`
with a reason and `driver_activity` with a summary; call the tool; assert the `content`
text contains the block reason and the activity summary, the cursor advances, and a
`since`-paged second call returns only the newer events.

### Issue 3 — External backends run in the project root; driver double-checks "missing file" blocks

Two parts:

1. **Fix the cwd.** Add `projectRoot` to `BackendRunInvocation` (already on
   `DriverRunSpec`); `runBackend` forwards `spec.projectRoot`. `claude-cli` and `codex`
   spawn with `cwd: invocation.projectRoot`. Run artifacts (codex `-o summary`, etc.)
   keep using `invocation.workdir` for output paths. `cosmonauts-subagent` already uses
   the project root — no change beyond accepting the new field.

2. **Structural mitigation for false "missing input" blocks.** Hardening the envelope
   prompt ("check the filesystem, not git") is unreliable on its own — say so. Instead,
   when a backend reports a blocked/failure outcome whose reason names a path that the
   driver can see on disk under `projectRoot`, the driver does not silently accept it: it
   re-emits the `task_blocked`/`spawn_failed` event annotated with
   `contradicted: { path, existsOnDisk: true }` and (config-gated, default on) retries the
   task once with an appended note ("`<path>` exists at `<abs path>`; read it directly").
   Scope guard: only a single retry, only when the reason text contains a path-like token
   that resolves to an existing file/dir, to avoid loops. Also tighten the envelope
   `Failure Protocol`: a block must quote the actual command and output it relied on.

Regression test: a fake backend whose first run blocks with
`"design/README.md does not exist"` and whose second run succeeds; with the file present
on disk, assert the driver retries once and the task ends Done; with the file genuinely
absent, assert no retry and the task ends Blocked. Plus a unit test that
`runBackend`/the backends receive `cwd === projectRoot`.

## Implementation Order

1. **Issue 1** — atomic task-create lock + concurrency regression tests.
2. **Issue 2** — `watch_events` payload-rendering + tests + description update.
3. **Issue 3** — `projectRoot` plumbed through `BackendRunInvocation`; `claude-cli`/`codex`
   cwd fix; driver "contradicted block" detection + single retry; envelope `Failure
   Protocol` tightening; tests.

## Risks

- **Issue 1**: a stale lock file (crashed writer) must be broken — reuse `isProcessAlive`
  from `lib/driver/lock.ts`. Keep the critical section tiny to minimize contention.
- **Issue 2**: don't bloat the text output — cap event count and per-event length; the
  full payload stays in `details`.
- **Issue 3**: the retry must be strictly bounded (one attempt, path-must-exist) or a
  backend that always blocks on a real file would loop. Path extraction from free-text
  reasons is heuristic; false negatives (no retry) are acceptable, false positives
  (spurious retry) are not — bias conservative. Changing `cwd` for external backends is a
  behavior change for anyone relying on the old (arguably broken) behavior — call it out
  in the commit.
