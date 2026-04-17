# Review Report

base: origin/main
merge_base: 7a7f500bbf62e1d9f85ac9b920db04efe28dc9f9
range: 7a7f500bbf62e1d9f85ac9b920db04efe28dc9f9..HEAD
overall: incorrect

## Findings

- id: F-001
  priority: P1
  severity: high
  confidence: 0.99
  complexity: simple
  title: "[P1] Interactive sessions drop the agent-switch extension on startup"
  files: cli/session.ts, cli/main.ts
  lineRange: cli/session.ts:91-100
  summary: `cli/main.ts` passes `extraExtensionPaths` for interactive mode (`cli/main.ts:418-430`), but the initial `buildSessionParams()` call in `createSession()` does not forward `extraExtensionPaths` (`cli/session.ts:91-100`). As a result, the first interactive session is created without the `agent-switch` extension unless the base agent definition already includes it, so `/agent` is unavailable before any switch is attempted.
  suggestedFix: Pass `extraExtensionPaths` into the initial `buildSessionParams()` call in `createSession()` so the startup session and switch sessions use the same extension set.

- id: F-002
  priority: P2
  severity: medium
  confidence: 0.89
  complexity: simple
  title: "[P2] /agent validation can reject IDs that resolve in the main runtime context"
  files: domains/shared/extensions/agent-switch/index.ts, cli/session.ts
  lineRange: domains/shared/extensions/agent-switch/index.ts:99-106
  summary: The extension validates `/agent <id>` using an extension-local runtime and its `domainContext` (`registry.has(agentId, domainContext)`), but the actual switch resolution happens later in `createSession()` with the main runtime registry/context (`cli/session.ts:136-139`). When contexts differ (e.g., CLI `--domain` override, or ambiguous unqualified IDs), valid targets for the main runtime can be rejected early as "Unknown agent", preventing intended switches.
  suggestedFix: In the extension handler, avoid pre-validating with the extension runtime for arg-based switches; set pending switch and let `createSession()` resolve with the main runtime registry/domainContext, surfacing any resolution error there.

### Quality Contract
QC-001: pass — `lib/interactive/agent-switch.ts` stores pending switch via `Symbol.for(...)` on `globalThis`, with no module-local singleton state.
QC-002: pass — `cli/session.ts` rebuilds model/thinking/prompts/tools/extensions/skills through `buildSessionParams()` when a pending switch is consumed.
QC-003: pass — switched-session path calls `buildSessionParams(..., extraExtensionPaths)` so the shared extension path is re-injected after switch.
QC-005: pass — `/agent` with no args opens `ui.select(...)`; `/agent <name>` follows validation then switch flow.
QC-006: pass — extension bootstraps its own `CosmonautsRuntime` with a promise cache keyed by cwd.
QC-007: pass — final switch resolution uses `agentRegistry.resolve(pendingAgentId, domainContext)` from `cli/session.ts` (main runtime inputs), not the extension runtime.
QC-008: pass — invalid IDs notify error and return before `ctx.newSession()`.
QC-009: pass — switched persistent sessions use `join(piSessionDir(cwd), newDef.id)`.
QC-010: pass — cancel/throw paths clear pending switch (`clearPendingSwitch()`), leaving the current session active.
QC-011: pass — shared `buildSessionParams()` is used by switch path and `session-factory`, removing prior duplication.
QC-012: fail — arg validation currently relies on extension runtime `domainContext`, so ambiguous/unqualified IDs are not guaranteed to resolve with main runtime `domainContext`.