---
title: Interactive Agent Switching via /agent Command
status: active
createdAt: '2026-04-08T13:49:02.523Z'
updatedAt: '2026-04-08T14:10:46.722Z'
---

## Overview

Add the ability to switch between agents during an interactive Cosmonauts session without restarting the process. A `/agent <name>` command creates a new session with the target agent's full identity (system prompt, tools, extensions, skills, model) while preserving the interactive TUI.

## Current State

Today, the agent is fixed at session startup via `--agent <id>` or the default (cosmo). The `AgentSessionRuntime` binds a `createRuntime` factory at construction time, and all calls to `newSession()` reuse that same factory — always recreating sessions with the same agent identity. There is no mechanism to change the agent's identity mid-session. Users must exit and relaunch `cosmonauts --agent <name>` to switch.

Pi's `InteractiveMode` already supports session replacement: `newSession()` tears down the current session, calls `createRuntime()` to build a new one, and `handleRuntimeSessionChange()` rebinds all UI elements (extensions, event subscriptions, footer, terminal title). The extension system supports `ctx.newSession()` from command handlers. These existing mechanisms are the foundation for agent switching.

**Key constraint:** Pi loads extensions via `jiti` with `moduleCache: false`, so module-level singletons are not shared between the main CLI code and extension code. Cross-boundary communication requires a process-global mechanism (`Symbol.for` on `globalThis`).

**Why not `switchSession()`?** Pi's `switchSession(sessionPath)` loads an existing session file — it resumes a persisted conversation. It cannot create a fresh session with a different agent identity. `newSession()` is the correct mechanism: it creates a brand-new session via the `createRuntime` factory, which is where we intercept to swap the agent identity.

## Design

### Module Structure

| Module | Single Responsibility |
|--------|----------------------|
| `lib/agents/session-assembly.ts` | Shared session-config builder. Takes an `AgentDefinition` + context, produces all parameters needed to create a session (prompts, tools, extensions, skills, model). Used by both `cli/session.ts` and `lib/orchestration/session-factory.ts`. |
| `lib/interactive/agent-switch.ts` | Process-global shared state for pending agent switch requests. Typed read/write of a pending agent ID string via `Symbol.for()` on `globalThis`. |
| `domains/shared/extensions/agent-switch/index.ts` | Pi extension that registers the `/agent` command. Validates the target agent ID exists (via its own `CosmonautsRuntime`), sets pending switch, calls `ctx.newSession()`. Reads agent identity from system prompt marker on `session_start` for status display. |
| `cli/session.ts` (modified) | The `createRuntime` factory checks the global port for a pending switch. When found, resolves the ID via the main runtime's `AgentRegistry` (closed over), calls `buildSessionParams()`, constructs a new `SessionManager` for the correct agent directory, and builds the session. |
| `cli/main.ts` (modified) | When in interactive mode, passes the agent-switch extension's absolute path as an extra extension path into `createSession`. |

### Dependency Graph

```
cli/main.ts
  → cli/session.ts (createSession — closes over AgentRegistry, DomainResolver)
      → lib/interactive/agent-switch.ts (consumePendingSwitch — returns agent ID string)
      → lib/agents/session-assembly.ts (buildSessionParams — shared builder)

domains/shared/extensions/agent-switch/index.ts
  → lib/interactive/agent-switch.ts (setPendingSwitch — sets agent ID string)
  → lib/runtime.ts (CosmonautsRuntime — for ID validation only)

lib/agents/session-assembly.ts
  → lib/domains/prompt-assembly.ts
  → lib/orchestration/definition-resolution.ts (resolveTools, resolveExtensionPaths)
  → lib/agents/runtime-identity.ts (appendAgentIdentityMarker)
  → lib/agents/skills.ts (buildSkillsOverride)

lib/orchestration/session-factory.ts (refactored to use session-assembly.ts)
  → lib/agents/session-assembly.ts (buildSessionParams)
```

Domain logic (`lib/interactive/agent-switch.ts`, `lib/agents/session-assembly.ts`) has no infrastructure dependencies. The extension depends on domain logic, not the reverse. Both the factory and the extension access the same state through `globalThis[Symbol.for()]`, avoiding jiti module cache isolation.

### Key Contracts

**Agent switch port** (`lib/interactive/agent-switch.ts`):

