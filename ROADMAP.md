# Roadmap

Work backlog in two sections. **Prioritized** items at the top are ordered — pick from the top. **Ideas** below are unordered candidates that haven't been prioritized yet. When an item is picked up from either section, remove it and create a plan via `plan_create`. See the `roadmap` skill for procedures.

## Prioritized

Ordered — pick from the top. Curated 2026-06 from a full-backlog reprioritization: ~15 scattered items were consolidated into a handful of capability **tracks**, each with a source-of-truth doc under `missions/architecture/` (linked per entry). The sequence front-loads the live bug, then high-leverage / compounding work, then the foundational multi-domain pieces. General **agent memory**, **autonomy / always-on**, and the rest are unordered Ideas below.

### `task-id-system`: Improve Task Naming / Numbering

The current scheme persists a `lastIdNumber` counter in `missions/tasks/config.json` and allocates `max(counter, highest ID on disk) + 1` at create time. Problems: the config file is rewritten (with 2-space JSON) on every create — churn and merge-conflict bait — and client-side sequential allocation can't prevent cross-branch ID collisions (two branches both mint `TASK-N`, merge produces duplicates). It actively breaks `plan archive` today. For now `missions/` is excluded from Biome to stop the lint churn; this item replaces the band-aid.

- Decide direction: derive next number from `missions/tasks/` ∪ `missions/archive/tasks/` and drop the config counter; or keep a counter but move it to an un-linted state file; or switch to collision-resistant non-sequential IDs (nanoid/ULID/short hash) — losing sequential readability but eliminating conflicts entirely
- Whichever path: `task create`/`task edit` must stop reformatting tracked config on every write (or stop touching it at all)
- If staying sequential: document the cross-branch collision caveat, or add a lightweight reconciliation step (e.g. `cosmonauts task renumber` after a merge)
- Update `lib/tasks/id-generator.ts`, `lib/tasks/task-manager.ts`, `lib/tasks/file-system.ts` and the task CLI accordingly; keep `generateNextId` behavior covered by tests
- Revisit the Biome `missions/` exclusion afterward — narrow or remove it if the config churn is gone

### `architectural-memory`: Codebase Architectural Memory

Durable, retrievable knowledge **about the codebase** — structure, decisions, work history — so agents and humans don't lose the thread as agents write the code. One repo-scoped substrate across facets: **code structure** (derived/actual + curated/intended), **decisions**, **work history**. First slice: the **derived code-structure map**. Later waves (architecture-of-record, reuse-scan, embedding retrieval) live in the source-of-truth doc.

- Derived map: dependency tree + public interfaces, always-fresh via cache-on-hash; "what each module does" narrative regenerated lazily only when a module's skeleton changes
- Sharded markdown agents load on demand — `architecture/index.md` + per-module shards — so agents stop re-scanning the whole codebase
- Build on existing TS tooling (dependency-cruiser / ts-morph / typedoc); LLM only for narrative + diagrams; targets the user's project
- Consumers: planner, plan-reviewer, coordinator, worker, quality-manager (human HTML/diagram + health-metrics view deferred)
- Source of truth, facets, waves, open decisions: `missions/architecture/architectural-memory.md`

### `agent-tools`: Native Agent Tools (Web Research + Browser)

Make borrowed/bolted-on capabilities feel **native** — registered tools (the established `pi.registerTool` + TypeBox pattern) with explicit capability docs, so agents reach for them instead of leaving for Claude Code/Codex. Today web research is **absent**; browser exists only as an under-surfaced shell-out skill. First slice: **web research**. Full assessment + theme in the source-of-truth doc.

- Web research (build native): `web_search` + `web_fetch` primitives behind a pluggable backend (Brave / Tavily / Exa / SearXNG) → a thin `researcher` skill/agent that composes them
- Browser (keep Playwright): first sharpen the `playwright-cli` skill — self-contained (inline reference, stack-agnostic), explicit use-cases, surfaced to `cosmo` + coding agents; upgrade to a thin native `browser` tool wrapping Playwright if usage stays low
- Pi-First: evaluate `pi-skills` brave-search / browser-tools before building; lean native for control + the clean pattern
- Cross-link: document the tool-authoring contract (currently code-only) with `domains`, for when installable domains add tools
- Source of truth: `missions/architecture/tool-ecosystem.md`

### `agent-swarms`: Multi-Agent Swarms with a Coordinator

N agents work as a team toward one objective, communicating through a coordinator. First slice: **read/opinion swarms** (codebase understanding, spike investigation, multi-lens review) — they mutate nothing and need no isolation. The full forward arc (mutable swarms, durable nesting, real parallelism/isolation, script-coordinated mode) lives in the orchestration source of truth.

- Shard work across N read-only agents — a different slice per agent, not today's same-prompt fan-out
- Coordinator collects and synthesizes per-agent opinions into one result
- Coordinator modes: spawned in-process, or the interactive main session as coordinator
- Builds on existing fan-out + `spawn_agent` + the `quality-manager` parallel-specialist pattern; no worktree isolation for this slice
- Source of truth & later waves: `missions/architecture/orchestration-future.md`

