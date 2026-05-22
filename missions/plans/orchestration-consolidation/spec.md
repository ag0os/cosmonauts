## Purpose

Today Cosmonauts runs orchestrated work through two parallel stacks. Chains spawn agents via an in-process `AgentSpawner` with privileged access to Pi's session API, message bus, and spawn tracker. Drive spawns agents via an opaque subprocess `Backend` interface with a mechanical preflight → spawn → postflight → commit loop owned by `lib/driver/`. The two engines have diverged in capability, surface, and assumptions. Chains can't use external CLIs cleanly. Drive can't host rich in-process agents in detached mode. Adding a new backend or a new orchestration pattern requires touching both stacks.

Consolidate them onto a single execution engine built around the **capsule** abstraction. A capsule is a per-invocation wrapper that owns everything which is true for every agent invocation regardless of backend: prompt scaffolding (preamble, content, the existing `OUTCOME` completion contract), tools/skills/permissions, invariants like commit policy and verification commands, looping, event logging, and run-state files. Beneath the capsule sits a thin **backend wrapper** that owns only what genuinely differs per backend: how to invoke a particular runtime (a Pi session, a Codex subprocess, a Claude Code subprocess, a future tmux pane) and how to stream whatever progress that runtime can emit.

Chains become programmatic compositions of capsule invocations. Drive becomes one capsule configuration — a coordinator agent driving a plan, inline or detached, in whichever backend the user picks. Loop behavior moves off agent personas and into capsule config. Sub-spawning, sub-agent messaging, and per-backend internals stay inside backend wrappers and don't leak into the chain or Drive layer.

The payoff is uniformity and flexibility. Adding a new backend is one wrapper, not a stack rewrite. A chain can mix backends per stage. Drive can run a Cosmonauts-internal coordinator detached (new) or a Claude Code coordinator inline (new). And because the same capsule surface is exposed via CLI/MCP, external agents (Claude Code, Codex) can drive Cosmonauts from outside using the same primitives an internal coordinator uses from inside — symmetric to how Cosmonauts uses them as backends.

## Users

Four audiences with different surfaces, all served by the same engine:

1. **Cosmonauts maintainers** extending the system — adding backends, building coordinator agents, evolving orchestration patterns. Today they pay a two-stack tax. After, they implement against one boundary.
2. **Cosmonauts agents** running as chain stages or Drive coordinators. Their orchestration tools (`spawn_agent`, `chain_run`, `run_driver`) continue to work; semantics are preserved through the migration.
3. **Humans running orchestrated work** via `cosmonauts --workflow`, `cosmonauts --chain`, `cosmonauts drive`. The CLI surface stays compatible. They gain per-stage backend selection and uniform behavior across backends.
4. **External agents** (Claude Code, Codex, future Gemini CLI, future tmux-hosted agents) — either *as backends* powering Cosmonauts capsules, or *as coordinators* driving Cosmonauts from outside via the CLI/MCP surface. Both directions are symmetrical by design.

The primary user for this plan is the maintainer extending the system. The success measure is whether someone can add a new backend by implementing one wrapper, and whether chains and Drive demonstrably share one engine.

## User Experience

### Running a chain

Today: `cosmonauts --workflow plan-and-build "design auth"` runs the chain; each stage spawns a Pi session via `AgentSpawner`.

After: the same CLI command, same observable outcomes. Internally each stage constructs a capsule (role + backend wrapper + config), the capsule runs the agent to completion (looping if configured), and the chain advances. Per-stage backend selection becomes expressible — for example a chain where the planner runs in Codex and the worker runs cosmonauts-internal. The chain renders a single uniform progress stream; rich event detail for backends that stream it (Pi sessions), coarse line-buffered output for those that don't (external CLIs).

Failure flow — backend liveness: a stage's backend wrapper liveness check fails (Codex binary missing, Claude CLI not on PATH). The chain reports the failure naming the backend wrapper as the source and does not run the stage. Today this is handled inconsistently between chains and Drive; after, it's a capsule-level invariant uniformly applied.

