# Orchestration — Forward Architecture & Roadmap

**Status:** Forward source of truth for where the orchestration system is going.
**Supersedes**
`docs/designs/child-process-spawning.md`, `docs/designs/script-orchestration.md`,
and the forward "Out of Scope / Post-Production" items in
`missions/architecture/durable-orchestration-runtime.md` (which remains the
historical Wave-1/2 record). Last updated 2026-09-13.

## Purpose

Define the durable boundaries and delivery order for evolving Cosmonauts from
linear chains and task-driven runs into a graph-first orchestration system that
can later support adaptive agent swarms without introducing a second runtime.

This is the one place the orchestration future lives. The roadmap should carry
only the next plannable orchestration slice; later slices remain here until they
are ready to promote.

## Decision Log

- `D-001 - One graph execution substrate`
  - Decision: Target one durable run-graph execution substrate for Chains,
    Drive, declared graphs, and swarms. A swarm is not a separate execution
    engine. Current inline coordinator chains, detached `spawn_agent`, and the
    spawn compiler (deleted 2026-09-23 as unused; re-created when spawn moves
    onto the graph substrate) are migration exceptions, not evidence that this
    boundary has shipped.
  - Alternatives: Maintain independent graph and swarm runtimes; keep dynamic
    spawning outside durable orchestration.
  - Why: One substrate gives every orchestration mode the same attempts, leases,
    cancellation, events, artifacts, recovery, and control semantics.
  - Decided-by: human architecture dialogue, 2026-09-11. Amended 2026-09-13 by
    codex from the independent review and human-accepted 2026-09-14 (derived):
    the current-exceptions sentence. Amended 2026-09-23 by human ruling
    (relayed by the supervising session; framework-health D-040): the spawn
    compiler's deletion is recorded in that sentence, in the migration
    inventory and in Shipped substrate.

- `D-002 - Authoring and coordination modes remain distinct`
  - Decision: Chain, Drive, declared-graph, swarm, and script-coordinated modes
    keep their own user-facing concepts and compile or materialize work through
    shared graph contracts.
  - Alternatives: Collapse every mode into one generic authoring API; let each
    mode own its own scheduler and persistence model.
  - Why: The modes express different intent—role topology, task policy,
    declarative control flow, adaptive coordination, or external scripting—while
    their execution requirements are shared.
  - Decided-by: human architecture dialogue, 2026-09-11.

- `D-003 - Graph control precedes swarm coordination`
  - Decision: Stabilize node execution, then add declared graph control, then
    controlled graph expansion, and only then build swarm coordination on top.
  - Alternatives: Build read/opinion swarms directly on `spawn_agent`; build a
    live-model coordinator before the graph can represent its decisions.
  - Why: Swarms need durable topology, routing, child ownership, and evidence.
    Building those as swarm-only mechanisms would create a parallel runtime.
  - Decided-by: human architecture dialogue, 2026-09-11.

- `D-004 - Predeclared routing is the first branching model`
  - Decision: The first router nodes—whether implemented by code or an agent—may
    select only declared outgoing edge identifiers. The scheduler validates and
    persists the selection; routers never mutate scheduler state directly.
  - Alternatives: Begin with registered subgraph expansion; allow agents to add
    arbitrary nodes and edges immediately.
  - Why: Predeclared routing is inspectable, resumable, statically validatable,
    and sufficient to prove branches and bounded loops before topology becomes
    dynamic.
  - Decided-by: human accepted planner recommendation, 2026-09-11.

- `D-005 - Code stages are registered durable operations`
  - Decision: A pure-code graph stage references a registered, versioned
    operation with serializable inputs and outputs. Persisted graphs never embed
    process-local closures.
  - Alternatives: Store arbitrary callbacks in graph nodes; route all non-agent
    work through shell commands.
  - Why: Registered operations can be validated, reconstructed after restart,
    tested independently, and hosted somewhere other than the creating process.
  - Decided-by: human accepted planner recommendation, 2026-09-11.

