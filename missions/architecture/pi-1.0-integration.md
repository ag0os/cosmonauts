# Pi 1.0 — Feature Audit & Integration Analysis

**Status:** Analysis input for planning, not a plan. It records what Pi 1.0 shipped
and where it could improve cosmonauts or replace cosmonauts-internal code (the
Pi-First audit that `AGENTS.md` asks for on each Pi bump). Written 2026-10-03
against cosmonauts `04ee4aa` (Pi pinned at `0.87.1`) and Pi `v1.0.1`.

**Audience:** future agents who analyze and plan the integration and implementation
of Pi features. Re-verify any claim below against the Pi source before acting
on it. Pi moves fast: 0.87.1 → 1.0.1 took 12 days and five releases.

## Sources and provenance

- **The announcement post was not read.** `https://earendil.com/posts/pi-1-0/`
  was blocked by the analysis session's network egress proxy. Everything here
  comes from the Pi monorepo at tag `v1.0.1`
  (`git clone https://github.com/earendil-works/pi`). The diffs cover
  `v0.87.1..v1.0.1`. If you can reach the post, read it for framing and
  priorities that the changelogs don't carry.
- **Primary Pi files consulted** (paths relative to the Pi repo root):
  - `packages/{coding-agent,agent,ai,tui}/CHANGELOG.md`, the sections 0.99.0 → 1.0.1.
  - `packages/coding-agent/docs/{extensions,virtual-models,codemode,mcp,models,sdk}.md`.
  - `packages/{durable,server,protocol,client,chord,codemode,mcp,telemetry,evals}/README.md`.
  - `packages/coding-agent/src/experimental/services/README.md`, which covers the server and client slice.
  - `packages/durable/test/examples/*`: 22 for a foreground subagent, 23 for background subagents, 24 for child tasks, 27 for plan mode, 28 for the reviewer.
  - `packages/coding-agent/examples/extensions/jev-router.ts`, a virtual-model router.
  - `packages/coding-agent/examples/sdk/14-codemode-mcp.ts`.
- **The cosmonauts-side survey** was done by reading and grepping at `04ee4aa`. LOC counts
  exclude tests and are approximate.

## TL;DR

1. **Bump to 1.0.1 now.** It is low risk and has been verified (see below). Update the
   `pi` skill (`domains/shared/skills/pi/SKILL.md`) in the same change.
2. **Highest-value features, which are stable and live in `pi-coding-agent`:**
   - codemode
   - tool `exposure`, `annotations` and nested `ctx.executeTool()`
   - virtual models
   - built-in MCP
   - classifier models
3. **Watch but don't adopt:**
   - `pi-durable` overlaps most with our durable runtime, but it is experimental and uses its own extension model.
   - `pi-server`, `pi-protocol`, `pi-client` and `chord` are experimental and excluded from the npm package.

## Upgrade verification (0.87.1 → 1.0.1)

**Evidence.** In a throwaway worktree, the four `@earendil-works/pi-*` versions
were bumped to `1.0.1` (lockstep) and then `bun install` was run.

- **`tsc --noEmit` is clean.**
- **`bun run test` gives 5473 passed, 18 failed and 3 skipped.**
  - The same failing tests also fail on 0.87.1 in that container. They are environment-sensitive tests: process reaping, fallow binary resolution, chmod-as-root, execution-probe and the Claude command baseline.
  - One test failed only on 1.0.1 under full-suite load: `quality-review-run > blocks a ready claim when the host observed an unbound audit`. It passed 3 out of 3 times in isolation, so treat it as a load flake rather than a Pi regression.
  - `bun run lint` was not run.
- **To reproduce:** bump the versions, run `bun install`, `bun run typecheck` and `bun run test`, then
  diff the failing tests against a 0.87.1 run in the same environment.

**Why it's low risk.** Pi 1.0's only hard break in our dependency set is in
`pi-agent-core`. It removed the experimental harness: `AgentHarness`,
sessions and session storage, the durable runtime, pico3, harness tools, compaction, skills,
prompt templates, system-prompt helpers, telemetry schemas, `uuidv7`, and the
`./node`, `./harness/*` and `./experimental/pico3` subpaths. Cosmonauts imports
none of that. From `pi-agent-core` we use:

- `type ThinkingLevel` (10 production files)
- `type AgentMessage` (`cli/architecture/narrative-provider.ts`)
- `runAgentLoop` and `AgentContext`/`AgentTool`/`AgentToolResult`, in tests only (`tests/pi-contract/pi-behavior-contract.test.ts`)

