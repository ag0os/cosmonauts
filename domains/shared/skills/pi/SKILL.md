---
name: pi
description: Pi framework API reference — sessions, tools, extensions, events, compaction, cost tracking, skills, and execution modes.
---

# Pi Framework

Pi (`@mariozechner/pi-coding-agent`) is the agent runtime. This skill covers its programmatic API surface for building on top of Pi.

> **Prefer DeepWiki for current API info.** The reference below may be outdated. Before relying on it, query DeepWiki for the latest (repo: `badlogic/pi-mono`). Load the `deepwiki` skill for instructions. Use this skill as a baseline when DeepWiki is unavailable.

## Package Structure

| Package | Purpose |
|---------|---------|
| `pi-coding-agent` | Main runtime: sessions, tools, skills, extensions, modes |
| `pi-ai` | Multi-provider LLM API, streaming, model registry |
| `pi-agent-core` | Core types: `Agent`, `AgentEvent`, `AgentMessage`, `AgentTool`, `ThinkingLevel` |
| `pi-tui` | Terminal UI library |

All packages use lockstep versioning under `@mariozechner/`.

## Session Creation

`createAgentSession()` is the main entry point. Returns `{ session, extensionsResult, modelFallbackMessage? }`.

```typescript
import {
  createAgentSession,
  createCodingTools,
  createReadOnlyTools,
  DefaultResourceLoader,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

// Minimal — uses all defaults
const { session } = await createAgentSession();

// Explicit configuration
const { session } = await createAgentSession({
  cwd: "/path/to/project",
  model: getModel("anthropic", "claude-sonnet-4-5"),
  thinkingLevel: "high",
  tools: createCodingTools("/path/to/project"),
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
| `tools` | `Tool[]` | `codingTools` | Built-in tool set |
| `customTools` | `ToolDefinition[]` | — | Additional tools |
| `resourceLoader` | `ResourceLoader` | `DefaultResourceLoader` | Skill/extension/prompt discovery |
| `sessionManager` | `SessionManager` | File-based | Session persistence |
| `settingsManager` | `SettingsManager` | File-based | Compaction, retry settings |

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
    case "message_start":
    case "message_update":
    case "message_end":
    case "tool_execution_start":
    case "tool_execution_end":
    case "auto_compaction_start":
    case "auto_compaction_end":
    case "auto_retry_start":
    case "auto_retry_end":
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

// Factory that auto-selects session directory
const sm = SessionManager.create(cwd);
```

Session files use JSONL format with a tree structure supporting branching without creating new files. Operations: `appendMessage()`, `branch()`, `appendCompaction()`.

## Built-in Tools

Pi exports two ready-made tool arrays plus individual factories:

```typescript
import {
  codingTools,       // [read, bash, edit, write]
  readOnlyTools,     // [read, grep, find, ls]
  createCodingTools,     // (cwd) => Tool[]
  createReadOnlyTools,   // (cwd) => Tool[]
  createReadTool,        // (cwd) => Tool
  createBashTool,        // (cwd) => Tool
  createEditTool,        // (cwd) => Tool
  createWriteTool,       // (cwd) => Tool
  createGrepTool,        // (cwd) => Tool
  createFindTool,        // (cwd) => Tool
  createLsTool,          // (cwd) => Tool
} from "@mariozechner/pi-coding-agent";
```

Factory functions accept a custom `cwd` for path resolution. Extensions can **override built-in tools** by registering a tool with the same name.

## Extension System

Extensions are TypeScript modules that hook into Pi's lifecycle. Auto-discovered from `~/.pi/agent/extensions/` (global) and `.pi/extensions/` (project-local).

