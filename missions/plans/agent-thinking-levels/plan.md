---
title: Per-Agent Thinking Level Configuration
status: active
createdAt: '2026-03-05T15:56:35.089Z'
updatedAt: '2026-03-05T15:56:35.089Z'
---

## Summary

Add `thinkingLevel` support to agent definitions and the orchestration pipeline so that individual agents in workflows/chains can use different thinking levels. Currently, `thinkingLevel` is only configurable at the CLI level (`--thinking` flag) and only affects the top-level Cosmo session. Spawned agents in chains and `spawn_agent` calls never receive a thinking level.

## Scope

**Included:**
- Add optional `thinkingLevel` field to `AgentDefinition`
- Add optional `thinkingLevel` field to `SpawnConfig`
- Add optional `ThinkingConfig` map (per-role overrides) to `ChainConfig`
- Wire thinking level through `agent-spawner.ts` → `createAgentSession()`
- Wire thinking level through `chain-runner.ts` → spawn calls
- Expose thinking level in `spawn_agent` tool parameter schema
- Propagate CLI `--thinking` flag as a chain-level default
- Set sensible defaults in `definitions.ts` for key agents (e.g. planner: `"high"`)
- Update tests

**Excluded:**
- No changes to the Pi framework itself — we only use the existing `thinkingLevel` parameter on `createAgentSession()`
- No new CLI flags beyond the existing `--thinking`
- No changes to system prompt content

**Assumptions:**
- Pi's `createAgentSession()` already accepts `thinkingLevel` as an optional parameter (confirmed in `cli/session.ts:108`)
- The `ThinkingLevel` type from `@mariozechner/pi-agent-core` includes: `"off"`, `"minimal"`, `"low"`, `"high"`, `"xhigh"` (confirmed in `cli/main.ts:35-42`)

## Approach

The design follows the existing `model` configuration pattern, which already has per-definition defaults, per-role overrides via `ModelConfig`, and CLI override. We replicate this three-tier resolution for thinking levels:

1. **Definition default** — `AgentDefinition.thinkingLevel` (e.g. planner gets `"high"`)
2. **Chain/config override** — `ThinkingConfig` on `ChainConfig`, analogous to `ModelConfig`
3. **CLI override** — `--thinking` flag propagates as a chain-level default (highest precedence)

Resolution order (same pattern as `getModelForRole` in `agent-spawner.ts:62-82`):
1. Explicit `SpawnConfig.thinkingLevel` (set by chain runner from `ThinkingConfig` or CLI)
2. Agent definition `thinkingLevel`
3. `ThinkingConfig.default` if provided
4. `undefined` (no thinking — Pi default behavior)

### Key design decisions

- **Per-definition defaults, not hardcoded in the runner.** Each agent definition owns its thinking level, just like it owns its model. The planner and task-manager benefit from higher thinking; workers and fixers may not need it.
- **`ThinkingConfig` mirrors `ModelConfig`.** Same shape, same resolution logic, same position in `ChainConfig`. Keeps the API consistent.
- **CLI `--thinking` becomes a chain-wide default.** When you run `cosmonauts --thinking high --chain "planner -> coordinator"`, all agents in the chain get `"high"` unless their definition or a per-role override says otherwise. This matches how `--model` would work if it were propagated to chains.
- **`spawn_agent` tool gets an optional `thinkingLevel` parameter.** Agents spawning sub-agents can explicitly set thinking level, just like they can set `model`.

### Integration with existing code

- `getModelForRole()` (`agent-spawner.ts:62`) is the template. We create a parallel `getThinkingForRole()` with identical resolution logic.
- `runStage()` (`chain-runner.ts`) already resolves model via `getModelForRole()` and passes it to `spawner.spawn()`. We add the same pattern for thinking.
- `createSession()` (`cli/session.ts`) already accepts and passes `thinkingLevel` to `createAgentSession()`. No changes needed there.
- The orchestration extension (`extensions/orchestration/index.ts`) needs to thread thinking through both `chain_run` and `spawn_agent` tool schemas.

## Files to Change

- `lib/agents/types.ts` — add optional `thinkingLevel?: ThinkingLevel` field to `AgentDefinition`
- `lib/agents/definitions.ts` — set `thinkingLevel` on agents that benefit from it (planner: `"high"`, task-manager: `"high"`, others: `undefined`)
- `lib/orchestration/types.ts` — add `thinkingLevel?: ThinkingLevel` to `SpawnConfig`; add `ThinkingConfig` interface; add `thinking?: ThinkingConfig` to `ChainConfig`
- `lib/orchestration/agent-spawner.ts` — add `getThinkingForRole()` helper; pass `thinkingLevel` through in `createPiSpawner().spawn()` to `createAgentSession()`
- `lib/orchestration/chain-runner.ts` — resolve thinking level per stage via `getThinkingForRole()` and pass to `spawner.spawn()`
- `extensions/orchestration/index.ts` — add optional `thinkingLevel` parameter to `spawn_agent` tool schema; thread it to spawner. Optionally expose thinking config on `chain_run`.
- `cli/main.ts` — propagate `--thinking` flag into `ChainConfig.thinking` when running chains/workflows
- `tests/agents/definitions.test.ts` — add test for `thinkingLevel` field validity (must be valid ThinkingLevel or undefined)
- `tests/orchestration/agent-spawner.test.ts` — add tests for `getThinkingForRole()` resolution tiers

## Risks

- **Model compatibility**: Not all models support all thinking levels. If a definition sets `thinkingLevel: "high"` but the model doesn't support thinking, Pi may error or silently ignore it. This is an existing Pi-level concern, not something we can solve here, but worth noting.
- **Token cost**: Enabling thinking on more agents increases token usage. The defaults should be conservative — only agents where thinking clearly improves output quality (planner, task-manager) get non-undefined defaults.
- **`ThinkingConfig` vs definition precedence**: Agents might get surprising thinking levels if both definition and config are set. The resolution order must be clearly documented and tested. Following the existing `ModelConfig` pattern mitigates this since developers already understand that precedence model.

## Implementation Order

1. **Types first** — Add `thinkingLevel` to `AgentDefinition`, `SpawnConfig`, `ChainConfig`, and create `ThinkingConfig`. Pure type changes, no behavior impact.
2. **Agent definitions** — Set `thinkingLevel` values on built-in definitions in `definitions.ts`.
3. **Spawner wiring** — Add `getThinkingForRole()` to `agent-spawner.ts` and pass thinking level to `createAgentSession()`.
4. **Chain runner wiring** — Resolve thinking per stage in `chain-runner.ts` and pass to spawn calls.
5. **Extension wiring** — Update `spawn_agent` and `chain_run` tool schemas in `extensions/orchestration/index.ts`.
6. **CLI propagation** — Thread `--thinking` flag into chain config in `cli/main.ts`.
7. **Tests** — Update definition tests and spawner tests for the new field and resolution logic.
