# Pi Agent Framework — Reference for Cosmonauts

Investigation of `@mariozechner/pi-coding-agent` (monorepo: `badlogic/pi-mono`) and its ecosystem. This document captures the actual API surface, capabilities, and patterns we should leverage — and where we're building something Pi deliberately doesn't include.

## Package Structure

Pi ships as four npm packages under `@mariozechner/`:

| Package | Purpose |
|---------|---------|
| `pi-coding-agent` | Main runtime: sessions, tools, skills, extensions, REPL, CLI |
| `pi-ai` | Unified multi-provider LLM API (20+ providers), streaming, model registry |
| `pi-agent-core` | Core types: `Agent`, `AgentEvent`, `AgentMessage`, `AgentTool`, `ThinkingLevel` |
| `pi-tui` | Terminal UI library (components, editor, rendering) |

All packages follow lockstep versioning (currently v0.66.1 in this repo). The binary is `pi`.

---

## Core API: `createAgentSession()`

This is the main entry point for programmatic (embedded) use. Returns `{ session: AgentSession, extensionsResult, modelFallbackMessage? }`.

```typescript
import { createAgentSession } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({
  cwd: string,                    // Working directory (default: process.cwd())
  agentDir: string,               // Config dir (default: ~/.pi/agent)
  authStorage: AuthStorage,       // API keys + OAuth creds (use static factories: .create(), .fromStorage(), .inMemory())
  modelRegistry: ModelRegistry,   // Available models
  model: Model,                   // Initial model (e.g. "anthropic/claude-sonnet-4-5")
  thinkingLevel: ThinkingLevel,   // "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
  tools: Tool[],                  // Built-in tool set (codingTools or readOnlyTools)
  customTools: ToolDefinition[],  // Additional tools (extensions register these)
  resourceLoader: ResourceLoader, // Controls skill/extension/prompt discovery
  sessionManager: SessionManager, // Session persistence backend
  settingsManager: SettingsManager, // Cache, compaction, retry settings
});
```

### AgentSession

```typescript
interface AgentSession {
  // Messaging
  prompt(text: string, options?: { images?: ImageContent[] }): Promise<void>;
  steer(text: string): Promise<void>;   // Queue mid-stream interruption

  // Events
  subscribe(handler: EventHandler): () => void;  // Returns unsubscribe fn

  // State
  messages: AgentMessage[];
  sessionId: string;
  isStreaming: boolean;
  agent: Agent;

  // Model control
  setModel(model: Model): void;
  cycleModel(): void;

  // Lifecycle
  abort(): Promise<void>;
  dispose(): void;
}
```

Session replacement APIs such as new-session, resume, fork, and import no longer live on `AgentSession`. Use `createAgentSessionRuntime()` and `AgentSessionRuntime` for `newSession()`, `switchSession()`, `fork()`, and `importFromJsonl()`.

### Session Persistence

```typescript
// File-based (persistent) — for long-lived agents
const sm = SessionManager.open(filePath);

// In-memory (ephemeral) — for short-lived workers
const sm = SessionManager.inMemory();

// JSONL format, tree structure (supports branching without new files)
// Operations: appendMessage(), branch(), appendCompaction()
```

### Pre-built Tool Sets

Pi exports two ready-made tool arrays:

- **`codingTools`**: `read`, `bash`, `edit`, `write` — full coding capability
- **`readOnlyTools`**: `read`, `grep`, `find`, `ls` — exploration only

Tool factory functions (`createCodingTools(cwd)`, `createReadOnlyTools(cwd)`) accept a custom `cwd` for path resolution. Individual factories are also available: `createReadTool`, `createBashTool`, `createEditTool`, `createWriteTool`, `createGrepTool`, `createFindTool`, `createLsTool`.

The `allTools` object in `packages/coding-agent/src/core/tools/index.ts` lists all available built-in tools by name. Extensions can **override built-in tools** by registering a tool with the same name. The `--no-tools` flag disables all built-ins.

### System Prompt Composition

Pi's `buildSystemPrompt()` assembles the final system prompt from multiple sources:

1. **Base prompt** — default "expert coding assistant" identity
2. **`SYSTEM.md`** — if present in `.pi/` or `~/.pi/agent/`, replaces the base prompt entirely
3. **`APPEND_SYSTEM.md`** — appends to the base/custom prompt
4. **Context files** — `AGENTS.md` / `CLAUDE.md` content, added under a "Project Context" section
5. **Skills** — formatted as XML, added under `<available_skills>`
6. **Tools** — tool descriptions and usage guidelines

Programmatic control via `createAgentSession()`:

```typescript
const { session } = await createAgentSession({
  // ...
  systemPrompt: "Replace entire base prompt",      // optional
  appendSystemPrompt: "Appended after everything",  // optional
});
```

Skills compose with the system prompt automatically — no manual injection needed. Write a SKILL.md, load it via the resource loader, and Pi formats and includes it.

---

## Extension System

Extensions are TypeScript modules that hook into Pi's lifecycle. Auto-discovered from `~/.pi/agent/extensions/` (global) and `.pi/extensions/` (project-local). As of v0.55.0, project-local resources take precedence over global ones.

### Extension API

```typescript
export default function myExtension(pi: ExtensionAPI) {
  // Register tools
  pi.registerTool({
    name: "my_tool",
    description: "...",
    parameters: Type.Object({ ... }),  // @sinclair/typebox
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      return { content: "result", details: "..." };
    },
  });

  // Register commands (REPL slash-commands)
  pi.registerCommand("mycommand", { description: "...", handler: async (args, ctx) => {} });

  // Subscribe to lifecycle events
  pi.on("before_agent_start", async (event) => { ... });
  pi.on("tool_call", async (event) => { ... });

  // Inject messages into the session
  pi.sendMessage({ customType: "my-ext", content: "...", display: true });

  // Persist extension state (survives restarts, branching — not sent to LLM)
  pi.appendEntry("my-ext-state", { key: "value" });

  // Cross-extension communication
  pi.events.emit("my-event", data);
  pi.events.on("other-event", handler);
}
```

### Key Extension Methods

| Method | Purpose |
|--------|---------|
| `pi.registerTool()` | Register a tool the LLM can call |
| `pi.registerCommand()` | Register a REPL slash-command |
| `pi.on()` | Subscribe to lifecycle events |
| `pi.sendMessage()` | Inject a custom message into the session |
| `pi.sendUserMessage()` | Send a user message, triggering an agent turn |
| `pi.appendEntry()` | Persist extension state (not sent to LLM) |
| `pi.events` | Cross-extension event bus |
| `pi.getActiveTools()` / `pi.setActiveTools()` | Control which tools are available |
| `pi.setModel()` / `pi.setThinkingLevel()` | Change model or thinking level |
| `pi.exec()` | Run shell commands |

### Extension Lifecycle Events — Full Catalog

Pi exposes ~25 lifecycle events via `pi.on()`. Events are grouped by category below. Each entry lists the event name, when it fires, its payload fields, and whether the handler can return a result to modify behavior.

#### Input & Agent Lifecycle

| Event | When | Payload | Can modify? |
|-------|------|---------|-------------|
| `input` | Raw user input received (before any processing) | `text: string`, `images?: ImageContent[]`, `source: "interactive" \| "rpc" \| "extension"` | Yes — return `{ action: "transform", text, images? }` to rewrite, or `{ action: "handled" }` to consume |
| `before_agent_start` | After user prompt submitted, before agent loop begins | `prompt: string`, `images?: ImageContent[]`, `systemPrompt: string` | Yes — return `{ message?, systemPrompt? }` to inject context or replace system prompt |
| `agent_start` | Agent loop starts (after `before_agent_start` hooks) | *(empty)* | No |
| `agent_end` | Agent loop finishes | `messages: AgentMessage[]` | No |

#### Turn & Message Streaming

| Event | When | Payload | Can modify? |
|-------|------|---------|-------------|
| `turn_start` | Each LLM turn begins | `turnIndex: number`, `timestamp: number` | No |
| `turn_end` | Each LLM turn ends | `turnIndex: number`, `message: AgentMessage`, `toolResults: ToolResultMessage[]` | No |
| `message_start` | A message begins (user, assistant, or tool result) | `message: AgentMessage` | No |
| `message_update` | Assistant message streaming (token-by-token) | `message: AgentMessage`, `assistantMessageEvent: AssistantMessageEvent` | No |
| `message_end` | A message ends | `message: AgentMessage` | No |