- `D-006 - Dynamic topology is append-only and policy-controlled`
  - Decision: After predeclared routing, add registered subgraph-template
    expansion before open swarm expansion. Materialization and routing decisions
    are durable, append-only facts with provenance and policy validation.
  - Alternatives: Rewrite the original graph in place; let a coordinator call
    backend or store internals directly.
  - Why: Append-only decisions preserve replay, auditability, fencing, and an
    explanation of how the runtime reached its current topology.
  - Decided-by: human accepted planner recommendation, 2026-09-11.

- `D-007 - Liveness is a universal node-attempt contract`
  - Decision: Every executing graph node has separate lease, useful-activity,
    and host-availability signals; bounded settlement-based cancellation;
    attempt fencing; persisted execution identity/evidence; an absolute hard
    ceiling on every attempt, enforced in every mode; and shadow/enforce idle
    policy. Hard-ceiling and idle policy are set in project configuration
    only; the hard ceiling defaults to four hours. Only the idle deadline is
    shadowable. Only the current unsuperseded token may mutate lifecycle
    state. Lease expiry is health evidence, not automatic authority to replace
    an unconfirmed mutating attempt.
  - Alternatives: Add timeouts only to chain stages or Quality Manager; treat
    process heartbeat as proof of execution progress; leave the hard ceiling
    optional, or make it shadowable with idle.
  - Why: A node that can remain `running` forever makes every higher-level mode
    non-durable. Lease liveness and execution progress answer different
    questions and must not mask each other. A shadow-default idle deadline
    alone cannot end a silent attempt that keeps its lease, so the ceiling is
    the backstop that makes termination unconditional.
  - Decided-by: human architecture dialogue, 2026-09-10 through 2026-09-11.
    Amended 2026-09-13 by codex from the independent review and
    human-accepted 2026-09-14 (derived): the unsuperseded-token and lease-expiry
    sentences, as further amended by the execution-liveness quarantine ruling.
    Amended 2026-09-23 by human ruling ("amend", relayed by the supervising
    session) to agree with execution-liveness INV-002 and its provenance
    (`missions/plans/execution-liveness/ruling-packet.md` Q1: hard ceiling
    always enforced, only idle shadowable; Q2: project config only; plan H-002:
    four-hour default): the hard ceiling is mandatory in every mode, and the
    former sentence "Useful active work has no mandatory wall-clock ceiling"
    and the rejected alternative "require a global hard timeout" are removed.

- `D-008 - Artifacts carry substantive graph state`
  - Decision: Structured artifact references carry durable outputs between
    nodes. Bounded summaries provide orientation but are not the data plane, and
    raw transcripts are diagnostic evidence rather than implicit workflow state.
  - Alternatives: Pass full transcripts between nodes; rely on the current
    200-character chain summary; coordinate through unnamespaced shared files.
  - Why: Explicit artifacts make independent sessions composable, retryable, and
    suitable for graph routing without unbounded context coupling. The runtime
    first retains the full opaque step result, then derives normalized result and
    artifact projections without discarding backend-specific evidence.
  - Decided-by: human architecture dialogue, 2026-09-11.

- `D-009 - Coordinator hosting is independent from execution selection`
  - Decision: An attached external harness and a Pi-hosted internal agent use the
    same coordinator-control contract. Coordinator host, coordinator policy,
    orchestration mode, worker execution transport, and worker model provider are
    independently selected and recorded.
  - Alternatives: Make Claude Code the preferred coordinator runtime; require
    internal coordinators to use a separate control surface; bind each
    coordinator harness to its own worker backend.
  - Why: Claude Code currently offers useful tools and a large context window,
    but those are client capabilities rather than durable orchestration
    semantics. Independent selection permits Claude Code, Codex, Pi-hosted
    coordinators, and future adapters to coordinate the same runtime.
  - Decided-by: human architecture dialogue, 2026-09-11.

