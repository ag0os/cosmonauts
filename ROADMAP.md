# Roadmap

Work backlog in two sections. **Prioritized** items at the top are ordered — pick from the top. **Ideas** below are unordered candidates that haven't been prioritized yet. When an item is picked up from either section, remove it and create a plan via `plan_create`. See the `roadmap` skill for procedures.

## Prioritized

Three items, in order. They stack: `reuse-scan` produces evidence, `distiller` condenses it into per-plan knowledge, `architecture-of-record` maintains the living synthesis, `embedding-memory` retrieves it at design time. Together they are the thing that actually prevents architectural drift and code duplication as the system grows.

### `architecture-of-record`: Cross-Plan Architectural Memory

**Complexity: medium.** Today `memory/<slug>.knowledge.jsonl` is per-plan. Decisions in plan N drift from plans 1..N-1 because no agent reads across plans. Introduce a living architecture document that `distiller` maintains and planners consult. Compounding value over time.

- New artifact: `memory/architecture.md` — module map, dependency rules, public contracts, key ADRs, conventions
- `distiller` extended: after writing each per-plan knowledge bundle, merge durable decisions into the architecture-of-record (filter by `type: decision | convention | trade-off`)
- Planners, `adaptation-planner`, and `tdd-planner` load `memory/architecture.md` at session start as context alongside capability packs
- `plan-reviewer` gains a review dimension: "proposed design is consistent with architecture-of-record, or the deviation is explicit and justified"
- Format: section per concern (modules, data, APIs, conventions, ADRs); each entry dated and linked to its source plan slug
- Rebuild command `cosmonauts memory rebuild` reconstructs the document from all archived plan knowledge bundles

### `reuse-scan`: Mandatory Reuse Scan Skill for Planners

**Complexity: low.** `coding-readonly.md` tells planners to "check for reusable code" but no role is accountable and no structured check exists. Add a skill that makes the check mandatory and evidenced in the plan.

- New skill `reuse-scan/SKILL.md` loaded by `planner`, `adaptation-planner`, and `tdd-planner`
- Procedure: for each proposed new module or major function, grep for existing implementations; document findings in the plan under a new **Reuse Analysis** section
- Plan template gains **Reuse Analysis**: what was searched, what was found, why existing code is or isn't sufficient
- `plan-reviewer` adds a review dimension: "reuse analysis present, searches credible, conclusions sound"
- Prevents codebase drift: each plan leaves evidence of what was considered for reuse, visible to future planners via the architecture-of-record

### `embedding-memory`: Embedding-Based Memory

**Complexity: medium.** Semantic search over past work for automatic context injection during prompt assembly. The data capture layer is built — session-lineage writes structured KnowledgeRecord JSONL files during plan execution. Remaining work is the query and injection pipeline. Pairs with `architecture-of-record`: embedding-memory is the retrieval layer; architecture-of-record is the curated single-source-of-truth layer.

- SQLite storage with vector columns for embeddings
- Multiple embedding backends (local via Ollama, or API-based)
- Semantic query interface over KnowledgeRecord entries
- Automatic injection at prompt assembly time (Layer 0.5 or hook)
- Temporal decay (older memories weighted lower)

## Ideas

### `architecture-viz`: Architecture Visualization & Health Analysis

As agents write more of the code, the human loses visibility of how the target codebase is actually organized. A module that scans the active project, renders its architecture visually, and lets an LLM co-analyze with the human — catching drift, dead modules, cyclic deps, and unhealthy growth patterns that would otherwise hide until refactor pain. Findings feed back into prompt engineering for the coding agents.

- Target is the **user's project** (any codebase cosmonauts is invoked in), not cosmonauts itself
- **Mechanical layer**: AST/import scan produces a structured dependency graph as JSON (modules, files, imports, sizes, fan-in/fan-out, cycles). Start with TypeScript/JavaScript; extend via tree-sitter for polyglot
- **Narrative layer**: LLM analyst agent consumes the JSON and produces Mermaid diagrams + markdown reports (C4-style context, component maps, layering violations, refactor candidates)
- **Local web server**: `cosmonauts arch serve` renders the JSON with an interactive graph lib (cytoscape.js or d3-force) for zoom/pan/filter; embedded Mermaid for the narrative diagrams — no build step, single static bundle
- **Text fallback** (`--text`): ASCII tree + Mermaid source for agent consumption and terminal-only environments
- **Storage**: `.cosmonauts/architecture/graph.json` (latest scan), `snapshots/<date>/` (history, diffable), `analyses/<topic>.md` (saved LLM reports with embedded Mermaid)
- **Dual consumer**: the same artifacts are read by humans (browser) and by agents (`plan-reviewer`, `quality-manager`) as context for architectural review
- **Health metrics**: cyclic deps, god-modules, orphan files, churn hotspots, layering violations vs the architecture-of-record
- **Feedback loop**: if drift is detected, flag for prompt-engineering review of the coding agents that produced it
- Likely a new domain (`domains/architecture/`) with an `architect-analyst` agent, or a cross-domain capability — decide during planning
- Pairs naturally with `architecture-of-record`: this feature surfaces the *actual* architecture; architecture-of-record holds the *intended* one; divergence between them is the signal