#### Context & Provider

| Event | When | Payload | Can modify? |
|-------|------|---------|-------------|
| `context` | Before every LLM call | `messages: AgentMessage[]` | Yes — return `{ messages }` to replace the message list (non-destructive, original session unaffected) |
| `before_provider_request` | Before the raw provider HTTP request is sent | `payload: unknown` (provider-specific) | Yes — return replacement payload |

#### Tool Execution

| Event | When | Payload | Can modify? |
|-------|------|---------|-------------|
| `tool_call` | Before a tool executes | `toolCallId: string`, `toolName: string`, `input: Record<string, unknown>` (typed per built-in tool) | Yes — return `{ block: true, reason? }` to prevent execution |
| `tool_result` | After a tool executes | `toolCallId: string`, `toolName: string`, `input`, `content: (TextContent \| ImageContent)[]`, `isError: boolean`, `details` | Yes — return `{ content?, details?, isError? }` to modify the result |
| `tool_execution_start` | Tool begins executing (for UI/progress) | `toolCallId: string`, `toolName: string`, `args: any` | No |
| `tool_execution_update` | Tool streaming partial output | `toolCallId: string`, `toolName: string`, `args: any`, `partialResult: any` | No |
| `tool_execution_end` | Tool finishes executing | `toolCallId: string`, `toolName: string`, `result: any`, `isError: boolean` | No |

#### Session Management

| Event | When | Payload | Can modify? |
|-------|------|---------|-------------|
| `session_start` | Session started, loaded, or reloaded | `reason: "startup" \| "reload" \| "new" \| "resume" \| "fork"`, `previousSessionFile?: string` | No |
| `session_before_switch` | Before switching to another session | `reason: "new" \| "resume"`, `targetSessionFile?: string` | Yes — return `{ cancel: true }` to block |
| `session_before_fork` | Before forking a session | `entryId: string` | Yes — return `{ cancel: true }` to block |
| `session_before_compact` | Before context compaction | `preparation: CompactionPreparation`, `branchEntries: SessionEntry[]`, `signal: AbortSignal` | Yes — return custom compaction instructions |
| `session_compact` | After compaction completes | `compactionEntry: CompactionEntry`, `fromExtension: boolean` | No |
| `session_before_tree` | Before navigating session tree | `preparation: TreePreparation`, `signal: AbortSignal` | Yes — can cancel or customize |
| `session_tree` | After tree navigation | `newLeafId`, `oldLeafId`, `summaryEntry?`, `fromExtension?` | No |
| `session_shutdown` | Process exit / session cleanup | *(empty)* | No |

#### Resource Discovery & Model

| Event | When | Payload | Can modify? |
|-------|------|---------|-------------|
| `resources_discover` | Skills/extensions/prompts discovered (startup or reload) | `cwd: string`, `reason: "startup" \| "reload"` | Yes — return `{ skillPaths?, promptPaths?, themePaths? }` to add extra paths |
| `model_select` | Model changed (set, cycle, or restore) | `model: Model`, `previousModel: Model \| undefined`, `source: "set" \| "cycle" \| "restore"` | No |
| `user_bash` | User runs a shell command via `!` or `!!` prefix | `command: string`, `excludeFromContext: boolean`, `cwd: string` | Yes — return `{ operations?, result? }` to override execution |

### `before_agent_start` Detail

This is the primary hook for context injection. Type signatures:

```typescript
interface BeforeAgentStartEvent {
  type: "before_agent_start";
  prompt: string;           // User's prompt text
  images?: ImageContent[];  // Attached images
  systemPrompt: string;     // Current system prompt
}

interface BeforeAgentStartEventResult {
  message?: Pick<CustomMessage, "customType" | "content" | "display" | "details">;
  systemPrompt?: string;  // Replace system prompt (chained across extensions)
}
```