- `D-010 - Durable run evidence owns coordinator continuity`
  - Decision: The materialized graph, execution decisions, messages, bounded
    summaries, session references, and artifacts are the source of truth for a
    coordinator's live model. A coordinator context window is a reconstructible
    cache; a coordinator may detach, compact, fail, or be replaced without losing
    run continuity.
  - Alternatives: Depend on one long-lived coordinator conversation; copy a full
    coordinator transcript into every worker prompt; make large context windows a
    compatibility requirement.
  - Why: Context size can improve judgment but cannot provide recovery,
    cross-harness handoff, auditability, or durable ownership. This decision also
    prevents orchestration correctness from depending on one vendor's context
    limits.
  - Decided-by: human architecture dialogue, 2026-09-11.

- `D-011 - Portability is capability-declared, not lowest-common-denominator`
  - Decision: Coordinator and worker packages declare required capabilities;
    harness and execution adapters declare provided capabilities. Compilation or
    attachment fails explicitly when they are incompatible. Adapters may expose
    richer native capabilities without changing the shared durable lifecycle or
    silently falling back to another backend.
  - Alternatives: Restrict all harnesses to the weakest common surface; assume
    equivalent tools and transcripts; silently substitute Pi when an external
    harness cannot satisfy a package.
  - Why: Harness neutrality should preserve useful native tools while keeping
    authority, persistence, and state transitions predictable.
  - Decided-by: human architecture dialogue, 2026-09-11.

- `D-012 - Architecture statements distinguish target from shipped state`
  - Decision: The shared-runtime, graph-control, coordinator-neutrality,
    durable-continuity, and capability-portability descriptions are target
    boundaries unless the Current Architecture section names their shipped
    substrate. Plans must name the populations and compatibility paths they
    actually migrate.
  - Alternatives: Describe the desired boundary as already unified; block all
    forward design until every legacy execution path is removed.
  - Why: Target boundaries guide convergence, while explicit exceptions prevent
    plans and tests from assuming authority or evidence paths that do not exist.
  - Decided-by: codex-proposed from the independent architecture review, 2026-09-13;
    human-accepted 2026-09-14 (derived: an implementer may amend it on the
    record).

## Boundary Model

| Zone | Responsibility | May depend on |
|---|---|---|
| Coordinator hosts and adapters | Host attached external or Pi-native coordinators, translate the shared control protocol, and advertise capabilities | Run/graph control APIs only; never scheduler state or backend internals |
| Orchestration frontends and coordinator policies | Chain DSL, Drive task policy, declared-graph definitions, swarm policy, and unattended script policy | Graph definition and control APIs |
| Graph compilation and control | Validate definitions, compile frontend intent, validate route decisions, and materialize approved subgraphs | Durable graph contracts and policy; never backend internals |
| Durable runtime | Schedule materialized nodes, own attempts and transitions, apply routing facts, and finalize runs | Backend contracts and `RunStore` only |
| Execution backends and transports | Launch Pi sessions or processes, report normalized activity/results/artifacts, and perform cancellation | Attempt context and execution dependencies; never authoring policy |
| Evidence and persistence | Atomically persist graphs, routing facts, leases, attempts, sessions, events, and artifacts | Storage primitives only |

Boundary rules:

- Frontends may express intent but may not write scheduler state or start
  backends directly.
- Every coordinator host submits the same declarative command and decision
  schemas. Hosting a coordinator externally grants no extra scheduler authority,
  and hosting it in Pi grants no privileged bypass.
- Coordinator attachment and worker execution are separate choices. A Claude
  coordinator may run Pi or Codex workers; a Pi coordinator may run Claude or
  Codex workers when capability and policy checks allow it.
- Coordinator context is never authoritative run state. Attach and resume rebuild
  the live model from persisted graph state, decisions, messages, summaries,
  sessions, and artifacts.
- Routers and swarm coordinators return declarative decisions. The graph-control
  layer validates authority, topology, budgets, and schemas before materializing
  them.
