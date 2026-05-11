---
name: pi
description: Pi framework API reference — sessions, tools, extensions, events, compaction, cost tracking, skills, and execution modes. Use when building on Pi's programmatic API, creating extensions, registering tools, or configuring sessions. Do NOT load for using cosmonauts CLI or managing tasks/plans.
---

# Pi Framework

Pi (`@earendil-works/pi-coding-agent`) is the agent runtime. This skill covers its programmatic API surface for building on top of Pi.

> **Note:** The reference below tracks `@earendil-works/pi-coding-agent` v0.74.0 (the version this repo pins). Use it as a baseline and query current Pi docs with Context7 when in doubt.

## Source Of Truth

- **Repository:** https://github.com/earendil-works/pi
- **Changelog:** https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md
- **Coding agent docs:** https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs
- **SDK docs:** https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md
- **Extension docs:** https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md
- **Local installed docs:** `node_modules/@earendil-works/pi-coding-agent/docs/`
- **Local installed types:** `node_modules/@earendil-works/pi-coding-agent/dist/**/*.d.ts`

From v0.74.0 onward Pi publishes under `@earendil-works/`. Do not use the old `@mariozechner/pi-*` package names in active code or examples; `@mariozechner/pi-coding-agent@0.74.0` is not published.

## Package Structure

| Package | Purpose |
|---------|---------|
| `@earendil-works/pi-coding-agent` | Main runtime: sessions, tools, skills, extensions, modes |
| `@earendil-works/pi-ai` | Multi-provider LLM API, streaming, model registry |
| `@earendil-works/pi-agent-core` | Core types: `Agent`, `AgentEvent`, `AgentMessage`, `AgentTool`, `ThinkingLevel` |
| `@earendil-works/pi-tui` | Terminal UI library |

All packages use lockstep versioning under the `@earendil-works/` scope.

## Session Creation

`createAgentSession()` is the main entry point. Returns `{ session, extensionsResult, modelFallbackMessage? }`.

```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { getModel } from "@earendil-works/pi-ai";

// Minimal — uses all defaults
const { session } = await createAgentSession();

// Explicit configuration
const { session } = await createAgentSession({
  cwd: "/path/to/project",
  model: getModel("anthropic", "claude-sonnet-4-5"),
  thinkingLevel: "high",
  tools: ["read", "bash", "edit", "write"],
  sessionManager: SessionManager.inMemory(),
  resourceLoader: loader,
});
```

### CreateAgentSessionOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string` | `process.cwd()` | Working directory |
| `agentDir` | `string` | `~/.pi/agent` | Global config directory |
| `authStorage` | `AuthStorage` | From `agentDir/auth.json` | API key storage |
| `modelRegistry` | `ModelRegistry` | Auto-created | Available models |
| `model` | `Model` | From settings | LLM model |
| `thinkingLevel` | `ThinkingLevel` | `"medium"` | `"off" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh"` |
| `scopedModels` | `Array<{model, thinkingLevel?}>` | — | Models for cycling |
| `tools` | `string[]` | `["read", "bash", "edit", "write"]` | When set, only these tool names are enabled |
| `noTools` | `"all" \| "builtin"` | — | `"all"` = start with no tools; `"builtin"` = disable default built-ins but keep extension/custom tools |
| `customTools` | `ToolDefinition[]` | — | Additional tools |
| `resourceLoader` | `ResourceLoader` | `DefaultResourceLoader` | Skill/extension/prompt discovery; also where `systemPrompt` / `appendSystemPrompt` overrides live |
| `sessionManager` | `SessionManager` | `SessionManager.create(cwd)` | Session persistence |
| `settingsManager` | `SettingsManager` | `SettingsManager.create(cwd, agentDir)` | Compaction, retry settings |
| `sessionStartEvent` | `SessionStartEvent` | — | Session-start metadata for extension runtime startup |