### `prd-ingestion`: PRD Ingestion Skill + Non-Interactive Spec-Writer Mode

Accept a written PRD as input and either proceed (if complete) or refuse with a structured gap list (if ambiguous). Unlocks PRD → merge-ready PR automation without making the system hallucinate product judgment. Needed only when a real PRD input stream exists.

- New shared skill `prd-ingestion/SKILL.md` with a PRD completeness checklist (goals, users, success criteria, scope, edge cases, non-goals, constraints, acceptance signals)
- New `spec-writer` mode: `--prd <path>` reads a PRD and validates against the checklist
- If PRD complete: generate `spec.md` without interactive questions
- If PRD has gaps: refuse with structured `missions/plans/<slug>/gaps.md` listing each missing or ambiguous item
- Non-interactive chain mode treats the gap list as a chain abort condition rather than proceeding with flagged assumptions
- Distinct from current "flag assumptions" behavior — this refuses rather than guesses when product judgment is required

### `behavioral-regression`: Behavioral Regression Skill

Tests passing ≠ behavior unchanged. For bug fixes and refactors where preservation is the point, a skill that guides workers to capture golden outputs and characterization tests before changing code.

- New skill `behavioral-regression/SKILL.md` covering characterization tests, golden output files, snapshot testing, approval testing patterns
- Loaded by `worker`, `refactorer`, and `fixer` when the task carries the label `preserve-behavior` or `refactor`
- Task template for preservation-work adds a mandatory AC: "existing behavior verified unchanged via golden outputs or characterization tests"
- `quality-manager` runs regression checks as part of verification for tasks with these labels
- Complements product tests rather than replacing them — targets the "change code, not behavior" case that tests alone don't cover

### `bug-triage`: Bug Triage Skill

Structured triage that produces either a minimal plan (complex bug) or a direct task (simple bug). **Skill only — `cosmo` remains the interface.** Do NOT promote to a dedicated agent; the routing procedure is the value, not a new role.

- New shared skill `bug-triage/SKILL.md` loaded by `cosmo`
- Covers repro steps, blast radius, duplicate check against archived plans, severity assessment, routing decision
- Triage artifact `missions/triage/<slug>.md` links to either a plan slug (complex → full plan) or a task ID (simple → direct fix)
- Standard severity labels feed into quality-manager priority handling (P0 bug skips the design-review gate entirely)

### `agent-messaging`: Agent-to-Agent Messaging

Replace filesystem polling with push-based communication between agents. Address when coordinator-loop cost or latency becomes symptomatic; not urgent at current scale.

- Event bus or completion callback system for spawned agents
- Coordinator receives results directly instead of re-reading task files each iteration
- In-memory pub/sub that the orchestration extension hooks into
- Idempotency keys to prevent duplicate processing
- Depth-aware dispatch (only direct requester receives completion events)

### `executive-assistant`: Autonomous Executive-Assistant Follow-Up

`main/cosmo` and Drive are implemented. This item tracks the remaining always-on supervision layer: watches `ROADMAP.md`, picks prioritized items, runs workflows or Drive, handles failures, and reports back. Real-time agent-to-agent communication is the substrate — without it, this is just a cron scheduler.

- Extend `domains/main/` with monitor/supervisor/escalator/reporter agents only if the daemon needs specialized roles
- `cosmonauts daemon` mode: long-running process with heartbeat, durable state, survives restarts
- Real-time comms primitives: peer registry, `send_to_peer` / `wait_for_peer_message` tools built on the existing `MessageBus` and `pi.sendUserMessage` injection
- Human steering channel — always-open injection point for mid-flight redirection
- Cross-plan arbitration: EA serializes or merges plans that touch the same files
- Hard safety caps: round limits on dialogues, budget ceilings, escalate-to-human after N autonomous retries
- Prototype sequence: daemon + steering channel first (single roadmap item → plan-and-build loop), then real-time dialogue (EA ↔ planner roadmap disambiguation), then supervision (mid-flight escalation)

### `chain-checkpointing`: Chain Checkpointing & Resumption

Serialize chain state after each stage so workflows survive crashes and can be resumed mid-execution. Address when long-running autonomous durations justify the complexity.

- Persist chain progress (completed stages, pending stages, accumulated stats) to disk
- Resume from last completed stage on restart
- CLI flag: `--resume <chain-id>` to continue a previously interrupted workflow
- Stage results cached for replay during debugging

### `model-failover`: Model Failover & Retry

