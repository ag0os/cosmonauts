# Roadmap

Work backlog in two sections. **Prioritized** items at the top are ordered — pick from the top. **Ideas** below are unordered candidates that haven't been prioritized yet. When an item is picked up from either section, remove it and create a plan via `plan_create`. See the `roadmap` skill for procedures.

## Prioritized

### `parallel-agent-spawning`: Parallel Agent Spawning

Fan-out in chain stages and concurrent spawns from coordinator. Single biggest capability gap vs OpenClaw.

- Add parallel stage syntax to chain DSL (e.g., `"worker[3]"` for fan-out)
- Concurrent spawn support in the orchestration extension via Promise.all()
- Depth and breadth limits (max active children per parent, max spawn depth)
- Progress reporting via coordinator subscribing to worker events
- Handle partial failures (some workers succeed, others fail)
- Subsumes and replaces the `parallel-workers` idea

### `agent-messaging`: Agent-to-Agent Messaging

Replace filesystem polling with push-based communication between agents. OpenClaw has a subagent announcement system where children push completion events to parents.

- Event bus or completion callback system for spawned agents
- Coordinator receives results directly instead of re-reading task files each iteration
- In-memory pub/sub that the orchestration extension hooks into
- Idempotency keys to prevent duplicate processing
- Depth-aware dispatch (only direct requester receives completion events)

### `chain-checkpointing`: Chain Checkpointing & Resumption

Serialize chain state after each stage so workflows survive crashes and can be resumed mid-execution.

- Persist chain progress (completed stages, pending stages, accumulated stats) to disk
- Resume from last completed stage on restart
- CLI flag: `--resume <chain-id>` to continue a previously interrupted workflow
- Stage results cached for replay during debugging
- Enables long-running `plan-and-build` workflows to survive interruptions

### `model-failover`: Model Failover & Retry

Wrap the spawner with retry logic that classifies errors and falls back to alternate models/providers. OpenClaw has sophisticated error classification, backoff with jitter, and multi-key rotation.

- Error classification: auth, billing, rate-limit, context overflow, transient
- Configurable backup models per role (e.g., fall back from opus to sonnet)
- Backoff strategy with jitter to avoid thundering herd
- Multi-key rotation with cooldown tracking per provider
- Usage stats preserved per attempt for cost tracking accuracy

### `embedding-memory`: Embedding-Based Memory

Semantic search over past work for automatic context injection during prompt assembly. Goes beyond the markdown-file memory system.

- Embedding-based memory store with query-driven retrieval
- Temporal decay (older memories weighted lower)
- Multiple embedding backends (local via Ollama, or API-based)
- Automatic injection at prompt assembly time (Layer 0.5 or hook)
- Subsumes and extends the `memory-system` idea with vector search from the start

### `hook-system`: Plugin & Hook System

Lifecycle hooks at chain, stage, and spawn levels for extensibility without modifying core code. OpenClaw has 15+ hooks with fire-and-forget and modifying patterns.

- Hook categories: chain lifecycle, stage lifecycle, agent spawn, tool execution
- Fire-and-forget hooks (parallel, void) and modifying hooks (sequential, merged results)
- Hook registration via config or extension API
- Key hooks: before_chain_start, after_stage_end, before_agent_spawn, after_tool_call
- Enables plugins for logging, metrics, custom validation, and external integrations

### `context-budget`: Context Budget Management

Smart pruning for coordinator loops that accumulate large tool outputs over many iterations. OpenClaw has custom context pruning extensions and compaction safeguards.

- Cache-TTL based token counting for context budget awareness
- Automatic compaction safeguards to prevent over-compaction
- Configurable token budget per agent role
- Preserve recent tool results within budget, summarize older ones
- Critical for long-running coordinator and quality-manager loops

## Ideas

### `web-search-tool`: Web Search

Add web_search tool for searching the web from agent sessions.

- Evaluate brave-search from pi-skills before building custom
- Choose search API: Brave Search (free tier), Tavily, or SearXNG
- Return structured results with titles, URLs, and snippets

### `browser-tool`: Browser Automation

Add browser tool via Playwright for UI testing and web interaction.

- Port patterns from OpenClaw
- Evaluate browser-tools from pi-skills before building custom
- Decide between Playwright (full, headless) vs CDP direct (lighter, existing Chrome)

### `heartbeat`: Autonomous Background Scheduling

Port heartbeat system from OpenClaw for autonomous background work.

- Periodic timer with HEARTBEAT.md conventions
- Cost-efficient: skip empty cycles, silent acknowledgment, deduplication
- Agent can be triggered on schedule without human intervention

### `decision-capture`: Decision Capture System

Capture key decisions made during sessions for long-term project memory.

- Manual recording during sessions + automatic end-of-session extraction
- Structured output compatible with the memory/ format
- Decisions feed into the persistent memory system

### `deepwiki-tool`: DeepWiki Integration

Add deepwiki_ask tool for querying documentation about public GitHub repositories via the DeepWiki API.

- Agents can ask questions about any public repo's architecture and API usage
- Evaluate pi-skills for existing integration before building custom
- Single tool with simple request/response interface

### `web-fetch-tool`: Web Page Fetching

Add web_fetch tool that fetches a URL, strips HTML, and returns readable text content.

- Agents can read documentation, blog posts, and reference material from the web
- Check if brave-search skill's content extraction already covers this
- Handle common edge cases: redirects, paywalls, very large pages

### `language-skills`: Language Skill Pack

Write language skills for Rust, Python, Swift, and Go.

- Follow the established pattern in domains/coding/skills/languages/typescript/SKILL.md
- Each skill covers idioms, best practices, toolchain conventions, and testing patterns
- Workers load the appropriate skill based on project language

### `domain-skills`: Domain Skill Pack

Write domain skills for testing, code-review, frontend, devops, api-design, and database.

- Follow existing conventions in domains/coding/skills/
- Testing skill covers strategy, coverage, mocking, and test organization
- Code-review skill covers what to look for, how to structure findings
- Frontend, devops, api-design, database skills cover domain-specific patterns and best practices

### `skill-routing`: Coordinator Skill Routing

Implement automatic skill-routing in the coordinator so workers get the right skills for each task.

- Match task labels to language/domain skills automatically
- Auto-detect project language from manifests (package.json, Cargo.toml, etc.)
- Coordinator instructs workers which skills to load based on task labels and project context

### `channels`: External Communication Transports

Connect Cosmonauts to external messaging platforms.

- Telegram and/or WhatsApp transports via Pi RPC mode or SDK
- Notification delivery when autonomous work completes
- Bidirectional: receive prompts and send results through messaging apps