```typescript
/** Set the agent ID to use for the next createRuntime call. */
export function setPendingSwitch(agentId: string): void;

/** Consume and clear the pending agent ID (returns undefined if none). */
export function consumePendingSwitch(): string | undefined;

/** Clear the pending switch without consuming (for cancellation/error cleanup). */
export function clearPendingSwitch(): void;
```

The port carries only a qualified agent ID string (e.g. `"coding/worker"` or `"planner"`). No `AgentDefinition` crosses the boundary — the extension validates the ID exists (so it can show an error before tearing down the session), and the factory resolves the full definition from the main runtime's registry. This avoids the risk of the extension's independently bootstrapped runtime resolving a different definition than the CLI's (due to missing `--domain`, `--plugin-dir` flags).

Implementation uses `Symbol.for('cosmonauts:agent-switch')` on `globalThis` to ensure the extension (loaded via jiti with `moduleCache: false`) and the factory (loaded natively) share the same state object.

**Session assembly builder** (`lib/agents/session-assembly.ts`):

```typescript
import type { ThinkingLevel } from '@mariozechner/pi-agent-core';
import type { Api, Model } from '@mariozechner/pi-ai';
import type { Tool } from '@mariozechner/pi-coding-agent';
import type { AgentDefinition } from './types.ts';
import type { SkillsOverrideFn } from './skills.ts';
import type { DomainResolver } from '../domains/resolver.ts';
import type { RuntimeContext } from '../domains/prompt-assembly.ts';

/** Assembled session parameters ready for session creation. */
export interface SessionParams {
  /** Assembled system prompt with identity marker. */
  promptContent: string;
  /** Resolved tools for the agent's tool set. */
  tools: Tool[];
  /** Resolved absolute extension paths. */
  extensionPaths: string[];
  /** Skill override function (or undefined for all skills). */
  skillsOverride: SkillsOverrideFn | undefined;
  /** Additional skill discovery paths. */
  additionalSkillPaths: string[] | undefined;
  /** Whether to load project context (AGENTS.md). */
  projectContext: boolean;
  /** Resolved model. */
  model: Model<Api>;
  /** Thinking level. */
  thinkingLevel: ThinkingLevel | undefined;
}

export interface BuildSessionParamsOptions {
  def: AgentDefinition;
  cwd: string;
  domainsDir: string;
  resolver?: DomainResolver;
  runtimeContext?: RuntimeContext;
  projectSkills?: readonly string[];
  skillPaths?: readonly string[];
  /** Model override (takes precedence over def.model). */
  modelOverride?: string | Model<Api>;
  /** Thinking level override (takes precedence over def.thinkingLevel). */
  thinkingLevelOverride?: ThinkingLevel;
  /** Extra extension paths to append (e.g. agent-switch extension). */
  extraExtensionPaths?: string[];
}

export async function buildSessionParams(
  options: BuildSessionParamsOptions
): Promise<SessionParams>;
```

Both `cli/session.ts` and `lib/orchestration/session-factory.ts` call `buildSessionParams()` and then construct their specific resource loader / session from the result. The only caller-specific difference: `cli/session.ts` uses `appendSystemPrompt` in resource loader options, while `session-factory.ts` uses `systemPrompt`. This is a one-line difference at each call site — the shared builder handles all the assembly logic.

**Extended `CreateSessionOptions`** (`cli/session.ts`):

```typescript
export interface CreateSessionOptions {
  // ... existing fields ...
  /** Agent registry for resolving pending agent switches in the createRuntime factory. */
  agentRegistry?: AgentRegistry;
  /** Domain context for agent resolution (from --domain flag or config). */
  domainContext?: string;
  /** Extra extension paths to always inject (e.g. agent-switch). Not logical names — absolute paths. */
  extraExtensionPaths?: string[];
}
```

No `enableAgentSwitch` flag needed. The factory's `consumePendingSwitch()` is a no-op when empty (returns `undefined`, factory proceeds with the original definition). The `agentRegistry` and `domainContext` are needed only when a pending switch is found; when absent, the factory ignores pending switches.

**`/agent` command behavior**:

| Input | Behavior |
|-------|----------|
| `/agent planner` | Warn about conversation loss → switch to planner |
| `/agent coding/worker` | Warn → switch to domain-qualified agent |
| `/agent` (no args) | Show interactive selector with all available agents |

### Seams for Change

