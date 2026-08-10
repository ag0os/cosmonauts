---
title: Drive reaps its backend process tree
status: active
createdAt: '2026-08-10T00:00:00.000Z'
updatedAt: '2026-08-10T00:00:00.000Z'
---

## Overview

Drive's CLI backends spawn `codex` / `claude` with `Bun.spawn` and await only
`child.exited`. Any descendant that outlives the direct child is orphaned
silently and `backend.run()` still resolves success — which is exactly what
happened on 2026-08-05, where a `codex` process survived its run by 68 minutes
while the run reported `completed`. This plan makes a settled backend mean a
dead process tree, on the successful path and on abort, reusing the process-group
primitives `project-tools` already ships.

See `spec.md` for the evidence chain and the ratified Intent (INV-1..INV-5).

## Current State

Three distinct defects, all live on `main` at `abb1555`:

- **The observed leak.** `lib/driver/backends/codex.ts:51` and
  `lib/driver/backends/claude-cli.ts:42` `await child.exited` and return. Nothing
  waits for or signals descendants. Confirmed by reproduction: a child that
  backgrounds a descendant with redirected stdio and exits 0 makes the sequence
  resolve in ~1s with `exitCode: 0` while the descendant lives on.
- **Abort does not reach the tree.** `signalDetachedChild`
  (`lib/driver/driver.ts:276`) sends `process.kill(pid, signal)`. `run.sh`
  `exec`s the step binary, so that pid *is* the step binary — but the backend
  process is its **child**, and POSIX kill-by-pid does not reach children. This
  path is reachable only from `abortDetachedRun`, so it is not what leaked on
  2026-08-05, but it leaks on every abort.
- **A descendant holding the pipes hangs the backend.** If a descendant inherits
  stdout/stderr, `await Promise.all([stdoutPromise, stderrPromise])` never
  resolves; `backend.run()` hangs until the 30-minute task timeout, which then
  returns `exitCode: 124` and still reaps nothing. Reproduced.

Nothing on the completion path signals anything: `stopDetachedChild` is called
only from `abortDetachedRun`.

The detection channel that originally surfaced this is gone. `vitest.config.ts`
now sets `testTimeout: 15_000` and the spawn-heavy driver suites declare 30s
budgets — correctly, because those tests were structurally over budget on a
quiet machine. A red suite no longer signals a leak and a green suite is not
evidence of none. This plan therefore asserts liveness explicitly (B-005) rather
than relying on timing.

## Design

**One shared POSIX group primitive, two consumers.** Extract
`processGroupExists` and `signalPosixProcessGroup` from
`domains/shared/extensions/project-tools/process-runner.ts` into
`lib/process/process-group.ts` and have both `project-tools` and the driver
backends use it. `project-tools` keeps its own settle/poll machinery — only the
two primitives move.

**Backends own their tree.** Each CLI backend spawns with `detached: true`,
making the child a process-group leader (verified honoured by Bun 1.2.22). After
`child.exited` resolves, the backend reaps the remaining group — `SIGTERM`, a
bounded grace, then `SIGKILL` — and only then drains stdout/stderr and returns.
Reaping before draining is what closes the pipe-hang defect: descendants holding
the pipes die, the pipes reach EOF, the drain completes.

**Abort signals the group, never a borrowed one.** `signalDetachedChild` moves to
`process.kill(-pid, …)`. This is safe under INV-4 precisely because the runner
was spawned `detached: true` and is therefore its own group leader; the driver
process never belongs to that group. The negation is applied only to a pid this
code detached — never to an arbitrary pid.

**The two group topologies do not conflict.** Once backends detach into their own
groups, an abort's group-kill of the runner's group no longer reaches them —
which is why the backend must own its own reaping regardless. The step binary
dying does not orphan the backend, because the backend is reaped by the same
process that spawned it, before it returns.

**Windows.** Mirror the split `project-tools` already makes
(`detached: process.platform !== "win32"`): on win32 the backends keep today's
direct-child-only behaviour. Recorded as a known gap (D-005) rather than
silently implied, and surfaced under INV-2.

## Behaviors

### B-001 - A settled backend leaves no live descendant
- Source: AC-001
- Context: a CLI backend's direct child exits successfully after starting a descendant that redirects its stdio and outlives it
- Action: `backend.run()` settles
- Expected: no process from that backend's group is alive when the returned promise settles; the returned `exitCode` is still the direct child's
- Seam: `lib/driver/backends/codex.ts`, `lib/driver/backends/claude-cli.ts`
- Test: `tests/driver/backends/process-reaping.test.ts` > `leaves no live descendant when the backend settles`
- Marker: `@cosmo-behavior plan:drive-process-reaping#B-001`

