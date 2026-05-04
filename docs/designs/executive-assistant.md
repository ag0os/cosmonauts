# Executive Assistant: Layer 3 Architecture

**Status:** Approved (Part 1) / Speculative (Part 2). Updated 2026-04-29.
**Supersedes:** the earlier daemon-first, multi-specialist-agent design previously at this path; that thinking is preserved in Part 2 (Future Phases).
**Implementation:** sliced into Plans 1, 2, 3 (and an open Plan 4) under `missions/plans/`.

## Summary

Cosmonauts gains a top-level cross-domain agent — the executive assistant — that orchestrates work across all installed domains, dispatches both internal cosmonauts agents and external CLI agents (codex, claude, gemini), and supervises long-running fleet runs in real time. The pattern is: **the script does the mechanical loop; the agent does judgment**.

This document captures the architecture in two parts:

- **Part 1 — Current commitment.** Concrete near-term work, sliced into Plans 1–3. Approved by user.
- **Part 2 — Future phases.** Speculative extensions composing on top of Part 1: autonomous daemon mode, real-time peer dialogue, specialist agents, durable inboxes, cross-plan arbitration. Not committed; recorded here so the architectural direction stays coherent if and when we reach for them.

## Three-layer picture

```
Layer 3: Executive Assistant
  - Persona: cross-domain orchestrator, fleet commander, real-time coordinator.
  - Lives in: domains/main/ as agent `cosmo`.
  - Tools: run_driver, watch_events, chain_run, spawn_agent, plan/task tools,
           plus everything any installed domain exposes.
  - Skills: dispatch, script-coordinator, fleet.

Layer 2: Domains
  - main/    NEW. Houses the executive assistant.
  - coding/  EXISTING. Cosmo retires here as the coding-domain `lead` agent.
  - shared/  EXISTING. Capability packs and base prompts; unchanged.
  - <future domains>: research, ops, etc.

Layer 1: Framework
  - Existing: chain runner, sub-agent spawning, plans/tasks, sessions, message bus.
  - New: lib/driver/ — the loop primitive (inline + detached modes), prompt
         template assembly, report parser, JSONL event stream + bus bridge,
         backend interface and adapters.
```

# Part 1 — Current Commitment

## Distillation: what the fallow-cleanup run taught us