The `AgentSwitchPort` is a narrow, stable interface. If Pi later exposes a native agent-switch mechanism (e.g., a `setCreateRuntime()` method on `AgentSessionRuntime`), the port can be retired and the extension can use Pi's API directly. The extension's `/agent` command UX is independent of the switching mechanism.

The `buildSessionParams` builder is the natural place to absorb any future `AgentDefinition` fields that affect session creation. Adding a field requires changing one function, not two.

## Approach

### How agent switching works end-to-end

1. User types `/agent planner` in the interactive TUI.
2. The `agent-switch` extension's command handler fires:
   a. Bootstraps a `CosmonautsRuntime` (cached, same pattern as orchestration extension) to get an `AgentRegistry`.
   b. Calls `registry.has("planner")` to validate the ID exists. If not, shows an error via `ctx.ui.notify()` and returns — **no session teardown occurs**.
   c. Shows a warning: "Starting a new session as planner. Current conversation will not be preserved."
   d. Calls `setPendingSwitch("planner")` on the global port.
   e. Calls `ctx.newSession()`.
   f. If `ctx.newSession()` returns `{ cancelled: true }` or throws, calls `clearPendingSwitch()` and shows an error.
3. Pi's `AgentSessionRuntime.newSession()`:
   a. Emits `session_before_switch` (extensions can cancel).
   b. Tears down the current session (disposes extensions, emits `session_shutdown`).
   c. Calls `createRuntime(...)` — the factory we built in `createSession`.
4. The factory detects `consumePendingSwitch()` returns an agent ID:
   a. Resolves the ID to a full `AgentDefinition` via the main runtime's `AgentRegistry` (closed over, using the correct `domainContext`).
   b. Calls `buildSessionParams(def, ...)` to get assembled prompts, tools, extensions, skills, model, thinking level.
   c. The builder appends the agent-switch extension path to the resolved extension paths via `extraExtensionPaths`.
   d. Constructs resource loader options from the params.
   e. Creates a new `SessionManager` scoped to the target agent's directory (`piSessionDir(cwd)/newAgentId`), ignoring the `sm` parameter passed by `newSession()`. Pi's `newSession()` creates a SessionManager in the old agent's directory; the factory overrides it. This works because `AgentSessionRuntime.apply()` replaces `this._session` entirely — subsequent access to `this.session.sessionManager` uses the factory's SessionManager.
   f. Creates the session with all new parameters.
5. Pi's `InteractiveMode.handleRuntimeSessionChange()`:
   a. Resets extension UI.
   b. Rebinds session extensions (now the new agent's extensions + agent-switch).
   c. Resubscribes to agent events.
   d. Updates terminal title.
6. The `session_start` handler in the agent-switch extension:
   a. Reads the agent ID from the system prompt using `extractAgentIdFromSystemPrompt(ctx.getSystemPrompt())` from `lib/agents/runtime-identity.ts`.
   b. Shows a status notification: "Switched to planner (anthropic/claude-opus-4-6)".

### Session directory scoping

Today `cli/session.ts:126-129` scopes session directories by agent ID: `piSessionDir(cwd)/agentId`. After a switch, Pi's `newSession()` creates a `SessionManager` in the **old** agent's directory (it reads `this.session.sessionManager.getSessionDir()`). If the factory used this session manager, planner sessions would be stored in cosmo's directory, `/resume` would mix both agents' sessions, and `cosmonauts --agent planner` later wouldn't find sessions created during a switch.

The factory solves this by creating its own `SessionManager` pointing to the correct agent-scoped directory when a switch is detected. Pi's `SessionManager.create(cwd, sessionDir)` only creates the directory on construction (if it doesn't exist); no session file is written until messages are appended. The `SessionManager` passed by `newSession()` is harmlessly discarded — it created at most an empty directory.

Verification: after switching cosmo → planner, `/resume` should list sessions from the planner directory, and `cosmonauts --agent planner` should find the switch-created session.

### Eliminating assembly duplication

Session assembly logic (prompt composition, tool resolution, extension resolution, skill override building, identity marker, model resolution) currently exists in two places:

- `cli/session.ts:87-133` — for interactive/print mode sessions
- `lib/orchestration/session-factory.ts:48-100` — for chain/spawn mode sessions