### `domains`: Domain System — Extraction, Boundary & Routing

Domains are composable agentic bundles (agents, prompts, capabilities, skills, tools, chains — the full stack) that extend Cosmonauts; the plugin substrate is **~80% built** (git/local/symlink/catalog install, manifest, multi-source precedence+merge, `eject`, `update`). This track finishes and documents it, ships a minimal core, and adds domain routing. Full model in the source-of-truth doc.

- Core bundle = framework + `shared` (stdlib) + `main` (default assistant); no merge; audit the `shared`/`main` split. `coding` + future/experimental domains = external repos
- Extract `coding` to its own repo (mechanism exists; `--link` symlink for the both-repos dev loop)
- Customization model: override-layer (precedence merge, asset-granular — customize without forking, upgrades preserved) + `eject` for full forks
- New mechanics: **domain routing** (`cosmo` picks the right domain — beyond skill-routing) + domain-aware skill discovery (folds in `domain-aware-skills`, `skill-routing`)
- Boundary/definition contract documented; declarative-format decision (manifest/agents/chains → data; tools stay code); domain composition/inheritance deferred
- Source of truth: `missions/architecture/domains.md`

## Ideas

Unordered candidates — pick only when directed. Several are full capability tracks with their own source-of-truth doc under `missions/architecture/`; the entry links to it.

### `agent-memory`: General Agent Memory

Operational/personal memory so agents (and Cosmo as an assistant) remember the user, project, and session without re-loading context every turn — distinct from architectural (code) memory but sharing its save/retrieve mechanism. Plain-text first behind a pluggable retrieval interface; embeddings optional. First slice: the **memory interface + plain-text substrate + scope-filtered retrieval**. Full model in the source-of-truth doc.

- Taxonomy: scope (session/project/user) × type (semantic/procedural/episodic); short-term ≈ the live Pi session (Pi-First audit), long-term = consolidated records
- Retrieval without context pollution: compact index always-loaded + detail on demand; scope + recency + `recall()` tool first, embeddings last
- Pluggable interface (`write` / `retrieve(scope, query)` / `consolidate`) shared with architectural memory; backends plug in (plain-text → SQLite → embeddings)
- Records: profile + playbooks (explicit-save v1), episodic log (= autonomy audit trail); user-scoped `~/.cosmonauts/`, human-legible and prunable
- Background consolidation ("dreaming") = a scheduled process → intersects the autonomy track; substrate for `ambient-cosmo` / `executive-assistant`
- Source of truth: `missions/architecture/agent-memory.md`

### `autonomy`: Autonomy / Always-On Substrate

The base that lets a domain or agent run on a schedule, wake periodically, react to events, or stay always-on — plus the governance that makes autonomous action safe. The same substrate powers memory "dreaming," periodic result-checks, the executive assistant, and the ambient terminal assistant. First slice: the **scheduling/lifecycle substrate** (triggers + host + durable wake-state). Full model in the source-of-truth doc.

- Layer A (base): triggers (interval / one-shot / event-wait / always-on) · lifecycle host (in-process → child → daemon) · durable wake-state (= the episodic log) · cost-efficient wake handler (skip empty, dedup, silent-ack)
- Agents/domains *declare* their triggers; the host fires them (pluggable, opt-in)
- Layer B (acting agents): trust tiers (auto / act-then-announce / reserved) + audit log + caps + escalate-to-human + a steering channel (where Telegram/WhatsApp transports plug in)
- Shares ONE long-lived host + durable store with the orchestration durable runtime — this delivers orchestration's deferred scheduler-form/daemon + durable-coordinator-loops
- Consumers (folded in): executive assistant (Cosmonauts-work supervisor), `ambient-cosmo` (herdr terminal supervisor), external `channels`; cross-links `agent-messaging`
- Source of truth: `missions/architecture/autonomy.md`

### `analysis-tools`: Static-Analysis Tooling for Agent Code Quality (Spike)

A spike/improvement track: review how Cosmonauts leverages static analysis to help agents produce great code, and where to take it. Today it's only Biome (lint/format) + `tsc` for this repo's TypeScript — nothing surfaced to agents as a dedicated capability, and nothing for non-TS codebases. Targets the user's project (any codebase), not just cosmonauts.

- Audit the current code-quality arc: how lint/typecheck are used in the quality gates and the agent loop today — are agents leveraging them, or just running the gate ad hoc?
- Use what we have better: richer rule sets, type-aware checks, complexity/dead-code/security signals fed back to `worker`/`quality-manager` as structured findings, not just pass/fail
- Other languages/codebases: per-language analyzers (ESLint, ruff/mypy, clippy, …) and how a domain/skill surfaces the right one per project
- Universal layer: a language-agnostic option (tree-sitter, `semgrep`) and a common findings contract (e.g. SARIF) so the framework speaks one analysis-results format across languages
- Pairs with `architectural-memory` (shared static-analysis substrate — dependency-cruiser/ts-morph/tree-sitter): that track *understands* the code; this one *catches problems* as agents write it