In April 2026 we refactored cosmonauts itself across 31 tasks (PR #4, branch `fallow-temp-exceptions-cleanup`). Spawning cosmonauts sub-agents to refactor cosmonauts code was risky — children load fresh code from disk while we mutate it. The improvised solution: drive the run with `codex exec --full-auto` (a separate binary) wrapped in a bash script, with cosmo serving as the *interactive coordinator*.

Outcomes:

- 31 tasks landed across 34 commits on a single branch with all four verifications green.
- 25 successful tasks ran 1h43m wall-clock. Average ~4-5 min/task end-to-end (pre-verify + codex + post-verify + commit). Codex token budget per task ≈ 3-7 min.
- Human attention: minimal during bulk run; heavy at boundaries (debugging pre-flight; recovering from TASK-246's token-budget overrun; mis-classified outcomes).

### What the script reliably owned

1. Pre-flight verification (validate branch + run all four verifications green at HEAD).
2. Mark task in-progress.
3. Render per-task prompt = header (conventions + pre-condition + landed helpers) + `cosmonauts task view` verbatim + worker discipline + report-format spec.
4. Invoke backend (`codex exec --full-auto -o summary - < prompt`).
5. Parse OUTCOME from agent's final report.
6. **Re-verify all four independently.** Don't trust the agent — codex misclassified warnings as pass at least once.
7. Stage non-`missions`/`memory` files.
8. Commit (driver-side; codex sandbox blocks `.git/index.lock`).
9. Mark task done. Continue. Stop on first failure.

### What only the agent (cosmo) could do

| Anomaly | Manual resolution |
|---|---|
| Pre-flight already red on branch (pre-existing lint/test) | Diagnose; decide fix-and-retry vs abort. Script can only halt. |
| TASK-220 already implemented at HEAD before driver started | Driver saw "no files changed" → marked blocked. Cosmo confirmed at-HEAD state, set Done, requeued. |
| codex marked fallow as `pass` while warnings existed | Cosmo triaged: warn-level dup outside this task = OK; in-task dup = stop. |
| TASK-246 token overrun (left 18 clone groups undone) | Cosmo committed progress 1/2 by hand, hand-wrote a focused per-task prompt for the remaining 18 groups, re-ran codex, committed progress 2/2. **Per-task prompt customization is a first-class need.** |
| Sandbox blocks `.git/index.lock` | Built into the loop: driver commits. **Backend-specific** — not a universal driver assumption. |
| `gh auth` wrong account | Pure manual; no script visibility. |
| Driver script edited mid-flight | Cosmo hand-edited `DEFAULT_TASKS=` to drop already-done tasks. Queue was ad-hoc text — not derived from task graph. |

### Stable insight

The script reliably owns the *mechanical envelope* (pre-flight, prompt rendering, backend invocation, post-verify, staging, commit, status transition). The agent owns *every classification decision* — what's pre-existing vs new, what counts as scope creep, when to split a task, when to stop and ask. **This separation is the architectural seam.**

## Decision Log

- **D-1 — Cosmo's fate**
  - Decision: Repurpose. The new top-level cross-domain agent takes the name `cosmo` and lives in `domains/main/`. The existing `domains/coding/agents/cosmo.ts` becomes `domains/coding/agents/lead.ts` — the coding-domain facilitator.
  - Alternatives: Absorb (rewrite existing cosmo into the assistant); Coexist (two top-level agents).
  - Why: The executive assistant's persona is genuinely different from the existing cosmo's — cross-domain, delegation-focused, not coding-focused. Conflating them dilutes both. Repurposing preserves the `cosmo` brand identity at the top while giving the coding-domain facilitator its own clear role.
  - Decided by: user-directed.

- **D-2 — Domain home and naming for the executive assistant**
  - Decision: `domains/main/`. The agent's flag name is `-a cosmo`; default `cosmonauts` (no args) routes to the main domain's lead agent.
  - Alternatives: `domains/executive/` (matches earlier thinking in this doc and AGENTS.md), `domains/cosmo/` (agent name as domain name), `domains/orchestration/` (role-named; collides with `lib/orchestration/`), part of `shared/` (rejected — `shared/` is infrastructure, not executable agents).
  - Why: "Main" reads as "the main agent's domain" — most accurate, least corporate, broader than executive. Agent identity (`cosmo`) and domain identity (`main`) cleanly separate so the domain can host sibling agents later (monitor, daemon, reporter) without name collision.
  - Decided by: user-directed (overrides the older `executive/` proposal preserved in Part 2).

- **D-2b — Old cosmo's new name**
  - Decision: `domains/coding/agents/lead.ts`. Coding-domain lead. Aligns with the existing "domain lead" concept referenced in `lib/domains/validator.ts`.
  - Alternatives: `dev`, `coder`, `main` (reserved for the new top-level), `cosmo` (taken).
  - Why: "Lead" matches the existing concept; reads correctly when the new cosmo delegates: "delegate to the coding domain's lead."
  - Decided by: user-directed.

- **D-3 — v1 scope**
  - Decision: Build framework primitives to be domain-agnostic from day 1, ship coding-domain integration only. Other domains plug in later via the same contracts.
  - Alternatives: Coding-only abstractions; ship at least one non-coding domain as proof.
  - Why: Architectural integrity matters; coding alone proves the abstractions enough. Speculative non-coding domain is busy-work.
  - Decided by: user-directed.

- **D-3' — Driver invocation surface**
  - Decision: The driver is reachable via two front-ends sharing one TS core. (1) Pi tool `run_driver` — what the assistant uses; events stream into its session via the activityBus bridge. (2) CLI verb `cosmonauts drive` — what humans and external agents (Claude Code, Cursor, etc.) use directly. Same backends, prompt templates, event format.
  - Alternatives: Tool-only (no CLI verb); CLI-verb-only with assistant shelling out.
  - Why: Primary UX is conversational — user talks to cosmo, cosmo dispatches the driver, cosmo monitors events directly without human-in-the-middle relay (that was the bad UX of the fallow run, where the human had to read the bash log and tell cosmo what was happening). The CLI verb is a useful affordance for ad-hoc human use and non-cosmonauts agents.
  - Decided by: user-directed.

- **D-4 — Driver form factor**
  - Decision: Two modes share one TS core in `lib/driver/`. (1) **Inline mode** — `runInline()` runs the loop as a Pi tool call inside the assistant's session. Best for short loops, ad-hoc fleet calls. (2) **Detached mode** — `startDetached()` writes a `run.sh` + prompt files + JSONL event log in a workdir, `nohup`-launches the script, returns a handle. Survives session death. Robust to refactoring cosmonauts itself (script is a frozen artifact at run time). Both modes write the same event format and use the same backends.
  - Alternatives: Inline only; detached only; entirely separate codebases per mode.
  - Why: Inline is convenient and immediate; detached is durable and decoupled from session lifetime. They share enough that one core implementation makes sense.
  - Decided by: user-directed.

- **D-5 — Real-time monitoring model**
  - Decision: Mirror the existing in-process activityBus to disk for out-of-process backends. Same event schema; in-process backends use the bus directly; external backends write JSONL to a known per-run path; an in-process tailer re-publishes those events into the activityBus. Net result: the assistant sees `[spawn_completion]` follow-ups and `spawn_activity` messages identically regardless of backend transport. A `watch_events({ runId, since? })` tool exists as fallback for history scrubbing or paused runs.
  - Alternatives: Streaming subscription tool only; polling only; new bespoke event format.
  - Why: Reuses existing `lib/orchestration/message-bus.ts`, `lib/orchestration/activity-bus.ts`, the `[spawn_completion]` follow-up message mechanism (`lib/orchestration/spawn-completion-loop.ts:18`), and the orchestration extension's bridge to `pi.sendMessage(..., { deliverAs: "nextTurn" })` (`domains/shared/extensions/orchestration/index.ts:106`). Out-of-process backends become "spawning over a different transport." JSONL file is also the audit log — replaces the ad-hoc `master.log` from the fallow run.
  - Decided by: planner-proposed, user-approved.

- **D-6 — Backends to ship in v1**
  - Decision: Three adapters — `cosmonauts-subagent`, `codex` (uses `codex exec --full-auto`), `claude-cli` (uses `claude -p`). Document a "write your own adapter in 30 lines" guide for gemini, qwen, etc.
  - Alternatives: Only `cosmonauts-subagent`+`codex` (what we used); broader (gemini, generic shell).
  - Why: Three covers the working set. Each adapter is ~40 lines, mostly child-process and event-emission; the barrier to add a new one stays low.
  - Decided by: user-directed.

- **D-7 — Plan slicing**
  - Decision: Three concrete plans + one open. Plan 1 = framework primitives + cosmonauts-subagent backend + inline mode. Plan 2 = `domains/main/` + new cosmo + lead rename + CLI default routing. Plan 3 = codex + claude adapters + detached mode + bash generator + `cosmonauts drive` CLI verb. Plan 4 = open (alternative domains, additional backends, observability polish).
  - Alternatives: One large plan; different boundaries (e.g., bundle agent rename into Plan 1).
  - Why: Each plan is independently shippable; failure of any one doesn't block earlier ones from shipping. Plan 1 has no breaking changes; Plan 2 is the user-visible flip; Plan 3 unlocks the original use case.
  - Decided by: user-directed.

- **D-A through D-D — Substrate shape**
  - **D-A Driver runtime**: TS core shared between inline and detached modes. Detached mode emits a bash runner; inline runs in-process. (User-approved.)
  - **D-B Backend interface**: shell-command-template per adapter; small TS module per backend. Adapter-script escape hatch documented for niche backends. (User-approved.)
  - **D-C Prompt templates**: layered markdown files (envelope per domain, pre-condition per plan, per-task body from `cosmonauts task view`, per-task override file under workdir). No template engine; concatenation. (User-approved.)
  - **D-D Report contract**: fenced JSON in agent's final message; permissive parser falls back to `OUTCOME:`-style text matching. JSON includes `progress: { phase, of, remaining }` for partial-credit cases. (User-approved.)

## Architecture

### Module map

```
lib/driver/                                     NEW (Plan 1)
  types.ts                core types: DriverRunSpec, Report, DriverEvent
  prompt-template.ts      3-layer assembly: envelope + pre-condition + per-task
  report-parser.ts        fenced-JSON with OUTCOME-text fallback
  event-stream.ts         JSONL writer + tailer + activityBus bridge
  driver.ts               runInline() + startDetached(); shared loop core
  driver-script.ts        bash generator for detached mode (Plan 3)
  backends/
    types.ts              Backend interface
    registry.ts           name → adapter resolution
    cosmonauts-subagent.ts  Plan 1 (uses spawn_agent internally)
    codex.ts                Plan 3
    claude-cli.ts           Plan 3

cli/drive/                                      NEW (Plan 3)
  subcommand.ts           `cosmonauts drive`

domains/shared/extensions/orchestration/        EXTEND (Plan 1)
  index.ts                register run_driver, watch_events tools;
                          bridge JSONL events → activityBus
                          (already bridges activityBus → pi.sendMessage)

domains/main/                                   NEW (Plan 2)
  domain.ts
  agents/
    cosmo.ts              the executive assistant (the new top-level)
  prompts/
    cosmo.md              persona: cross-domain orchestrator, fleet commander
  skills/
    dispatch/SKILL.md
    script-coordinator/SKILL.md
    fleet/SKILL.md
  capabilities/
    fleet.md              cap pack: run_driver, watch_events tools

domains/coding/                                 RENAME + ADD
  agents/
    cosmo.ts → lead.ts    Plan 2 (rename)
  prompts/
    cosmo.md → lead.md    Plan 2 (rename)
  drivers/templates/      NEW (Plan 3)
    envelope.md           default per-task prompt envelope for coding tasks
  domain.ts               Plan 2: update lead pointer
```

### Dependency graph

```
domains/main/cosmo
       │
       │ uses (Pi tools)
       ▼
shared/extensions/orchestration  (run_driver, watch_events)
       │
       │ uses
       ▼
lib/driver/  ──uses──►  lib/orchestration/  (activityBus, spawn_agent, MessageBus)
       │
       ▼
lib/driver/backends/*   ──spawns──►  child processes (codex/claude/internal)
                                       │
                                       └─ writes ─►  JSONL event log
                                                          │
                          ┌────── tailer ────────────────┘
                          ▼
                  activityBus (re-publish in-process)
                          │
                          ▼
              pi.sendMessage(deliverAs:"nextTurn")
                          │
                          ▼
              assistant's next turn
```

Direction is inward: `lib/driver/` is domain-agnostic; domains use it via the shared orchestration extension. No domain code imports from another domain.

### Key contracts

```ts
// lib/driver/backends/types.ts
export interface BackendCapabilities {
  canCommit: boolean;                  // codex sandboxed → false
  isolatedFromHostSource: boolean;     // codex/claude → true; cosmonauts-subagent → false
}

export interface Backend {
  readonly name: string;                       // "codex", "claude-cli", "cosmonauts-subagent"
  readonly capabilities: BackendCapabilities;
  run(invocation: {
    promptPath: string;
    workdir: string;
    taskId?: string;
    eventSink: (e: DriverEvent) => void;       // backend emits start/end events
    signal?: AbortSignal;
  }): Promise<{ exitCode: number; stdout: string; durationMs: number }>;
}
```

```ts
// lib/driver/types.ts — what the agent's final message must produce
export type ReportOutcome = "success" | "failure" | "partial";

export interface Report {
  outcome: ReportOutcome;
  files: { path: string; change: "created" | "modified" | "deleted" }[];
  verification: { command: string; status: "pass" | "fail" | "not_run" }[];
  notes?: string;
  progress?: { phase: number; of: number; remaining?: string };
}
```

```ts
// lib/driver/types.ts — events on the bus and JSONL log
export type DriverEvent =
  | { type: "run_started";     runId; planSlug; backend; mode: "inline" | "detached" }
  | { type: "task_started";    runId; taskId }
  | { type: "preflight";       runId; taskId; status: "started"|"passed"|"failed"; details? }
  | { type: "spawn_started";   runId; taskId; backend }
  | { type: "spawn_activity";  runId; taskId; activity }
  | { type: "spawn_completed"; runId; taskId; report: Report }
  | { type: "spawn_failed";    runId; taskId; error }
  | { type: "verify";          runId; taskId; phase: "post"; status; details? }
  | { type: "commit_made";     runId; taskId; sha; subject }
  | { type: "task_done";       runId; taskId }
  | { type: "task_blocked";    runId; taskId; reason }
  | { type: "run_completed";   runId; summary }
  | { type: "run_aborted";     runId; reason };
```

```ts
// lib/driver/driver.ts
export interface DriverRunSpec {
  planSlug: string;
  taskIds: string[];
  backend: Backend;
  promptTemplate: { envelopePath: string; preconditionPath?: string; perTaskOverrideDir?: string };
  preflightCommands: string[];
  postflightCommands: string[];
  branch?: string;
  commitPolicy: "driver-commits" | "backend-commits" | "no-commit";
  workdir: string;
  eventLogPath: string;
}

export interface DriverHandle {
  runId: string;
  abort(): Promise<void>;
  result: Promise<DriverResult>;
}

export function runInline(spec: DriverRunSpec): DriverHandle;
export function startDetached(spec: DriverRunSpec): DriverHandle;  // Plan 3
```

```
// Pi tools registered by orchestration extension (Plan 1)
run_driver({
  planSlug,
  taskIds?,                    // default: all unblocked tasks for plan
  backend,                     // "cosmonauts-subagent" | "codex" | "claude-cli"
  mode,                        // "inline" | "detached"
  branch?,
  commitPolicy?,
  promptOverrides?,            // dir of per-task <task-id>.md overrides
}) → { runId, eventLogPath }

watch_events({
  runId,
  since?                       // monotonic cursor
}) → { events: DriverEvent[], cursor: string }
```

`watch_events` is fallback. Steady state: events arrive as `[spawn_completion]`-style follow-up messages via the existing activityBus → `pi.sendMessage(..., { deliverAs: "nextTurn" })` path, exactly like in-process spawns today.

## Plan slicing

| Plan | Slug (suggested) | Ships | Result |
|---|---|---|---|
| 1 | `driver-primitives` | `lib/driver/` core (types, prompt-template, report-parser, event-stream, inline driver) + `cosmonauts-subagent` backend + orchestration extension's `run_driver`/`watch_events` tools + JSONL→activityBus bridge | Existing cosmo can drive plans in-process. Abstraction proven. No user-visible changes outside the new tools. |
| 2 | `main-domain-and-cosmo-rename` | `domains/main/` with new cosmo agent + skills + persona; rename `coding/agents/cosmo.ts` → `lead.ts`; CLI default routing to main domain's lead | New top-level cosmo. `cosmonauts` (no args) routes to the cross-domain assistant. `cosmonauts -a lead` gets the coding facilitator. |
| 3 | `external-backends-and-cli` | `codex` + `claude-cli` adapters; detached mode; bash generator; `cosmonauts drive` CLI verb; coding-domain default envelope | Assistant fires codex/claude. Humans get `cosmonauts drive --plan X --backend codex` for direct fleet runs. |
| 4 | (open) | First non-coding domain; alternative backends; observability polish | Out of immediate scope. |

Plan 1 has no breaking changes. Plan 2 is the user-visible flip. Plan 3 unlocks the original use case. Plans 1 and 2 are independently shippable; Plan 3 depends on Plan 1 (driver core) but not Plan 2.

## Two design points to remember

**1. Inline-mode commits.** The driver does not bypass the host process when committing in inline mode. Inline runs *inside* the assistant's session — the assistant *is* the process holding `.git/index.lock`. Commits happen via subprocess (`git add`, `git commit`) just like the bash version did. Same code path; different invocation context. No special handling.

**2. Pre-flight handling.** When pre-flight fails before a task, the driver does *not* halt silently. It emits a structured `preflight` event with status `failed`, the failing command, captured stderr (~30 lines), and a `git diff --stat HEAD` snapshot. The assistant receives this as a follow-up message, decides (fix-and-retry vs abort vs ask human), and either re-invokes the driver from where it failed or escalates. This formalizes what cosmo did manually in the fallow run.

## Risks (Part 1 only)

- **Driver loops without supervision when run detached.** Runs spanning hours could consume budget without intervention. Mitigation: explicit `--max-cost`, `--max-tasks`, `--timeout` flags on `run_driver`; default ceilings; the assistant chooses whether to attach.
- **Backend reports false success.** Codex misclassified warnings as pass in the fallow run. Mitigation: post-verify is run by the driver, not the backend; backends never gate task completion; verification status in Report is informational only.
- **Per-task prompt override missing for unforeseen anomaly.** Mitigation: the driver supports a `--resume-task <id> --prompt <file>` mode. The assistant generates and writes an override file based on its judgment.
- **Inline mode dies with the session.** Long runs lose progress on session compaction or kill. Mitigation: assistant defaults to detached mode for runs above a threshold (heuristic from skill/persona); detached mode survives session death and produces a resumable artifact.
- **Multiple drivers writing to the same workdir.** File-event-log collisions, ambiguous commits. Mitigation: each run generates a fresh `runId`; workdir is `missions/sessions/<plan>/runs/<runId>/`; lock file in workdir.
- **Branch invariants violated mid-run.** A user manually pushes / rebases while the driver is on the branch. Mitigation: pre-flight re-checks branch on every iteration; aborts with a clear event if mismatch.

# Part 2 — Future Phases (Speculative)

The following extensions compose on top of Part 1 but are not committed. Recorded here so the architectural direction stays coherent if and when we reach for them. Names and shapes from this section are subject to revision when the corresponding phase is actually planned.

## Goals beyond Part 1

1. **Autonomous orchestration.** A roadmap item flows to a merged PR without a human on the keyboard, with the human receiving targeted questions only when product judgment is required.
2. **Mid-flight supervision.** An always-on agent observes running workflows and can redirect, pause, or escalate without tearing them down.
3. **Real-time dialogue between agents.** Two or more agents exchange turn-interleaved messages in a live session rather than waiting for each other to finish.
4. **Durable state.** The main agent survives process restarts, crashes, and machine reboots without losing track of what is in flight.
5. **Human steering at any time.** A well-known injection point lets the human redirect running work without killing it.

## Phase A — Daemon mode

Long-running cosmonauts process (`cosmonauts daemon`) hosting a persistent main-cosmo session. Heartbeat triggers periodic ticks; ticks may pick up roadmap items, monitor in-flight runs, surface escalations.

```
cosmonauts daemon \
  --domain main \
  --agent cosmo \
  --tick-interval 60s \
  --state-dir .cosmonauts/daemon \
  --human-channel .cosmonauts/daemon/inbox.log
```

- Persists state to `.cosmonauts/daemon/state.json`: current plan slug, in-flight run IDs, last-seen roadmap hash, pending messages.
- Reattach: `cosmonauts daemon --status`, `cosmonauts daemon --attach` for a live TUI view.
- Graceful shutdown on SIGTERM; replays pending state on restart.

## Phase B — Human steering channel

- Tail file at `.cosmonauts/daemon/inbox.log`. New lines are delivered to the main cosmo session as `pi.sendUserMessage(content, { deliverAs: "steer" })`.
- Outbound: cosmo writes status, questions, and completion reports to `.cosmonauts/daemon/outbox.log`.
- Optional future transports: socket for IDE/plugin integration; messaging bridges (Telegram, Slack, etc.).

## Phase C — Real-time peer dialogue

Today the `spawn_agent` tool is RPC-shaped: spawn, run to completion, return summary. A supervisor cannot *converse* with running work. Phase C adds peer-to-peer messaging while both agents are alive.

```ts
// lib/orchestration/peer-registry.ts
interface PeerRegistry {
  register(alias: string, pi: ExtensionAPI): void;
  unregister(alias: string): void;
  get(alias: string): ExtensionAPI | undefined;
}
```

New tools:

```
send_to_peer({ target, content, deliverAs?: "steer" | "followUp" | "nextTurn" })
wait_for_peer_message({ fromAlias?, timeoutMs })
```

Topologies:

| Shape | Topology | Use case |
|---|---|---|
| Paired dialogue | A ↔ B direct | cosmo ↔ planner roadmap disambiguation; planner ↔ plan-reviewer iterative tightening |
| Room / channel | N peers on a named channel | Panel debate on review; multi-specialist standup |

Constraint: Pi sessions are sequential internally. An agent cannot listen while talking. "Real time" means **turn-interleaved**, not simultaneous — messages arrive but are consumed at the next turn boundary or via `steer` mid-tool.

Start with paired dialogue. It is the smallest extension surface and reuses `MessageBus` unchanged.

## Phase D — Specialist agents in `domains/main/`

Part 1 ships one agent (cosmo). Phase D adds specialists cosmo can delegate to without leaving the main domain:

- `triage` — classifies roadmap items (ready, needs-clarification, blocked).
- `escalator` — writes structured questions to the human steering channel and waits for replies.
- `reporter` — periodic status summaries to the human channel.
- `monitor` — long-running observer of in-flight driver runs; surfaces anomalies to cosmo.

Each lives at `domains/main/agents/<name>.ts` with prompt and skills. Cosmo's allowlist includes them.

## Phase E — Durable inboxes

Per-session inbox at `.cosmonauts/daemon/inboxes/<sessionId>.jsonl`. `send_to_peer` writes both to the in-memory `MessageBus` (live delivery) and the inbox (durability). On daemon restart, peer sessions drain their inboxes before accepting new work.

## Phase F — Mid-flight supervision

- Cosmo subscribes to `activityBus` for running driver runs (already supported by Part 1 via `watch_events` and follow-up messages).
- `quality-manager` and `coordinator` agents gain a `notify_supervisor(reason, severity)` tool.
- Cosmo decides autonomously for low-severity (retry, reroute) and escalates high-severity to human.

## Phase G — Cross-plan arbitration and rooms

- Cosmo detects file overlap between concurrent plans and serializes or merges them.
- Room-based comms for multi-agent panel debates (reviewer specialists argue severity).
- Persistent rooms across plans for longitudinal discussions.

## Open questions for Part 2

| Question | Notes |
|---|---|
| When does daemon mode become valuable? | Only after we have a use case for autonomous roadmap-watching. If the human wants to steer every plan, daemon adds little. |
| Who owns budget ceilings — daemon or per-run? | Likely both. Per-run for cost containment; daemon for total monthly burn. |
| How does the daemon coexist with interactive cosmo on the same machine? | Daemon owns one project; interactive cosmo can attach via `cosmonauts daemon --attach` rather than spawning a new session. |
| Reattach UX for in-flight driver runs | Part 1 has `watch_events`; Phase A would add a TUI view. |
| Conflict with the `agent-messaging` roadmap item | This subsumes it: real-time comms is the broader substrate. Keep the existing item as the tactical flavor. |

## Risks (Part 2)

| Risk | Mitigation |
|---|---|
| Runaway cost | Mandatory budget ceilings per daemon-day; idle-tick short-circuit; round caps on dialogues; per-workflow cost ceilings. |
| Cascading misreads | Hard round cap on cosmo ↔ planner dialogues. Escalate to human after N autonomous retries on the same item. |
| Loop termination | Every dialogue declares an explicit halt condition (consensus token, max rounds, external judge). |
| Turn-interleaved is not real-time | Default `deliverAs: "followUp"`. Document `steer` as escape hatch only. |
| Peer registry leaks on crash | `session_shutdown` cleanup + process-exit cleanup + liveness check before dispatch. |
| Durable state schema churn | Schema version in state file; migration stubs; accept state loss for pre-1.0. |

# Cross-references

- `AGENTS.md` — Layer 3 vision statement.
- `lib/orchestration/message-bus.ts` — typed pub/sub primitive (`MessageBus`).
- `lib/orchestration/activity-bus.ts` — process-global instance with session-scoped cleanup.
- `lib/orchestration/spawn-completion-loop.ts` — `[spawn_completion]` follow-up message format and `awaitNextCompletionMessages`.
- `lib/sessions/manifest.ts` — durable per-plan session lineage manifests.
- `domains/shared/extensions/orchestration/index.ts` — existing activityBus → `pi.sendMessage` bridge.
- Plans (when written): `missions/plans/driver-primitives/`, `missions/plans/main-domain-and-cosmo-rename/`, `missions/plans/external-backends-and-cli/`.
- Reference run: `missions/archive/plans/fallow-temp-exceptions-cleanup/`, GitHub PR #4.
- Earlier prompt brief that initiated this design: `docs/designs/script-orchestration.md`.
