# Autonomy / Always-On — Forward Architecture & Roadmap

**Status:** Forward source of truth for Cosmonauts autonomy and always-on
capabilities. Companion to the `autonomy` roadmap entry. **Absorbs**
`heartbeat`, `executive-assistant`, `channels`, and the autonomy half of
`ambient-cosmo`; its detailed herdr design remains in
`docs/designs/cosmo-ambient-assistant.md`. Last updated 2026-09-13.

## Purpose

Let a domain or agent declare “wake on this schedule, event, or condition” and
have a durable host invoke work cost-efficiently and safely. Autonomy decides
when work begins and how an execution host remains available. Orchestration
decides how a run graph executes to an honest terminal state.

The two tracks may converge on one long-lived host process, but they retain
distinct authorities and persisted state: the orchestration run store owns node
attempts; the episodic log owns autonomy wake-state, audit, and memory.

## Decision Log

- `D-001 - Shared host is a target, not shipped substrate`
  - Decision: Evolve toward one long-lived process capable of hosting both
    autonomy triggers and orchestration scheduling. W1 remains the already
    ratified in-process, config-gated host; daemon/process form is later.
  - Alternatives: Claim the current schedulers already form one host; build two
    unrelated daemons immediately.
  - Why: One eventual host reduces lifecycle duplication without overstating
    current integration or blocking the safe incremental host.
  - Decided-by: autonomy planning; amended 2026-09-13 by codex from the
    independent architecture review and human-accepted 2026-09-14 (derived).

- `D-002 - Host sharing does not merge state authority`
  - Decision: Orchestration's `RunStore` remains authoritative for graphs,
    attempts, leases, activity, deadlines, cancellation, and terminal state.
    The episodic log remains authoritative for trigger wake-state, autonomy
    audit, and memory. Integration uses explicit commands/events, not shared
    record mutation.
  - Alternatives: Put wake-state in run records; let the autonomy host renew
    leases or terminalize steps; use one undifferentiated durable store.
  - Why: Trigger scheduling and attempt execution have different invariants and
    recovery semantics even if one process hosts both.
  - Decided-by: codex-proposed from the independent architecture review, 2026-09-13;
    human-accepted 2026-09-14 (derived: an implementer may amend it on the
    record).

- `D-003 - Execution heartbeat vocabulary belongs to orchestration`
  - Decision: Autonomy calls its empty-cycle optimization `skip-empty wake`,
    `dedup`, and `silent acknowledgement`. `Heartbeat` is reserved for the
    execution ownership signal defined by orchestration liveness.
  - Alternatives: Reuse heartbeat for both useful wake cycles and attempt lease
    renewal.
  - Why: Ownership, execution activity, host availability, and an empty wake are
    different facts and must remain distinguishable in evidence and policy.
  - Decided-by: codex-proposed from the independent architecture review, 2026-09-13;
    human-accepted 2026-09-14 (derived: an implementer may amend it on the
    record).

- `D-004 - Autonomy triggers runs; orchestration owns coordinator loops`
  - Decision: A wake handler may request a spawn, Chain, Drive, or future graph
    run through public orchestration control. Scheduler-owned coordinator loops,
    descendant lifecycle, deadlines, and cancellation stay in
    `orchestration-future.md` Waves A through C.
  - Alternatives: Let the autonomy host directly supervise node attempts or
    claim it delivers durable coordinator loops as a side effect.
  - Why: One execution authority prevents competing leases, deadlines, and
    terminal-state writers.
  - Decided-by: codex-proposed from the independent architecture review, 2026-09-13;
    human-accepted 2026-09-14 (derived: an implementer may amend it on the
    record).

## Boundary Model

| Zone | Responsibility | Must not own |
|---|---|---|
| Trigger declarations | Describe interval, one-shot, event-wait, or always-on wake intent | Run attempts or scheduler state |
| Autonomy host | Evaluate triggers, remain available, invoke orchestration control, and record wake outcomes | Backend launch, attempt leases, execution deadlines, or graph transitions |
| Autonomy wake-state and audit | Episodic trigger cursor, dedup state, action audit, and memory linkage | Materialized run graph or attempt truth |
| Orchestration control/runtime | Start and execute runs; own graph nodes, attempts, descendants, liveness, cancellation, and terminal state | Trigger declaration policy or autonomy trust tier |
| Governance and channels | Apply trust, caps, escalation, and human steering to autonomous actions | Direct store mutation or privileged scheduler access |

Boundary rules:

- A wake handler invokes public orchestration commands; it does not call a
  backend or write run state directly.