Multiple extensions' results are chained: messages accumulate, system prompt modifications apply sequentially.

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  return {
    message: {
      customType: "my-extension",
      content: "Additional context for the LLM",
      display: true,  // true = stored in session + sent to LLM
    },
    systemPrompt: event.systemPrompt + "\n\nExtra instructions...",
  };
});
```

### Tool Override

Extensions can **replace built-in tools by registering a tool with the same name**. This means we can override `bash` with a sandboxed version or restrict `write` to specific directories. The `--no-tools` flag disables all built-ins, letting extensions provide everything.

As of v0.55.0, extension name collisions are resolved by first-in-load-order (the first registration wins). Collisions no longer unload entire extensions — both extensions remain active, only the conflicting tool name goes to the first registrant.

---

## Skills System

Skills are `SKILL.md` files — prompt fragments with YAML frontmatter, loaded into the system prompt. Not executable code.

```markdown
---
name: typescript
description: TypeScript/Node best practices
---

# TypeScript

When working on TypeScript projects:
- Prefer strict typing, avoid `any`
- Use ESM imports
...
```

### Discovery

Skills are auto-discovered from:
- `~/.pi/agent/skills/` (global)
- `~/.agents/skills/` (global, added in v0.54.0)
- `.pi/skills/` (project-local)
- `.agents/skills/` (project-local + ancestor directories, added in v0.54.0)
- Pi packages (via `pi` manifest in package.json)

As of v0.55.0, project-local skills take precedence over global ones.

### Scoping via ResourceLoader

```typescript
const resourceLoader = new DefaultResourceLoader({
  // Replace ALL discovered skills with just these:
  skillsOverride: [mySkill1, mySkill2],
  // OR add skills on top of discovered ones:
  // (use skillsOverride for strict isolation)
});
```

**`skillsOverride` is the right approach for worker agents** — completely replaces all skills instead of accumulating. Prevents workers from picking up random project-local skills.

---

## Project Context Files (AGENTS.md / CLAUDE.md)

Pi natively discovers and injects project-level instruction files into the agent's system prompt. No custom extension needed.

### Discovery Order

`DefaultResourceLoader` discovers context files via `discoverContextFiles`:

1. **Global**: `~/.pi/agent/AGENTS.md`
2. **Parent directories**: walks up from `cwd`, checking each directory for `AGENTS.md` or `CLAUDE.md`
3. **Current directory**: `./AGENTS.md` or `./CLAUDE.md`

All matching files are **concatenated**. Global files load first, then ancestor directories, then current directory.

### Injection

`buildSystemPrompt` appends discovered context file content under a "Project Context" section in the system prompt automatically. Every agent session using `DefaultResourceLoader` gets this for free.

### Related Files

Pi also supports:
- **`SYSTEM.md`** — overrides the entire default system prompt
- **`APPEND_SYSTEM.md`** — appends to the default system prompt

These are distinct from `AGENTS.md` / `CLAUDE.md` which provide project context, not system prompt replacement.

### Controlling Per-Agent Context

To **skip** project context for agents that don't need it (e.g., coordinator, task-manager), use a custom `ResourceLoader` or configure `DefaultResourceLoader` to not load context files. For agents that do need it (planner, worker, cosmo), use the default behavior.

---

## Package System

Cosmonauts will be distributed as a Pi package.

### Package Manifest (package.json)

```json
{
  "name": "cosmonauts",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

Paths can be directories (recursively discovered), files, or globs.

### Install Flow

```bash
pi install ./cosmonauts          # Local dev
pi install npm:cosmonauts        # Published
pi install git:github.com/x/y    # Git
```

After install, extensions auto-load, skills auto-discover, tools appear in the agent. No separate binary needed.

### Scopes

- **User** (global): `~/.pi/agent/` — shared across projects
- **Project** (local, `-l` flag): `.pi/` — project-specific (takes precedence over global as of v0.55.0)
- **Temporary** (`-e` flag): one-shot, not persisted

---

## Compaction (Context Management)

When a session's token count exceeds the model's context window, Pi compacts:

1. Walk backward from newest message, keep `keepRecentTokens` (default 20k)
2. Summarize everything before the cut point via an LLM call
3. Store `CompactionEntry` in the JSONL session
4. Reload with summary + recent messages

Full history remains in the JSONL file (lossless on disk, lossy in context).

Configurable via `SettingsManager` (note: as of v0.53.0, setters update in-memory only — call `await settingsManager.flush()` for durable persistence). For ephemeral workers, either:
- Let auto-compaction handle it (simplest)
- Set `keepRecentTokens` low (workers are short-lived)
- Abort + restart with fresh session if task is too large

---

## Lightweight LLM Calls

For quick classification or routing decisions without a full session:

```typescript
import { completeSimple } from "@mariozechner/pi-ai";

const result = await completeSimple(model, systemPrompt, userMessage);
```

Useful for: task classification, skill routing, plan summarization, quick yes/no decisions.

---

## Execution Modes

Pi supports three execution modes, all available both via CLI flags and programmatic API.

### Interactive Mode (default)

Full TUI/REPL with keyboard input. Requires a TTY.

```typescript
import { createAgentSession, InteractiveMode } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({ /* ... */ });
const mode = new InteractiveMode(session, { initialMessage: "optional first prompt" });
await mode.run();  // Blocks until user exits
```

CLI: `pi` or `pi "initial prompt"` (opens REPL, optionally with an initial message).

Supports `InteractiveModeOptions`: `initialMessage`, `initialMessages`, `initialImages`, `verbose`.

### Print Mode (`--print`)

Non-interactive single-shot execution. Sends prompt(s), outputs result, exits.

```typescript
import { createAgentSession, runPrintMode } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({ /* ... */ });
await runPrintMode(session, {
  mode: "text",           // "text" (final response to stdout) or "json" (event stream)
  initialMessage: "...",  // The prompt
  messages: [],           // Additional messages
});
process.exit(0);
```

CLI: `pi --print "prompt"` or `pi --mode text "prompt"` or `pi --mode json "prompt"`.

- **Text mode**: prints final assistant response to stdout.
- **JSON mode**: streams all `AgentSessionEvent` objects as JSON lines to stdout.

### RPC Mode (`--mode rpc`)

Headless operation via JSON protocol over stdin/stdout.

```typescript
import { createAgentSession, runRpcMode } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({ /* ... */ });
await runRpcMode(session);  // Returns Promise<never>, runs until shutdown
```

CLI: `pi --mode rpc`.

Supports 20+ RPC commands: `prompt`, `steer`, `follow_up`, `abort`, `set_model`, `cycle_model`, `bash`, `compact`, `new_session`, etc. Each command returns a JSON response with `{ type: "response", command, success, data?, error? }`.

Potential uses:
- Sandboxed workers in Docker containers
- Cross-machine distribution
- Language-agnostic orchestrators
- IDE integrations

Not needed for Phase 0 (in-process is simpler), but a good option for Phase 3+ parallel/sandboxed workers.

### CLI Flags

Key flags relevant to Cosmonauts:

| Flag | Description |
|------|-------------|
| `--print`, `-p` | Non-interactive mode (process prompt and exit) |
| `--mode <text\|json\|rpc>` | Output mode |
| `--model <id>` | Model ID (e.g., `anthropic/claude-sonnet-4-5`) |
| `--thinking <level>` | Thinking level: off, minimal, low, medium, high, xhigh |
| `--skill <path>` | Load additional skill (repeatable) |
| `--extension`, `-e <path>` | Load additional extension (repeatable) |
| `--tools <list>` | Enable specific tools (e.g., `read,bash,edit,write`) |
| `--no-tools` | Disable all built-in tools (extension tools still work) |
| `--system-prompt <text>` | Replace default system prompt |

Cosmonauts passes these through to `createAgentSession()` where applicable.

---

## Cost Tracking

Pi tracks token usage and costs per model per session. This data is available through the event system. The orchestration layer aggregates costs across all spawned workers for budget enforcement and reporting.

### Cosmonauts Chain Events

The chain runner emits `ChainEvent` variants during orchestration. These are Cosmonauts-level events (not Pi lifecycle events) delivered via the `onEvent` callback in `ChainConfig`.

#### Event Catalog

| Event | When | Key Payload |
|-------|------|-------------|
| `chain_start` | Chain execution begins | `stages: ChainStage[]` |
| `chain_end` | Chain execution completes (success or failure) | `result: ChainResult` (includes `stats?: ChainStats`) |
| `stage_start` | A stage begins | `stage: ChainStage`, `stageIndex: number` |
| `stage_end` | A stage completes | `stage: ChainStage`, `result: StageResult` |
| `stage_iteration` | A loop stage starts a new iteration | `stage: ChainStage`, `iteration: number` |
| `stage_stats` | Stats captured for a completed stage spawn | `stage: ChainStage`, `stats: SpawnStats` |
| `agent_spawned` | An agent session is created | `role: string`, `sessionId: string` |
| `agent_completed` | An agent session finishes | `role: string`, `sessionId: string` |
| `agent_turn` | Forwarded Pi session lifecycle event (turn boundaries, compaction) | `role: string`, `sessionId: string`, `event: SpawnEvent` |
| `agent_tool_use` | Forwarded Pi tool execution event | `role: string`, `sessionId: string`, `event: SpawnEvent` |
| `error` | An error occurred during chain execution | `message: string`, `stage?: ChainStage` |

#### `stage_stats` — Per-Stage Cost Data

Emitted after each successful agent spawn within a stage. Contains a `SpawnStats` object:

```typescript
interface SpawnStats {
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: number;       // Estimated cost in USD
  durationMs: number; // Wall-clock duration
  turns: number;      // User↔assistant turns
  toolCalls: number;  // Total tool calls made
}
```

For loop stages, `stage_stats` fires once per iteration. The `StageResult.stats` aggregates all iterations.

#### `agent_turn` — Session Lifecycle Forwarding

Wraps Pi's internal session events (`turn_start`, `turn_end`, `auto_compaction_start`, `auto_compaction_end`) with the agent role and session ID. Useful for progress monitoring and debugging.

#### `agent_tool_use` — Tool Execution Forwarding

Wraps Pi's `tool_execution_start` and `tool_execution_end` events. Enables tool-level observability across spawned agents without subscribing to each session individually.

#### Aggregate Chain Stats

The `chain_end` event's `result.stats` contains `ChainStats`:

```typescript
interface ChainStats {
  stages: StageStats[];     // Per-stage breakdown
  totalCost: number;        // Sum of cost across all stages (USD)
  totalTokens: number;      // Sum of total tokens across all stages
  totalDurationMs: number;  // Sum of durationMs across all stages
}

interface StageStats {
  stageName: string;        // Agent role name
  iterations: number;       // Iteration count (1 for non-loop stages)
  stats: SpawnStats;        // Aggregated tokens, cost, duration
}
```

Cost data is ephemeral — displayed in CLI output and included in chain events. No disk persistence.

---

## Ecosystem

### pi-skills (badlogic/pi-skills)

Ready-made skills compatible with Pi, Claude Code, and Codex CLI:

| Skill | What it does |
|-------|-------------|
| `brave-search` | Web search + content extraction via Brave API |
| `browser-tools` | Browser automation via Chrome DevTools Protocol |
| `gccli` | Google Calendar CLI |
| `gdcli` | Google Drive CLI |
| `gmcli` | Gmail CLI |
| `transcribe` | Speech-to-text via Groq Whisper |
| `vscode` | VS Code integration (diffs, file comparison) |
| `youtube-transcript` | YouTube video transcripts |

No agent-role skills (planner, coordinator, worker) exist in pi-skills — that's what Cosmonauts creates.

### pi-mom (reference implementation)

`@mariozechner/pi-mom` is a Slack bot built on Pi. Patterns worth studying:

- **Channel-isolated agents**: each channel gets its own session, storage, and agent instance
- **Dual-file sessions**: `log.jsonl` (source of truth) + `context.jsonl` (LLM working memory)
- **Dynamic system prompts**: rebuilt on every run with fresh memory, skills, and context
- **Sandboxed execution**: Docker or host mode via pluggable executor
- **Sequential channel queues**: messages within a channel processed in order, channels parallel

---

## What Pi Deliberately Doesn't Include

Pi's philosophy is "minimal core." These are things Cosmonauts must build:

1. **Sub-agent spawning** — no built-in `spawn_agent`. We create sessions, manage their lifecycle, and collect results ourselves.
2. **Agent timeout/cancellation** — no timeout API. We need our own abort-after-N-seconds logic.
3. **Task system** — no task management. We bring the task system as an extension.
4. **Orchestration** — no chain runner, no coordinator loop. We build this.
5. **Inter-agent communication** — no message passing between sessions. We coordinate through shared task state (files).
6. **Budget enforcement** — no "stop if cost > $X." We aggregate from events.
