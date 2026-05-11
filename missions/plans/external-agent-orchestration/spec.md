# External Agent Orchestration

## Problem

Cosmonauts today orchestrates **internal Pi-backed agents**. Every agent in a chain is a Pi session built from an `AgentDefinition` and run inside the host process. External coding agents (Claude Code, Codex) are reachable only through `drive`, which is a separate execution path with its own `Backend` adapter pattern (`lib/driver/backends/`) that doesn't compose with the chain runner.

This creates two gaps:

1. **External tools can't participate in chains as first-class roles.** A user can't write `cosmonauts --chain "planner -> claude-code-implementer -> reviewer"` and have the middle stage shell out to Claude Code. Drive runs adjacent to chains, not inside them.

2. **Internal agents can't be exported for external runtime use.** A "planner" agent's value is the composed system prompt + capabilities + skill index — but those artifacts are locked inside the cosmonauts process. There is no way to take that planner and run it on top of a Claude Code subscription, where the per-token cost is zero.

The motivation for solving (2) is concrete: Pi no longer offers a flat-rate plan. Running heavy planning workloads through Pi means paying per token. Wrapping `claude` (the CLI), which the user already pays for via Pro/Max subscription, would let cosmonauts-defined agents run effectively for free at the inference layer while preserving cosmonauts' planning discipline (prompts, skills, tools).

## Vision

One declarative model for what an agent **is** (`AgentDefinition`), three runtime modes for **how it executes**:

| Mode | Where | When to use |
|------|-------|-------------|
| **Internal** | In-process Pi session | Default; full Pi feature surface |
| **External (chain stage)** | Subprocess: `claude`, `codex`, etc. | Mix external tools into chains; leverage subscription auth for selected stages |
| **Exported binary** | Standalone Bun-compiled binary that wraps an external CLI | Distribute a cosmonauts agent for use outside the cosmonauts repo; share with users who only have the external tool installed |

The same `AgentDefinition` should drive all three. Differences are confined to a small adapter layer that knows how to translate definition fields (prompt layers, tools, skills, model) into the host runtime's conventions.

## Scope

### In scope

- A unified adapter abstraction for "how to run an agent definition," covering both in-process Pi sessions and subprocess external CLIs.
- Chain runner support for external-CLI stages (`claude-code`, `codex`) declared the same way as internal stages.
- An export command that compiles an agent definition into a standalone binary which wraps an external CLI.
- Mapping table from `AgentDefinition` fields to the corresponding Claude Code CLI flags (and the analogous Codex flags where applicable).
- Subscription-auth safety: exported binaries and external chain stages must not silently fall back to API billing when `ANTHROPIC_API_KEY` is set.

### Out of scope (this spec)

- New external integrations beyond Claude Code and Codex. Other CLIs can be added later by implementing the adapter contract.
- Round-trip orchestration where Claude Code spawns cosmonauts sub-agents back. One-way for now: cosmonauts orchestrates, externals execute.
- Native MCP-server packaging of cosmonauts agents (separate concern).
- Sharing skill/prompt updates back from external runtime activity into cosmonauts memory. Externals are stateless from cosmonauts' POV.

## Key Findings

These findings come from a codebase audit and a study of the Claude Code CLI reference (`https://code.claude.com/docs/en/cli-reference`). They de-risk the design and should not need to be re-derived during planning.

### Claude Code CLI supports full prompt and tool customization

The breakthrough flags:

| Flag | Maps to |
|------|---------|
| `--system-prompt-file <path>` | **Replaces** Claude Code's default system prompt with file contents. This is the seam for baking in cosmonauts' composed prompt. |
| `--append-system-prompt-file <path>` | Layers cosmonauts content on top of Claude Code's default. Useful when we want to keep Claude Code's tool-use instincts and just add discipline. |
| `--tools "Bash,Edit,Read"` | Restricts the built-in tool set. Maps to `AgentDefinition.tools` (`coding` / `readonly` / `verification` / `none`). |
| `--allowedTools` / `--disallowedTools` | Fine-grained permission rules. |
| `--bare` | Skips auto-discovery of hooks, skills, plugins, MCP, CLAUDE.md. Required for hermetic, reproducible scripted runs. |
| `--plugin-dir <path>` | Loads a plugin (which may contain skills) from a directory. The natural delivery vehicle for cosmonauts skills inside an exported binary. |
| `--settings <path-or-json>` | Inline or file-based settings override. |
| `--strict-mcp-config --mcp-config <path>` | Hermetic MCP setup. |
| `--max-turns N`, `--max-budget-usd $`, `--output-format json` | Scripted execution controls. |
| `-p` (`--print`) | Non-interactive single-shot mode. |
| `--agents '<json>'` | Inline subagent definitions. May enable mapping cosmonauts subagent allowlists onto Claude Code's subagent model. |

