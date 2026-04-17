# Executive-Assistant Domain & Real-Time Agent Communication

**Status:** Investigation / proposal. No code changes yet.

## Problem

`AGENTS.md` describes a Layer 3 vision: *"always-on heartbeat that triggers domain workflows and manages long-running projects."* Today there is no mechanism to get there. Cosmonauts is a one-shot CLI: a human types a prompt, a chain runs, the process exits. There is no component that:

- Watches `ROADMAP.md` and picks items on its own.
- Survives process restarts while a long-running plan is in flight.
- Reacts to mid-execution signals (failures, quality issues, human nudges) without being killed and restarted.
- Arbitrates across plans that contend for the same files.

Layered underneath that gap is a missing substrate: **agents today can only communicate by completing.** The `spawn_agent` tool is RPC-shaped — spawn, run to completion, return summary. A supervisor cannot *converse* with running work, only dispatch and wait. For a batch scheduler that is fine. For an executive assistant it is the wrong shape.

## Goals

1. **Autonomous orchestration.** A roadmap item can flow to a merged PR without a human on the keyboard, with the human receiving targeted questions only when product judgment is required.
2. **Mid-flight supervision.** An always-on agent observes running workflows and can redirect, pause, or escalate without tearing them down.
3. **Real-time dialogue between agents.** Two or more agents can exchange turn-interleaved messages in a live session rather than waiting for each other to finish.
4. **Durable state.** The EA survives process restarts, crashes, and machine reboots without losing track of what is in flight.
5. **Human steering at any time.** A well-known injection point lets the human redirect running work without killing it.
6. **Backwards compatible.** Existing one-shot CLI, chain DSL, and workflow semantics continue to work unchanged.

## Non-Goals

- Cross-machine distribution.
- Replacing the chain runner — it remains the primitive for deterministic DAG-shaped pipelines.
- Self-modifying agents (the EA does not rewrite its own prompts or the coding domain).
- A full product-management replacement: the EA triages and executes; it does not decide product strategy.
- Security isolation beyond what child-process spawning (`docs/designs/child-process-spawning.md`) already provides.

## Current Primitives

Most of the substrate exists; the gaps are specific and named.

**Already in Pi (`@mariozechner/pi-coding-agent`):**

- `pi.events.on/emit` — in-session extension event bus.
- `pi.sendUserMessage(content, { deliverAs })` — inject messages into a running session. Modes: `steer` (interrupt mid-stream), `followUp` (queue after current tools), `nextTurn` (wait for idle).
- `pi.sendMessage({ customType, content, ... }, { triggerTurn, deliverAs })` — inject typed custom messages.
- `session.subscribe(event)` — stream `turn_start/end`, `tool_execution_*`, `message_update`, etc.
- `ctx.newSession({ parentSession, setup })` — create a child session with lineage link and a setup callback that writes to the child's `SessionManager` before the first turn.

**Already in cosmonauts:**

- `lib/orchestration/message-bus.ts` — typed pub/sub with `waitFor`.
- `lib/orchestration/activity-bus.ts` — process-global `MessageBus` instance with session-scoped cleanup.
- `domains/shared/extensions/orchestration/spawn-tool.ts` subscribes to each child session's events and rebroadcasts `tool_start/end`, `turn_start/end`, `compaction` onto the activity bus. A parent already *observes* its children in real time; it just cannot *talk back*.
- Chain runner (`lib/orchestration/chain-runner.ts`) with safety caps (`maxTotalIterations`, `timeoutMs`).
- Work lifecycle: roadmap → plan → tasks → sessions → archive → memory, with local `missions/` directory.

**What is missing:**

1. **Peer registry.** A process-wide `sessionId / alias → { pi, sendUserMessage }` map. Populated when a session starts, removed on dispose. Pi does not ship one.
2. **Outbound-message tools.** `send_to_peer(target, content)` that looks up a peer and calls `targetPi.sendUserMessage(content, { deliverAs: "followUp" })`. `wait_for_peer_message(timeoutMs)` that blocks on `messageBus.waitFor("peer_message", pred)` for agents that should pause for a reply.
3. **Daemon mode.** A long-running process with heartbeat, durable state, and a reattach story. Chains are one-shot.
4. **Durable inboxes.** Messages from running workflows and from the human have to queue somewhere the EA can drain on its next tick. In-memory `MessageBus` is process-scoped.
5. **Human steering channel.** A well-known always-open injection point (file tail, socket, stdin) plumbed through `sendUserMessage` with `deliverAs: "steer"`.
6. **Executive-assistant domain.** `domains/executive/` with agents, prompts, capabilities, and workflows.