These are nearly identical. The only difference is the resource loader option key: `appendSystemPrompt` vs `systemPrompt`. Adding the agent-switch path would create a third copy inside the factory's switch branch.

The `buildSessionParams()` function in `lib/agents/session-assembly.ts` extracts all common logic. Both callers become:

```typescript
// cli/session.ts
const params = await buildSessionParams({ def, cwd, domainsDir, resolver, ... });
const resourceLoaderOptions = {
  appendSystemPrompt: params.promptContent,
  noExtensions: true,
  noSkills: true,
  ...(params.extensionPaths.length > 0 && { additionalExtensionPaths: params.extensionPaths }),
  ...(params.skillsOverride && { skillsOverride: params.skillsOverride }),
  ...(params.additionalSkillPaths && { additionalSkillPaths: params.additionalSkillPaths }),
  ...(!params.projectContext && { agentsFilesOverride: () => ({ agentsFiles: [] }) }),
};

// lib/orchestration/session-factory.ts
const params = await buildSessionParams({ def, cwd: config.cwd, domainsDir, resolver, ... });
const loader = new DefaultResourceLoader({
  cwd: config.cwd,
  systemPrompt: params.promptContent,
  noExtensions: true,
  noSkills: true,
  ...(params.extensionPaths.length > 0 && { additionalExtensionPaths: params.extensionPaths }),
  ...(params.skillsOverride && { skillsOverride: params.skillsOverride }),
  ...(params.additionalSkillPaths && { additionalSkillPaths: params.additionalSkillPaths }),
  ...(!params.projectContext && { agentsFilesOverride: () => ({ agentsFiles: [] }) }),
});
```

The resource loader option construction is a thin per-caller layer (6 lines). All heavy lifting — prompt assembly, identity markers, extension resolution, tool resolution, skill overrides, model resolution — lives in `buildSessionParams()`. The factory's switch path calls the same function, adding no duplication.

### Agent identity after switch — no second source of truth

The original plan defined `getCurrentSwitchedAgent()` / `setCurrentSwitchedAgent()` as process-global state for tracking the active agent. This is unnecessary. `lib/agents/runtime-identity.ts` already embeds the agent ID into every session's system prompt as a structured marker (`<!-- COSMONAUTS_AGENT_ID:coding/planner -->`). The `extractAgentIdFromSystemPrompt()` utility reads it.

After a switch, the new session's system prompt contains the new agent's identity marker. The `session_start` handler reads it via `ctx.getSystemPrompt()` to display the status notification. No separate tracking state is needed.

### Pattern references

- **Runtime bootstrap in extensions:** Same pattern as `domains/shared/extensions/orchestration/index.ts:9-36` — `CosmonautsRuntime.create()` cached by cwd in a promise map.
- **Process-global shared state:** `Symbol.for()` on `globalThis` — standard JavaScript mechanism for cross-realm state sharing. Typed wrapper functions keep the API clean.
- **Agent identity extraction:** `extractAgentIdFromSystemPrompt()` in `lib/agents/runtime-identity.ts:36-41`.

## Files to Change

- `lib/agents/session-assembly.ts` — **new**: Shared `buildSessionParams()` function. Extracts prompt assembly, tool resolution, extension resolution, skill override building, identity marker, and model resolution from `AgentDefinition` + context into a single `SessionParams` result.
- `lib/orchestration/session-factory.ts` — **refactor**: Replace inline assembly logic (lines 54-100) with a call to `buildSessionParams()`. Continue to own session manager creation, resource loader instantiation, and `createAgentSession()` call.
- `cli/session.ts` — **refactor + extend**: Replace inline assembly logic (lines 87-111) with a call to `buildSessionParams()`. Add `agentRegistry`, `domainContext`, and `extraExtensionPaths` to `CreateSessionOptions`. Make the `createRuntime` factory check `consumePendingSwitch()` — when found, resolve ID via registry, call `buildSessionParams()` with new definition, create agent-scoped `SessionManager`.
- `lib/interactive/agent-switch.ts` — **new**: Process-global agent switch port with three exports: `setPendingSwitch(agentId)`, `consumePendingSwitch()`, `clearPendingSwitch()`. Uses `Symbol.for('cosmonauts:agent-switch')` on `globalThis`.
- `domains/shared/extensions/agent-switch/index.ts` — **new**: Pi extension registering `/agent` command with argument autocomplete (agent names from bootstrapped registry). Validates ID exists before teardown. Warns about conversation loss. Sets pending switch. Calls `ctx.newSession()`. Handles cancellation cleanup. On `session_start`: reads agent ID from system prompt marker, shows status with model name.
- `cli/main.ts` — **modify**: In the interactive mode path (section 5, around line 235), resolve the agent-switch extension's absolute path and pass it as `extraExtensionPaths` to `createSession`. Pass `agentRegistry` and `domainContext` from the runtime.
- `tests/agents/session-assembly.test.ts` — **new**: Unit tests for `buildSessionParams()` — verifies prompt assembly, tool resolution, extension paths, skill overrides, model resolution, and `extraExtensionPaths` injection.
- `tests/interactive/agent-switch.test.ts` — **new**: Unit tests for the agent switch port (set-consume-clear semantics, consume-when-empty returns undefined, clear after set).
- `tests/extensions/agent-switch.test.ts` — **new**: Integration tests for the extension's command flow — valid ID triggers switch, invalid ID shows error without teardown, cancellation cleans up pending state.

