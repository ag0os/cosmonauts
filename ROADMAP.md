# Roadmap

Prioritized backlog — top items are highest priority. When an item is picked up, remove it from this list and create a plan via `plan_create`. See the `roadmap` skill for procedures.

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

- Follow the established pattern in skills/languages/typescript/SKILL.md
- Each skill covers idioms, best practices, toolchain conventions, and testing patterns
- Workers load the appropriate skill based on project language

### `domain-skills`: Domain Skill Pack

Write domain skills for testing, code-review, frontend, devops, api-design, and database.

- Follow existing conventions in skills/domains/
- Testing skill covers strategy, coverage, mocking, and test organization
- Code-review skill covers what to look for, how to structure findings
- Frontend, devops, api-design, database skills cover domain-specific patterns and best practices

### `skill-routing`: Coordinator Skill Routing

Implement automatic skill-routing in the coordinator so workers get the right skills for each task.

- Match task labels to language/domain skills automatically
- Auto-detect project language from manifests (package.json, Cargo.toml, etc.)
- Coordinator instructs workers which skills to load based on task labels and project context

### `memory-system`: Persistent Cross-Session Memory

Port the daily-log + MEMORY.md pattern from OpenClaw so agents retain context across sessions.

- memory_search and memory_save tools for reading/writing persistent memories
- Inject relevant memories at agent start via before_agent_start hook
- Start with markdown files, design for future upgrade to vector search

### `web-search-tool`: Web Search

Add web_search tool for searching the web from agent sessions.

- Evaluate brave-search from pi-skills before building custom
- Choose search API: Brave Search (free tier), Tavily, or SearXNG
- Return structured results with titles, URLs, and snippets

### `parallel-workers`: Parallel Worker Execution

Fan-out independent tasks to multiple workers running concurrently.

- Coordinator batches tasks with no mutual dependencies and runs them via Promise.all()
- Progress reporting via coordinator subscribing to worker events
- Handle partial failures (some workers succeed, others fail)

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

### `channels`: External Communication Transports

Connect Cosmonauts to external messaging platforms.

- Telegram and/or WhatsApp transports via Pi RPC mode or SDK
- Notification delivery when autonomous work completes
- Bidirectional: receive prompts and send results through messaging apps