- `autonomy-host` must consume the `execution-liveness` attempt contract before
  sharing process lifecycle. It must not introduce a second heartbeat, lease,
  deadline, or cancellation model.
- Event-wait wakes consume durable events or status transitions; they do not
  poll arbitrary filesystem artifacts as synchronization.
- A shared future process does not imply one schema or store. Each subsystem
  writes only through its owning interface.
- Attached and Pi-hosted coordinators use the same orchestration control
  boundary; autonomy does not privilege a coordinator harness.

## Current Architecture

- The active `missions/plans/autonomy-host/` W1 design selects an in-process
  host, disabled by default, with interval, one-shot, event-wait, and always-on
  trigger concepts plus durable wake-state.
- The durable orchestration scheduler and file-backed run store already exist,
  but attempt liveness is being amended by the active `execution-liveness` plan.
- The episodic log is the memory/audit substrate used by autonomy; it is not the
  orchestration run store.
- No daemon currently provides cross-session survival, and no shared host
  lifecycle or durable coordinator-loop integration has shipped.

## Target Architecture

### Layer A — Scheduling and lifecycle

- **Triggers:** interval/cron, one-shot delay, durable event/condition wait, and
  always-on re-arm.
- **Host spectrum:** in-process first, then child/detached, then daemon when
  survival across coordinator restarts is required.
- **Wake-state:** episodic cursor and evidence survive restart without becoming
  run-attempt state.
- **Wake handler:** invokes a declared payload through orchestration control.
  Skip-empty wakes, deduplicate work, and acknowledge silence cheaply.
- **Declaration model:** agents or domains declare triggers in a validated,
  pluggable, opt-in schema.

### Layer B — Autonomy governance

- **Trust tiers:** automatic for reversible/low-stakes work,
  act-then-announce, and reserved actions that require human confirmation.
- **Audit:** the episodic log records wake decisions and external actions.
- **Caps:** budget ceilings, round limits, and escalation after bounded retries.
- **Steering:** an always-open injection/interrupt point where future channels
  such as Telegram or WhatsApp can attach as transports.

### Shared host relationship

The target may be one process with two services:

- orchestration service — execute a materialized run graph to terminal; and
- autonomy service — decide when to request runs and keep trigger evaluation
  alive.

The services communicate through control/event contracts and retain separate
stores and ownership. Daemon form is shared infrastructure; durable coordinator
loops remain an orchestration capability, not an autonomy deliverable.

## Forward Waves

- **W1 — In-process scheduling/lifecycle substrate** *(active
  `autonomy-host` plan).* Config-gated triggers, episodic wake-state,
  cost-efficient wake handler, and declaration model. First payloads are memory
  dreaming and periodic result checks. Any overlap with active attempt lifecycle
  waits for `execution-liveness`.
- **W2 — Daemon host.** Long-lived process, restart recovery, detach/reattach,
  and explicit orchestration/autonomy service boundaries.
- **W3 — Governance.** Trust tiers, audit, caps, escalation, and steering.
- **W4 — Executive assistant.** Always-on supervisor of Cosmonauts work through
  orchestration control, with cross-plan arbitration and agent messaging.
- **W5 — Ambient assistant.** Herdr-backed terminal supervisor; observation and
  action phases remain independently shippable.
- **Transports — `channels`.** External steering and notification adapters over
  the governance channel.

## Open Decisions

- Trigger-declaration schema and whether its registry lives with agent
  definitions, domain manifests, or a separate configuration surface.
- Exact process/control protocol when W2 combines the autonomy and orchestration
  services.
- How much of the reserved trust tier is hard-block versus confirmed proceed.
- Retention boundaries between wake audit evidence and long-term memory.

## Plan Links

- Active W1: `missions/plans/autonomy-host/`.
- Attempt-lifecycle prerequisite: `missions/plans/execution-liveness/`.
- Orchestration host/control direction:
  `missions/architecture/orchestration-future.md` and the `drive-envelope`
  roadmap item.
- Episodic wake-state and memory:
  `missions/architecture/knowledge-and-memory.md`.
- Ambient consumer: `docs/designs/cosmo-ambient-assistant.md`.

## Consolidation Ledger

- Absorbs ROADMAP ideas `heartbeat` (renamed as trigger/wake behavior),
  `executive-assistant`, and `channels`.
- Folds in the autonomy half of `ambient-cosmo`; retains its herdr consumer
  design separately.
- Shares a future host process—but not attempt or wake-state authority—with
  `orchestration-future.md`.
- Cross-links rather than absorbs `agent-messaging`, memory's episodic log, and
  orchestration's durable coordinator-loop work.