- The scheduler consumes materialized graph contracts; it does not interpret
  chain syntax, plan tasks, prompts, or coordinator prose.
- Backends execute one node attempt and report evidence. They do not choose
  downstream topology or infer run success.
- The store owns atomic lease/fencing checks. A late or obsolete attempt may
  append diagnostic evidence but may not replace current step state.
- Lease expiry makes work unhealthy and ineligible to count as fresh external
  work. It does not prove a process dead or authorize a competing mutating
  claim; token rotation requires confirmed settlement/death or explicit
  operator replacement with that evidence.
- Protocol-specific executors may use a lower execution transport for launch,
  prompt materialization, output capture, cancellation, timeout, and cleanup.
  Drive policy must not leak into that transport, and chains must not call the
  full Drive task loop.
- Swarm coordination must use the same validated graph-control surface available
  to other frontends; it receives no privileged bypass around the scheduler.
- Package requirements and adapter capabilities are validated before execution;
  incompatible combinations fail explicitly and never trigger a hidden backend
  fallback.

Current exceptions to these target rules are deliberate migration inventory:
coordinator-bearing chains execute in the inline chain runner; dynamic
`spawn_agent` creates detached promises without scheduler handles; the spawn
graph compiler was deleted 2026-09-23 as unused and is re-created when spawn
moves onto the graph substrate; and Drive owns backend-local timeout
and task-write seams. Waves A through C retire these exceptions in named slices.

## Current Architecture

### Shipped substrate

- **A durable scheduler boundary, with compatibility runtimes.** `runId` and the
  file-backed run store (`missions/sessions/<scope>/runs/<runId>/`) are shared by
  durable Chain and Drive paths, with normalized
  `cosmonauts run chain|drive|status|watch|list` and events. Loop-free chains and
  Drive have production graph compilers. Coordinator-bearing chains still run
  inline. The spawn-as-one-node compiler was deleted 2026-09-23 as unused and is
  re-created when spawn moves onto the graph substrate; `spawn_agent` launches
  detached work outside scheduler ownership.
- **Graph shape.** `RunGraph` currently contains nodes plus unconditional edges.
  It persists execution topology but is not yet a general workflow language:
  there are no route decisions, edge conditions, registered operation contract,
  joins, or durable graph expansion.
- **Spawning shapes today.** Sequential chains (`a -> b -> c`); same-stage
  concurrency (`[a, b]` and fan-out `r[N]` — fan-out sends the *same prompt*, no
  durable read-only guarantee or sharding); dynamic `spawn_agent` (5 concurrent
  per parent, nesting depth 2, and a 5-minute completion-observation wait).
- **Drive.** Deterministic plan→tasks execution, file-backed, resumable —
  and sequential by default because its run policy omits `maxParallelSteps` and
  the shared scheduler defaults that policy to one.

### Current ceiling

- Agent-step liveness is incomplete: timeout policy is not enforced during
  active work, lease expiry is not authoritative, activity is not distinct from
  heartbeat, cancellation does not own every descendant, and planless chain
  sessions are not persisted.

- **One Bun process, one event loop** → async I/O concurrency, **no OS
  parallelism**. Two CPU-bound agents block each other.
- **Containment is partial** — a child that *throws* is caught (parent survives);
  a child that **OOMs or hits a fatal** takes the whole process and every sibling
  down.
- **No concurrent mutable work** — shared cwd and git index; staging/commits
  contend on `.git/index` even when edit sets are disjoint.
- **Deferred end-to-end capabilities:** managed isolated worktrees, functional
  approval nodes, and parent-run/parent-step linkage. Some supporting vocabulary
  exists, but these behaviors are not complete runtime contracts.

## Target Architecture

### Orchestration modes over one graph runtime

- **Chain mode** remains concise role-topology syntax and compiles to a graph.
- **Drive mode** remains plan/task-policy orchestration and compiles its work and
  finalizers to a graph without exporting Drive policy into the scheduler.