All of these remain in 1.0. Every `pi-coding-agent` symbol we import is still
exported from its `src/index.ts` in 1.0.1, including `parseSkillBlock`, `Skill`,
`ResourceDiagnostic`, `createAgentSessionRuntime`,
`createAgentSessionFromServices`, `createAgentSessionServices`,
`CreateAgentSessionRuntimeFactory`, `runPrintMode`, `InteractiveMode`,
`SessionInfo`, `isEditToolResult`, `getAgentDir`, `InlineExtension` and
`ModelRuntime`.

**Notes for the bump PR:**
- Pi 1.0.1 removed `npm-shrinkwrap.json` from the published package. Pi's transitive
  dependencies are no longer pinned by Pi, so `bun.lock` is now the only pin.
- 0.99.0 note: `--no-extensions` now also disables Pi's built-in extensions.
  Built-ins are named `builtin:<name>`.
- 0.99.0 note: the `tui` `queryTerminalColorScheme()` and `queryTerminalBackgroundColor()` were replaced by
  `queryTerminalColors()`. We don't use them; we only use `Text` and `Box`.

## Cosmonauts' current Pi surface (as of `04ee4aa`)

- **`pi-coding-agent`, the heavy dependency:**
  - Session and runtime: `createAgentSession`, `AgentSession`, `SessionManager`, `SettingsManager`, `ModelRegistry`, `ModelRuntime`, `DefaultResourceLoader`. Used in `lib/orchestration/session-factory.ts`, `lib/orchestration/agent-spawner.ts`, `cli/pi-session.ts`, `cli/session.ts`, `lib/orchestration/{definition,model}-resolution.ts`.
  - `InteractiveMode` and `runPrintMode` in `cli/main.ts`.
  - Extension API types in about 20 extension files under `domains/shared/extensions/*`, `bundled/*/extensions/*` and `lib/extensions/*`.
- **`pi-ai`:** `builtinModels` (`pi-ai/providers/all`, in `model-resolution.ts`), `Api`, `Model`, `AssistantMessage`, `TextContent`, and faux-provider helpers in tests.
- **`pi-tui`:** `Text` and `Box` only (`domains/shared/extensions/orchestration/*`).
- **Every child agent** is an in-process Pi `createAgentSession` in one Bun process
  (`lib/orchestration/session-factory.ts`).

## What Pi shipped between 0.87.1 and 1.0.1

### Stable, in `pi-coding-agent` (the package we already depend on)

| Feature | What it is | Pi docs |
|---|---|---|
| **Codemode** (0.99.0; trimmed about 40% in 1.0.0) | A `codemode` tool runs model-written JS in a QuickJS/WASM sandbox. Its only capability is calling tools, with `Promise.all` parallelism and `store`/`load`. Nested results stay out of the LLM context; only the script output does. Scripts also get `models.classify()` and `models.generateImages()`. Off unless enabled (`"defaultTools": ["+codemode"]`). | `docs/codemode.md`, `docs/cli.md#enable-codemode` |
| **Tool exposure** | `exposure: direct \| model-only \| codemode \| deferred \| hidden`, plus `namespace`, `annotations` (MCP-style `readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`), `outputSchema` + `structuredContent`, `isError` results, and `prepareLoadout()`. | `docs/extensions.md#tool-exposure` |
| **Nested tool calls** | `ctx.executeTool(name, args, { signal, onUpdate })`. Validation and `tool_call`/`tool_result` handlers apply. Events carry `parentToolCallId`. A bounded `nestedCalls` record goes on the caller's result, and nested `usage` rolls up into the caller's usage. | `docs/extensions.md` |
| **`tool_search`** | Finds and activates `deferred` tools on demand. | `docs/mcp.md#control-tool-exposure` |
| **MCP** | stdio and streamable HTTP, OAuth (CIMD, RFC 9207, per-server credentials, step-up), `mcp.json` (global or project with overrides), `/mcp`, `pi mcp add\|remove\|list\|login\|logout`, `pi.registerMcpServer()` / `unregisterMcpServer()` / `getMcpServers()`, `mcp_servers_change`. | `docs/mcp.md` |
| **Virtual models** (experimental) | `pi.registerVirtualModel({ provider, id, route })`. `route(request, ctx)` picks a physical model and thinking level per request. It sees `reason` (`user\|continuation\|retry\|direct`), `previous`, `failed` (with `errorMessage`) and router `state`, which is persisted on the session branch. SDK: `modelRuntime.registerVirtualModel()`. | `docs/virtual-models.md` |
| **Classifier models** | `ctx.modelRegistry.classify()` and codemode `models.classify()`, using a provider-neutral `choice`/`score`/`bool` contract. Providers: TypeSafe Jev (direct, OpenRouter, Cloudflare, Vercel, OpenCode Zen), Cloudflare Clef, and any llama.cpp chat model. | `docs/models.md#use-classifier-models` |
| **Image models** | `ctx.modelRegistry.generateImages()` and codemode `models.generateImages()`. | `docs/models.md#use-image-models` |
| **Tool renderers for any tool** (1.0.1) | `pi.registerToolRenderer((toolName, next) => …)` covers tools that are not registered yet, for example in resumed sessions. | `docs/extensions.md#tool-rendering` |
| **`provider_stream_event`** | Observes parsed provider events before Pi normalizes them. | `docs/extensions.md` |
| **Smaller items** | `steer()` and `followUp()` return a `"queued" \| "handled"` disposition. `AssistantMessage.thinkingLevel` is recorded. `/reload` enables new `defaultTools`. `+name`/`-name` work in `defaultTools`. Anthropic tools added mid-conversation are sent inline (`inline-tools-2026-09-15` beta), which keeps the prompt cache. Anthropic workload identity federation. Fullscreen TUI by default. | changelogs |