Wrap the spawner with retry logic that classifies errors and falls back to alternate models/providers. Reactive work — address when provider flakiness becomes symptomatic.

- Error classification: auth, billing, rate-limit, context overflow, transient
- Configurable backup models per role (e.g., fall back from opus to sonnet)
- Backoff strategy with jitter to avoid thundering herd
- Multi-key rotation with cooldown tracking per provider
- Usage stats preserved per attempt for cost tracking accuracy

### `hook-system`: Plugin & Hook System

Lifecycle hooks at chain, stage, and spawn levels for extensibility without modifying core code. Defer unless a plugin ecosystem becomes an explicit goal.

- Hook categories: chain lifecycle, stage lifecycle, agent spawn, tool execution
- Fire-and-forget hooks (parallel, void) and modifying hooks (sequential, merged results)
- Hook registration via config or extension API
- Key hooks: before_chain_start, after_stage_end, before_agent_spawn, after_tool_call
- Enables plugins for logging, metrics, custom validation, and external integrations

### `context-budget`: Context Budget Management

Smart pruning for coordinator loops that accumulate large tool outputs over many iterations. Address when coordinator or quality-manager runs start hitting compaction issues.

- Cache-TTL based token counting for context budget awareness
- Automatic compaction safeguards to prevent over-compaction
- Configurable token budget per agent role
- Preserve recent tool results within budget, summarize older ones

### `domain-aware-skills`: Domain-Aware Skill Discovery

Skill filtering should be domain-aware. When `projectConfig.skills` is unset, default to showing all skills from the active domain context rather than all skills globally. Prevents cross-domain noise as new domains are added.

- `buildSkillsOverride` gains a `domainContext` parameter
- Filter discovered skills by domain when no explicit skill list is given
- Projects can still override with an explicit `skills` list to restrict further

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

### `dialogic-planner-followups`: Review-Derived Followups from `dialogic-planner`

Items deferred from the `dialogic-planner` branch. Polish items pruned; load-bearing ones kept.

- **Panel-value validation.** Measure whether the three-specialist code-review panel (security, performance, UX) inside `quality-manager` produces materially different findings from a single multi-lens generalist `reviewer` after real-world runs. If specialists catch meaningfully different issues, the pattern is justified and new lenses can be added (below). If not, retire the specialists and beef up the generalist. Agent count must be justified by observed friction.
- **Additional reviewer lenses.** Once panel-value validation confirms the specialist pattern earns its keep, consider adding: data-integrity/migration-safety (schema changes, reversibility, lock duration), reliability/failure-recovery (retries, timeouts, idempotency, circuit breakers), observability (tracing, alerting — distinct from perf metrics). Each a focused specialist matching the existing template.
- **TDD-specific review lens for `plan-reviewer`.** `plan-reviewer` has no "Behaviors completeness" or "test-spec atomicity" dimensions, so TDD plans pass review on architecture but miss TDD-discipline gaps. Extend `plan-reviewer.md` with a conditional dimension that applies when a `## Behaviors` section is present, rather than adding a `tdd-reviewer` agent.
- **Dialogic idle fallback.** The `design-dialogue` skill waits for user direction at pass boundaries with no timeout guidance. Rule: if the user does not respond within the session, commit current defaults and document them as assumptions in the plan.
- **Canonical trigger-phrase vocabulary.** The "just decide" signal works but is informal. Document a canonical list (`[autonomous]` tag, "just do it", "commit", "go ahead") that `cosmo` and the planner agree on, so mode switches are deterministic.

### `tdd-orchestration-followups`: Deferred Work from `tdd-orchestration-hardening`

Items scoped out of the `tdd-orchestration-hardening` plan. Captured here so they survive archival and can be picked up when the cost/benefit shifts.

- **Commit cadence inside TDD tasks.** Each task currently produces three commits (RED + GREEN + REFACTOR), which ships failing tests at every RED commit (red CI on every push) and ~3× history noise. Switch to single-commit-per-task: only `refactorer` commits; `test-writer` and `implementer` stage only; on phase failure the coordinator uses `git reset --mixed` to preserve unstaged files as a recovery point. Touches `test-writer.md`, `implementer.md`, `refactorer.md`, and `tdd-coordinator.md` failure paths. Revisit when red-CI cost or history noise becomes measured.
- **Merge `implementer` + `refactorer` into one agent.** The GREEN/REFACTOR phase boundary is currently enforced across two separate agents for a relatively weak discipline win, at the cost of an extra spawn per task (~33% of per-task orchestration overhead). The load-bearing boundary is RED/GREEN between `test-writer` and the implementer; REFACTOR can be a second step inside the same session. Touches both agent definitions, both prompts, and the `GREEN complete:` → `REFACTOR complete:` handoff contract in `tdd-coordinator.md`. Revisit if per-task orchestration cost becomes measured.