- **Declared-graph mode** exposes agents, registered operations, routers,
  branches, joins, bounded loops, approvals, and reusable subgraphs.
- **Swarm mode** adds an adaptive coordinator that proposes work and topology
  through validated graph expansion rather than spawning outside the runtime.
- **Attached-coordinator mode** lets an interactive coordinator hosted by Claude
  Code, Codex, Pi, or a future adapter author or steer the same graph-control
  surface.
- **Script-coordinated mode** formalizes unattended mechanical coordination over
  that same surface; it is not the first point at which external coordination is
  supported.

These may be distinct user-facing choices. Internally they converge at graph
definition/control contracts and the durable scheduler.

### Independent selection axes

| Axis | Examples | Durable rule |
|---|---|---|
| Coordinator host | Claude Code, Codex, Pi session, future harness adapter | Uses the shared run/graph-control protocol |
| Coordinator policy | Cosmo, Cody, Quality Manager, swarm coordinator | Proposes decisions within explicit authority and budgets |
| Orchestration frontend | Chain, Drive, declared graph, swarm | Compiles or materializes shared graph contracts |
| Worker execution transport | Pi session, Claude CLI, Codex CLI, process | Executes one fenced node attempt and reports normalized evidence |
| Worker model provider | Anthropic, OpenAI, or another provider exposed by its transport | Never changes orchestration authority or durable state semantics |

Harness-specific context windows and tools may improve a coordinator's judgment.
They do not change the control protocol or become prerequisites for run recovery.

### Three graph layers

1. **Graph definition** — an immutable, versioned declaration of nodes, allowed
   transitions, schemas, policies, and referenced subgraph templates.
2. **Materialized run graph** — the concrete nodes and edges authorized for one
   run, including append-only expansions from registered templates.
3. **Execution decisions** — persisted route selections, expansion requests,
   approvals, skips, retries, and terminal transitions that explain how the run
   traversed the materialized graph.

The original definition is never rewritten to disguise a runtime decision.

### Graph node and control vocabulary

- **Agent node:** execute an agent definition in an attempt-scoped session.
- **Operation node:** invoke a registered code operation through versioned,
  serializable input/output schemas.
- **Router node:** use deterministic code or an agent to select declared outgoing
  edge identifiers and emit a structured route decision.
- **Fan-out and join:** execute independent nodes concurrently and resume only
  under an explicit all/any/quorum policy.
- **Subgraph node:** invoke a reusable declared graph; later materialize a
  registered template with validated inputs.
- **Approval node:** persist a wait condition and resume from explicit human
  input.
- **Coordinator node:** later maintain a live model and propose policy-bounded
  graph expansion for a swarm.

The current persisted `StepKind` vocabulary is migration input, not the final
node schema. `agent` maps directly to an agent node; `command` and `finalizer`
are candidates for registered operation nodes; `approval` maps to an approval
node; and `chain`/`drive` identify frontend-compiled wrapper work rather than new
target node kinds. Before the first general graph node is persisted, Wave B must
decide where operation version identity lives and publish the exact compatibility
mapping for existing records.

### Routing and expansion progression

1. **Durable read-only fan-out.** Predeclare distinct shard inputs, enforce a
   read-only capability, persist one artifact result per branch, and converge at
   a deterministic all-join. Today's Quality Manager panel is not proof of this
   contract because its agents can mutate shared files.
2. **Predeclared routing.** All possible nodes and edge identities are known;
   routers select allowed edge IDs, non-selected branches become explicitly
   `skipped`, resume matches exact decisions, and finalization accounts for
   unreachable nodes. Initial bounded loops unroll into declared acyclic nodes;
   persisted loop-back edges wait for Wave C.
3. **Registered template expansion.** A router chooses an approved subgraph
   template and supplies validated inputs. The runtime records the materialized
   nodes, template version, parent decision, and budgets.