### B-002 - A descendant holding the output pipes cannot hang the backend
- Source: AC-002
- Context: the direct child exits but a descendant still holds the inherited stdout/stderr pipes
- Action: `backend.run()` settles
- Expected: it settles well within the task timeout rather than blocking on the drain; the direct child's output is still returned
- Seam: `lib/driver/backends/codex.ts`, `lib/driver/backends/claude-cli.ts`
- Test: `tests/driver/backends/process-reaping.test.ts` > `settles when a descendant holds the output pipes open`
- Marker: `@cosmo-behavior plan:drive-process-reaping#B-002`

### B-003 - Reaping escalates an ignored SIGTERM on a bounded deadline
- Source: AC-003
- Context: a descendant ignores `SIGTERM`
- Action: the backend reaps its group
- Expected: `SIGKILL` follows on a bounded grace and the call settles; the deadline is asserted directly, not inferred from a helper's default
- Seam: `lib/process/process-group.ts`
- Test: `tests/driver/backends/process-reaping.test.ts` > `escalates an ignored SIGTERM to SIGKILL on a bounded deadline`
- Marker: `@cosmo-behavior plan:drive-process-reaping#B-003`

### B-004 - Abort signals the runner's process group, not its pid alone
- Source: AC-004
- Context: a detached run is aborted while its step binary has a live child
- Action: `abortDetachedRun` terminates the runner
- Expected: the signal is addressed to the runner's group (negated pid) so descendants receive it; escalation order and the bounded settle of the existing abort contract are unchanged; only a pid this code spawned `detached` is ever negated
- Seam: `lib/driver/driver.ts`
- Test: `tests/driver/driver-detached.test.ts` > `escalates an ignored SIGTERM to SIGKILL so abort settles on a bounded deadline`
- Marker: `@cosmo-behavior plan:drive-process-reaping#B-004`

### B-005 - A leaked tree is reported, never silently passed
- Source: AC-005, INV-2
- Context: the group cannot be confirmed dead after escalation
- Action: the backend returns
- Expected: the failure is surfaced on the run's channels rather than folded into a clean result; the run does not present a reaping failure as a successful task
- Seam: `lib/driver/backends/*`
- Test: `tests/driver/backends/process-reaping.test.ts` > `surfaces a tree that survives escalation`
- Marker: `@cosmo-behavior plan:drive-process-reaping#B-005`

## Files to Change

- `lib/process/process-group.ts` — new; extracted POSIX primitives.
- `domains/shared/extensions/project-tools/process-runner.ts` — import the
  extracted primitives; no behavioural change.
- `lib/driver/backends/codex.ts`, `lib/driver/backends/claude-cli.ts` — detach,
  reap, then drain.
- `lib/driver/backends/bun-runtime.ts` — `BunSpawnOptions` gains `detached`.
- `lib/driver/driver.ts` — `signalDetachedChild` addresses the group.
- `tests/driver/backends/process-reaping.test.ts` — new; real processes, explicit
  30s budget.
- `tests/driver/driver-detached.test.ts` — pinned abort assertion updated for the
  negated pid.

## Risks

- **The pinned abort test breaks by construction.**
  `tests/driver/driver-detached.test.ts:824` (TASK-500 PR-001) asserts
  `kill.mock.calls.filter(([pid]) => pid === sentinelPid)`. A group signal makes
  that `-sentinelPid`. The elapsed-ms bound (2_800–8_000) must stay green and
  must stay a direct assertion. Five `@cosmo-behavior` markers live in that file;
  none may be dropped.
- **Behaviour conformance.** Seven plans seam behaviours to
  `lib/driver/driver.ts`. Re-check every one with
  `bun bin/cosmonauts plan check-artifacts <slug>`.
- **INV-5.** Adding a kill to the completion path must not convert the normal
  path into the start-only residual `episodic-log#B-019` permits.
- **Over-broad signalling.** Negating the wrong pid would signal the driver's own
  group. Mitigated by negating only pids spawned `detached` here, and asserted by
  B-004.
- **Remediation regressions.** This repo's review fixes reliably introduce new
  defects, including on five-line changes and including tests written to assert
  the bug. Budget for at least two review rounds.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Degradation / notes |
