---
source: archive
plan: drive-process-reaping
distilledAt: 2026-08-14
---

# Drive reaps its backend process tree

## What Was Built

Drive's CLI backends (`codex`, `claude-cli`) now spawn their child into its own
POSIX process group and reap that group before returning, so a settled backend
means a dead process tree rather than a dead direct child. The detached runner's
abort path signals the runner's *group* instead of its pid, and a signalled
runner reaps its backend group before dying. Shared primitives live in
`lib/process/process-group.ts`, extracted from the runner `project-tools`
already shipped.

## Key Decisions

- **The defect was the backend contract, not the abort path** (D-001). Both
  stated hypotheses going in were wrong. The event log settled it: the leaking
  task ran 3m29s against a 30-minute timeout and emitted `spawn_completed` with
  `outcome: "success"` — reachable only *after* `await child.exited` resolved.
  The survivor therefore could not be the awaited child; it was a descendant
  nothing ever waited for.
- **Reap before draining stdout/stderr** (D-004). A descendant inheriting the
  pipes keeps them from EOF, so draining first blocks until the task timeout.
  Killing the pipe holders is what lets the drain finish — the ordering *is* the
  mechanism, and it needs no deadline.
- **A descendant outliving the backend is a leak, not a hand-off** (D-003).
  Drive's task model ends the task when the backend exits; there is no channel
  by which a survivor could be owned, observed, or later stopped.
- **The backend must reap itself even on abort** (D-006). Detaching the backend
  into its own group means an abort — which signals the *runner's* group — no
  longer reaches it, and a signalled runner never reaches its own reap. The
  runner therefore installs termination handlers that reap live backend groups.
- **Ship the reap; withdraw the speculative hardening** (D-010, human-decided).
  Behaviors B-007/B-008 are withdrawn, not deleted — see Gotchas.

## Patterns Established

- **Negate only a pid you spawned `detached`.** `kill(-pid, …)` is safe exactly
  because the target leads its own group; a pid you merely share a group with
  would signal yourself. Every negation site in this work satisfies that by
  construction, and a test asserts no *other* group is ever signalled.
- **Reaping helpers are bounded by construction**: SIGTERM → grace → SIGKILL,
  with grace values validated against `NaN`/`Infinity`/negative so "bounded"
  is literally true.
- **`processGroupExists`/`signalPosixProcessGroup`** live in `lib/process/` and
  are shared by the driver backends and `project-tools`. Do not grow a second
  copy.
- **Windows keeps direct-child-only behaviour** (D-005), mirroring the split
  `project-tools` already makes. Recorded as a gap rather than silently implied.

## Files Changed

- `lib/process/process-group.ts` — new; POSIX group primitives plus bounded
  `reapProcessGroup`.
- `lib/driver/backends/cli-process.ts` — new; the shared spawn/reap/drain path
  and the active-group registry both CLI backends use.
- `lib/driver/backends/{codex,claude-cli}.ts` — reduced to argv construction;
  the process lifecycle moved to `cli-process.ts`.
- `lib/driver/driver.ts` — `signalDetachedChild` addresses the group;
  escalation gated on the group emptying, not the leader exiting.
- `lib/driver/run-step.ts` — SIGTERM/SIGINT handlers that reap backend groups,
  plus an unref'd hard-exit backstop.
- `tests/driver/backends/process-reaping.test.ts` — new; drives the real
  backends inside a real `bun` process.

## Gotchas & Lessons

- **A green suite is not evidence that nothing leaked.** This leak was
  originally found only because orphan load pushed driver tests over vitest's
  old 5s default. That signal is gone (15s global, 30s driver budgets). Check
  `ps` deliberately.
- **`Bun.spawn` honours `detached: true`** (verified on 1.2.22), and its
  `Subprocess` exposes `pid`. But every pre-existing backend test stubs `Bun`
  wholesale, so reaping is untestable there — the real-process tests shell out
  to `bun` and read back what the backend observed at settle.
- **Bounding an `await` is not bounding a resource.** A `Promise.race` deadline
  whose losing timer is never cleared keeps Bun's event loop alive; the same is
  true of an abandoned-but-uncancelled pipe read. This cost two review rounds:
  a signalled runner lingered ~2s past its work, straight through the driver's
  own 2s SIGKILL deadline.
- **Partial output is more dangerous than empty output.** Returning a truncated
  stdout on a drain timeout could report a *failed* task as successful:
  `parseReport` only honours a **closed** ` ```json ` fence, so truncated text
  falls through to the bare `outcome:` line scan and an early
  "outcome: success" wins over the fenced failure that would have overridden it.
  Empty yields `unknown`, which fails safe.
- **Test the SIGTERM-ignoring sentinel the way the repo already does.**
  `bash -c 'trap "" TERM; sleep 60'` does *not* survive a group SIGTERM — the
  sleep is signalled directly, bash's wait returns, and bash exits normally. It
  must respawn its sleep in a loop. And it must signal readiness before the
  parent exits: the reap fires ~30ms later, which readily beats `trap` being
  installed, silently turning escalation tests into a coin flip.
- **Know when to stop hardening.** Four independent review rounds each found
  real defects, but after the first they were *all* in the hardening around a
  `setsid()`-escaping descendant — a case never observed here and not handled on
  `main` either — at roughly one new defect per round. The final decision
  (D-010) was to withdraw B-007/B-008 and ship only the reap, whose six
  behaviors each have a verified negative control. Accepted gaps are written
  down: a session-escaping descendant holding a pipe can stall the drain, a
  stalled event sink is awaited unbounded, and teardown reaps a single snapshot.
- **Withdraw behaviors, don't delete them.** `check-artifacts` recognises
  `*(withdrawn by D-###, date — reason)*` on the heading with all fields intact.
  Note the annotation is parsed as a `*(…)*` span, so an inner `)` — e.g.
  writing `setsid()` — breaks it.