### `artifact-viewer`: Human-Friendly HTML Views (Plans + Architecture)

Markdown stays the source of truth for agents; humans get a rendered **HTML companion** so they keep visibility as agents do the work. Render cosmonauts' key artifacts as readable HTML — starting with **plans** and the **architecture map**. A cross-cutting presentation layer; the `architectural-memory` track's deferred HTML/diagram view folds in here.

- Plans: render `missions/plans/<slug>/{plan,spec,review}.md` + task list/status as a navigable HTML view
- Architecture: render the derived map (`architectural-memory` W1) — module graph + per-module pages + Mermaid diagrams
- One surface — `cosmonauts serve` (generalizes the deferred `cosmonauts arch serve`); no build step, single static bundle; markdown is rendered *to* HTML, never replaced
- Humans-only — agents keep reading the markdown source; this is purely additive
- Extensible later to tasks / reviews / run-status

### `agent-messaging`: Agent-to-Agent Messaging

Replace filesystem polling with push-based communication between agents. Address when coordinator-loop cost or latency becomes symptomatic; not urgent at current scale. Shared substrate: feeds orchestration's durable-coordinator-loops and the autonomy executive-assistant.

- Event bus or completion callback system for spawned agents
- Coordinator receives results directly instead of re-reading task files each iteration
- In-memory pub/sub that the orchestration extension hooks into
- Idempotency keys to prevent duplicate processing
- Depth-aware dispatch (only direct requester receives completion events)

### `hook-system`: Plugin & Hook System

Lifecycle hooks at chain, stage, and spawn levels for extensibility without modifying core code. Defer unless a plugin ecosystem becomes an explicit goal (the `domains` track may make it one).

- Hook categories: chain lifecycle, stage lifecycle, agent spawn, tool execution
- Fire-and-forget hooks (parallel, void) and modifying hooks (sequential, merged results)
- Hook registration via config or extension API
- Key hooks: before_chain_start, after_stage_end, before_agent_spawn, after_tool_call
- Enables plugins for logging, metrics, custom validation, and external integrations

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

### `language-skills`: Language Skill Pack

Write language skills for Rust, Python, Swift, and Go. Skill *content* that ships inside (extracted) domains — downstream of the `domains` track.

- Follow the established pattern in `domains/coding/skills/languages/typescript/SKILL.md`
- Each skill covers idioms, best practices, toolchain conventions, and testing patterns
- Workers load the appropriate skill based on project language

### `domain-skills`: Domain Skill Pack

Write domain skills for testing, code-review, frontend, devops, api-design, and database. Skill *content* that ships inside domains — downstream of the `domains` track.

- Follow existing conventions in `domains/coding/skills/`
- Testing skill covers strategy, coverage, mocking, and test organization
- Code-review skill covers what to look for, how to structure findings
- Frontend, devops, api-design, database skills cover domain-specific patterns and best practices

### `headless-init`: Headless Project Bootstrap (`init --print` / `--emit-files`)

`cosmonauts init` is REPL-only today: it launches the domain lead to chat about `AGENTS.md` and skill choices, then writes files after the user confirms. External orchestrators (Claude Code, Codex driving cosmonauts from outside) can't bootstrap a fresh project without a human at the terminal. Surface a non-interactive mode that produces the same artifacts as a single-shot proposal.

- `cosmonauts init --print` runs the bootstrap agent in print mode and emits the proposed `AGENTS.md` content to stdout; no files written
- `cosmonauts init --emit-files <dir>` writes proposed `AGENTS.md` and any skill-suggestion files into `<dir>` without prompting; reports a summary on stderr; exits non-zero if the bootstrap agent declines
- Bootstrap prompt reworked so the agent produces a structured, single-shot proposal (no clarifying questions in this mode); structured envelope documented in the bootstrap persona
- Existing interactive `cosmonauts init` REPL remains the default — unchanged
- Tests cover both new modes against a fixture project; assert produced `AGENTS.md` is non-empty and carries the expected section headings

### `product-domain`: Product Strategy Domain (split from `superplanning-integration`)

A specialized domain for product work — idea validation, product planning, and product review (`product-planner`, `product-reviewer`, `product-researcher` agents + `forcing-questions` / `review-personas` / `product-docs` skills + brainstorm / plan-product / product-to-code chains). Split out of the `superplanning-integration` plan (whose coding-agent-hardening half remains that plan's active scope). A concrete first consumer of the `domains` extraction vision.

- Build as a specialized **external domain** per the `domains` track conventions, not embedded in the framework
- `product-researcher` is gated on `agent-tools` web research; until then it documents methodology for manual research
- Detailed design already exists: `missions/plans/superplanning-integration/{plan.md,spec.md}` (the product-domain sections)
- Cross-links: `domains` (how it ships/installs) · `agent-tools` (web-research dependency)