|---:|---|---|---|---|---|
| 1 | `correctness` | universal | bound | `bun run test`, `bun run lint`, `bun run typecheck` pass | hard fail |
| 2 | `artifact-conformance` | universal | bound | Every B-### (B-001–B-005) has its named test and exact marker | hard fail |
| 3 | `liveness` | plan-specific | bound | No process survives the suite: `ps` checked deliberately after the reproduction suite, since the timing signal is retired | hard fail |
| 4 | `behavior-regression` | plan-specific | bound | `plan check-artifacts` clean for all seven driver-seamed plans | hard fail |

## Implementation Order

1. **Extract the primitives.** Move `processGroupExists` /
   `signalPosixProcessGroup` to `lib/process/process-group.ts`; `project-tools`
   imports them. Pure refactor — the suite must stay green with no other change.
2. **Reproduce before fixing (B-001, B-002).** Write the failing tests first,
   with real processes and an explicit 30s budget. They must fail against
   today's backends for the stated reason, not incidentally.
3. **Reap in the backends (B-001, B-002, B-003, B-005).** Detach, reap, drain.
   Both backends, since they share the defect verbatim.
4. **Group-signal on abort (B-004).** Update `signalDetachedChild` and the pinned
   assertion together; re-verify the elapsed bound.
5. **Conformance sweep.** `check-artifacts` across the seven seamed plans, then
   the full ladder, then an independent review.

## Decision Log

- **D-001 - The leak is in the backend contract, not the abort path**
  - Decision: treat "backend awaits only its direct child" as the defect, and
    the pid-vs-group abort signal as a separate, additional defect.
  - Alternatives: fix only `signalDetachedChild` (the originally suggested
    Hypothesis A — rejected: that path is reachable only from `abortDetachedRun`,
    and the 2026-08-05 run completed successfully without ever aborting, so it
    cannot explain the observed orphan); treat it as a codex bug and wait
    upstream (rejected: the same defect exists in the `claude-cli` backend, so
    it is ours).
  - Why: the event log shows `spawn_completed` with `outcome: "success"` 3m29s
    after `spawn_started` against a 30-minute timeout, and `spawn_completed` is
    only reachable after `await child.exited` resolved. The survivor cannot have
    been the awaited child.
  - Decided by: investigation, evidence-derived, 2026-08-10

- **D-002 - Reuse the project-tools primitives rather than writing a second set**
  - Decision: extract `processGroupExists` / `signalPosixProcessGroup` into
    `lib/process/process-group.ts`; both consumers import them.
  - Alternatives: duplicate the two helpers into the driver (rejected — this
    problem is solved once in this repo and a second copy would drift); move the
    whole `process-runner` settle machinery (rejected — it is built around
    `node:child_process` streams and the backends use `Bun.spawn`; only the
    POSIX primitives are genuinely shared).
  - Why: explicit instruction to reuse the prior art, and the primitives are the
    part that is actually common.
  - Decided by: planner-proposed, 2026-08-10

- **D-003 - A descendant that outlives the backend is a leak, not a hand-off**
  - Decision: reap it.
  - Alternatives: let deliberate descendants survive (rejected — Drive's task
    model ends the task when the backend exits; there is no channel by which a
    surviving process could be owned, observed, or later stopped, so "hand-off"
    would mean "unmanaged"). `project-tools` already made this call for provider
    processes.
  - Why: consistency with the existing prior art, and INV-1.
  - Decided by: planner-proposed, 2026-08-10

- **D-004 - Reap before draining stdout/stderr**
  - Decision: reap the group after `child.exited`, then await the output
    promises.
  - Alternatives: drain first then reap (rejected — that is the pipe-hang
    defect: a descendant holding the pipes blocks the drain for the full 30-minute
    task timeout); drain with a timeout and reap after (rejected — it discards
    the direct child's tail output on a deadline that has nothing to do with the
    output).
  - Why: killing the pipe holders is what lets the drain terminate, so ordering
    fixes the hang for free rather than papering over it.
  - Decided by: planner-proposed, 2026-08-10

- **D-005 - Windows keeps today's behaviour, recorded as a gap**
  - Decision: mirror `detached: process.platform !== "win32"`; on win32 the
    backends reap only the direct child.
  - Alternatives: port the `taskkill` tree-kill from `project-tools` (deferred —
    it widens this corrective plan and no Windows Drive run exists to verify
    against); claim cross-platform coverage (rejected — INV-2 forbids a silent
    gap).
  - Why: the repo already makes exactly this split for the same reason.
  - Decided by: planner-proposed, 2026-08-10