Failure flow — missing completion signal: an agent finishes without emitting `OUTCOME`. The capsule treats this exactly as today's Drive does — block unless verification commands were configured and passed, in which case success can be inferred (existing rule preserved).

### Running Drive

Today: `cosmonauts drive run --plan auth-system --backend codex` runs a mechanical preflight → spawn → postflight → commit loop over each task in the queue.

After: the same CLI command. It constructs a capsule configured as "a coordinator agent driving plan `auth-system`" and runs it. The coordinator agent decides task ordering, dispatch, verification, and commits — using tools the capsule exposes and following its prompt and skill. The mechanical loop in code goes away; its safety properties (preflight, postflight, commit lock, event log, run-state files, retry-on-contradicted-block) become capsule features the coordinator triggers through its tools and prompt discipline.

Inline = the capsule runs in the host process tree. Detached = the capsule forks into its own process tree with its own lifecycle. Inline vs detached is process topology, not TTY ownership; whatever each backend does with the terminal is the backend's concern. Both modes apply to any backend, including cosmonauts-internal — running a Cosmonauts-internal coordinator detached is a new capability.

Failure flow — partial completion: the coordinator emits a partial signal. The capsule treats it as today's Drive does — block per `partialMode`, surface progress in the event log, allow resume via the same `cosmonauts drive run --resume <runId>` semantics.

Failure flow — coordinator crash detached: the detached process exits before writing the completion file. Status classification surfaces `dead` exactly as today, with the same recovery path.

### Running an external agent as a coordinator

A Claude Code or Codex agent — running outside Cosmonauts, either exported as a packaged coordinator binary or installed alongside the `cosmonauts` CLI — drives a plan by invoking `cosmonauts` commands (spawn workers, run gates, commit, update task state). Each such command internally constructs and runs a capsule. The external agent sees the same primitives an internal coordinator sees, just CLI-mediated.

Packaging external agents as coordinator binaries is a follow-up plan ([[coordinator-package-export]]). This plan ensures the capsule surface and CLI primitives are shaped to make that packaging tractable rather than requiring retrofits.

## Acceptance Criteria