`createAgentSession` does **not** accept `systemPrompt` / `appendSystemPrompt` directly — pass them via the resource loader (see [DefaultResourceLoader](#defaultresourceloader)).

## AgentSession

The core class shared across all execution modes.

### Messaging

```typescript
// Send a prompt (blocks until agent completes)
await session.prompt("Implement the auth module");
await session.prompt("Analyze this image", { images: [imageContent] });

// Interrupt mid-stream (delivered after current tool execution)
await session.steer("Stop and focus on the login endpoint instead");

// Queue for after current turn completes
await session.followUp("Now write tests for what you just built");

// Send custom message (not a user turn)
await session.sendCustomMessage({
  customType: "my-extension",
  content: "Context for the LLM",
  display: true,   // true = stored + sent to LLM; false = stored only
});

// Send user message that always triggers a turn
await session.sendUserMessage("Do this next", {
  deliverAs: "steer",  // or "followUp" when streaming
});
```

### State Access

```typescript
session.messages          // AgentMessage[] — all messages including custom types
session.sessionId         // Current session ID
session.isStreaming       // Whether agent is currently streaming
session.model             // Current Model (may be undefined)
session.thinkingLevel     // Current ThinkingLevel
session.systemPrompt      // Current effective system prompt
session.state             // Full AgentState
session.pendingMessageCount  // Queued steering + follow-up count
session.sessionFile       // Session file path (undefined if in-memory)
session.sessionName       // Display name, if set
```

### Event Subscription

```typescript
const unsubscribe = session.subscribe((event) => {
  switch (event.type) {
    // AgentEvent stream (from pi-agent-core): message_start/update/end,
    // tool_execution_start/update/end, turn_start/end, ...
    case "message_start":
    case "message_update":
    case "message_end":
    case "tool_execution_start":
    case "tool_execution_end":
    // AgentSession-only events:
    case "queue_update":            // pending steering/follow-up changed
    case "compaction_start":        // event.reason: "manual" | "threshold" | "overflow"
    case "compaction_end":          // event.result, .aborted, .willRetry, .errorMessage?
    case "auto_retry_start":
    case "auto_retry_end":
    case "session_info_changed":    // event.name
    case "thinking_level_changed":  // event.level
      // ... handle events
  }
});

// Later: stop listening
unsubscribe();
```

### Model Control

```typescript
await session.setModel(getModel("anthropic", "claude-opus-4-5"));
await session.cycleModel("forward");    // Returns ModelCycleResult | undefined
session.setThinkingLevel("high");
session.cycleThinkingLevel();           // Returns ThinkingLevel | undefined
session.getAvailableThinkingLevels();   // ThinkingLevel[]
session.supportsThinking();             // boolean
```

### Tool Control

```typescript
session.getActiveToolNames();           // string[] — currently enabled tools
session.getAllTools();                   // ToolInfo[] — all registered tools
session.setActiveToolsByName(["read", "bash"]);  // Enable specific tools
```

### Lifecycle

```typescript
await session.abort();    // Abort current operation, wait for idle
session.dispose();        // Remove all listeners, disconnect
```

## Session Persistence

```typescript
// File-based (persistent) — JSONL format, supports branching
const sm = SessionManager.open("/path/to/session.jsonl");

// In-memory (ephemeral) — for short-lived agents
const sm = SessionManager.inMemory();

// Factory that auto-selects the session directory under cwd (new session)
const sm = SessionManager.create(cwd);

// Resume the most recent session for cwd (else start fresh)
const sm = SessionManager.continueRecent(cwd);

// Fork from an existing session file into a new one
const sm = SessionManager.forkFrom("/path/to/source.jsonl", targetCwd);

// Discovery (static, async): SessionManager.list(cwd), SessionManager.listAll()
```

Session files use JSONL format with a tree structure supporting branching without creating new files. Operations: `appendMessage()`, `branch()`, `appendCompaction()`.

## Built-in Tools

Pass `tools` as a string allowlist of built-in tool names. Omit the option to
get the default coding set. Factories are still exported for SDK code that
needs direct `Tool` objects (e.g. custom tool wrappers), but `createAgentSession`
no longer accepts them:

```typescript
const { session } = await createAgentSession({
  tools: ["read", "bash", "edit", "write"], // explicit allowlist (only these enabled)
  // tools: ["read", "grep", "find", "ls"], // read-only set
  // noTools: "all",                         // start with no tools at all
  // noTools: "builtin",                     // drop built-ins, keep extension/custom tools
});

// Factories (for custom tool composition outside createAgentSession):
import {
  createCodingTools,     // (cwd) => Tool[]
  createReadOnlyTools,   // (cwd) => Tool[]
  createReadTool,        // (cwd) => Tool
  createBashTool,        // (cwd) => Tool
  createEditTool,        // (cwd) => Tool
  createWriteTool,       // (cwd) => Tool
  createGrepTool,        // (cwd) => Tool
  createFindTool,        // (cwd) => Tool
  createLsTool,          // (cwd) => Tool
} from "@earendil-works/pi-coding-agent";
```

Factory functions accept a custom `cwd` for path resolution. Extensions can **override built-in tools** by registering a tool with the same name.

## Extension System

Extensions are TypeScript modules that hook into Pi's lifecycle. Auto-discovered from `~/.pi/agent/extensions/` (global) and `.pi/extensions/` (project-local).

### Extension Factory

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI) {
  // Register tools, commands, event handlers, etc.
}
```

### ExtensionAPI Methods

| Method | Purpose |
|--------|---------|
| `pi.registerTool(toolDef)` | Register a tool the LLM can call |
| `pi.registerCommand(name, opts)` | Register a REPL slash-command |
| `pi.registerShortcut(key, opts)` | Register a keyboard shortcut |
| `pi.registerFlag(name, opts)` | Register a CLI flag |
| `pi.getFlag(name)` | Get CLI flag value |
| `pi.on(event, handler)` | Subscribe to lifecycle events |
| `pi.sendMessage(msg, opts?)` | Send custom message to session |
| `pi.sendUserMessage(content, opts?)` | Send user message, triggers turn |
| `pi.appendEntry(type, data?)` | Persist extension state (not sent to LLM) |
| `pi.setSessionName(name)` | Set session display name |
| `pi.getSessionName()` | Get session display name |
| `pi.setLabel(entryId, label)` | Set/clear label on a session entry |
| `pi.exec(cmd, args, opts?)` | Run shell command |
| `pi.getActiveTools()` | Get active tool names |
| `pi.getAllTools()` | Get all registered tools |
| `pi.setActiveTools(names)` | Set active tools by name |
| `pi.getCommands()` | Get available slash commands |
| `pi.setModel(model)` | Change model (returns false if no API key) |
| `pi.getThinkingLevel()` | Get current thinking level |
| `pi.setThinkingLevel(level)` | Set thinking level |
| `pi.registerProvider(name, config)` | Register/override model provider |
| `pi.unregisterProvider(name)` | Remove a registered provider |
| `pi.registerMessageRenderer(type, renderer)` | Custom message rendering |
| `pi.events` | Cross-extension `EventBus` |

### Tool Registration

```typescript
import { Type } from "typebox";   // typebox v1 — the codebase's schema package

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "Does something useful",
  promptSnippet: "One-line description for system prompt",   // optional; omitted custom tools don't show in the prompt's tool list
  promptGuidelines: ["Guideline bullet for system prompt"],  // optional
  parameters: Type.Object({
    input: Type.String({ description: "The input" }),
    verbose: Type.Optional(Type.Boolean()),
  }),
  // Optional: "self" lets the tool render its own framing instead of the standard colored shell
  renderShell: "default",
  // Optional: normalize raw args before schema validation (compat shim)
  prepareArguments: (args) => args as { input: string; verbose?: boolean },
  // Optional per-tool override: "sequential" | "parallel"
  executionMode: "parallel",
  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    // signal: AbortSignal | undefined, onUpdate: streaming callback | undefined
    // ctx: ExtensionContext — has ui, cwd, sessionManager, model, etc.
    return { content: "result text", details: { extra: "data" } };
  },
  renderCall: (args, theme, context) => undefined,            // Optional custom UI
  renderResult: (result, opts, theme, context) => undefined,
});
```

### Lifecycle Event Catalog

Events are subscribed via `pi.on(eventName, handler)`. Handlers receive `(event, ctx)` where `ctx` is `ExtensionContext`.

**Input & Prompt Events:**

| Event | When | Return type | Use case |
|-------|------|-------------|----------|
| `input` | Raw user input received | `InputEventResult` | Preprocessing, transforms |
| `before_agent_start` | After prompt, before agent loop | `BeforeAgentStartEventResult` | Context injection, system prompt modification |
| `context` | Before every LLM call | `ContextEventResult` | Message pruning, injection |
| `before_provider_request` | Before provider HTTP call | `BeforeProviderRequestEventResult` | Payload inspection/replacement |
| `after_provider_response` | After provider HTTP response | — | Response inspection, logging |

**Agent Loop Events:**

| Event | When | Use case |
|-------|------|----------|
| `agent_start` | Agent loop begins | Logging |
| `agent_end` | Agent loop ends | Cleanup, aggregation |
| `turn_start` | Each agent turn begins | Progress tracking |
| `turn_end` | Each agent turn ends | Turn-level metrics |

**Message Events:**

| Event | When | Use case |
|-------|------|----------|
| `message_start` | Message begins (user, assistant, toolResult) | Rendering |
| `message_update` | Streaming token update | Live display |
| `message_end` | Message completes | Persistence |

**Tool Events:**

| Event | When | Return type | Use case |
|-------|------|-------------|----------|
| `tool_call` | Before tool execution | `ToolCallEventResult` | Block/allow, sandboxing |
| `tool_result` | After tool execution | `ToolResultEventResult` | Filter/transform output |
| `tool_execution_start` | Tool begins | — | Progress UI |
| `tool_execution_update` | Tool streams partial result | — | Live output |
| `tool_execution_end` | Tool finishes | — | Metrics |

**Session Events:**

| Event | When | Return type | Use case |
|-------|------|-------------|----------|
| `session_start` | Session starts, reloads, or replaces the active session | — | State restoration, rebind per-session state |
| `session_before_switch` | Before session switch | Can cancel | State management |
| `session_before_fork` | Before fork | Can cancel | State management |
| `session_before_compact` | Before compaction | Can modify | Custom compaction |
| `session_compact` | After compaction | — | Post-compact updates |
| `session_before_tree` | Before tree navigation | Can cancel | State management |
| `session_tree` | After tree navigation | — | Post-navigate setup |
| `session_shutdown` | Process exit | — | Cleanup, saving |
| `resources_discover` | Resources discovered | `ResourcesDiscoverResult` | Add skill/prompt/theme paths |

**Other Events:**

| Event | When | Use case |
|-------|------|----------|
| `model_select` | Model changes | Model routing |
| `thinking_level_select` | Thinking level changes | Thinking-level routing |
| `user_bash` | User runs `!` or `!!` command | Audit, logging |

### before_agent_start Detail

The primary hook for injecting context before each agent turn:

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  // event.prompt — user's prompt text
  // event.images — attached images
  // event.systemPrompt — current system prompt
  return {
    message: {
      customType: "my-ext",
      content: "Additional context for the LLM",
      display: true,
    },
    systemPrompt: event.systemPrompt + "\n\nExtra instructions...",
  };
});
```