4. **Open swarm expansion.** A coordinator may propose new work under explicit
   role, depth, concurrency, cost, mutation, and isolation policy. The runtime
   validates and appends the accepted topology; rejected proposals remain
   evidence.

### Universal execution envelope

In the target runtime, every node attempt, regardless of orchestration mode or
backend, receives:

- an ownership lease with renewal, expiry, and a fencing token;
- a separate last-activity signal derived from normalized execution evidence;
- an absolute hard ceiling enforced in every mode, shadowable or enforced idle
  timeout, and bounded cancellation grace;
- cancellation propagation to tools, nested graphs, and spawned descendants;
- attempt-scoped session and output persistence;
- normalized result, artifact, usage, diagnostic, and terminal-state capture.

Heartbeat proves that a worker still owns an attempt; it does not prove useful
progress. Expiry removes health but does not itself supersede the current token.
If cancellation cannot be confirmed by result settlement, the scheduler revokes
the token and ends terminal-blocked instead of preserving `running` forever or
starting a potentially conflicting replacement.

### Swarm model

N agents working as a team toward one objective, communicating through a
coordinator. There are **two fundamentally different classes**, and conflating
them is the main trap:

- **Read / opinion swarms** — understand the codebase, investigate spikes, or
  review one change through different lenses. The target contract enforces that
  they mutate nothing, so worktree isolation is unnecessary; current agents,
  including the Quality Manager panel, do not yet provide that guarantee. The
  first slice therefore needs real sharding, enforced read-only capability,
  durable artifact results, and deterministic synthesis—not just same-prompt
  fan-out.
- **Mutable swarms** — N agents implementing concurrently. This is where
  isolation actually matters.

**The coordinator.** A swarm always needs one. Today's chain `coordinator` only
dispatches-and-waits (no live model of the run); Drive has no agent-coordinator
(deterministic, sequential); the richest coordinator we have actually run was the
**interactive main agent** in the ad-hoc `fallow-temp-exceptions-cleanup` run —
it held context, owned commits, fixed pre-existing breakage, and arbitrated in
real time. The capability we lack is not spawning — it is a **coordinator that
maintains a live model of the swarm**: who owns which files, who is mid-edit, when
it is safe to commit, when it is safe to verify. That live model must be
reconstructible from durable evidence rather than existing only in the model's
context. Two hosting modes use the same control contract:

- **In-process coordinator** — a spawned coordinator agent owns the live model.
- **Attached coordinator** — an interactive session hosted by Claude Code,
  Codex, Pi, or a future harness drives the swarm. Claude Code is the current
  reference dogfood client, not the architectural default.

**The fork — isolation vs. coordination.** Concurrent mutation corrupting shared
state has two answers: *isolate* (worktrees, so the coordinator need not track) or
*coordinate* (a live-model coordinator serializes commits and gates verification,
so you need not isolate). **Worktrees are not always required** — for disjoint
edit sets with centralized commit authority and coordinator-gated verification, a
shared tree works (exactly what fallow-cleanup did). Isolation is needed when edit
sets may overlap, workers must commit independently, or each must verify against a
clean tree. This fork — not "worktrees yes/no" — is the real design decision.

## Forward Waves

The roadmap promotes one of these slices at a time.

- **A — Execution liveness.** Make node attempts activity-aware, cancellable,
  fenced, and diagnosable; enforce lease expiry; persist planless sessions; own
  descendant cancellation; and fix completion-waiter loss. Stabilize the current
  Quality Manager without introducing a QM-specific workflow runtime. The
  contract is independent of the initiating coordinator and worker backend.
- **B — Declared graph control.** First make artifact handoff executable by
  persisting full results and referenced outputs. Then ship a durable enforced
  read-only fan-out/all-join slice. Add edge identity, explicit `skipped` state,
  exact-decision resume, and reachability-aware finalization before registered
  operations and predeclared routers. Initial bounded loops are statically
  unrolled; loop-back edges wait for Wave C. Migrate Quality Manager only after
  these contracts exist. Attached and Pi-hosted coordinators submit the same
  validated decisions.
