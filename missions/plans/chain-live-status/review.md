# Plan Review: chain-live-status

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "The plan is built on event fields and renderer hooks that do not exist"
  plan_refs: plan.md:24-45, plan.md:66-68, plan.md:75
  code_refs: lib/orchestration/message-bus.ts:42-55, domains/shared/extensions/orchestration/spawn-tool.ts:120-161, domains/shared/extensions/orchestration/spawn-tool.ts:339-384, node_modules/@earendil-works/pi-coding-agent/docs/extensions.md:1764-1793
  description: |
    The plan specifies a translator over `tool_call_start { name, args }`, `assistant_text`, and a subscription filtered by the spawned session ID, then says to add a custom tool `render` function. None of those boundaries match the current code. `SpawnActivityEvent` carries `activity.kind` plus `toolName` and a preformatted `summary`; it has no raw `args`, no `assistant_text` variant, and no child `sessionId` field. The `spawn_agent` tool schema also uses `role`, not `agent`.

    Pi's tool rendering API here is `renderCall` / `renderResult` with `context.invalidate()` and shared `context.state`; the docs do not expose a tool-level `render` hook. A worker following the plan literally will target the wrong event shape and wrong renderer surface. The planner needs to restate the exact event contract and rendering API the implementation will use.

- id: PR-002
  dimension: risk-blast-radius
  severity: high
  title: "The plan misses the actual source of the scrolling noise"
  plan_refs: plan.md:10-18, plan.md:35-45, plan.md:66-70
  code_refs: domains/shared/extensions/orchestration/index.ts:52-69, domains/shared/extensions/orchestration/index.ts:95-135, domains/shared/extensions/orchestration/spawn-tool.ts:548-567, domains/shared/extensions/orchestration/chain-tool.ts:164-193
  description: |
    The visible scrollback is not produced only by `spawn_agent` / `chain_run` result renderers. The orchestration extension subscribes to `activityBus` on every session start and injects a separate `spawn-activity` message with `pi.sendMessage(..., { deliverAs: "nextTurn" })` for each forwarded tool-start event. Those custom messages are what accumulate as independent rows.

    The plan's implementation order only talks about new live renderers on the tools. If `domains/shared/extensions/orchestration/index.ts` is left unchanged, the new single-line renderer will coexist with the existing `spawn-activity` messages and the core symptom remains. The planner needs to include the message-injection path in scope and specify how it is removed, replaced, or gated.

- id: PR-003
  dimension: state-sync
  severity: high
  title: "`spawn_agent` cannot swap its accepted row for a final completion row with the current lifecycle"
  plan_refs: plan.md:46-55, plan.md:67-69
  code_refs: domains/shared/extensions/orchestration/spawn-tool.ts:325-331, domains/shared/extensions/orchestration/spawn-tool.ts:401-449, domains/shared/extensions/orchestration/spawn-tool.ts:506-531
  description: |
    The plan says the live line is replaced with `↳ {agent}: done ...` when the tool resolves and that `renderResult` will produce that final summary. But `spawn_agent` does not stay pending until child completion. It launches the child session in a detached promise, returns immediately with `details.status = "accepted"`, and later reports success/failure through `pi.sendUserMessage(..., { deliverAs: "followUp" })`.

    That means the original tool row never receives a completion result to render. With the current lifecycle, `renderResult` for the original tool call can only render `spawning`/`accepted`, not `done`. This needs redesign before tasking: the plan must explain where the long-lived row state lives and how completion updates reach that same row instead of arriving as a different follow-up message.

- id: PR-004
  dimension: user-experience
  severity: high
  title: "The fallback story loses child output for normal interactive sessions"
  plan_refs: plan.md:54-62, plan.md:73-77
  code_refs: lib/orchestration/session-factory.ts:86-98, domains/shared/extensions/orchestration/spawn-tool.ts:427-435, domains/shared/extensions/orchestration/spawn-tool.ts:462-499
  description: |
    The plan says the sub-agent's full result remains available for inspection and that hidden activity is mitigated by `/show` or by reading the session file directly. That is not true for ordinary interactive spawns. When `planSlug` is absent, child sessions use `SessionManager.inMemory()` and no JSONL/transcript file is written. Persistence only happens inside the `if (planSlug && sessionFilePath)` block.

    The current code also keeps full assistant text only for `verifier`; every other role sends back a summary string. If the plan removes the visible `spawn-activity` scrollback without adding a persistence/retrieval mechanism for non-plan sessions, users lose the only detailed trace they currently have. The planner needs to account for default interactive usage, not just plan-scoped runs.

- id: PR-005
  dimension: duplication
  severity: medium
  title: "`chain_run` already has a richer live-event boundary than the plan describes"
  plan_refs: plan.md:37-45, plan.md:67-69
  code_refs: domains/shared/extensions/orchestration/chain-tool.ts:92-119, lib/orchestration/chain-runner.ts:199-220, lib/orchestration/types.ts:263-287, domains/shared/extensions/orchestration/rendering.ts:75-105
  description: |
    `chain_run` already receives structured progress through `runChain(... onEvent)` and specifically gets `agent_tool_use` events with the original `tool_execution_start` payload, including raw `args`. The current renderer turns those into progress lines via `chainEventToProgressLine()`.

    The plan says to build the chain renderer with the same activity-bus pattern as `spawn_agent`, which would introduce a second progress source with a different contract (`SpawnActivityEvent` summary-only vs `ChainEvent.agent_tool_use` with args). That is unnecessary duplication and leaves the shared translator boundary underspecified. The planner should pick the actual integration point for `chain_run` and define one event contract for it.

## Missing Coverage

- How `filesEdited` in the proposed completion summary is computed for `spawn_agent`; the current `SpawnActivityEvent` surface exposes only `toolName` and `summary`, not a canonical file path.
- Whether the existing chain cost table is preserved; `chain_run` currently appends a `💰 Cost Summary` block on completion at `domains/shared/extensions/orchestration/chain-tool.ts:184-189`.
- What behavior is expected in normal interactive sessions where `planSlug` is absent and no child transcript file exists.
- Whether `--mode json` is actually in scope for Cosmonauts; the underlying Pi docs support it (`docs/pi-framework.md:457-460`), but Cosmonauts does not currently wire `--mode` in the CLI (`cli/pi-flags.ts:50-52`, `cli/main.ts:122-145`).

## Assessment

The plan is viable with revisions, but the current version targets the wrong boundaries. Fix the lifecycle/integration story first: identify which mechanism owns live status (`spawn-activity` messages, tool-row renderers, or `chain_run` `onEvent`) and make that contract explicit before creating tasks.