Multiple extensions chain: messages accumulate, system prompt modifications apply sequentially.

## System Prompt Composition

Pi's `buildSystemPrompt()` assembles the final prompt from:

1. **Base prompt** — default coding assistant identity
2. **`SYSTEM.md`** — in `.pi/` or `~/.pi/agent/`, replaces base entirely
3. **`APPEND_SYSTEM.md`** — appends to base/custom prompt
4. **Context files** — `AGENTS.md` / `CLAUDE.md` content, under "Project Context"
5. **Skills** — formatted as XML in `<available_skills>`
6. **Tools** — tool descriptions and guidelines

Programmatic control goes through the resource loader (not `createAgentSession` directly):

```typescript
const loader = new DefaultResourceLoader({
  cwd,
  systemPrompt: "Replace entire base prompt",
  appendSystemPrompt: ["Appended after everything"],
});
const { session } = await createAgentSession({ resourceLoader: loader });
```

For per-turn dynamic injection, an extension can return a `systemPrompt` from the `before_agent_start` event (see below).

### DefaultResourceLoader

Controls what resources (skills, extensions, prompts, themes, context files) a session sees:

```typescript
const loader = new DefaultResourceLoader({
  cwd: "/project",
  agentDir: "~/.pi/agent",
  settingsManager: SettingsManager.create("/project", "~/.pi/agent"),

  // Add paths on top of discovered ones
  additionalSkillPaths: ["/path/to/skills"],
  additionalExtensionPaths: ["/path/to/extensions"],

  // Override discovered resources (strict isolation for workers)
  skillsOverride: (base) => ({
    skills: base.skills.filter(s => allowlist.has(s.name)),
    diagnostics: base.diagnostics,
  }),

  // Suppress project context for agents that don't need it
  agentsFilesOverride: () => ({ agentsFiles: [] }),

  // Direct prompt injection
  appendSystemPrompt: ["Agent identity and persona content"],
  systemPrompt: "Replace the entire default system prompt",

  // Disable resource types
  noExtensions: true,
  noSkills: true,
});
await loader.reload();
```

