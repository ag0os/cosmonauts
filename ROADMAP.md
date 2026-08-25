# Roadmap

Work backlog in two sections. **Prioritized** items at the top are ordered — pick from the top. **Ideas** below are unordered candidates that haven't been prioritized yet. When an item is picked up from either section, remove it and create a plan via `plan_create`. See the `roadmap` skill for procedures.

## Prioritized

Re-assessed and reordered **2026-08-25** in a human-led re-planning session, replacing the 2026-06 capability-track ordering (that queue's history — `task-id-system` through `knowledge-surface`, all shipped — lives in `knowledge/` and git history). The organizing thesis: **cosmonauts as a harness-agnostic software factory.** Factory assets — agents, skills, workflows, knowledge, the architecture picture — are defined once, in cosmonauts; any harness (cosmonauts itself, Claude Code, Codex, Gemini, …) can play coordinator or worker; and the factory improves itself from its own session data.

Agreed spine: **portable harness** (`harness-adapters`, `drive-envelope`, `coordinator-packages` — added 2026-08-25 — `external-session-capture`) → **factory quality** (`factory-modes`, `architecture-aware-planning`, `worker-inloop-analysis`) → **knowledge-and-memory continuation** (per the §10.1 amendment in `missions/architecture/knowledge-and-memory.md`) → **`agent-interaction`** → **`domains`**. Items marked **(thread)** are deliberately small and run alongside whatever is on top — start them at the first opportunity; they block nothing.

Active plans are not roadmap items: `harness-adapters` (picked up 2026-08-25 — was the top of this queue), `memory-consolidation` (re-spec required before tasks — see §10.1), `autonomy-host`, `coding-extraction`, and `superplanning-integration` (plus the deferred `web-research` spec) live under `missions/plans/`.

### `drive-envelope`: Drive as a Free Envelope

Decouple Drive's value (isolation, gates, session capture, reporting) from the plan+task ceremony so one-off and externally-triggered work can use it too.

- "Run N drive agents on X" from a prompt/brief — no plan or task required; plan-backed Drive unchanged
- Callable internally (agent, chain) and externally (any harness with cosmonauts knowledge driving the CLI non-interactively)
- Free-form runs still record sessions and outcomes, so they feed the memory loop like plan-backed runs
- Source of truth: `missions/architecture/orchestration-future.md` (extends the `runStart` seam)

### `coordinator-packages`: Packaged Cosmonauts Coordinators for Any Harness

Launch an external harness (Claude Code, Codex) already *being* a cosmonauts coordinator — a packaged agent whose identity is "coordinate this cosmonauts project through the CLI", in flavors (cosmo = general assistant, cody = coding coordinator). The binary-export mechanism exists (`cosmonauts export`, Claude-Forge-style; `packages/cosmo-spec-writer-claude` and `cosmo-worker-codex` prove it); this makes coordinators first-class and thin.

- Coordinator personas get a git-tracked native home — today each package's external-safe system prompt (`packages/*/*-system.md`) is hand-written and gitignored, the same no-source-of-truth disease the commands had
- Thin-coordinator principle: the package carries identity + CLI knowledge; skills and commands come from the `harness-adapters` sync (`skillDelivery: "reference"`, not inline-frozen), so a running coordinator never drifts from the repo
- Flavors are configuration over one coordinator template, not hand-forked prompts
- Consumes: `harness-adapters` (assets + registry) · `drive-envelope` (the coordinator's main lever) · pairs with `external-session-capture` (coordinator sessions are precisely the ones worth capturing)

### `external-session-capture`: Externally-Coordinated Sessions Feed the Memory Loop

Work coordinated from outside (Claude Code, Codex, …) currently leaves nothing our memory system can read; define the capture contract.

- Specify what an externally-coordinated run leaves behind — transcript tier, episode pointers, artifacts — and where it lands
- Adapter-side hook: the `harness-adapters` exports carry the capture instructions/mechanism, so capture is part of using cosmonauts from outside, not a separate chore
- The contract becomes a source behind `memory-consolidation`'s pluggable-sources seam (§10.1: the re-spec consumes this)
- Cross-links: `harness-adapters` · `missions/architecture/knowledge-and-memory.md` §5

### `knowledge-adoption` (thread): Turn On What We Built, In This Repo

Every memory/knowledge feature shipped so far is gated OFF and unconsumed; all remaining design rests on theory. Flip that, deliberately and on record.

- Enable the knowledge-surface gates in this repository — a dogfooding decision recorded as such; shipped defaults stay OFF
- Deliberately run internal cosmonauts coordinators and agents: recent usage has been external-coordinator-only, so internal agents are the unobserved population
- Record what retrieval actually does — recall usage, index cost against the 24,000-byte combined budget, observed behavior changes — as evidence for the consolidation and budget decisions
- Revisit the 155 approved-but-unpromoted proposals once index contents matter to a live consumer

### `factory-evals` (thread): Stop Driving Blind — Instrumentation First

No evals drive development today; changes to agents and workflows land unmeasured. Start with a scoreboard over signals we already produce.

- Harvest existing artifacts into a persistent scoreboard with baselines: drive/chain run stats, gate outcomes, review-round counts, test/lint results, cost per plan
- Every factory change — prompt, agent, workflow — lands against a baseline instead of an anecdote
- Deferred rungs, on purpose: frozen task suites replayed against agent/prompt changes; retrieval A/B (pairs with `knowledge-adoption` evidence)

### `factory-modes`: Legible Collaboration Modes

One agent set, one swapped prompt layer per mode — the mode explicit to both the agents and the user. Parallel per-mode domains were considered and rejected 2026-08-25 (duplication and drift — the same disease as the hand-copied skills).

- A mode layer in the four-layer prompt assembly: **dialogic-product** (spec conversations — user value, UX), **dialogic-plan** (trade-offs, current architecture, blast radius of the change), **full-factory** (post-spec, agents decide)
- A per-run `on-uncertainty` policy, declared up front and legible in every mode: `decide | ask-and-continue | ask-and-halt`
- Escalation never blocks: park the question durably, notify, continue parallelizable work — "finished except one parked question" is an outcome the user chose, never a surprise
- Durable resume for `ask-and-continue` is `autonomy-host`'s event-wait trigger (the host's first factory-critical consumer)
- Absorbs from `dialogic-planner-followups`: the dialogic idle-fallback rule and the canonical trigger-phrase vocabulary

### `architecture-aware-planning`: Plans That Know the Architecture

Planning conversations and plan artifacts consult the current architecture and state the blast radius of proposed changes.

- Planner and plan-reviewer consume the derived code-structure map plus the intended-architecture knowledge record; `dialogic-plan` mode surfaces both in conversation
- Plans state change impact and extension-health reasoning: which boundaries the change touches, and how it respects or deliberately amends them
- The map's two-tier freshness must be trustworthy at planning time
- Source of truth: `missions/architecture/code-structure-map.md` (derived map + drift signal), with the intended-architecture record class from `knowledge-and-memory.md`

### `worker-inloop-analysis`: Workers Self-Correct While Writing

Static-analysis feedback inside the worker's write loop, not only at end-of-task gates — catch "this code is getting worse" while it's cheap to fix.

- Wire the shipped seven-capability analysis contract into the worker (and refactorer) coding workflow: complexity/CRAP-style signals consulted as code is written
- Policy and prompts, not new infrastructure — the capability runtime shipped 2026-08; SwarmForge's per-language engineering article is the inspiration, our provider-neutral contract is the mechanism
- Quality gates unchanged; this is earlier, self-directed feedback, not a gate replacement

### `observational-memory`: Investigate OM and Design Its Seam

Pi-First investigation of Mastra-style observational memory via the existing Pi port, before the consolidation pump is re-specced.

- Audit and trial `pi-observational-memory` (github.com/elpapi42/pi-observational-memory): Observer/Reflector/Dropper background workers, threshold-driven, compaction-as-rendering
- Requires the Pi lockstep bump to ≥0.81.0 (`agent_settled` event) — with the mandated full API re-audit that accompanies any bump
- Design the seams: its `recall` tool vs ours (name collision); Reflector output as a live source for the consolidation pump; whether a continuously-maintained observation log subsumes the working-state singleton
- Findings resolve two §10.1 dispositions: working state (parked pending this) and the `memory-consolidation` re-spec

### `agent-interaction`: The Live Coordinator Triangle

Real-time coordinator↔worker↔verifier interaction — reframed 2026-08-25 from `agent-swarms` breadth: the live triangle is the value; N-agent parallelism is not a goal until it proves value.

- First: assess what orchestration/messaging surfaces already exist and what a coordinator actually needs mid-run
- Reference design for the mailbox: SwarmForge's validated send — closed header schema, generated bodies, durable per-agent queues where state is file location, refuse-never-repair (`missions/architecture/spikes/swarmforge-workflow-spec.md`)
- Merges the former `agent-messaging` idea: push-based completion/events replacing filesystem polling, idempotency keys, depth-aware dispatch
- Breadth swarms and the later waves stay in the source of truth: `missions/architecture/orchestration-future.md`

### `domains`: Domain System — Extraction, Boundary & Routing

Domains are composable agentic bundles (agents, prompts, capabilities, skills, tools, chains — the full stack) that extend Cosmonauts; the plugin substrate is **~80% built** (git/local/symlink/catalog install, manifest, multi-source precedence+merge, `eject`, `update`). This track finishes and documents it, ships a minimal core, and adds domain routing. It is the gate for **opening cosmonauts to the world**. Full model in the source-of-truth doc.

- Core bundle = framework + `shared` (stdlib) + `main` (default assistant); no merge; audit the `shared`/`main` split. **Partly done:** S2 Wave 1 made `shared`+`main` a runnable coding-less install and produced a leakage scan (`missions/archive/plans/coding-agnostic-framework/leakage-findings.md`) whose Wave-2 dispositions feed the move
- Extract `coding` to its own repo (mechanism exists; `--link` symlink for the both-repos dev loop). **Wave 1 DONE (2026-06-29)**; **Wave 2** = the physical move, tracked by the active `coding-extraction` plan
- Customization model: override-layer (precedence merge, asset-granular) + `eject` for full forks
- New mechanics: **domain routing** (`cosmo` picks the right domain) + domain-aware skill discovery (folds in `domain-aware-skills`, `skill-routing`)
- Boundary/definition contract documented; declarative-format decision; composition/inheritance deferred
- Source of truth: `missions/architecture/domains.md`

## Ideas

Unordered candidates — pick only when directed. Several are full capability tracks with their own source-of-truth doc under `missions/architecture/`; the entry links to it.

### `agent-tools`: Native Agent Tools (Web Research + Browser) — ⏸ PARKED

**⏸ PARKED (2026-07-01; moved to Ideas 2026-08-25.)** S1 (native web research) is deferred — the warm spec lives at `missions/plans/web-research/` (status `deferred`), parked in favor of a cheaper *research-delegation* direction (delegate research to codex/claude-cli via the driver seam — now naturally part of the `harness-adapters`/`drive-envelope` direction). Browser (S2) is not started. Revive the native web-research slice when fully-autonomous chain runs need grounded/cited, machine-consumable facts.

- Web research (build native): `web_search` + `web_fetch` primitives behind a pluggable backend (Tavily / Exa / SearXNG — Brave free tier is dead) → a thin `researcher` skill/agent
- Browser (keep Playwright): sharpen the `playwright-cli` skill first; upgrade to a thin native `browser` tool if usage stays low
- Source of truth: `missions/architecture/tool-ecosystem.md`

### `autonomy`: Autonomy / Always-On Substrate

The base that lets a domain or agent run on a schedule, wake periodically, react to events, or stay always-on — plus the governance that makes autonomous action safe. **W1 (Layer A) is the active `autonomy-host` plan** (in-process host + triggers + durable wake-state, config-gated off); **the daemon (W2), governance (W3), EA (W4), ambient (W5), and `channels` remain here, unprioritized.** The host now has two named consumers: the `memory-consolidation` dreaming loop and `factory-modes`' `ask-and-continue` escalation (event-wait trigger). Full model in the source-of-truth doc.

- Layer A (base): triggers (interval / one-shot / event-wait / always-on) · lifecycle host (in-process → child → daemon) · durable wake-state · cost-efficient wake handler
- Layer B (acting agents): trust tiers + audit log + caps + escalate-to-human + a steering channel
- Shares ONE long-lived host + durable store with the orchestration durable runtime
- Consumers (folded in): executive assistant, `ambient-cosmo`, external `channels`; cross-links `agent-interaction`
- Source of truth: `missions/architecture/autonomy.md`

### `analysis-tools`: Static-Analysis Tooling for Agent Code Quality

**Capability foundation ✅ shipped (2026-08-05)** through the analysis-capabilities plans: a provider-neutral seven-capability contract, structured results, explicit binding/failure states, a pinned reference provider, gate-category declarations, and capability procedures for the consumer roles. The in-loop wiring slice is now the Prioritized item `worker-inloop-analysis`. What remains here is expansion and policy work:

- Deepen the signal: richer rule sets, type-aware checks, and security signals as structured findings (v1 taxonomy has no security capability; the reference provider is syntactic)
- Polyglot provider routing and a second validated executable provider — ArchSpec is the concrete candidate (`archspec-provider` below); per-language analyzers (ESLint, ruff/mypy, clippy, …) surfaced per project
- Universal layer: a language-agnostic option (tree-sitter, `semgrep`) behind the same contract; consider SARIF for the result envelope
- Author repository boundary zones where enforcement is wanted; decide CI enforcement or scheduled stewardship
- Additional MCP/Node transports and any fix-application workflow evaluated separately; capability fixes stay preview-only until that safety design is ratified
- Pairs with `code-structure-map` (shared static-analysis substrate): that track *understands* the code; this one *catches problems* as agents write it

### `archspec-provider`: Ruby/Rails Analysis Provider (ArchSpec)

Investigate ArchSpec (archspecrb.dev) — architecture-boundary static analysis for Ruby, the fallow analogue — and integrate it as the second executable provider behind the shipped analysis-capability contract, active when the target codebase is Ruby/Rails.

- Investigate first: map ArchSpec's surface (`init`/`check`/`explain`/`todo`, `--format json`, non-zero exit on violations, rules in `Archspec.rb`, Rails/Layered/Hexagonal/Clean/… templates) onto the seven-capability taxonomy — it is a natural `boundary-conformance` binding, a gate that today resolves unbound everywhere
- Detection keys on the provider's own config or dependency (an `Archspec.rb` / Gemfile entry), not project language — per the shipped routing rule
- This is the "second validated executable provider" slice of `analysis-tools` made concrete: it validates that the provider-neutral contract actually is provider-neutral
- Cross-links: `analysis-tools` · `worker-inloop-analysis` (in-loop signals route through the same binding when the project is Ruby)

### `artifact-viewer`: Human-Friendly HTML Views (Plans + Architecture + Runs)

**First slice ✅ shipped with `code-structure-map` W1 (2026-07-03):** the plans + architecture-map HTML view (`cosmonauts serve`) — dependency-free, escaped-markdown, deterministic SVG module graph, read-only. Markdown stays the source of truth for agents; humans get a rendered companion. **Ambition extended 2026-08-25 toward factory observability:**

- Render workflow/chain definitions per domain graphically — which agents act at which stage
- Real-time run visibility: what domains/agents are working right now, live run status
- Later: inspect other sessions (output, token spend) and inject a message into one — the write half rides on `agent-interaction`
- Plans: render `missions/plans/<slug>/` + task list/status as a navigable view; render versioned `review-<n>.md` rounds (currently invisible — reimplement the reverted symlink-unsafe fix with real path containment)
- Quality-manager review panel writes generic `review-round-N.md` names that overwrite other plans' rounds — needs plan-scoped naming, which changes what the viewer lists
- Overall review first: walk `cosmonauts serve` end to end and scope from that pass, not assumption

### `hook-system`: Plugin & Hook System

Lifecycle hooks at chain, stage, and spawn levels for extensibility without modifying core code. Defer unless a plugin ecosystem becomes an explicit goal (the `domains` track may make it one).

- Hook categories: chain lifecycle, stage lifecycle, agent spawn, tool execution
- Fire-and-forget hooks (parallel, void) and modifying hooks (sequential, merged results)
- Registration via config or extension API
- Key hooks: before_chain_start, after_stage_end, before_agent_spawn, after_tool_call

### `spec-to-backlog`: Automated Spec→Plan→Tasks Pipeline + Planning-Agent Hardening

Distilled from the first fully-instrumented spec→plan→tasks run (2026-07-02/03) — observations and forward design in `missions/architecture/spikes/spec-to-backlog-pipeline.md`. Agent hardening and the external-coordinator workflow (the Claude Code command `/spec-to-backlog`) are ✅ DONE; `harness-adapters` will bring that command home as a generated export.

- **Remaining:** collect run data on whether the hardened single agents close the gap the external adversarial channel covers; then a **self-contained cosmonauts version** — multi-lens sharded review is not expressible in the chain DSL, making this a concrete consumer of `agent-interaction`
- Spec creation stays human-interactive; `prd-ingestion` (below) is the principled non-interactive entry point
- Cross-links: `agent-interaction` · `prd-ingestion` · `dialogic-planner-followups`

### `prd-ingestion`: PRD Ingestion Skill + Non-Interactive Spec-Writer Mode

Accept a written PRD as input and either proceed (if complete) or refuse with a structured gap list (if ambiguous). Needed only when a real PRD input stream exists.

- New shared skill with a PRD completeness checklist (goals, users, success criteria, scope, edge cases, non-goals, constraints, acceptance signals)
- `spec-writer --prd <path>` validates against the checklist; complete → `spec.md` without questions; gaps → structured `gaps.md` refusal
- Non-interactive chain mode treats the gap list as an abort condition — refuses rather than guesses when product judgment is required

### `behavioral-regression`: Behavioral Regression Skill

Tests passing ≠ behavior unchanged. For bug fixes and refactors where preservation is the point, a skill guiding workers to capture golden outputs and characterization tests before changing code.

- Skill covers characterization tests, golden outputs, snapshot/approval patterns
- Loaded by `worker`, `refactorer`, `fixer` on `preserve-behavior` / `refactor` labels; task template adds a mandatory preservation AC
- `quality-manager` runs regression checks for these labels

### `bug-triage`: Bug Triage Skill

Structured triage producing either a minimal plan (complex bug) or a direct task (simple bug). **Skill only — `cosmo` remains the interface;** do NOT promote to a dedicated agent.

- Covers repro, blast radius, duplicate check against archived plans, severity, routing decision
- Triage artifact `missions/triage/<slug>.md` links to a plan slug or task ID
- Severity labels feed quality-manager priority handling (P0 skips the design-review gate)

### `dialogic-planner-followups`: Review-Derived Followups from `dialogic-planner`

Items deferred from the `dialogic-planner` branch. **Note 2026-08-25:** the dialogic idle-fallback rule and the canonical trigger-phrase vocabulary are absorbed by `factory-modes`; what remains here:

- **Panel-value validation.** Measure whether the three-specialist review panel inside `quality-manager` produces materially different findings from a single multi-lens generalist. If not, retire the specialists. Agent count must be justified by observed friction — `factory-evals` provides the instrument
- **Additional reviewer lenses** (data-integrity/migration-safety, reliability/failure-recovery, observability) — only after panel-value validation confirms the pattern
- **TDD-specific review dimension for `plan-reviewer`** — conditional on a `## Behaviors` section, not a new agent

### `tdd-orchestration-followups`: Deferred Work from `tdd-orchestration-hardening`

Captured so they survive archival; pick up when the cost/benefit shifts.

- **Commit cadence inside TDD tasks:** switch to single-commit-per-task (only `refactorer` commits; stage-only for the others; `git reset --mixed` recovery). Revisit when red-CI cost or history noise becomes measured
- **Merge `implementer` + `refactorer`:** the load-bearing boundary is RED/GREEN; REFACTOR can be a second step in the same session. Revisit if per-task orchestration cost becomes measured

### `language-skills`: Language Skill Pack

Write language skills for Rust, Python, Swift, and Go — skill content that ships inside (extracted) domains; downstream of `domains`.

- Follow the pattern in `domains/coding/skills/languages/typescript/SKILL.md`
- Each covers idioms, best practices, toolchain conventions, testing patterns

### `domain-skills`: Domain Skill Pack

Write domain skills for testing, code-review, frontend, devops, api-design, and database — skill content that ships inside domains; downstream of `domains`.

- Follow existing conventions in `domains/coding/skills/`

### `headless-init`: Headless Project Bootstrap (`init --print` / `--emit-files`)

`cosmonauts init` is REPL-only; external orchestrators can't bootstrap a fresh project without a human at the terminal. Surface a non-interactive mode. (Natural rider on the `harness-adapters` direction.)

- `init --print` emits the proposed `AGENTS.md` to stdout; `init --emit-files <dir>` writes proposals without prompting, non-zero exit if the bootstrap agent declines
- Bootstrap prompt reworked for structured single-shot proposals; interactive REPL remains the default
- Tests cover both modes against a fixture project

### `product-domain`: Product Strategy Domain (split from `superplanning-integration`)

A specialized domain for product work — idea validation, product planning, product review. A concrete first consumer of the `domains` extraction vision, and the natural home for `factory-modes`' **dialogic-product** conversations at full depth.

- Build as an external domain per `domains` conventions, not embedded
- `product-researcher` is gated on web research (`agent-tools`); until then it documents methodology
- Detailed design exists: `missions/plans/superplanning-integration/{plan.md,spec.md}` (the product-domain sections)
- Cross-links: `domains` · `agent-tools` · `factory-modes`