- Running `cosmonauts --workflow plan-and-build "<prompt>"` produces equivalent observable outcomes to today's behavior — same stage sequence, same task artifacts, same final state. Internally it routes through the new capsule-based engine.
- Running `cosmonauts drive run --plan <slug> --backend codex --mode detached` runs to completion and produces the same `events.jsonl`, `run.completion.json`, and `run.pid` artifacts as today. The per-task semantics are now driven by a coordinator agent rather than the deterministic loop.
- Running `cosmonauts drive run --plan <slug> --backend cosmonauts-internal` works in both inline and detached modes. Detached Cosmonauts-internal is a new capability.
- A chain expression supports per-stage backend selection (exact syntax is the planner's call). A chain that combines stages on different backends runs end-to-end.
- Adding a new backend (any kind — external CLI, future tmux, anything else) requires implementing one backend-wrapper interface and registering it. No changes to chain code, Drive code, or capsule code are needed to add the new backend.
- Loop semantics behave identically regardless of backend: a capsule configured to loop continues invoking the wrapped agent until the agent emits an `OUTCOME` marker indicating completion, the iteration budget is exhausted, or the deadline is reached.
- The existing `OUTCOME` marker / fenced JSON contract is preserved verbatim. Agents continue to emit the same markers; the capsule continues to parse them the same way.
- Today's Drive invariants — branch preflight, preflight commands, postflight verification, repo commit lock, event log, run-state files, retry-on-contradicted-block — continue to hold for any capsule that configures them, regardless of backend.
- Resume of detached runs works for any backend. `cosmonauts drive run --resume <runId>` reuses the workdir and refuses dirty worktrees without `--resume-dirty`, as today.
- Failure handling for a missing, malformed, or partial completion signal matches today's Drive behavior — block with reason, leave task state recoverable, surface in the event log.
- The chain runner and Drive runner share one execution engine. This is verifiable by inspecting the call graph — both converge on a capsule-level run primitive — and by the absence of two parallel agent-execution code paths.
- The `cosmonauts-subagent` backend name is removed; its semantics are subsumed by the `cosmonauts-internal` backend wrapper in inline mode. Existing references migrate or are removed.
- External agents (Claude Code, Codex) running outside Cosmonauts can construct and run capsules via `cosmonauts` CLI commands and observe the same outcomes as internal callers using the in-process surface.
- A `cosmonauts --list-workflows` listing continues to work without changes to project workflow config (`bundled/coding/coding/workflows.ts`, `.cosmonauts/config.json`).

## Scope

Included:
- Definition of the capsule abstraction: responsibilities, config surface, events emitted, artifacts produced, lifecycle, inline-vs-detached semantics.
- Definition of the backend-wrapper interface: invocation, streaming, capabilities descriptor, liveness check, inline-vs-detached support, completion-signal extraction from backend output.
- Three concrete backend wrappers at parity with today: cosmonauts-internal (replacing both `AgentSpawner` and the `cosmonauts-subagent` backend), codex, claude-cli.
- Decoupling of loop behavior from agent persona. Loop becomes a capsule-level setting; the chain DSL keeps sequencing, parallel groups, and fan-out but stops carrying loop semantics. Agent definitions stop carrying `loop: true`; today's loop-mode roles inherit their loop config from per-role capsule defaults.
- Migration of chains onto the capsule engine. Whatever Pi-specific machinery remains (message bus, spawn tracker, spawn completion loop, plan-session-context) is moved inside the cosmonauts-internal backend wrapper, not the chain runner.
- Reframing of Drive: replace the mechanical `runRunLoop` with a coordinator-capsule invocation. Preserve the public CLI commands (`cosmonauts drive run|status|list|resume`) and the run-state-file contract.
- Generalization of run-state files (`spec.json`, `events.jsonl`, `run.pid`, `run.inline.json`, `run.completion.json`) to "any detached capsule run," not driver-specific.
- The unified completion-signal contract (existing `OUTCOME:` marker / fenced JSON, preserved verbatim).
- A capsule-level verification step after the completion signal — generalization of today's Drive postflight — that gates loop exit and the inferred-success-on-unknown-outcome rule.
- An audit of the CLI/MCP primitives a coordinator (internal or external) needs in order to do its work: spawn, gates, commit, task state, plan state, event monitoring. Closing gaps where today's surface assumes an in-process caller.

Excluded:
- Concrete coordinator agent definitions — which persona, which skill, which capsule defaults for the new Drive coordinator. Tracked as [[coordinator-design]].
- A tmux-based backend wrapper. Tracked as [[tmux-backend]].
- Packaging Claude Code / Codex as exportable coordinator binaries. Tracked as [[coordinator-package-export]].
- TUI improvements for rendering unified event streams from heterogeneous backends. Tracked as [[envelope-tui-streaming]]. Initial implementation may emit minimal/raw output for non-Cosmonauts backends.
- Cross-backend session lineage and transcript continuity when chain stages alternate backends. Tracked as [[cross-backend-lineage]].
- Changes to the `OUTCOME:` marker contract itself. Reused as-is.
- Adding new backends beyond cosmonauts-internal, codex, claude-cli.
- Changes to how plans, tasks, or skills are authored. The capsule is an execution-time concern.
- Cosmetic CLI changes beyond what's needed to express per-stage backend selection.

## Assumptions

- Pi (`@earendil-works/pi-coding-agent`) continues to expose its session and spawn API in a form the cosmonauts-internal wrapper can adapt against. Lockstep upgrades may require revisiting wrapper details but should not require revisiting the capsule contract.
- The existing `OUTCOME:` marker / fenced JSON contract is rich enough to serve as the universal completion signal across all backends.
- External CLI backends (codex, claude-cli) continue to support their current non-interactive invocation surfaces (`codex exec`, `claude -p`), with their existing YOLO / skip-permissions env-var controls.
- Detached subprocess + file-IPC (event log JSONL + completion file) is an acceptable pattern for any backend running detached, including cosmonauts-internal. Pi sessions can be hosted in a binary entry point — the existing `cosmonauts-drive-step` runner-binary pattern is generalizable.
- The chain DSL is preserved at the source level — same syntax for sequence, brackets, fan-out — with at most an additive notation for per-stage backend selection.
- Project workflow files (`bundled/coding/coding/workflows.ts`, project `.cosmonauts/config.json`) keep working at parity after the migration.
- The CLI/MCP surface that internal coordinator-agents use is the same surface external agents use; the symmetry assumption holds because tool invocations are interchangeable.
- An agent verifying its own completion conditions before emitting `OUTCOME` plus a capsule-level postflight check after the marker is functionally equivalent to today's external task-state check between iterations, for all existing loop use cases.
- The two-stack migration can be done incrementally inside this plan (capsule-first, then wrappers, then chain migration, then Drive reframe) without a long-lived parallel implementation. The planner will decompose into tasks accordingly.

## Open Questions

- Per-stage backend syntax in the chain DSL. Candidates include `planner@codex`, `planner[codex]`, or a separate config map. Planner's call.
- Whether the `cosmonauts-subagent` backend name persists as a backwards-compatible alias for `cosmonauts-internal` inline, or is removed cleanly.
- Sub-spawning across backend boundaries. Today sub-spawning is same-backend only: a Pi parent spawns Pi children in-process via a shared `MessageBus` and `SpawnTracker`, while an external backend's own sub-agents (Codex helpers, Claude Code sub-tasks) stay inside the backend's black box and are invisible to Cosmonauts. After the merge, two flavors of cross-backend become possible:
  - **Outbound** — a Cosmonauts-internal parent spawns a child in another backend, e.g. `spawn_agent(role, backend: "codex")`. Tractable, because the Cosmonauts process is the orchestrator: it can construct a child capsule on any backend and deliver completion back via the same MessageBus pattern. Open sub-questions: how the parent observes a child whose event surface differs from its own, lifecycle ownership, and lineage when parent and child are in different processes.
  - **Inbound** — an external parent spawns a Cosmonauts-internal child, e.g. a Codex agent shelling out to `cosmonauts spawn …`. Handled by the CLI bridge, which is already the mechanism external coordinators use to drive Cosmonauts from outside. Explicit, stateless, no special-case orchestration needed.

  Recommended default: within-backend spawning works as today; cross-backend via the CLI bridge is always allowed and explicit; implicit/transparent cross-backend `spawn_agent` from a Cosmonauts-internal parent to a different backend is deferred unless a concrete use case requires it during this plan. The planner should confirm whether deferring the outbound flavor is acceptable for the consolidation, or whether at least outbound cross-backend `spawn_agent` needs to land alongside the rest.
- Exact shape of the capsule's tools/skills/permissions surface — particularly how external backends, which have their own tool systems, integrate with capsule-provided tools, vs how cosmonauts-internal capsules expose tools through Pi's registration.
- Whether the loop primitive admits any "external check" callback for backwards compatibility, or only the agent-emitted signal (with postflight as the safety net). The user's intent is the latter, but the planner should confirm every existing loop-stage use case (default coordinator completion check, terminal-blocked early exit) is expressible after collapse.
- How [[coordinator-package-export]] constrains the capsule surface. Even though export is a follow-up, early scoping during planning will help avoid retrofits.
- Naming inside the codebase. "Capsule" is the conceptual term; whether the implementation modules use that name or something more descriptive (`AgentRun`, `Invocation`, `Session`) is a planner call.
- Whether existing on-disk Drive run directories from before the migration must remain readable, or whether a clean break is acceptable. Likely acceptable to break, given Drive is still early.
- TUI handling of streams from non-Cosmonauts backends in the interim before [[envelope-tui-streaming]] lands. Minimal output is fine; the spec should not block on a polished story.
- Whether chain loop semantics on agent definitions get a transitional compat shim or break immediately at migration. Planner's call.
- Whether the capsule-level postflight check is configured per-capsule (current Drive style: a list of shell commands) or per-role (capsule-default postflight inherited from agent definition). Either is workable; the planner should pick one.