Override callbacks (`skillsOverride`, `extensionsOverride`, `promptsOverride`, `themesOverride`, `agentsFilesOverride`, `systemPromptOverride`, `appendSystemPromptOverride`) receive the base-discovered resources and return the final set.

## Skills System

Skills are `SKILL.md` files with YAML frontmatter. They are prompt fragments — not executable code.

### Skill File Format

```markdown
---
name: my-skill
description: One-line description shown in the skill index.
---

# Skill Content

Markdown content loaded into the system prompt.
```

### Discovery

Skills auto-discover from:
- `~/.pi/agent/skills/` and `~/.agents/skills/` (global)
- `.pi/skills/` and `.agents/skills/` (project-local + ancestors)
- Pi packages (via `pi` manifest in `package.json`)

Discovery rules: direct `.md` children in the root directory, recursive `SKILL.md` under subdirectories. Project-local skills take precedence over global ones.

### Loading and Formatting

```typescript
import { loadSkills, loadSkillsFromDir, formatSkillsForPrompt } from "@earendil-works/pi-coding-agent";

// Load from all configured locations
const { skills, diagnostics } = loadSkills({ cwd: "/project" });

// Load from a specific directory
const { skills } = loadSkillsFromDir({ dir: "/path/to/skills", source: "my-package" });

// Format for system prompt (XML format per Agent Skills standard)
const promptFragment = formatSkillsForPrompt(skills);
```