## Risks

1. **jiti module isolation** — The core risk. Pi loads extensions via `jiti` with `moduleCache: false`. `Symbol.for()` on `globalThis` is the standard defense — it shares across all module loading mechanisms. If jiti's behavior changes, `Symbol.for()` still works. Low risk.

2. **Extension survival across switches** — When switching agents, the new session loads the new agent's extensions. The agent-switch extension must always be included so the user can switch back. `buildSessionParams()` accepts `extraExtensionPaths` which the factory passes through. If this injection is accidentally removed, the user loses the ability to switch after the first switch. Mitigated by integration tests.

3. **Session directory override** — The factory creates its own `SessionManager` instead of using the one passed by Pi's `newSession()`. This works because `AgentSessionRuntime.apply()` replaces the session entirely and subsequent access uses the new session's manager. However, `newSession()` still calls `SessionManager.create()` for the old directory (creating at most an empty directory). This is a benign side effect but couples us to Pi's `newSession()` implementation. If Pi changes to write a session file eagerly in `newSession()`, orphan files could appear. Low risk — `SessionManager.create()` is currently lazy.

4. **Extension bootstraps independent runtime** — The agent-switch extension bootstraps its own `CosmonautsRuntime` for validation (same pattern as the orchestration extension). This runtime may not exactly match the main CLI runtime if `--domain` or `--plugin-dir` flags were passed. However, the extension uses the registry only for existence checking (`has()`), not for the actual definition used to build the session. The factory resolves the ID via the main runtime's registry, which has the correct flags. If the extension says "yes, this agent exists" but the factory can't find it (because the extension's registry is slightly different), the factory should handle the error gracefully. Medium risk — mitigated by having the factory treat a missing ID as an error and showing a notification.

5. **Model cost changes** — Switching from cosmo (opus) to worker (sonnet) changes the model. The status notification includes the model name: "Switched to planner (anthropic/claude-opus-4-6)" so users are aware.

6. **buildSessionParams refactor scope** — Extracting the shared builder changes `cli/session.ts` and `lib/orchestration/session-factory.ts`. These are core session creation paths. The refactor must be behavior-preserving — existing tests must pass without changes. Mitigated by running the full test suite after the refactor and before adding agent-switch logic.

## Quality Contract

- id: QC-001
  category: architecture
  criterion: "lib/interactive/agent-switch.ts uses Symbol.for() on globalThis for cross-module state — no module-level singletons"
  verification: reviewer

- id: QC-002
  category: correctness
  criterion: "The createRuntime factory in cli/session.ts, when a pending switch is detected, correctly rebuilds all session parameters (prompts, tools, extensions, skills, model, thinking level) from the new agent definition via buildSessionParams()"
  verification: reviewer

- id: QC-003
  category: integration
  criterion: "The agent-switch extension is always included in the extension paths of sessions created after an agent switch, even if the target agent definition does not list it"
  verification: reviewer

- id: QC-004
  category: correctness
  criterion: "Unit tests for the agent switch port (setPendingSwitch/consumePendingSwitch/clearPendingSwitch) verify set-consume-clear semantics and that consuming when empty returns undefined"
  verification: verifier
  command: "bun run test -- --grep 'agent-switch'"

- id: QC-005
  category: behavior
  criterion: "/agent with no arguments shows an interactive agent selector; /agent with a valid name triggers the switch flow"
  verification: reviewer

- id: QC-006
  category: architecture
  criterion: "The extension follows the established pattern from the orchestration extension: bootstraps its own CosmonautsRuntime with a promise cache keyed by cwd"
  verification: reviewer

- id: QC-007
  category: correctness
  criterion: "/agent worker resolves identically whether the CLI was started with --domain coding or no domain flag, because the factory resolves via the main runtime's registry (with correct domainContext), not the extension's independently bootstrapped one"
  verification: reviewer

- id: QC-008
  category: correctness
  criterion: "If the target agent ID is invalid, the extension shows an error via ctx.ui.notify() and does NOT call ctx.newSession(). The current session remains intact."
  verification: reviewer

- id: QC-009
  category: correctness
  criterion: "After switching cosmo → planner, the new session is stored in piSessionDir(cwd)/planner — /resume lists planner's sessions, not cosmo's"
  verification: reviewer

- id: QC-010
  category: correctness
  criterion: "If ctx.newSession() is cancelled or throws, clearPendingSwitch() is called and the current session remains usable"
  verification: reviewer

- id: QC-011
  category: architecture
  criterion: "Session assembly (prompts, tools, extensions, model) uses the shared buildSessionParams() builder — no inline duplication in the factory's switch path or in session-factory.ts"
  verification: reviewer

- id: QC-012
  category: correctness
  criterion: "Unqualified agent IDs that exist in multiple domains resolve using the main runtime's domainContext, not an arbitrary default"
  verification: reviewer

## Implementation Order

1. **Extract `buildSessionParams`** (`lib/agents/session-assembly.ts`) — Shared session-config builder used by both `cli/session.ts` and `lib/orchestration/session-factory.ts`. Extracts prompt assembly, identity marker, tool resolution, extension resolution, skill override building, and model resolution into one function. Refactor both callers to use it. Run full test suite (`bun run test`, `bun run typecheck`) to verify no regressions. This is a prerequisite — without it, the switch path in the factory would be a fragile copy of session setup logic.

2. **Agent switch port** (`lib/interactive/agent-switch.ts`) — Process-global shared state with three functions: `setPendingSwitch(agentId: string)`, `consumePendingSwitch(): string | undefined`, `clearPendingSwitch()`. Uses `Symbol.for('cosmonauts:agent-switch')` on `globalThis`. Unit tests for set-consume-clear semantics.

3. **Modify `cli/session.ts`** — Add `agentRegistry`, `domainContext`, and `extraExtensionPaths` to `CreateSessionOptions`. The `createRuntime` factory checks `consumePendingSwitch()`. When an agent ID is returned: resolve it via the closed-over `AgentRegistry` (with `domainContext`), call `buildSessionParams()` (passing `extraExtensionPaths` so agent-switch extension is always included), construct a new `SessionManager` scoped to the target agent's directory, build resource loader options, create the session. Wrap the consume-resolve-build path in try/catch that calls `clearPendingSwitch()` on error as defense-in-depth.

4. **Create agent-switch extension** (`domains/shared/extensions/agent-switch/index.ts`) — Registers `/agent` command with `getArgumentCompletions` for agent names. On invocation: bootstrap `CosmonautsRuntime` (cached) to validate ID exists (if invalid, show error and return without calling `ctx.newSession()`). Show warning about conversation loss. Call `setPendingSwitch(agentId)`. Call `ctx.newSession()`. If result is `{ cancelled: true }` or throws, call `clearPendingSwitch()` and show error. On `session_start`: read agent ID from system prompt via `extractAgentIdFromSystemPrompt(ctx.getSystemPrompt())`, show status notification with agent name and model.

5. **Modify `cli/main.ts`** — In the interactive mode path (section 5), resolve the agent-switch extension's absolute path (`join(domainsDir, 'shared', 'extensions', 'agent-switch')` or via `runtime.domainResolver`). Pass it as `extraExtensionPaths: [agentSwitchPath]` to `createSession`. Pass `agentRegistry: registry` and `domainContext` from the runtime. No definition mutation.

6. **Integration tests** — Cover QC-007 through QC-012: domain-context-aware resolution, invalid ID rejection, session directory scoping, cancellation cleanup, no assembly duplication, multi-domain disambiguation.
