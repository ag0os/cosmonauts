## Purpose

Nothing in cosmonauts can currently happen unless a human (or a run they
started) is actively driving. The autonomy substrate changes that premise:
an agent or domain declares its wake conditions, and a host fires them —
on an interval, after a delay, on an event/condition, or as a re-arming
always-on loop — with state carried across wakes and without wasteful or
noisy empty cycles. It is deliberately domain-agnostic plumbing: the same
substrate later powers the executive assistant and ambient Cosmo, and it
satisfies the orchestration runtime's deferred scheduler-form seam from the
always-on side (one host, not two daemons).

Per the 2026-07-17 ◆reassess decision this ships as infrastructure,
**in-process only** (wakes live and die with a running cosmonauts process)
and **off by default**: with the gate closed, no timer is ever armed. The
proof target is the dreaming loop: a declared trigger firing the
`memory-consolidation` payload end-to-end.

## Users

- **Agent/domain authors** — declare triggers in their agent definition or
  domain manifest ("consolidate memory nightly", "re-check this result in an
  hour") without writing scheduling code.
- **The human running a long-lived cosmonauts process** — observes scheduled
  work happening, can list what is armed, when it last fired, and what
  happened; can flip one config switch to turn all of it off (or on).
- **The consolidation job** (sibling plan) — the first real payload.
- **Future consumers (out of scope, shape-setting):** periodic result-checks,
  the executive assistant, ambient Cosmo, orchestration coordinator loops.

## User Experience

**Disabled (default):** no triggers arm, no timers exist, nothing about a
session or run changes. The gate is one documented master config flag.

**Declaring:** a trigger is declared where the agent/domain is defined, in the
four vocabulary forms: interval/cron ("every N"), one-shot delay ("in 1h"),
event/condition wait (fires when a condition is met — not busy-polling), and
always-on loop (re-arms after each wake).

**Enabled, process running:** declared triggers arm when the process starts
and fire their payloads (spawn / chain / Drive / the consolidation job) at the
declared times. Each consequential wake leaves an episode record — the
episodic log is the wake-state, so "what did the host do and why" is answered
the same way as any other memory question.

**Cost discipline (the `heartbeat` value):** a wake that finds nothing to do
is skipped silently — no user-facing noise, no episode spam, no payload cost.
Duplicate pending wakes dedup. The human never sees a stream of empty ticks.

**Observability:** the human can ask the CLI what is armed, when each trigger
last fired, and each wake's outcome (fired / skipped-empty / failed).

**Failure:** a payload that crashes is recorded (status + episode), the host
survives, and a bounded retry policy applies before the trigger reports
failure and waits for its next natural firing. A payload failure never kills
the process that hosts it.

**Stopping / restarting:** killing the process disarms everything cleanly.
On next start with the gate open, triggers re-arm and read their durable
wake-state from the episodic log — an interval trigger knows it already fired
today. (Surviving *without* a running process is the daemon — the explicit
next rung, not this plan.)

## Acceptance Criteria

- With the gate closed (default), starting sessions and runs arms nothing:
  no timers, no background activity, behavior identical to today.
- With the gate open, a declared interval trigger fires its payload the
  declared number of times in a long-running process, and each firing leaves
  an episode record naming trigger, payload, and outcome.
- The dreaming loop demonstrably works end-to-end: a declared trigger fires
  the `memory-consolidation` payload against a store with episodes, and the
  consolidation report/results are observable afterwards.
- An empty wake cycle (nothing to do) produces no user-visible output and no
  episode record.
- A deliberately failing payload: the host survives, the failure is visible
  in the CLI status and as an episode, and the bounded retry policy is
  observable.
- The CLI lists armed triggers with last-fired time and last outcome.
- Restarting the process re-arms declared triggers and respects prior
  wake-state (a fired one-shot does not fire again; an interval trigger
  honors its schedule across the restart).
- Trigger declaration, the vocabulary, the gate, and the wake-state contract
  are documented.

## Scope

Included:
- The four trigger forms and the declaration model (agent definition / domain
  manifest).
- The in-process lifecycle host: arm on start, fire, disarm on exit.
- Durable wake-state on the episodic log (no second store).
- Skip-empty / dedup / silent-ack wake handling and bounded retries.
- CLI observability of triggers and outcomes.
- The master config gate, off by default.
- A Pi-First audit on timers/background primitives as the opening step
  (standing rule; the docs mandate it for this track explicitly).

Excluded:
- **The daemon host (autonomy W2)** — surviving process restarts / detach and
  reattach. Contracts here must make that a promotion, not a rewrite, but no
  daemon is built.
- Governance (trust tiers, caps, steering channel — autonomy W3); v1 payloads
  are the lightest-governance kind (dreaming, checks on machine state).
- Executive assistant, ambient Cosmo, channels/transports.
- Orchestration's durable-coordinator-loops themselves — this plan delivers
  the shared host seam they will use, not the loops.

## Assumptions

- "In-process" means any long-lived cosmonauts process can host armed
  triggers (interactive session or a dedicated run); which process forms host
  by default is a planner decision inside that constraint.
- The condition-wait trigger's v1 event sources are internal (run/task/plan
  state), not external webhooks.
- Wake-state granularity: the host derives "have I fired / found work" from
  episode records it wrote, not from a parallel bookkeeping file. If the
  planner finds episodes too coarse for exact re-arm math, any auxiliary
  state must still live inside the episodic store's conventions.
- The `episodic-log` flag and this gate are separate switches (log can be on
  without any autonomy), but the host requires the log — opening the
  autonomy gate with the log disabled is a configuration error surfaced
  clearly, not a silent partial mode.

## Open Questions

- Declaration schema and its home: agent definition vs domain manifest vs
  both (an open decision named in the source-of-truth doc).
- Is the host the orchestration scheduler process or a sibling sharing the
  store? The doc leans "same process" — the planner should confirm against
  the current durable-runtime code rather than re-litigate on paper.
- Retry policy shape: fixed small N with backoff, or per-trigger declared?
- What, if anything, of the always-on loop form is worth demonstrating in v1
  beyond interval + one-shot + condition (the loop is the least-needed form
  until a real always-on consumer exists)?