**SDK caveat that matters for us.** The CLI loads `codemode`, `tool_search` and MCP
as built-in extensions, but SDK sessions do not. Cosmonauts builds its sessions
through the SDK, so it must add `createCodemodeExtension()`,
`createToolSearchExtension()` and `createMcpExtension()` to the
`DefaultResourceLoader` `extensionFactories`. It must also call `session.bindExtensions()`,
because MCP connects on `session_start`. See `docs/sdk.md#codemode-mcp` and
`examples/sdk/14-codemode-mcp.ts`.

### New packages

| Package | Status | What it is |
|---|---|---|
| `@earendil-works/pi-durable` | **Experimental** ("API changes without notice") | A durable agent harness on SQLite, JSONL or memory storage. Details below the table. |
| `@earendil-works/pi-server` / `pi-protocol` / `pi-client` | **Experimental**, "no compatibility guarantees" | A local server that routes clients to durable Sessions over Unix sockets, with CBOR-framed routed envelopes and attach/detach of multiple presentations. The coding agent's `pi server` and `pi client` exist only behind `PI_EXPERIMENTAL=1` and are **excluded from the npm package**. |
| `@earendil-works/chord` | Standalone (not "a Pi package") | An app-composition runtime: plugins and facets per process (worker, TUI, web), typed services, replicated state with JSON deltas, and a Go-like `Context` for cancellation. It is the substrate for durable and the server. |
| `@earendil-works/pi-codemode` | Published | A standalone QuickJS sandbox (`CodemodeSandbox`, `renderDeclarations()`) with no Pi deps. It can expose any functions to model-written scripts. |
| `@earendil-works/pi-mcp` | Published | A standalone MCP client (`McpClient`, stdio and HTTP transports, `/oauth`, `toLlmContent()`) with no SDK dependency. |
| `@earendil-works/pi-telemetry` | Published | A vendor-neutral `TelemetryContext`/`TelemetrySpan` contract, a no-op and an in-memory reference adapter, and typed schemas. No exporter. |
| `@earendil-works/pi-evals` | **Private**, not published | Behavioral evals built on `vitest-evals`. Paired `without_docs`/`with_docs` arms run in fresh Docker containers and report pass-rate "lift". |

**What `pi-durable` provides:**
- Every entry, tool call and document is committed before it is shown.
- Crash resume via `harness.resume()`.
- Duplicate-safe `submit()` keyed on `requestId`.
- Tools declared `replay: "safe"` re-run after a crash; other tools return an `interrupted` result.
- Conversations owned by tasks (subagents), with bottom-up abort and `{ background: true }` boundaries.
- Child tasks waiting on `allSettled` or `failFast`.
- A live `taskGraph()`.
- Inbox steer, follow-up and write.
- Background, manual and overflow compaction.
- Per-model and per-tool usage in `pi.usage`.
- Its own `defineExtension`/`defineTool`/`hook` model, and `watchEvents()` for coding-agent-style events.
- **Limits:** one process owns a storage at a time, with no cross-process locking.