### Extension Factory

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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
import { Type } from "@sinclair/typebox";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "Does something useful",
  promptSnippet: "One-line description for system prompt",
  promptGuidelines: ["Guideline bullet for system prompt"],
  parameters: Type.Object({
    input: Type.String({ description: "The input" }),
    verbose: Type.Optional(Type.Boolean()),
  }),
  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    // ctx: ExtensionContext — has ui, cwd, sessionManager, model, etc.
    return { content: "result text", details: { extra: "data" } };
  },
  renderCall: (args, theme) => undefined,     // Optional custom UI
  renderResult: (result, opts, theme) => undefined,
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
| `session_start` | Session loads | — | State restoration |
| `session_before_switch` | Before session switch | Can cancel | State management |
| `session_switch` | After session switch | — | Post-switch setup |
| `session_before_fork` | Before fork | Can cancel | State management |
| `session_fork` | After fork | — | Post-fork setup |
| `session_before_compact` | Before compaction | Can modify | Custom compaction |
| `session_compact` | After compaction | — | Post-compact updates |
| `session_before_tree` | Before tree navigation | Can cancel | State management |
| `session_tree` | After tree navigation | — | Post-navigate setup |
| `session_shutdown` | Process exit | — | Cleanup, saving |
| `resources_discover` | Resources discovered | `ResourcesDiscoverResult` | Add skill/prompt/theme paths |
| `session_directory` | Before session dir creation | Custom path | Session storage location |

**Other Events:**

| Event | When | Use case |
|-------|------|----------|
| `model_select` | Model changes | Model routing |
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

Programmatic control:

```typescript
const { session } = await createAgentSession({
  systemPrompt: "Replace entire base prompt",
  appendSystemPrompt: "Appended after everything",
});
```

### DefaultResourceLoader

Controls what resources (skills, extensions, prompts, themes, context files) a session sees:

```typescript
const loader = new DefaultResourceLoader({
  cwd: "/project",
  agentDir: "~/.pi/agent",
  settingsManager: SettingsManager.create(),

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
  appendSystemPrompt: "Agent identity and persona content",
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
import { loadSkills, loadSkillsFromDir, formatSkillsForPrompt } from "@mariozechner/pi-coding-agent";

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
const settings = SettingsManager.create();
settings.setCompactionEnabled(true);
settings.getCompactionSettings();
// { enabled: boolean, reserveTokens: number, keepRecentTokens: number }
```

### Compaction Events

```typescript
session.subscribe((event) => {
  if (event.type === "auto_compaction_start") {
    // event.reason: "threshold" | "overflow"
  }
  if (event.type === "auto_compaction_end") {
    // event.result: CompactionResult | undefined
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

### Interactive Mode

Full TUI/REPL. Requires a TTY.

```typescript
import { InteractiveMode } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({ /* ... */ });
const mode = new InteractiveMode(session, { initialMessage: "optional first prompt" });
await mode.run();  // Blocks until user exits
```

### Print Mode

Non-interactive single-shot. Send prompt, output result, exit.

```typescript
import { runPrintMode } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({ /* ... */ });
await runPrintMode(session, {
  mode: "text",            // "text" = final response to stdout; "json" = event stream
  initialMessage: "...",
});
```

### RPC Mode

Headless JSON protocol over stdin/stdout.

```typescript
import { runRpcMode } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({ /* ... */ });
await runRpcMode(session);  // Returns Promise<never>
```

Supports 20+ commands: `prompt`, `steer`, `follow_up`, `abort`, `set_model`, `compact`, `new_session`, etc.

## Session Branching and Navigation

```typescript
// Fork from a specific entry (creates new session file)
const { selectedText, cancelled } = await session.fork(entryId);

// Navigate within session tree (same file)
const result = await session.navigateTree(targetId, {
  summarize: true,
  customInstructions: "Focus on...",
});

// Start fresh session
const completed = await session.newSession({
  parentSession: "/path/to/parent.jsonl",
  setup: async (sm) => { /* initialize session entries */ },
});

// Switch to different session file
const completed = await session.switchSession("/path/to/other.jsonl");

// Get user messages for fork selector
const messages = session.getUserMessagesForForking();
```

## Auth Storage

```typescript
import { AuthStorage } from "@mariozechner/pi-coding-agent";

const auth = AuthStorage.create("/path/to/auth.json");  // File-backed
const auth = AuthStorage.inMemory();                     // Ephemeral
```

## Model Registry

```typescript
import { ModelRegistry } from "@mariozechner/pi-coding-agent";

const registry = new ModelRegistry(authStorage, "/path/to/models.json");
```

Models are identified by `"provider/model-id"` strings. Use `getModel()` from `pi-ai` to resolve:

```typescript
import { getModel } from "@mariozechner/pi-ai";
const model = getModel("anthropic", "claude-sonnet-4-5");
```

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