- **C — Controlled expansion and durable nesting.** Add registered subgraph
  templates, parent-run/step linkage, observable child runs, tree-wide
  cancellation, and scheduler-owned coordinator loops.
- **D — Swarm coordination.** Begin only after Wave C proves durable expansion,
  child ownership, and cancellation, and after `agent-interaction` evidence shows
  the live coordinator decisions worth productizing. Deliver read/opinion swarms
  first, then live-model mutable coordination and cost/token budgets across the
  run tree. Coordinators propose graph work; they do not bypass graph policy.
  The coordinate-without-isolation branch remains deferred while
  `durable-orchestration-runtime` D-016 forbids shared mutable coordination.
- **E — Real parallelism and isolation.** Once concurrent mutation has measured
  value, choose the isolation/coordination posture and plan child-process
  execution, crash containment, worktree isolation, parallel mutable execution,
  merge finalizers, approval gates, backend-report hardening, scheduler host
  form, and store-backend evolution as explicit follow-ups rather than an
  implicit swarm prerequisite.
- **F — Unattended script coordination.** Formalize resumable, non-interactive
  mechanical coordination over the run/graph-control surface. External
  interactive clients and pluggable Pi, Codex, Claude, and process execution are
  cross-cutting requirements introduced in earlier waves, not deferred here.

Model failover, streaming watch output, context budgets, and broader approval
ergonomics should be pulled into the earliest wave whose behavior requires them.
The old `chain-checkpointing` idea remains retired: graph state and artifacts own
checkpointing.

`agent-messaging` and `hook-system` remain independently owned capabilities, but
must integrate through normalized activity and graph-control contracts rather
than introducing alternate orchestration state.

The scheduler host remains shared with the autonomy/always-on track:
orchestration owns executing a run graph to terminal; autonomy owns when work
begins and how a host stays alive. See `missions/architecture/autonomy.md`.

## Open Decisions

- The public authoring syntax and schema for declared graphs.
- Whether the first join policies are only `all` and `any`, or include quorum.
- How bounded loops are represented without permitting undeclared topology.
- The registered-operation discovery, versioning, and compatibility contract.
- When a subgraph should share a run versus become a linked child run.
- The first non-CLI binding for the coordinator-control protocol after the CLI
  reference adapter.
- Default isolation posture for mutable swarms.
- Sharding contracts for read/opinion swarms.

## Plan Links

- Shipped foundation: `missions/architecture/durable-orchestration-runtime.md`
  and its archived Wave-1/2 plans.
- Active first slice: `missions/plans/execution-liveness/`.
- Portable public control boundary: the `drive-envelope` roadmap item.
- Following proposed slices: `graph-control`, `nested-runs`,
  `durable-coordinator-loops`, and swarm coordination (not yet created).
- Related active host plan: `missions/plans/autonomy-host/plan.md` and
  `missions/architecture/autonomy.md`.

Every future orchestration plan must link this record through `Architecture
Context` and name the decisions and boundary rules it implements.

## Consolidation Ledger

- Absorbs the earlier `agent-swarms`-first sequencing into graph-first Waves
  B-D; swarm remains a target capability, not the initial substrate.
- Absorbs roadmap ideas `chain-timeouts`, `nested-runs`,
  `durable-coordinator-loops`, `model-failover`, `streaming-events`, and
  `context-budget` into the waves above.
- Keeps `agent-messaging` and `hook-system` independently owned but requires
  them to integrate through normalized activity and graph-control contracts.
- Supersedes the forward direction in `child-process-spawning.md` and
  `script-orchestration.md`; those remain historical evidence.
- Supersedes the Wave-3/post-production cluster in
  `durable-orchestration-runtime.md`; that document remains the historical
  Wave-1/2 source.