### Scoping Skills per Agent

Use `DefaultResourceLoader.skillsOverride` to control which skills an agent sees:

```typescript
const loader = new DefaultResourceLoader({
  skillsOverride: (base) => ({
    skills: base.skills.filter(s => ["task", "plan"].includes(s.name)),
    diagnostics: base.diagnostics,
  }),
});
```

Skills with `disable-model-invocation: true` in frontmatter are excluded from the prompt but can still be loaded via `/skill:name`.

## Compaction (Context Management)

When token count exceeds the model's context window, Pi compacts automatically:

1. Walk backward from newest message, keep `keepRecentTokens` (default 20k)
2. Summarize everything before the cut point via an LLM call
3. Store `CompactionEntry` in the JSONL session
4. Reload with summary + recent messages

Full history is preserved in the JSONL file (lossless on disk, lossy in context).

### Manual Compaction

```typescript
const result = await session.compact("Focus on the auth module changes");
session.abortCompaction();  // Cancel in-progress compaction
```

### Configuration

```typescript
const settings = SettingsManager.create(cwd, agentDir);
settings.setCompactionEnabled(true);
settings.getCompactionSettings();
// { enabled: boolean, reserveTokens: number, keepRecentTokens: number }
```

### Compaction Events

```typescript
session.subscribe((event) => {
  if (event.type === "compaction_start") {
    // event.reason: "manual" | "threshold" | "overflow"
  }
  if (event.type === "compaction_end") {
    // event.reason, event.result: CompactionResult | undefined
    // event.aborted, event.willRetry, event.errorMessage
  }
});
```

## Cost Tracking (SessionStats)

```typescript
const stats: SessionStats = session.getSessionStats();
// stats.sessionFile        — string | undefined
// stats.sessionId          — string
// stats.userMessages       — number
// stats.assistantMessages  — number
// stats.toolCalls          — number
// stats.toolResults        — number
// stats.totalMessages      — number
// stats.tokens.input       — number
// stats.tokens.output      — number
// stats.tokens.cacheRead   — number
// stats.tokens.cacheWrite  — number
// stats.tokens.total       — number
// stats.cost               — number (USD)
```

Context usage for the current model:

```typescript
const usage = session.getContextUsage();
// usage.tokens       — number | null (null right after compaction)
// usage.contextWindow — number
// usage.percent      — number | null
```

## Settings Manager

Controls compaction, retry, and other agent behaviors:

