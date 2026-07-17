# Autonomy / Always-On — Forward Architecture & Roadmap

**Status:** Forward source of truth for cosmonauts' autonomy / always-on
capability — the base that lets agents run on a schedule, wake periodically, react
to events, or stay always-on, plus the governance that makes autonomous action
safe. Companion to the `autonomy` roadmap entry. **Absorbs** `heartbeat`,
`executive-assistant`, `channels`, and the autonomy half of `ambient-cosmo` (its
detailed herdr design stays in `docs/designs/cosmo-ambient-assistant.md`).
**Shares one long-lived host + durable store** with the orchestration durable
runtime (`orchestration-future.md`). Last updated 2026-06-12.

## The basic idea

A domain or agent should be able to declare *"wake me every morning / X times /
when this completes / stay always-on,"* and have a durable host fire it —
cost-efficiently, with state carried across wakes, and (when it acts on the world)
under a trust model. The **same substrate** powers memory "dreaming," periodic
result-checks, the executive assistant, and the ambient terminal assistant.

## Two layers

- **Layer A — scheduling/lifecycle substrate** (the base). Domain-agnostic;
  everything sits on it.
- **Layer B — autonomy governance.** Only for agents that *act on the world*.
  Dreaming and periodic checks need almost none of it; EA and ambient need all.

## Layer A — scheduling/lifecycle substrate

- **Triggers:** interval/cron ("every N", "X times") · one-shot delay ("check back
  in 1h") · **event/condition wait** (block on a status/result, *not* polling) ·
  always-on loop (re-arms).
- **Lifecycle host (a spectrum):** in-process (dies with the session — fine for
  dreaming/periodic *within* a run) → child/detached → **daemon** (survives
  restarts, durable state — required for true always-on).
- **Durable wake-state:** what it remembers across wakes + restarts **is the
  episodic log** — reuse agent-memory, don't invent a second store.
- **Wake handler:** runs a payload (spawn / chain / Drive / consolidation job).
  Cost-efficient: **skip empty cycles, dedup, silent-ack** (the `heartbeat` value).
- **Declaration model:** agents/domains *declare* their triggers (in the agent
  definition / domain manifest); the host fires them — pluggable, opt-in, the same
  shape as the memory interface.

## Layer B — autonomy governance (acting agents)

- **Trust tiers:** auto (reversible/low-stakes) · act-then-announce · reserved
  (irreversible — pause + surface). From the ambient design, generalized off herdr.
- **Audit log = the episodic memory** (one log, three roles: audit trail +
  wake-state + memory).
- **Caps:** budget ceilings, round limits, escalate-to-human after N retries.
- **Steering channel:** an always-open human injection/interrupt point — where
  `channels` (Telegram/WhatsApp/…) plug in as transports.

## The shared host (common ancestor with orchestration)

The orchestration durable runtime already owns a scheduler + file-backed run store
+ `runId`. Orchestration-future defers **scheduler-form** (in-proc/child/daemon)
and **durable-coordinator-loops** — that is the *same host* this track needs.
Division of labor:

- **Orchestration = the "what":** execute a run-graph to terminal.
- **Autonomy = the "when / stay-alive":** decide when to start runs, keep a process
  breathing, wake on time/event; invoke chains/Drive/spawns.

**One long-lived host + one durable store, shared.** Building this track delivers
orchestration's deferred `scheduler-form`/daemon + `durable-coordinator-loops` from
the always-on angle. Two daemons would be the duplication to avoid.

## Forward waves

> **W1 picked up 2026-07-17** as the active spec-ready plan
> `missions/plans/autonomy-host/` (with `episodic-log` as the wake-state
> dependency and `memory-consolidation` as the first payload), per the
> agent-memory ◆reassess decision: in-process host, config-gated off by
> default. W2+ remain unprioritized.

- **W1 — Scheduling/lifecycle substrate (Layer A)** *(active slice → `autonomy`)*.
  Trigger types + in-process host + durable wake-state (episodic) + cost-efficient
  wake handler + agent/domain trigger declaration. **Pi-First audit** on
  timers/background first. First payloads: memory "dreaming" (memory W4) + periodic
  result-checks — lightest governance.
- **W2 — Daemon host.** Long-lived process: survives restarts, durable state,
  detach/reattach. Promotes the host up the spectrum. Shared with orchestration
  `scheduler-form`.
- **W3 — Autonomy governance (Layer B).** Trust tiers + audit log + caps +
  escalate-to-human + steering channel.
- **W4 — Executive assistant.** Always-on supervisor of *Cosmonauts* work: watches
  `ROADMAP.md`, runs chains/Drive, handles failures, reports. A + B +
  `agent-messaging` (real-time). Cross-plan arbitration (serialize plans touching
  the same files).
- **W5 — Ambient assistant (`ambient-cosmo`).** herdr-backed supervisor of the
  *whole terminal*; A + B + a `herdr` capability + memory playbooks (phase 3).
  Detailed design: `docs/designs/cosmo-ambient-assistant.md`. Phases 1–2 (observe,
  act) are independently shippable.
- **Transports — `channels`.** External steering/notification (Telegram/WhatsApp)
  on the steering channel.

## Intersection map

- **↔ Orchestration:** shared daemon / `scheduler-form` / `durable-coordinator-loops`.
  Decide one host (lean: same process).
- **↔ Memory:** the episodic log is the autonomy audit trail **and** agent-memory's
  episodic facet **and** the wake-state — one log, three roles. "Dreaming" (memory
  W4) is the first payload.
- **↔ `agent-messaging`** (own roadmap item, cross-linked): push comms for EA
  real-time + orchestration coordinator loops.
- **Pi-First:** audit Pi session-state / `pi.appendEntry()` / pi-skills + any
  timer/background primitive before building the loop.

## Open decisions

- Host form for W1: in-process timers first vs. jump to a daemon.
- Is the autonomy host literally the orchestration scheduler process, or a sibling
  sharing the store? (Lean: same process.)
- Trigger-declaration schema and where it lives (agent definition vs. domain
  manifest vs. a registry).
- How much of the reserved tier is hard-block vs. confirm-and-proceed under full
  autonomy.

## Consolidation ledger

- **Absorbs ROADMAP ideas:** `heartbeat` (→ Layer A trigger), `executive-assistant`
  (→ W4), `channels` (→ transports).
- **Folds in** the autonomy half of `ambient-cosmo` (→ W5); the detailed herdr
  design is retained in `docs/designs/cosmo-ambient-assistant.md` as the consumer
  spec.
- **Shares host/store** with `orchestration-future.md` (`scheduler-form`,
  `durable-coordinator-loops`).
- **Cross-links (not absorbed):** `agent-messaging` (shared substrate);
  agent-memory's episodic facet (the log); "dreaming" (memory W4 payload).