## Proposed Design

### Real-time communication substrate

Smallest vertical extension that unlocks agent dialogue:

```ts
// lib/orchestration/peer-registry.ts
interface PeerRegistry {
  register(alias: string, pi: ExtensionAPI): void;
  unregister(alias: string): void;
  get(alias: string): ExtensionAPI | undefined;
}
```

- `pi.on("session_start", ctx => registry.register(alias, pi))` in a new `peers` extension.
- `pi.on("session_shutdown", () => registry.unregister(alias))`.

Two new tools exposed to agents whose definitions opt in:

```ts
// send_to_peer
{ target: string, content: string, deliverAs?: "steer" | "followUp" | "nextTurn" }
// → resolves peer in registry, calls targetPi.sendUserMessage

// wait_for_peer_message
{ fromAlias?: string, timeoutMs: number }
// → messageBus.waitFor("peer_message", evt => matches predicate)
```

Two shapes worth supporting:

| Shape | Topology | Use case |
|---|---|---|
| **Paired dialogue** | A ↔ B direct | EA ↔ planner roadmap disambiguation; planner ↔ plan-reviewer iterative tightening |
| **Room / channel** | N peers on a named channel | Panel debate on review; multi-specialist standup |

Start with paired dialogue. It is the smallest extension surface, reuses `MessageBus` unchanged, and lets us learn whether turn-interleaved "real time" feels useful before investing in rooms or moderation.

**Key constraint:** Pi sessions are sequential internally. An agent cannot listen while talking. "Real time" in practice means **turn-interleaved**, not simultaneous — messages arrive, but get consumed at the next turn boundary or via `steer` mid-tool.

### Executive-assistant domain

```
domains/executive/
├── domain.ts                    # Domain manifest
├── agents/
│   ├── supervisor.ts            # Watches roadmap, dispatches workflows, arbitrates across plans
│   ├── triage.ts                # Classifies roadmap items (ready, needs-clarification, blocked)
│   ├── escalator.ts             # Writes to the human steering channel when autonomous decision fails
│   └── reporter.ts              # Periodic status summaries to the human channel
├── prompts/
│   ├── supervisor.md
│   ├── triage.md
│   ├── escalator.md
│   └── reporter.md
├── capabilities/
│   └── supervision.md           # Capability pack: reading roadmap, dispatching workflows, escalation procedures
├── skills/
│   ├── roadmap-triage/SKILL.md
│   └── human-escalation/SKILL.md
└── workflows.ts                 # autonomous-roadmap, supervised-plan, etc.
```

Supervisor can spawn coding-domain agents (cross-domain spawning already works via `domain.agent` qualified IDs).

### Daemon mode

New CLI subcommand:

```
cosmonauts daemon \
  --domain executive \
  --tick-interval 60s \
  --state-dir .cosmonauts/daemon \
  --human-channel .cosmonauts/daemon/inbox.log
```

- Long-running process with a supervisor session that wakes on an interval or on filesystem events (roadmap change, inbox message).
- Persists state to `.cosmonauts/daemon/state.json`: current plan slug, in-flight workflow, last-seen roadmap hash, pending messages.
- Supports reattach: `cosmonauts daemon --status`, `cosmonauts daemon --attach` for a live TUI view.
- Graceful shutdown on SIGTERM; replays pending state on restart.

### Human steering channel

- Tail a file at `.cosmonauts/daemon/inbox.log`. New lines are delivered to the supervisor as `deliverAs: "steer"` messages.
- Mirror to a socket for IDE/plugin integration.
- Outbound: supervisor writes status, questions, and completion reports to `.cosmonauts/daemon/outbox.log`.
- Optional future transport via `channels` roadmap idea (Telegram, WhatsApp).

### Durable inboxes

- Per-session inbox at `.cosmonauts/daemon/inboxes/<sessionId>.jsonl`.
- `send_to_peer` writes to both the in-memory `MessageBus` (for live delivery) and the inbox (for durability).
- On daemon restart, peer sessions drain their inboxes before accepting new work.

## Migration Plan

### Phase 0 — Daemon shell, no real-time comms

- `cosmonauts daemon` subcommand.
- Supervisor agent that reads `ROADMAP.md`, picks the top prioritized item, runs the `plan-and-build` workflow synchronously, reports to outbox, sleeps, repeats.
- Durable state: last roadmap hash, current plan slug.
- Human steering channel: read-only for Phase 0 (supervisor reports; human edits roadmap directly).

Acceptance:

- Daemon runs a roadmap item through `plan-and-build` with zero human intervention.
- Daemon survives SIGTERM and resumes the next tick cleanly.
- Status subcommand prints current state.

### Phase 1 — Human steering channel

- Inbox tail plumbed through `pi.sendUserMessage(content, { deliverAs: "steer" })`.
- Supervisor handles steering messages: pause, prioritize, cancel, ask-back.
- Outbox receives supervisor questions that expect human answers.

Acceptance:

- Human writes "pause" to inbox → supervisor pauses current workflow.
- Human writes "prioritize item X" → supervisor reorders roadmap and picks X next.
- Supervisor writes a question to outbox when product judgment is required.

### Phase 2 — Real-time agent dialogue (paired)

- `lib/orchestration/peer-registry.ts` + `peers` extension.
- `send_to_peer` and `wait_for_peer_message` tools.
- First use case: EA ↔ planner roadmap-interpretation dialogue. Supervisor spawns a planner and converses with it to sharpen scope before committing a full `plan-and-build` run.
- Hard round cap (e.g. 5 exchanges) and escalate-to-human on cap.

Acceptance:

- A paired dialogue runs to completion or escalates on cap.
- Round cap is configurable per dialogue instance.
- Both sides' transcripts land in `missions/sessions/` lineage.

### Phase 3 — Mid-flight supervision

- Supervisor subscribes to `activityBus` for running workflows.
- `quality-manager` and `coordinator` gain a `notify_supervisor(reason, severity)` tool.
- Supervisor decides autonomously for low-severity (retry, reroute) and escalates high-severity to human.

Acceptance:

- A simulated quality-manager failure triggers supervisor → autonomous retry.
- A simulated legal-sensitive finding triggers supervisor → human escalation.

### Phase 4 — Cross-plan arbitration and rooms

- Supervisor detects file overlap between concurrent plans, serializes or merges them.
- Room-based comms for multi-agent panel debates (reviewer specialists argue severity).
- Optional: persistent rooms across plans for longitudinal discussions.

## Risks & Open Questions

| Risk | Mitigation |
|---|---|
| **Runaway cost.** Autonomous EA burns money 24/7 if wrong or chatty. | Mandatory budget ceilings per daemon-day; idle-tick short-circuit (skip tick if nothing changed); round caps on dialogues; per-workflow cost ceilings. |
| **Cascading misreads.** EA steers planner wrong → wasted implementation tokens. | Hard round cap on EA ↔ planner dialogues. Escalate to human after N autonomous retries on the same roadmap item. |
| **Loop termination.** Conversations are cyclic; chains are DAGs. | Every dialogue declares an explicit halt condition (consensus token, max rounds, external judge). No dialogue without a cap. |
| **Turn-interleaved is not real-time.** Messages arrive at turn boundaries; `steer` mid-stream is risky. | Default to `deliverAs: "followUp"`. Document `steer` as escape hatch for emergencies. Design prompts to assume turn granularity. |
| **Peer registry leaks on crash.** Dead sessions stay registered. | `session_shutdown` cleanup + process-exit cleanup + liveness check before `send_to_peer` dispatch. |
| **Human-in-the-loop UX.** Autonomy means fewer interrupts, but critical escalations must surface. | Severity taxonomy (info/warn/error/critical); critical goes to a dedicated out-of-band channel (future `channels` integration). |
| **Durable state schema churn.** Early design, rapid iteration. | Schema version in state file; migration stubs; accept state loss for pre-1.0. |
| **Reattach semantics.** What does "attach to running daemon" show? | Phase 0 shows status only (read-only); Phase 2+ shows live session transcripts via activity bus. |
| **Conflict with `agent-messaging` roadmap item.** That item targeted coordinator-loop latency. | This subsumes it: real-time comms is the broader substrate. Keep the existing item as the tactical flavor; this is the strategic one. |

## Recommendation

Do not build real-time comms first. Build the daemon first.

Without a daemon there is nowhere to run the EA, and without an EA there is nothing using real-time comms. Reversing the order produces a beautiful conversation substrate with no supervisor to use it.

Ship Phase 0 (daemon shell) before anything else. It exercises the full roadmap → plan → build → archive loop autonomously using today's chain runner unchanged. If that works end-to-end without surprises, Phases 1-4 become incremental additions to a working autonomous system rather than speculative investments in infrastructure for a use case that does not exist yet.

The real-time communication work (Phase 2) is the piece that turns the EA from a batch scheduler into an actual executive assistant — but it pays off only once the EA exists to converse with.