```typescript
// Creation
const settings = SettingsManager.create(cwd, agentDir);  // File-backed
const settings = SettingsManager.inMemory();              // Ephemeral

// Compaction
settings.getCompactionEnabled();
settings.setCompactionEnabled(true);
settings.getCompactionKeepRecentTokens();  // number
settings.getCompactionReserveTokens();     // number

// Auto-retry
settings.getRetryEnabled();
settings.setRetryEnabled(true);
settings.getRetrySettings();
// { enabled, maxRetries, baseDelayMs, maxDelayMs }

// Model defaults
settings.getDefaultModel();
settings.setDefaultModelAndProvider("anthropic", "claude-sonnet-4-5");
settings.getDefaultThinkingLevel();
settings.setDefaultThinkingLevel("high");

// Persistence
await settings.flush();  // Write pending changes to disk
```

## Execution Modes

All three modes take an `AgentSessionRuntime` (from `createAgentSessionRuntime`, see below), **not** a bare `AgentSession` — the runtime is what owns session replacement (new/resume/fork/import).

### Interactive Mode

Full TUI/REPL. Requires a TTY.

```typescript
import { InteractiveMode } from "@earendil-works/pi-coding-agent";

const runtime = await createAgentSessionRuntime(createRuntime, { cwd, agentDir, sessionManager });
const mode = new InteractiveMode(runtime, { initialMessage: "optional first prompt" });
await mode.run();  // Blocks until user exits
```

### Print Mode

Non-interactive single-shot. Send prompt, output result, exit. Returns the process exit code.

```typescript
import { runPrintMode } from "@earendil-works/pi-coding-agent";

const exitCode = await runPrintMode(runtime, {
  mode: "text",            // "text" = final response to stdout; "json" = event stream
  initialMessage: "...",
});
```

### RPC Mode

Headless JSON protocol over stdin/stdout.

```typescript
import { runRpcMode } from "@earendil-works/pi-coding-agent";

await runRpcMode(runtime);  // Returns Promise<never>
```

Supports 20+ commands: `prompt`, `steer`, `follow_up`, `abort`, `set_model`, `compact`, `new_session`, etc.

## Session Branching and Navigation

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({
  cwd,
  sessionManager,
  sessionStartEvent,
}) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
    })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});

// Fork from a specific entry (creates/replaces the active session)
await runtime.fork(entryId);

// Navigate within session tree (same file)
const result = await runtime.session.navigateTree(targetId, {
  summarize: true,
  customInstructions: "Focus on...",
});

// Start fresh session
await runtime.newSession({
  parentSession: "/path/to/parent.jsonl",
  setup: async (sm) => { /* initialize session entries */ },
});

// Switch to different session file
await runtime.switchSession("/path/to/other.jsonl");

// Get user messages for fork selector
const messages = runtime.session.getUserMessagesForForking();
```

## Auth Storage

```typescript
import { AuthStorage } from "@earendil-works/pi-coding-agent";

const auth = AuthStorage.create("/path/to/auth.json");  // File-backed
const auth = AuthStorage.inMemory();                     // Ephemeral
```

## Model Registry

```typescript
import { ModelRegistry } from "@earendil-works/pi-coding-agent";

const registry = ModelRegistry.create(authStorage, "/path/to/models.json");
```

Models are identified by `"provider/model-id"` strings. Use `getModel()` from `pi-ai` to resolve:

```typescript
import { getModel } from "@earendil-works/pi-ai";
const model = getModel("anthropic", "claude-sonnet-4-5");
```

## Lightweight LLM Calls (`pi-ai`)

For one-off classification/routing without spinning up a full `AgentSession`, call the `pi-ai` stream helpers directly. They take a `Context` object (`{ systemPrompt?, messages, tools? }`) plus options:

```typescript
import { completeSimple, streamSimple } from "@earendil-works/pi-ai";

const context = { systemPrompt: "Classify the request.", messages: [{ role: "user", content: "..." }] };

const msg = await completeSimple(model, context, { reasoning: "low" });  // resolves to the final AssistantMessage
const events = streamSimple(model, context);                              // AssistantMessageEventStream

// Lower-level (full ProviderStreamOptions): complete(model, context, options?) / stream(model, context, options?)
```

Useful for task classification, skill routing, plan summarization, quick yes/no decisions.

## Package System

Pi packages distribute extensions, skills, prompts, and themes via npm:

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

Install: `pi install ./local-pkg`, `pi install npm:package`, `pi install git:github.com/x/y`. Scopes: user (global), project (`-l` flag), temporary (`-e` flag).
