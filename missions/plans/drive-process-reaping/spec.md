# Drive reaps its backend process tree

## Problem

A Drive run on 2026-08-05 (`--backend codex --mode detached`) left a `codex`
process alive 68 minutes after its own task finished, after the four subsequent
tasks finished, and after the run reached `completed` and reported success.
Nothing noticed or reaped it.

The mechanism is now established rather than hypothesised (see Evidence). It is
not the abort path and not the task timeout: it is that **a backend's contract
ends at its direct child**, while the work it starts does not.

## Evidence

Run `run-b99edc06-03a4-4a4c-b7ba-7121cdfffb81`, plan
`analysis-investigation-procedures` (event log retained under
`missions/archive/sessions/`):

- `spawn_started` TASK-549 at `2026-08-05T15:25:03.042Z`.
- `spawn_completed` TASK-549 at `2026-08-05T15:28:31.982Z`, `outcome: "success"`.
- Elapsed 3m29s against a 30-minute `DEFAULT_TASK_TIMEOUT_MS`. **The timeout
  never fired**, and `spawn_completed` is only reachable after `await
  child.exited` resolved.
- The orphan's `etime` resolves its start to 12:25:03 local; the machine is
  UTC-3, so 15:25:03Z — an exact match for `spawn_started`.
- Its parent was a plain shell: it had been reparented, so the process that
  spawned it had already exited while it had not.

Therefore the survivor was **not** the direct child of `Bun.spawn` — that one
exited and was awaited — but a descendant of it that nothing ever waited for.

Reproduced deterministically, without codex and in about one second: a script
that backgrounds a descendant with redirected stdio and then exits 0 makes the
`backend.run()` sequence resolve with `exitCode: 0` while the descendant is
still alive.

An earlier write-up blamed a `codex exec` review process killed by timeout.
That was wrong and is corrected in `memory/analysis-investigation-procedures.md`;
it is not re-derived here.

## Intent

Goal: when Drive reports that a task's backend has finished, the operating
system agrees — no process started by that backend is still running, on the
successful path as well as on abort.

Invariants — mechanism yields to these:

- **INV-1 — A settled backend leaves nothing running.** `backend.run()` does not
  resolve or reject while any process it started is still alive. "Finished"
  means the whole process tree, not the direct child.
- **INV-2 — A leak is never silent.** If the tree cannot be reaped, that is
  surfaced as an error or a warning on the run's own channels. Reaping failure
  is never reported as a clean task result.
- **INV-3 — Abort stays bounded.** Every termination path settles on a bounded
  deadline, escalating an ignored `SIGTERM` to `SIGKILL`. Correct reaping may
  not turn a bounded abort into an unbounded wait.
- **INV-4 — Signals reach the intended tree and nothing else.** A process-group
  signal is only ever sent to a group this code created and therefore leads. A
  group the signalling process merely belongs to is never signalled.
- **INV-5 — Exactly one terminal episode per attempt.** The completion path does
  not acquire the single residual `episodic-log#B-019` permits for an externally
  hard-killed fire-and-forget child.

Where liveness and completeness pull against each other, INV-3 wins: a tree that
will not die is escalated and then reported under INV-2, never waited on forever.

## In scope

Drive's process lifecycle in `lib/driver/` — the CLI backends (`codex`,
`claude-cli`), the detached runner's abort path, and the shared POSIX
process-group primitives they need.

## Out of scope

The capability/analysis surface, prompts, roadmap tracks. The
`cosmonauts-subagent` backend, which runs in-process and spawns nothing. Windows
process-tree semantics beyond mirroring the platform split the existing prior art
already makes.

## Prior art

`domains/shared/extensions/project-tools/process-runner.ts` already solves this
problem once: it spawns `detached` on POSIX, tests liveness with
`process.kill(-pgid, 0)`, refuses to settle until `childClosed &&
processTreeGone()`, and escalates a force-kill on a deadline. This plan reuses
its primitives rather than inventing a second set.

## Open questions

None blocking. One judgement call is recorded as D-003: whether a descendant that
deliberately outlives the backend is a leak or a legitimate hand-off. Drive's task
model says the task is over when the backend exits, so it is a leak.
