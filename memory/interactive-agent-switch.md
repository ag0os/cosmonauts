---
source: archive
plan: interactive-agent-switch
distilledAt: 2026-04-15T15:05:00Z
---

# Interactive Agent Switching via /agent Command

## What Was Built

Added interactive agent switching so a running Cosmonauts REPL can start a fresh session as another agent without restarting the CLI. The switch path rebuilds the full target agent identity — prompt layers, tools, extensions, skills, model, and thinking level — instead of resuming an existing conversation under the old runtime. The work also extracted a shared session-assembly builder so interactive and orchestration session creation use the same prompt/tool/model wiring.

## Key Decisions

- **Use `ctx.newSession()` rather than Pi `switchSession()`.** Agent switching needs a brand-new runtime with a different agent definition; `switchSession()` only resumes an existing session file.
- **Bridge CLI code and extension code through `globalThis[Symbol.for(...)]`.** Pi loads extensions through jiti with `moduleCache: false`, so module-local state is not a safe communication channel.
- **Centralize session setup in `buildSessionParams()`.** Prompt assembly, identity markers, tools, extensions, skills, model resolution, and thinking level are shared logic and must not drift between normal startup and switch-driven startup.
- **Validate the target agent before tearing down the current session.** Invalid `/agent` input should fail in-place and keep the current session usable.
- **Use the system-prompt identity marker as the source of truth for the active agent.** The extension reads the marker on `session_start` instead of maintaining separate “current agent” state.

## Patterns Established

- **Process-global switch ports should carry plain identifiers, not complex runtime objects.** The switch boundary passes an agent ID string and lets the main runtime resolve the real definition.
- **Any new session creation path should call `lib/agents/session-assembly.ts`.** Do not duplicate prompt, extension, skill, or model assembly inline.
- **Interactive extensions that must survive session replacement belong in `extraExtensionPaths`.** The target agent definition does not need to list them explicitly.
- **UI status about the active agent should derive from `extractAgentIdFromSystemPrompt()`.** Runtime identity is embedded in prompts, so the UI can observe it without extra bookkeeping.
- **Context-destroying interactive commands need cleanup on cancel/error.** Pending global switch state must be cleared if `ctx.newSession()` is cancelled or throws.

## Files Changed

- `lib/agents/session-assembly.ts` — new shared builder for prompt assembly, identity marker injection, tool resolution, extension resolution, skill filtering, model resolution, and thinking level selection.
- `cli/session.ts` — refactored to use `buildSessionParams()` and extended with switch-aware `createRuntime` logic plus injected registry/domain context/extra extensions.
- `lib/orchestration/session-factory.ts` — refactored to use the same session-assembly builder as the CLI path.
- `lib/interactive/agent-switch.ts` — process-global pending-switch port used to hand the next agent ID from extension code to session creation.
- `domains/shared/extensions/agent-switch/index.ts` — `/agent` command, agent selector, validation, cancellation cleanup, argument completion, and switch status notification.
- `cli/main.ts` — wires the agent-switch extension into interactive sessions and passes the registry/domain context needed for resolution.
- `tests/agents/session-assembly.test.ts`, `tests/interactive/agent-switch.test.ts`, `tests/extensions/agent-switch.test.ts` — lock in session assembly behavior, switch-port semantics, invalid-ID handling, cancellation cleanup, and domain-context-aware resolution.

## Gotchas & Lessons

- **jiti module isolation is the core constraint.** Shared state between CLI code and extensions must live on `globalThis` behind a `Symbol.for()` key.
- **The agent-switch extension must be re-injected after every switch.** If it is only listed on the starting agent, users can switch once and then lose `/agent` in the new session.
- **Unqualified agent IDs need main-runtime domain context.** Multi-domain setups can make names ambiguous; resolution must use the CLI’s registry context, not ad-hoc defaults.
- **The session-assembly extraction is part of the feature, not incidental refactoring.** Without it, the switch path would create a fragile third copy of core session bootstrapping logic.
- **Session storage behavior is coupled to Pi internals.** The original design explicitly cared about keeping switched sessions associated with the target agent’s history, so future changes around `newSession()` and `SessionManager` should be reviewed carefully.