## Recommendations

Each item: the Pi feature, then the cosmonauts code or plan it touches, then the payoff.

### 1. Codemode → agent-written orchestration scripts

- **Fit.** Codemode lines up closely with Wave F of `missions/architecture/orchestration-future.md` ("Unattended script coordination") and with the script-coordinated mode first sketched in `docs/designs/script-orchestration.md`, now superseded into `orchestration-future.md`.
- **How.** Give `spawn_agent`, `chain_run` and `run_driver` an `outputSchema` and return `structuredContent`. Tools live in `domains/shared/extensions/orchestration/{spawn-tool,chain-tool,driver-tool}.ts`. Then cosmo could write scripts like "fan out 4 reviewers, branch on verdicts", with no chain-DSL growth (`lib/orchestration/chain-parser.ts`).
- **Limits still apply.** Our spawn limits (`lib/orchestration/spawn-limits.ts`: 5 concurrent, depth 2) still bind, because nested calls go through the same tools.
- **Payoff:** Pi takes over a planned subsystem instead of us building it.

### 2. Tool exposure, annotations and nested calls

- **Exposure.** Cosmo carries many orchestration tools, and lazy loading would cut prompt tokens. Today we pass only a flat allowlist (`buildToolAllowlist` in `lib/orchestration/definition-resolution.ts`, presets `coding`/`readonly`/`verification`/`none`), with no deferred loading or tool search.
- **Annotations.** The `readonly` preset, `bundled/lean/extensions/role-guard` and Drive's destructive-git guard (`lib/agents/session-assembly.ts`) could key off `readOnlyHint` and `destructiveHint` instead of tool-name lists.
- **Nested calls.** `ctx.executeTool()` rolls nested `usage` up into the caller, which helps cost accounting across the run tree (Wave D, "cost/token budgets").
- **Payoff:** less custom guard and allowlist code.

### 3. Virtual models → model failover and phase routing

- **Failover.** `route()` gets `reason: "retry"` with `failed.message.errorMessage` (overloaded, context overflow) and can switch models. That covers `model-failover` (`orchestration-future.md`: "Model failover … should be pulled into the earliest wave whose behavior requires them").
- **Phase routing.** One name such as `cosmonauts/auto` could route by phase, for example plan on a strong model and build on a cheaper one. Router `state` persists on the session branch.
- **Current resolution chain.** Today model resolution is static: role → config `models` → definition → `FALLBACK_MODEL` (`lib/orchestration/model-resolution.ts`). There is no runtime failover.
- **Experimental:** Pi marks virtual models experimental.
- **Payoff:** we drop planned custom work.

### 4. MCP, built in

- **Wiring.** Add the three built-in extension factories during session assembly (see the SDK caveat above). Then an agent definition (`lib/agents/types.ts`) could declare its own `mcpServers`, registered through `pi.registerMcpServer()`.
- **Roadmap.** This covers `analysis-tools` "Additional MCP/Node transports" (`ROADMAP.md`). Cosmonauts has no MCP support today.
- **Payoff:** new capability for little effort.

### 5. Classifier models

