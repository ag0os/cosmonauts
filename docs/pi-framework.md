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

All packages follow lockstep versioning (currently v0.52.9, 207 releases). The binary is `pi`.

---

## Core API: `createAgentSession()`

This is the main entry point for programmatic (embedded) use. Returns `{ session: AgentSession, extensionsResult, modelFallbackMessage? }`.

```typescript
import { createAgentSession } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({
  cwd: string,                    // Working directory (default: process.cwd())
  agentDir: string,               // Config dir (default: ~/.pi/agent)
  authStorage: AuthStorage,       // API keys + OAuth creds
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

- **`codingTools`**: read, write, edit, bash — full coding capability
- **`readOnlyTools`**: read, grep, find, ls — exploration only

Tool factory functions (`createCodingTools()`, `createReadOnlyTools()`) accept a custom `cwd` for path resolution.

---

## Extension System

Extensions are TypeScript modules that hook into Pi's lifecycle. Auto-discovered from `~/.pi/agent/extensions/` (global) and `.pi/extensions/` (project-local).

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
}
```

### Key Extension Events

| Event | When | Can modify? | Use case |
|-------|------|-------------|----------|
| `before_agent_start` | After user prompt, before agent loop | Inject messages, replace system prompt | Inject task context into workers |
| `context` | Before every LLM call | Modify messages | Cost guardrails, context pruning |
| `tool_call` | Before tool execution | Block execution | Sandbox workers (restrict file access) |
| `tool_result` | After tool execution | Modify result | Filter/transform output |
| `turn_start` / `turn_end` | Each agent turn | — | Progress reporting |
| `agent_start` / `agent_end` | Agent loop lifecycle | — | Logging, cleanup |
| `session_before_compact` | Before compaction | Cancel or customize | Control context management |

### Tool Override

Extensions can **replace built-in tools by registering a tool with the same name**. This means we can override `bash` with a sandboxed version or restrict `write` to specific directories. The `--no-tools` flag disables all built-ins, letting extensions provide everything.

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
- `.pi/skills/` (project-local)
- Pi packages (via `pi` manifest in package.json)

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
- **Project** (local, `-l` flag): `.pi/` — project-specific
- **Temporary** (`-e` flag): one-shot, not persisted

---

## Compaction (Context Management)

When a session's token count exceeds the model's context window, Pi compacts:

1. Walk backward from newest message, keep `keepRecentTokens` (default 20k)
2. Summarize everything before the cut point via an LLM call
3. Store `CompactionEntry` in the JSONL session
4. Reload with summary + recent messages

Full history remains in the JSONL file (lossless on disk, lossy in context).

Configurable via `SettingsManager`. For ephemeral workers, either:
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

## RPC Mode

Pi supports headless operation via `--mode rpc`: JSON protocol over stdin/stdout.

```bash
pi --mode rpc
```

An `RpcClient` class provides a typed API for spawning and controlling agents as child processes. Potential uses:
- Sandboxed workers in Docker containers
- Cross-machine distribution
- Language-agnostic orchestrators

Not needed for Phase 0 (in-process is simpler), but a good option for Phase 3+ parallel/sandboxed workers.

---

## Cost Tracking

Pi tracks token usage and costs per model per session. This data is available through the event system. The orchestration layer should aggregate costs across all spawned workers for budget enforcement.

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
3. **Task system** — no task management. We bring forge-tasks format as an extension.
4. **Orchestration** — no chain runner, no coordinator loop. We build this.
5. **Inter-agent communication** — no message passing between sessions. We coordinate through shared task state (files).
6. **Budget enforcement** — no "stop if cost > $X." We aggregate from events.