### Subscription auth requires shelling out, not the SDK

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is **API-key only** — it has no path to Claude Pro/Max subscription billing. The only subscription path is the `claude` CLI binary itself, authenticated via `claude auth login` (interactive) or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` (scripted/CI).

**Critical precedence rule:** If `ANTHROPIC_API_KEY` is set in env, it overrides the OAuth token and forces API billing. Exported binaries and chain external stages must either unset it or refuse to run when it's present, depending on user intent.

### The codebase already has the right seams

From the audit:

- **Agent definitions** (`lib/agents/types.ts:19-46`) are flat TypeScript objects. Adding a `kind: "internal" | "external"` discriminator plus an optional `external?: { runtime, ... }` block is non-disruptive.
- **Prompt assembly** (`lib/domains/prompt-assembly.ts:62+`, function `assemblePrompts()`) is already a pure string-producing function. Callable at build time to bake the composed prompt into a binary asset.
- **Skill discovery** (`lib/skills/discovery.ts:32-47`, function `discoverSkills()`) returns the per-domain skill catalog. Filterable by an agent's `skills[]` allowlist for embedding.
- **Drive's `Backend` adapter** (`lib/driver/backends/types.ts:25-30`, with refs `claude-cli.ts`, `codex.ts`, `cosmonauts-subagent.ts`) is a clean `run(invocation) → {exitCode, stdout, durationMs}` contract. This is the closest thing to the abstraction we need.
- **Chain runner** (`lib/orchestration/chain-runner.ts:200+`) drives stages via an `AgentSpawner` interface (`lib/orchestration/types.ts:318+`). Today it's hardcoded to a Pi spawner. The seam is at `createPiSpawner(...)` — replacing this with a polymorphic spawner that dispatches by `AgentDefinition.kind` is the natural integration point.

### Two adapter abstractions exist; they should converge

`AgentSpawner` (chain runner) and `Backend` (drive) solve overlapping problems with different shapes. Maintaining both indefinitely is a tax. The planner should decide whether to:

- **(a)** Make `AgentSpawner` polymorphic with a new "external" variant that internally delegates to the existing `Backend` registry. Lowest disruption.
- **(b)** Refactor drive `Backend` and chain `AgentSpawner` to a single `AgentRuntime` interface that both consume. Cleaner long-term, more upfront work.
- **(c)** Keep them separate and just add a Pi→external bridge in the chain runner. Highest tech-debt accumulation; not recommended.

Recommendation lean: **(a)** for first ship, with a path documented to **(b)** in a follow-up plan.

## Capabilities to Deliver

### Capability 1: External tools as first-class chain stages

A chain stage referencing an external runtime resolves to a subprocess invocation rather than a Pi session, while sharing the same role-resolution and prompt-passing machinery the chain runner uses today.

**Acceptance shape:**

- A user can declare `cosmonauts --chain "planner -> claude-impl -> reviewer"` where `claude-impl` is an agent definition with `kind: "external"` targeting Claude Code.
- The external stage receives the chain's accumulated context as its prompt input via stdin or a temp file.
- stdout (and structured `--output-format json` when configured) is captured and surfaced to the next stage and to chain logs.
- Failure modes (binary not on PATH, auth missing, exit codes) integrate with the chain runner's existing error handling and global safety caps (`maxTotalIterations`, `timeoutMs`).
- `cosmonauts --list-agents` shows external agents alongside internal ones.

### Capability 2: Export an agent as a standalone binary

A cosmonauts command produces a single distributable binary that, when run, invokes an external CLI with cosmonauts' composed prompt, allowed skills, and tool restrictions baked in.

**Acceptance shape:**

- `cosmonauts export <agent-id> --target claude-cli --out bin/<name>` produces a compiled binary via `bun build --compile`.
- The binary, when run, materializes embedded prompt + skills to a temp working directory and spawns `claude` with the appropriate flags.
- Subscription auth is preserved: the binary refuses to run (or logs a clear warning) when `ANTHROPIC_API_KEY` is set in the environment without explicit opt-in.
- The binary supports `-p`-style usage (prompt as arg or stdin, output to stdout) so it composes with shell pipelines.
- Skill delivery uses one of three strategies (see Open Questions); the planner picks one for v1.

### Capability 3 (implicit): The mapping table

Both capabilities need the same translation: `AgentDefinition` → external runtime configuration. This should be implemented once, in a shared module, and reused.

| `AgentDefinition` field | Claude Code CLI flag | Codex flag (existing in `backends/codex.ts`) |
|---|---|---|
| Composed prompt (`assemblePrompts()` output) | `--system-prompt-file` (replace) or `--append-system-prompt-file` | (Codex doesn't have native equivalent; bake into prompt body) |
| `tools: "coding"` | `--tools "Bash,Edit,Read,Write,..."` | n/a (Codex tool set is fixed) |
| `tools: "readonly"` | `--tools "Read,Glob,Grep,WebSearch,WebFetch"` | n/a |
| `tools: "verification"` | `--tools "Bash,Read,Glob,Grep"` | n/a |
| `tools: "none"` | `--tools ""` | n/a |
| `skills[]` (allowlist) | `--plugin-dir <generated-plugin>` | (Bake skill content into prompt) |
| `model` | `--model <name>` | (Codex uses default) |
| Subagent allowlist | `--agents '<json>'` (optional v2) | n/a |
| `thinkingLevel` | `--effort low\|medium\|high\|xhigh\|max` | n/a |
| Hermetic execution | `--bare --strict-mcp-config --setting-sources ""` | (Codex `--full-auto`) |
| Cost cap | `--max-budget-usd N` | n/a |
| Turn cap | `--max-turns N` | n/a |
| Output format | `--output-format json` | (Codex summary file) |

The mapping module should expose something like `buildClaudeCliInvocation(definition, runtimeOpts) → InvocationSpec` that both the chain external-stage adapter and the binary entrypoint consume.

## Design Constraints

- **No changes to existing internal agent behavior.** Adding `kind: "external"` must be additive; all current chains, workflows, and tests continue to pass unchanged.
- **Subscription billing must be the default for `claude-cli` target.** The integration must take the path that uses the user's Pro/Max subscription, not API billing, unless the user explicitly opts into API billing via flag or env.
- **Hermetic exports.** Exported binaries must not depend on the user having any cosmonauts files on disk. All needed prompt and skill content is embedded.
- **Failure visibility.** When an external stage fails (binary missing, auth misconfigured, exit non-zero), the chain runner surfaces a diagnostic that names the runtime, the binary, and the likely fix — not just a stack trace.
- **Skill delivery is pluggable.** Whether skills are inlined into the prompt or shipped as a Claude Code plugin is a strategy the user (or the agent definition) selects, because the right answer depends on agent size and skill cardinality.

## Suggested First Slice (Minimum to Demonstrate the Idea)

A planner should not plan everything at once. The narrowest cut that proves the architecture:

1. **One external runtime** (`claude-cli`) with one tool target (`coding/planner` or a new `external-planner` definition).
2. **One delivery mode** (exported binary) — the higher-leverage capability since it unlocks subscription billing immediately.
3. **Inline skills** — concatenate allowed skill `.md` files into the composed system prompt. Defer plugin-dir packaging.
4. **No chain integration yet** — prove the binary path end-to-end before unifying with the chain runner.

If that ships and works, follow-up plans add: chain-stage integration, plugin-dir skill packaging, Codex parity, and the unified `AgentRuntime` refactor.

## Open Questions for the Planner

These need a human decision before or during planning. Listed in priority order.

1. **Adapter unification strategy.** (a) Polymorphic `AgentSpawner` delegating to `Backend`, (b) unified `AgentRuntime` refactor, or (c) keep separate. Spec recommends (a) for v1.
2. **Skill delivery strategy.** Inline-in-prompt vs Claude Code plugin-dir vs hybrid. Recommended: inline for v1, plugin-dir for v2.
3. **System prompt mode.** `--system-prompt-file` (replace) loses Claude Code's default tool-use guidance; `--append-system-prompt-file` keeps it but means our prompts run "on top of" Claude Code's identity. Replace gives precision; append gives compatibility. Recommendation: append by default, replace as opt-in for agents that want full identity control.
4. **Auth posture.** Exported binary refuses to run when `ANTHROPIC_API_KEY` is set, warns and continues, or has a `--allow-api-billing` opt-in flag? Recommendation: warn + continue with a clear stderr message, plus a `--strict-subscription` flag to force refuse.
5. **Where does `kind: "external"` live?** New definition file with `kind: "external"`, or a new top-level concept like `ExternalAgentDefinition` separate from `AgentDefinition`? Recommendation: same `AgentDefinition` with discriminator field, since most fields are shared.
6. **Codex parity.** Codex lacks `--system-prompt-file` and `--tools` equivalents. For v1, do we expose Codex as an external chain target only (not as an export target), or do we bake the prompt into the user-message body for Codex? Recommendation: chain target only for v1; defer Codex export until we have a real use case.
7. **Output capture for chain consumption.** When an external stage's output is JSON-shaped (`--output-format json`), how does the next chain stage parse it? Recommendation: chain runner stays format-agnostic; provide a small helper extension that downstream stages can use.

## Risks

- **Claude Code flag drift.** The CLI surface evolves. Our mapping table will need versioning or feature detection (`claude --version` parsing). Mitigation: keep the mapping isolated in one module; add a smoke test that runs `claude --help` in CI.
- **Skill semantics divergence.** Cosmonauts skills assume Pi's on-demand `/skill:name` loading. Inline-in-prompt loses that affordance; plugin-dir partially restores it but may not match Claude Code's skill conventions exactly. Some skills may need rewriting for the external runtime.
- **Auth confusion.** Users will set `ANTHROPIC_API_KEY` for other reasons and be surprised when an exported binary uses subscription auth (or vice versa). Heavy investment in clear startup diagnostics is warranted.
- **Sub-agent allowlists don't transfer cleanly.** Cosmonauts allowlists assume Pi's `spawn_agent` tool. Claude Code has its own subagent system (`--agents`). For agents that spawn sub-agents, mapping is non-trivial. Mitigation: v1 supports only leaf agents (no sub-agent spawning) for the external target.
- **Bun `--compile` portability.** Compiled binaries are platform-specific. Distributing planner agents may require multi-arch builds. Mitigation: document this; defer multi-arch automation.

## File Citations (For the Planner's Convenience)

| Concern | File | Lines |
|---------|------|-------|
| Agent definition shape | `lib/agents/types.ts` | 19-46 |
| Prompt assembly entry point | `lib/domains/prompt-assembly.ts` | 62+ |
| Session creation seam | `lib/orchestration/session-factory.ts` | 44-100 |
| Skill discovery | `lib/skills/discovery.ts` | 32-47 |
| Drive Backend interface | `lib/driver/backends/types.ts` | 25-30 |
| Existing claude-cli backend | `lib/driver/backends/claude-cli.ts` | 10-43 |
| Existing codex backend | `lib/driver/backends/codex.ts` | 12-51 |
| Chain runner entry | `lib/orchestration/chain-runner.ts` | 200+ |
| AgentSpawner interface | `lib/orchestration/types.ts` | 318+ |
| Driver tool registration | `domains/shared/extensions/orchestration/driver-tool.ts` | 71-76 |
| Skill exporter (existing) | `lib/skills/exporter.ts` | 13 |

## References

- Claude Code CLI reference: `https://code.claude.com/docs/en/cli-reference`
- Claude Code authentication: `https://code.claude.com/docs/en/authentication`
- Claude Agent SDK overview: `https://code.claude.com/docs/en/agent-sdk`
- Pi framework reference: the `pi` skill (`domains/shared/skills/pi/SKILL.md`)
- Cosmonauts agent system overview: `AGENTS.md` (Agent System and Three Pillars sections)