- **Fit.** `ctx.modelRegistry.classify()` asks cheap choice, score or bool questions. It fits domain routing (`ROADMAP.md` `domains`: "`cosmo` picks the right domain") and could gate routing inside a virtual model (#3).
- **Not a fit.** It does not replace `cli/memory/judgment-provider.ts` or `cli/architecture/narrative-provider.ts`, which need free-form strict-JSON answers through `cli/pi-session.ts` `createToollessPiSession`.
- **Needs a classifier provider:** TypeSafe Jev, llama.cpp, OpenRouter or Cloudflare.

### 6. `pi-durable`: watch, don't adopt

- **Overlap.** It overlaps the most with what we've built:
  - `lib/durable-runtime` (about 4.4k LOC: `FileRunStore`, `scheduler.ts` with leases, heartbeat and resume, `controller.ts`)
  - `lib/orchestration/durable-chain-runner.ts`
  - `lib/orchestration/spawn-tracker.ts`
  - the driver's durable steps and events

  It is also close to what the active `execution-liveness` plan and the `drive-envelope` roadmap item want: leases, descendant cancellation, persisting planless sessions, start/attach, status/watch, cancel.
- **Why not adopt yet:**
  - **Explicitly experimental:** "the API changes without notice".
  - **Its own extension model** (`defineExtension`/`defineTool`/`hook`, sections instead of `DefaultResourceLoader`). Our agent stack (resource loader, skills, four-layer prompts, Pi extensions) would not carry over, so adoption means a rewrite.
  - **One process owns a storage at a time**, with no cross-process locking. That clashes with detached Drive processes and our lease scheduler.
  - **Pi's own coding agent hasn't moved to it.** Only the experimental server worker uses it. Stable `AgentSession` still uses JSONL `SessionManager`.
- **What to do now:** align our naming and semantics with it: task ownership, `allSettled` vs. `failFast`, `requestId` idempotency, `replay: "safe"`, background boundaries. Spike once the coding agent depends on it.

### 7. `pi-server`, `pi-protocol`, `pi-client` and `chord`: watch

- **Fit.** They match `ROADMAP.md` `agent-interaction` (attached coordinators, detach and reattach), `autonomy` (daemon W2 and `channels`), `coordinator-packages`, and `artifact-viewer` (live run visibility, message injection). `orchestration-future.md` lists "first non-CLI binding for the coordinator-control protocol" as an open decision.
- **Why wait:** they are experimental, the protocol says it has no compatibility guarantees, and the coding agent leaves the server and client out of its npm package.
- **What to do now:** watch them.

### 8. Smaller items

- **`pi-telemetry`.** `lib/orchestration/chain-profiler.ts` (Chrome-trace JSONL) could emit spans through `TelemetryContext`, which would make OpenTelemetry an adapter later.
- **`pi-evals`.** It's private, so copy the pattern rather than the package. The paired-arm "lift" design with a frozen cohort and blocked-pair rules fits `factory-evals` (`ROADMAP.md`) for measuring prompt, skill or agent changes.
- **Free with the bump:**
  - The Anthropic inline-tools beta keeps the prompt cache when tools change mid-conversation. That helps `/agent` switches (agent-switch extension) and `setActiveTools` changes.
  - `registerToolRenderer` keeps spawn and chain renderers working in resumed sessions (`domains/shared/extensions/orchestration/{spawn-tool,chain-tool,rendering}.ts`).
  - `AssistantMessage.thinkingLevel` is recorded, which is useful for stats (`lib/orchestration/chain-stats.ts`).

## Suggested order

1. Bump to 1.0.1 and update the `pi` skill doc.
2. Turn on MCP, codemode and tool search in session assembly, behind each agent definition.
3. Spike codemode-driven orchestration: give `spawn_agent` and `chain_run` structured results, and compare against Wave F.
4. Build model failover as a virtual model instead of custom code.
5. Track `pi-durable` and `pi-server`, and keep our durable runtime's concepts close to theirs.

## Open questions for the next agent

- **Codemode and spawn concurrency.** Do codemode scripts calling `spawn_agent` in
  `Promise.all` interact correctly with `spawn-limits.ts` and the in-process
  semaphore? What happens to a script whose nested spawn outlives the codemode
  timeout (`codemode.inlineBudget`, `timeout_ms`)?
- **Exposure vs. our allowlist.** Does Pi's `exposure` compose with the `tools` allowlist we pass to
  `createAgentSession`? Or does the allowlist filter registration so that `deferred`
  tools never become reachable? Check `session-factory.ts` against Pi's
  `core/sdk.ts` in 1.0.1.
- **Virtual models across our session types.** Do virtual-model routes and router `state` survive our `SessionManager`
  usage? Cosmonauts uses in-memory sessions for most spawns and file-backed sessions only for plan and
  quality-review runs.
- **MCP scoping.** Should MCP be per agent definition, per domain (`domain.ts` manifest), or
  per project (`.pi/mcp.json` is already honored by Pi once the extension is
  loaded)?
- **Durable gaps.** Re-check `pi-durable` on each Pi bump: has the coding agent's stable path
  moved onto it, has the API settled, and is there cross-process ownership?
- **The announcement post.** Read it when reachable. It may state Pi's roadmap direction
  (for example durable becoming the default runtime), which would change the "watch"
  verdicts in #6 and #7.

## Corrections (2026-10-05)

Added after the planning outline and two spikes re-checked this audit against the Pi source (tags `v1.0.1`, `v1.0.3`) and the installed packages. Nothing above was rewritten; where a line below disagrees with the text above, this section wins. Paths under `node_modules/@earendil-works/` are the installed Pi 1.0.3 (`bun install` at `19592410` or later); other paths are this repository.

### Three findings that change the plan

1. **Our tool allowlist and Pi's tool exposure do not compose.** `buildToolAllowlist` (`lib/orchestration/definition-resolution.ts:46`) is passed as `tools` (`lib/orchestration/session-factory.ts:299-313`, `cli/session.ts:70, 622, 654`). Pi treats `tools` as a filter **by name** at every registration (`pi-coding-agent/dist/core/agent-session.js:1099-1100`, `dist/core/sdk.js:145-148`). Two things follow. Every listed tool is active from the start, so `deferred` exposure defers nothing, and adding the codemode factory switches codemode on for every agent that gets it. And no tool whose name is unknown when the list is built (MCP's `mcp__<server>__<tool>`) is ever registered.
2. **Spawned sessions never emit `session_start`.** Pi emits it in `session.bindExtensions()` (`pi-coding-agent/dist/core/agent-session.js:2562-2582`). Pi's own print and interactive modes call that (`dist/modes/print-mode.js:53`, `dist/modes/interactive/interactive-mode.js:1472`); Cosmonauts never does (no `bindExtensions` in `lib`, `cli`, `domains`, `bundled`; spawns go through `lib/orchestration/agent-spawner.ts:189`). MCP connects on `session_start`, so it would never connect in a spawned agent.
3. **`spawn_agent` accepts and detaches.** It returns `Accepted spawn of <role>` at once and runs the child as a detached promise (`domains/shared/extensions/orchestration/spawn-tool.ts:857, 893-900`); the child's result arrives later as a message. Past the limits it returns a normal, non-error result reading `spawn_agent rejected: depth or concurrency limit reached` (`spawn-tool.ts:744`). The tool's signal goes only to the quality-review launch (`spawn-tool.ts:517, 816-820`), so nothing cancels a child. A codemode script that awaits `spawn_agent` gets the acceptance text, not the result.

### Corrected claims

- **Recommendation 1 (codemode).** An `outputSchema` does not make `spawn_agent` scriptable, because it returns before the child runs (finding 3). `chain_run` is different: it awaits the chain and returns its result (`domains/shared/extensions/orchestration/chain-tool.ts:213-237`), so an `outputSchema` with `structuredContent` would hand a script that result (`pi-coding-agent/docs/extensions.md:146`). `run_driver` returns a run id (`domains/shared/extensions/orchestration/driver-tool.ts:350-357`). `codemode.inlineBudget` is a token budget for tool declarations in the `codemode` description, not a timeout. The only deadline is a script's `timeout_ms`, which is unset by default (`pi-coding-agent/docs/settings.md:42`, `docs/codemode.md:16`). "Off unless enabled" holds for the `pi` CLI, but on Cosmonauts' allowlist path the factory alone turns codemode on (finding 1).
- **Recommendation 2 (exposure, annotations, nested calls).**
  - Exposure is defeated by the allowlist (finding 1).
  - Annotations cannot replace the guards. The lean role guard and Drive's destructive-git guard read the **bash command string** (`bundled/lean/extensions/role-guard/index.ts:83-124`, `lib/agents/session-assembly.ts:264`). A hint describes a tool, not a call. Pi's built-in tools carry no annotations, and only `bash` has an `outputSchema` (`pi-coding-agent/dist/core/tools/bash.js`).
  - Nested usage does not roll children up, because spawned children are separate sessions, not nested tool calls. What works is a tool that runs sessions inside its own call returning their `usage` on its result. `lean_build` and `lean_review` now do (`bundled/lean/extensions/lean-run/index.ts:208-212`).
  - Measured declarations: the lean lead declares 12 tools, cosmo 21.
- **Recommendation 3 (virtual models).**
  - Pi auto-retries, and so asks a router with `reason: "retry"`, only errors it classifies as transient (`pi-ai/dist/utils/retry.js:23-87, 183-190`). Quota, billing and subscription-limit errors are never retried (`retry.js:4-22`).
  - On `openai-codex`, the provider of every default agent, an HTTP error response with status 429 or a `usage_limit_reached`/`usage_not_included`/`rate_limit_exceeded` code that the adapter's own transport retries did not clear becomes "You have hit your ChatGPT usage limit…" (`pi-ai/dist/api/openai-codex-responses.js:55-63, 287-302, 1249-1255`), which Pi's auto-retry does not retry. Errors that arrive as stream events (`error`, `response.failed`) keep the server's message (`openai-codex-responses.js:547-558`) and are retried when it reads as transient. So a failover router there is consulted on transient errors (5xx, network, and overload, capacity or rate-limit messages), never on that usage-limit text, and "that covers `model-failover`" is wrong for the failure that matters here, running out of usage.
  - A virtual model must be registered per session through the SDK (`modelRuntime.registerVirtualModel`, `pi-coding-agent/dist/core/model-runtime.d.ts:124`) before the model is resolved. Cosmonauts resolves the model before extensions load (`lib/agents/session-assembly.ts:300`, then `lib/orchestration/session-factory.ts:293`), so an extension registers too late.
- **Recommendation 4 (MCP).** "Little effort" is wrong. Three things in our code stand in the way: the allowlist drops MCP tools (finding 1), spawned sessions never emit `session_start` (finding 2), and MCP's default exposure (`codemode`) needs codemode on, which the extension switches on by itself unless `autoEnableCodemode` is `false` (`pi-coding-agent/docs/mcp.md:228`). Interactive `cosmonauts` and `--print` already emit `session_start` through Pi's modes.
- **Recommendation 5 (classifier models).** No consumer yet: Cosmonauts has no classifier provider configured (default agents run on `openai-codex`), and its two fits (domain routing, routing inside a virtual model) are out of reach for now.
- **Recommendation 8 (smaller items).**
  - `registerToolRenderer` is not free with the bump: Cosmonauts would have to call it, and does not (no call in `lib`, `cli`, `domains`, `bundled`).
  - `pi-telemetry` through the chain profiler buys little: `lib/orchestration/chain-profiler.ts` is imported only by `cli/chain-execution.ts`.
  - Inline Anthropic tools and the recorded `thinkingLevel` are real and already in effect.
- **Pi version.** Cosmonauts is on Pi **1.0.3** (`package.json`), not 1.0.1. 1.0.3's only breaking change is the Azure provider rename (`azure-openai-responses` → `azure`), which no Cosmonauts code references.
- **Open questions.** Codemode and spawn concurrency: finding 3. Exposure against the allowlist: finding 1. Virtual models across session types: router state is a session entry, so it lives as long as the session; the real constraint is registering before the model is resolved (above). MCP scoping: open, for the check-tool brainstorm. Durable gaps: unchanged at 1.0.3 (still experimental; the published coding agent does not depend on `pi-durable`, `pi-coding-agent/package.json:50-55`). The announcement post changed none of the "watch" verdicts.

### Spike results

- **S1a, no spend** (real Pi 1.0.3 on the faux provider, real builder, lead and cosmo assembly). With codemode `on`, declared tool size grows by 59% for the builder, 13% for the lead and 16% for cosmo. `only` shrinks the lead's and cosmo's by 22% and 27%, but routes every call through scripts, and cosmo's listing overflows the inline budget. Pi's codemode prompt line and guideline never reach a Cosmonauts model: a replacement system prompt drops Pi's tool snippets and guidelines (`pi-coding-agent/dist/core/system-prompt.js:76-85`). The lean role guard blocks `git commit` from inside a script exactly as from a direct call; `sh -c` gets through both ways (the guard's documented gap). A health-hook finding is always logged, but reaches the model only when the script returns the nested write's result.
- **S1b, live** (codemode `on` for `lean/builder` only, no prompt cue, two builds of the saved plan): both `done`, $1.25 and $1.12, acceptance 34/34, **0 codemode calls**; every health finding reached the model and was acted on.

### Rulings

- **Stop 0 (human, 2026-10-05):** move to Pi 1.0.3 before building (done, `19592410`). Failover parked: no run on record ended on a provider failure, and on `openai-codex` Pi's auto-retry never retries the usage-limit text, so a failover router would not see it. The lean run's usage reaches the lead's session totals (built, `b8db84ac`).
- **Stop 1 (human, 2026-10-05):** no role gets codemode or tool search now: codemode on the S1a and S1b evidence, tool search declined with it, untried; reversible by one name in an agent definition's `extensions` list. The codemode opt-in and the script fan-out spike are dropped. Tool selection without a fixed name list waits for MCP in Pi sessions, together with the question of which session paths (Drive, chains, quality review) that change may reach. MCP waits for the check-tool brainstorm, which decides where MCP servers are declared and who gets them.
