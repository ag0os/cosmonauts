# Roadmap

Work backlog in two sections. **Prioritized** items at the top are ordered — pick from the top. **Ideas** below are unordered candidates that haven't been prioritized yet. When an item is picked up from either section, remove it and create a plan via `plan_create`. See the `roadmap` skill for procedures.

## Prioritized

Re-assessed and reordered **2026-08-25** in a human-led re-planning session, replacing the 2026-06 capability-track ordering (that queue's history — `task-id-system` through `knowledge-surface`, all shipped — lives in `knowledge/` and git history). The organizing thesis: **cosmonauts as a harness-agnostic software factory.** Factory assets — agents, skills, workflows, knowledge, the architecture picture — are defined once, in cosmonauts; any harness (cosmonauts itself, Claude Code, Codex, Gemini, …) can play coordinator or worker; and the factory improves itself from its own session data.

Agreed spine: **portable harness** (`harness-adapters`, `drive-envelope`, `vendored-skills` — added 2026-08-26 — `coordinator-packages` — added 2026-08-25 — `external-session-capture`) → **factory quality** (`factory-modes`, `architecture-aware-planning`, `worker-inloop-analysis`) → **knowledge-and-memory continuation** (per the §10.1/§10.2 amendments in `missions/architecture/knowledge-and-memory.md`) → **`agent-interaction`** → **`domains`**. Items marked **(thread)** are deliberately small and run alongside whatever is on top — start them at the first opportunity; they block nothing.

Orchestration dependency overlay, ratified **2026-09-11** and amended by codex
after independent review **2026-09-13** and human-accepted **2026-09-14**: the active `execution-liveness` plan is the
urgent reliability insertion before new work on `drive-envelope`. It does not
replace the portable-harness spine. Once liveness is proven, resume that spine
through `drive-envelope`; graph work then starts with artifact handoff and an
enforced durable read-only fan-out/all-join slice before routers, durable
nesting, or swarm coordination. Later slices advance in the dependency order in
`missions/architecture/orchestration-future.md`. Every slice must remain neutral
across coordinator harness, coordinator policy, execution transport, and model
provider. Claude Code is a reference dogfood client, not an architectural
default.

Active plans are not roadmap items: `execution-liveness`,
`living-memory-structural-hardening`, `autonomy-host`, `coding-extraction`, and
`superplanning-integration` (plus the deferred `web-research` spec) live under
`missions/plans/`. `chain-stage-context`, `harness-adapters`, `living-memory`,
and `living-memory-fidelity` shipped and are archived; their knowledge is in
`knowledge/` and `memory/agent/proposals/`. `execution-liveness` owns the shared
scheduler attempt/lease/cancellation seam; do not implement the overlapping
`autonomy-host` lifecycle seam ahead of that contract.

Quality pause, human-prioritized **2026-09-14**: before continuing active-plan
or new feature development, complete `test-health-audit`, then
`project-health-audit`. These two items temporarily precede the active-plan and
portable-harness queues; once both establish trustworthy baselines, resume the
existing dependency order.

### `test-health-audit`: Make the Test Suite Trustworthy

Establish a test-evidence method and use it to audit and remediate the existing suite so green tests provide meaningful development guardrails.

- Adapt the deintroverter study's evidence-chain and graduated-verdict approach to Cosmonauts tests, covering execution integrity, production or artifact grounding, contract alignment, fault sensitivity, composition realism, and determinism
- Inventory every test and explicit gap; identify test-local assertions, mock-supplied outcomes, missing consumer seams or composition roots, wrong-side expectations, undiscovered tests, skips, and todos without treating heuristic findings as automatic failures
- Calibrate the method against known historical false-confidence cases, then use targeted mutation probes to prove that critical tests fail for the defects they claim to prevent
- Remediate confirmed weaknesses and leave a documented, repeatable assessment method plus a trustworthy suite baseline; cross-link `behavioral-regression` and `deliverable-completeness-gates` rather than duplicating their concerns

### `project-health-audit`: Establish a Clean Static-Health Baseline

After `test-health-audit`, use the shipped static-analysis capabilities to assess and remediate the whole repository before feature development resumes.

- Run every bound project-scope gate-facing capability—dead code, duplication, complexity, and boundary conformance—and report unbound, unsupported, or failed capabilities explicitly rather than treating missing evidence as clean
- Trace and confirm findings before remediation, resolve real defects or record narrowly justified baselines, and rerun the supported analyses plus the full test, lint, and typecheck gates
- Produce a reproducible whole-project health record that future work can compare against; consume the existing analysis surface without expanding providers or duplicating the separate `analysis-tools` and `worker-inloop-analysis` roadmap scopes

### `drive-envelope`: Drive as a Free Envelope

Decouple Drive's value (isolation, gates, session capture, reporting) from the plan+task ceremony so one-off and externally-triggered work can use it too.

- "Run N drive agents on X" from a prompt/brief — no plan or task required; plan-backed Drive unchanged
- Establish a coordinator-neutral run-control contract for start/attach, status/watch, messaging or artifact submission, approval, cancellation, and later graph decisions; the CLI is its first adapter, not its definition
- Callable internally (Pi-hosted agent or chain) and externally (Claude Code, Codex, or any future harness adapter) without changing Drive policy
- Coordinator host, coordinator policy, worker execution transport, and model provider are independent selections; compatibility is explicit and incompatible combinations fail before execution
- Free-form runs still record sessions and outcomes, so they feed the memory loop like plan-backed runs
- Source of truth: `missions/architecture/orchestration-future.md` (extends the `runStart` seam)

### `vendored-skills`: Cosmonauts Carries Third-Party Skills Too

*Added 2026-08-26; placement after `drive-envelope` confirmed by the human on 2026-08-26, extending the ratified 2026-08-25 spine. Nothing downstream blocks on it.*

Today the portable-harness thesis is only half true. Switch harness and your **cosmonauts** assets follow you; your hand-installed **third-party** skills do not. `playwright-cli` is the proof — installed by hand twice, once in Claude Code and once in cosmonauts, so agents could use the tool in both. That is exactly the hand-maintained-copy drift `harness-adapters` exists to kill, one layer out. Make cosmonauts able to store and sync skills it did not author.

- **Does not invalidate `harness-adapters`.** Spec amendment A-001 excluded `playwright-cli` from *migration* because it was not traceable to a cosmonauts source — correct then, correct now. Vendoring is a different, additive operation with its own evidence.
- **Native vs vendored must be a real distinction**, for mechanical reasons rather than taxonomy:
  - *Lifecycle* — native skills are authored here and you edit the source; vendored skills are authored upstream, so a local edit forks them and upstream updates need re-import. Opposite defaults.
  - *Two provenance hops* — `INV-001` traces every export to one in-repo source, but a vendored skill's in-repo source is itself a copy. Needs upstream → vendored → exported, with drift detectable at **both** hops; the shipped manifest models only the second.
  - *Direction* — `harness sync` is repo → harness. Vendoring needs a separate ingest operation (upstream/harness → repo). Collapsing both into one command is the trap.
  - *Redistribution* — native skills ship in the npm tarball freely; third-party ones raise licensing questions `package.json` "files" does not currently consider.
- **The hard part.** Vendoring reopens `INV-002`'s worst case. "Foreign means never touch" is a clean rule the whole conflict machinery rests on; "…unless vendored" creates a class where cosmonauts overwrites something it did not author. Note that importing `playwright-cli` means adopting the **generated** artifact as source of truth (7450 bytes, 8 files, an `allowed-tools:` key) over the 2693-byte cosmonauts wrapper that merely tells you to run the generator — precisely the adopt operation D-014 forbids. Import must therefore be explicit, one-time and proof-carrying, in the shape of the D-018 command bootstrap, never an inference from name or byte equality.
- **Naming trap**: `external-skills/` already means the opposite — skills cosmonauts exposes *outward* to other harnesses. Do not reuse "external" for "imported from outside"; prefer `vendor-skills/` or `imported-skills/` so direction stays unambiguous.
- **Open ruling that shapes the rest of the design**: is a vendored skill editable in-repo at all, or strictly read-only until re-imported? That one choice determines the provenance model, the conflict rules, and whether "local patch on top of upstream" is a supported concept.
- Cross-links: `harness-adapters` (registry, provenance, `HarnessAsset.ownership` is the natural seam for a third variant) · `domains` (owns *publish*; this is *ingest*, a different concern) · `coordinator-packages` (a thin coordinator wants vendored skills synced too)

### `coordinator-packages`: Packaged Cosmonauts Coordinators for Any Harness

Launch a supported external harness (Claude Code, Codex, and future adapters)
already *being* a cosmonauts coordinator — a packaged agent whose identity is
"coordinate this cosmonauts project through the run-control surface", in flavors
(cosmo = general assistant, cody = coding coordinator). The binary-export
mechanism exists (`cosmonauts export`, Claude-Forge-style;
`packages/cosmo-spec-writer-claude` and `cosmo-worker-codex` prove it); this makes
coordinators first-class and thin without making either harness privileged.

- Coordinator personas get a git-tracked native home — today each package's external-safe system prompt (`packages/*/*-system.md`) is hand-written and gitignored, the same no-source-of-truth disease the commands had
- Thin-coordinator principle: the package carries identity + CLI knowledge; skills and commands come from the `harness-adapters` sync (`skillDelivery: "reference"`, not inline-frozen), so a running coordinator never drifts from the repo
- Flavors are configuration over one coordinator template, not hand-forked prompts
- Consumes: `harness-adapters` (assets + registry) · `drive-envelope` (the coordinator's main lever) · pairs with `external-session-capture` (coordinator sessions are precisely the ones worth capturing)

### `external-session-capture`: Externally-Coordinated Sessions Feed the Memory Loop

Work coordinated from outside (Claude Code, Codex, and future adapters)
currently leaves nothing our memory system can read; define one harness-neutral
capture contract.

- Specify what an externally-coordinated run leaves behind — transcript tier, episode pointers, artifacts — and where it lands
- Adapter-side hook: every `harness-adapters` export carries the same minimum capture instructions/mechanism; richer native transcripts are optional capability evidence, not a different lifecycle
- A coordinator may detach, lose context, or be replaced; the next coordinator reconstructs continuity from durable run state, decisions, summaries, messages, and artifact references
- The contract becomes a source behind `living-memory`'s pluggable-sources seam (§10.1: the re-spec consumes this)
- Cross-links: `harness-adapters` · `missions/architecture/knowledge-and-memory.md` §5

### `knowledge-adoption` (thread): Turn On What We Built, In This Repo

Every memory/knowledge feature shipped so far is gated OFF and unconsumed; all remaining design rests on theory. Flip that, deliberately and on record.

- ✅ **Done 2026-08-26**: `knowledgeSurface.enabled: true` set in `.cosmonauts/config.json` — a deliberate dogfooding decision for this repository only; shipped defaults stay OFF. Triggered by the `harness-adapters` archive, whose distillation was blocked because `propose_knowledge` is gated behind it.
- Deliberately run internal cosmonauts coordinators and agents: recent usage has been external-coordinator-only, so internal agents are the unobserved population
- Record what retrieval actually does — recall usage, index cost against the 24,000-byte combined budget, observed behavior changes — as evidence for the consolidation and budget decisions
- ✅ **Done 2026-08-27**: the proposal backlog (168 on disk: the 155 backfill survivors + 13 live harness-adapters) was fully surveyed, ratified, and discharged — 90 promoted byte-identical, 44 merged into curated records, 34 rejected on record; `memory/agent/proposals/` is empty. Analysis + per-file dispositions: `missions/reviews/knowledge-proposal-backlog-{analysis,dispositions}.md`; execution audit trail: `knowledge-surface-promotion-{2..7}.md` + `knowledge-surface-backfill-amendment-1.md`.

### `living-memory-corpus-findings`: The Regulator Cannot Reach the Corpus It Regulates

Promoted from Ideas **2026-09-14** (Decided-by: human) after the first live `cosmonauts memory consolidate --dry-run` against this repository's own corpus. The shipped pass works end to end — its deterministic tier found five real dead citations, four of them repaired in `1f2d575` — but it can only inspect a fraction of the corpus and cannot be steered toward the rest. The former "byte allowance" bullet is folded into the reach finding below; they are one defect seen from two sides. Nothing here blocks the queue above it, but all of it blocks a live retirement run.

- **Reach is ~21% of the corpus, and the selection rule is emergent rather than chosen.** The corpus source collects through `KNOWLEDGE_INDEX_RETRIEVAL` (`lib/memory/consolidation-sources.ts:204`), so what the regulator may examine is settled by the injection retrieval contract plus a byte-budgeted walk. Measured 2026-09-14 against the 237-record corpus: 50 admitted. By recency those are ranks 19–100 — the 18 newest records are never examined, and the band is ragged (19 in, 20–21 out, 22 in). By path order they are a mostly-contiguous run from rank 6 to 106. Neither rule is one anybody picked, and the oldest 137 records are unreachable under both. LM-D-002 bound *target size* to the injected index — a statement about the goal; the implementation quietly extended that binding to reach
- **The likeliest retirement candidates are exactly the invisible ones.** A forgetter that cannot reach old records is not a forgetter. An approximate scan (over-counting: it neither masks code fences nor canonicalizes the way the real detector does) finds ~20 records carrying a dead body path, ~19 of them outside the admitted set
- **The band moves under unrelated edits, so findings vanish unresolved.** Repairing four dead citations in `1f2d575` shifted the byte accounting enough to swap one record out of the admitted set. The fifth finding disappeared from the next run without being fixed, and nothing reported that it had gone
- **Ruled 2026-09-14 (Decided-by: human) — add a persistent sweep cursor** in the durable machine files, so bounded rounds compose into full corpus coverage across successive passes. `representedKeys` already implements the "do not re-show me what is already proposed" half; the cursor adds "examined and found clean". Injection stays bounded exactly as ruled. Explicitly **not** raising the byte budget: that relocates the boundary and fights LM-D-002. Land it **before any live retirement run** — retirement authority over a sample you cannot steer is how the wrong record gets retired
- **Frozen frontmatter generates findings nobody is permitted to act on.** 136 frozen seed records, 100 carry a `files:` list, and **31 of those have at least one dead path** — the `bundled/coding/coding/` doubling plus `domains/shared/prompts/base.md` and siblings, a systematic distiller-era bug already fixed upstream. The B-003 audit never forgives metadata drift, so every such finding is un-actionable by construction and would occupy the bounded 10-proposal round budget indefinitely. **Ruled 2026-09-14 (Decided-by: human): skip `metadata.files` when a record carries `legacySourceSha256`** — that list is provenance, not a live pointer a reader should follow — while continuing to scan those records' bodies, which is what round 8 repaired. Do **not** amend `tests/fixtures/knowledge-seed-inventory.json`: it would make migration history claim the distiller wrote a path it did not write. If those paths should resolve for readers, that is a retrieval-side concern, not a history edit
- **Episode source follows an escaping directory symlink and prunes the file it finds** (medium; still awaiting a ruling). Reproduced end-to-end against production code 2026-09-09: an external episode is collected with `inventoryComplete: true` and no warning, then deleted by `finalize()`. It fails closed only when the external file is *malformed*, so the completeness signal reports health exactly in the case that matters. Four options drafted at `missions/reviews/living-memory-episode-symlink-escape-escalation.md`
- **Rejected or unscannable knowledge directories are reported as a healthy complete inventory** (still awaiting a ruling). The same shape one layer up. The `living-memory-fidelity` Risks section records this with an explicit "do not close this by widening the rule without a ruling", because closing it over any listed-but-unscanned path would wedge the pass permanently for any corpus containing a symlinked or non-regular `.md`. Decide it together with the item above or the two will diverge
- Evidence: `missions/reviews/qm/living-memory-fidelity-{security,performance}.md` · `missions/reviews/improvements/living-memory-fidelity.md` follow-up 6 · `missions/reviews/knowledge-surface-promotion-8.md` · commit `1f2d575`

### `factory-evals` (thread): Stop Driving Blind — Instrumentation First

No evals drive development today; changes to agents and workflows land unmeasured. Start with a scoreboard over signals we already produce.

- Harvest existing artifacts into a persistent scoreboard with baselines: drive/chain run stats, gate outcomes, review-round counts, test/lint results, cost per plan
- Add liveness signals already available or introduced by `execution-liveness`: terminalization latency, false timeout count, rejected late commits, descendant-cancellation outcome, and session-evidence availability
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

### `agent-interaction`: The Live Coordinator Triangle

Real-time coordinator↔worker↔verifier interaction — reframed 2026-08-25 from `agent-swarms` breadth: the live triangle is the value; N-agent parallelism is not a goal until it proves value.

- First: assess what orchestration/messaging surfaces already exist and what a coordinator actually needs mid-run
- Both attached external coordinators and Pi-hosted coordinators use the same validated command and decision schemas; neither may write scheduler state or launch a backend directly
- Coordinator context is a cache for judgment, never the continuity store; graph state, events, summaries, messages, and artifacts allow detach/reattach or harness replacement
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

### `pi-lockstep-bump`: Pi Lockstep Bump Toward Current

*Added 2026-09-01 (ratified with the living-memory slate — OM spike D-2). Deliberately not a rider on memory work: nothing in the memory queue needs it (`agent_settled` shipped in 0.80.4; OM verified working at the pinned 0.80.6).*

Bump all four `@earendil-works/pi-*` packages (lockstep) from 0.80.6 toward current — a migration project sized at three breaking clusters (spike §1.3): auth (`modelRuntime` replaces `authStorage`/`modelRegistry`; 61 references across 6 files), the bundled TypeBox major, and the 0.84 lane-based session API that removes the JSONL/in-memory repository APIs our session factory is built on. The mandated full API re-audit and the `domains/shared/skills/pi/SKILL.md` update ride in the same change.

- Source of truth: `missions/architecture/spikes/observational-memory.md` §1.3

### `agent-tools`: Native Agent Tools (Web Research + Browser) — ⏸ PARKED

**⏸ PARKED (2026-07-01; moved to Ideas 2026-08-25.)** S1 (native web research) is deferred — the warm spec lives at `missions/plans/web-research/` (status `deferred`), parked in favor of a cheaper *research-delegation* direction (delegate research to codex/claude-cli via the driver seam — now naturally part of the `harness-adapters`/`drive-envelope` direction). Browser (S2) is not started. Revive the native web-research slice when fully-autonomous chain runs need grounded/cited, machine-consumable facts.

- Web research (build native): `web_search` + `web_fetch` primitives behind a pluggable backend (Tavily / Exa / SearXNG — Brave free tier is dead) → a thin `researcher` skill/agent
- Browser (keep Playwright): sharpen the `playwright-cli` skill first; upgrade to a thin native `browser` tool if usage stays low
- Source of truth: `missions/architecture/tool-ecosystem.md`

### `autonomy`: Autonomy / Always-On Substrate

The base that lets a domain or agent run on a schedule, wake periodically, react to events, or stay always-on — plus the governance that makes autonomous action safe. **W1 (Layer A) is the active `autonomy-host` plan** (in-process host + triggers + durable wake-state, config-gated off); **the daemon (W2), governance (W3), EA (W4), ambient (W5), and `channels` remain here, unprioritized.** The host now has two named consumers: the `living-memory` dreaming loop and `factory-modes`' `ask-and-continue` escalation (event-wait trigger). Full model in the source-of-truth doc.

- Layer A (base): triggers (interval / one-shot / event-wait / always-on) · lifecycle host (in-process → child → daemon) · durable wake-state · cost-efficient wake handler
- Layer B (acting agents): trust tiers + audit log + caps + escalate-to-human + a steering channel
- Targets one long-lived host process with orchestration, while preserving separate authorities: the run store owns graph attempts and the episodic log owns autonomy wake-state/audit
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

### `drive-timeout-semantics`: Suspension and Work Salvage After Drive Conformance

The active `execution-liveness` plan owns the universal distinction between
lease heartbeat, useful activity, host clock discontinuity, explicit
idle/hard-deadline policy, and settlement-based cancellation. Its `TASK-682`
must first map Drive's current 30-minute backend cap into explicit scheduler
`hardTimeoutMs` policy and remove the abandoning backend-local timer. Until that
task ships, Drive timeout behavior is unchanged. Afterward this item owns the
remaining product decisions about suspension disposition and preserving useful
work after cancellation. Both cost real work on the `living-memory` run (14
Drive runs, 20 tasks) and make long detached runs unsafe to leave unattended on
a laptop.

- **Host-suspension product semantics.** `TASK-609` (60 min) and `TASK-610` (120 min) both failed as "timed out" while the machine was asleep. `TASK-610`'s heartbeat never advanced past `spawn_started` and it produced zero file changes in two hours; it then finished in ~10 minutes once the machine was awake. `execution-liveness` now records and rebases a detected clock discontinuity so it cannot manufacture worker idleness; this item decides the Drive-facing outcome, reporting, and resume experience for that interval
- **Salvage on timeout.** `TASK-609`'s worker had every substantive AC green but died before the mandatory `types.ts` re-pin and formatting. Drive committed nothing, so a rerun would have redone ~1160 correct lines; the coordinator salvaged it by hand. Commit worker output as WIP on timeout, or grant a finalization grace window, so a resume can complete rather than restart — finalization is cheap and mechanical, and discarding a whole task for missing it is the most expensive possible failure mode
- Same family as the shipped-but-open `verified_commit_failed` / resume-finalize gap in `missions/reviews/drive-improvement-observations-artifact-format-redesign.md`: work that succeeded is lost because finalization did not
- Evidence: `missions/reviews/improvements/living-memory-implementation.md` (14 run IDs)
- Cross-links: `execution-liveness` (owns the shared attempt contract) · `drive-envelope` (same orchestration seam) · `autonomy` (unattended runs are exactly where a wall-clock lie is unrecoverable) · `factory-evals` (timeout and heartbeat outcomes are scoreboard signals)

### `deliverable-completeness-gates`: Gates That Notice What The Backlog Never Named

Four cheap gate additions from one observation: a behaviour-complete backlog with a fully green suite can still ship a deliverable-incomplete system, and the entire gate ladder is blind to it.

- **Real composition root against real data.** All 21 `living-memory` behaviours reached green with exact markers while the production corpus source did not exist at all — every behaviour test injects fixture sources into `createLivingMemoryConsolidator()`, so the pipeline was complete, correct, and disconnected from `knowledge/`. Found only by running the real CLI against the real 237-record corpus. For plans shipping a user-invokable surface, require one AC that exercises the real composition root against real project data
- **Adapter/source ownership in the coverage matrix.** The backlog decomposed by *behaviour*; the corpus adapter is infrastructure every behaviour assumes and none names (`TASK-614` named only the episodic source). `/spec-to-backlog` Phase 5 should verify each declared v1 source/adapter has an owning task, not only each behaviour
- **Directory-boundary AC on every remediation task.** `TASK-624` read "23 dead-code findings in the changed scope" as licence to go repo-wide, deleting and demoting exports across `lib/driver`, `lib/harness-adapters`, `lib/process`, orchestration and two CLIs — 18 files, all reverted. Every later remediation task carried an explicit boundary AC and stayed in scope; make it a standing template line in `/skill:task`
- **Review discipline for transaction/recovery code.** Six of seven `living-memory` review rounds' fixes introduced a fresh defect, and naming the previous round's regression to the next reviewer measurably sharpened it. Two riders: when a review finds a contract violation, check whether a test asserts the wrong side of it (one did — six rows under a limit of five, pinning the violation as expected behaviour); and when a round closes an instance and names a structurally identical successor, escalate the *class* for ratification rather than fixing the instance and re-reviewing (four rounds of pathname races ended only at the human ruling D-026)
- **Five more riders from `living-memory-fidelity`'s eighteen rounds** (2026-09-09), each with a named round that would have caught the defect earlier. **Path parity**: where a file carries near-duplicate control paths, the review must ask "for each behaviour, does path A match path B?" — ten diff-scoped rounds passed over a defect in the unchanged sibling path; the one round scoped that way resolved twelve behaviours at once. **Caller enumeration on helper changes**: when a change alters what a helper guarantees or when an error is tagged, enumerate that helper's callers, not the diff — this class appeared three times and is invisible to both the diff and the changed file's tests. **Class enumeration in the remediation task**: require a per-site fix-or-justification list, and have the review check the enumeration against the file rather than accept it; rounds scoped at the class consistently closed sites nobody had named. **Positive coverage statement on closing rounds**: a bare "no findings" is compatible with not having looked — require a statement naming what was checked, and treat its absence as insufficient evidence for handoff. **Name the axis, not the class**: a round that closes a defect class must say which *axis* it closed and which it did not look for — `writesCommitted` was declared closed three times and was wrong twice, because closing one axis made the next one reachable
- **Consumer-seam regressions, not just producer.** Eight producer-level regressions stayed green while each of three consumer call sites was reverted one at a time. Require a regression at the seam that *reports* a value, not only the one that produces it — and when writing it, check no other test double in the same test supplies the value under test
- Evidence: `missions/reviews/improvements/living-memory-implementation.md` · `missions/plans/living-memory/review-rounds.md`
- Cross-links: `spec-to-backlog` (owns two of the four) · `behavioral-regression` (same "tests passing ≠ behaviour preserved" thesis) · `factory-evals` (review-round counts are already a named signal)

### `drive-task-outcomes`: Drive's Outcome Vocabulary Is Too Coarse

Two Drive behaviours that cost real work on the `living-memory-fidelity` run (11 Drive runs, 38 tasks) and that make review-bearing plans expensive to drive.

- **A negative verdict is indistinguishable from a crash.** A review task that did its job perfectly and returned "blocked — one unresolved finding" produces exactly the same `events.jsonl` shape as a worker that died: `spawn_completed … outcome: failure` then `run_aborted`. The operator must open `<runDir>/TASK-NNN-summary.txt` to tell them apart. Add a terminal state distinguishing "task succeeded, verdict negative" from "task failed"
- **Blocked tasks are re-queued on the next run.** Relaunching after a blocked review re-runs that review against unchanged code, which aborts again before the remediation it was waiting for can run. Worked around with `--task-ids` on every relaunch, once per remediation cycle. Skip tasks whose last outcome was a negative verdict unless explicitly requested
- **The commit phase is skipped for tasks that change no source.** Every review-only task left its required `review-<n>.md` untracked; on a branch where workers run `codex --yolo`, an untracked required artifact is at risk, and each had to be committed by hand. Commit a task's declared output files even when no source path changed — the review record is a required plan artifact under the plan's own D-010, not a byproduct
- Evidence: `missions/reviews/improvements/living-memory-fidelity.md` rows 6-7
- Cross-links: `drive-timeout-semantics` (same family — Drive's outcomes do not describe what happened) · `drive-envelope` (same orchestration seam) · `factory-evals` (verdict-vs-crash is a scoreboard signal that currently cannot be computed)

### `qm-chain-safety`: The Quality Manager Chain Writes Outside Its Plan

The QM chain has now destroyed committed work product on an unrelated plan at least twice, and its findings need triage before any is acted on.

This is independent from `execution-liveness`: bounded attempts prevent silent
forever-runs but do not make shared review filenames safe or validate findings
against the current diff.

- **It overwrites review records it did not create.** On the `living-memory-fidelity` run it wrote its findings into `missions/reviews/{performance,security,ux}-review-round-1.md` — the *parent* plan's records — replacing their content (158 insertions, 298 deletions). Recovered by preserving the new content, restoring the tracked files, and relocating the findings to `missions/reviews/qm/`. The same behaviour is recorded independently in the `analysis-capability-runtime` distillation, where it clobbered `planning-system-hardening`'s artifacts. Give the chain an explicit plan-scoped output path, or have it refuse to modify a file it did not create
- **It cannot run concurrently with a codex review.** Launched together in the background, both were killed by the OS for memory exhaustion — the QM produced zero output and codex produced 1.1 MB then died. Either make the sequential ordering explicit and enforced, or make the panel's footprint bounded
- **Its findings need triage against the diff base.** Four of eight findings on the last run described pre-existing behaviour, verified byte-identical between the base and HEAD, and one was a residue the plan's own Risks recorded as knowingly open pending a human ruling. Acting on all eight would have been scope creep presented as diligence. Triage each finding against the base before scoping remediation
- Evidence: `missions/reviews/improvements/living-memory-fidelity.md` rows 9-10, 14 · `missions/reviews/qm/living-memory-fidelity-*.md`
- Cross-links: `factory-evals` (the "panel-value validation" bullet under `quality-contracts` asks whether the three specialists earn their keep at all)

### `analysis-debt-paydown`: Pay Down What the Newly-Bound Analysis Gates Revealed

Per-project `fallow` execution consent was granted 2026-09-10 while preparing `chain-stage-context`, which bound `duplication`, `complexity` and `dead-code` for the first time and immediately showed why binding a gate without running it is unsafe: two of the three fail whole-repo on pre-existing debt. That plan's gates were rewritten as changed-scope regression checks against baselines committed at `.fallow-baselines/`, which stops the debt growing but pays none of it down. This item pays it down. **Duplication is not part of it** — `fallow dupes` exits 0; its 3,288 duplicated lines (3.9% across 50 files) are under threshold and informational.

**Part 1 — retire the dead-code baseline.** `fallow dead-code` exits 1: 26 unused exports, 102 unused *type* exports, 2 duplicate-export pairs. Independently pickable, no sequencing constraint.

- `fallow fix` auto-handles 25 of the 26 value exports — it strips the `export` keyword and leaves the symbol, so internally-used constants like `CODEX_ARGS_ENV` are safe. Verified by dry run
- The **102 unused type exports are not auto-fixable** and are the bulk of the work. Decide per cluster: delete, or suppress with a stated reason. `lib/harness-adapters/sync.ts` alone carries 17 and `scripts/validate-harness-exports.ts` 14
- Two duplicate-export pairs need a human call about which copy survives, not a fix. `partialReason` is defined at `lib/driver/drive-finalization.ts:699` *and* `lib/driver/run-one-task.ts:827` with byte-identical bodies; `drive-scheduler-backend.ts` imports the `run-one-task` copy while `drive-finalization` uses its own. Not yet drifted, but nothing stops it. `registerEditCommand` is duplicated across `cli/plans/commands/edit.ts` and `cli/tasks/commands/edit.ts`
- **Completion condition:** `fallow dead-code` exits 0, `.fallow-baselines/dead-code.json` is deleted, and the `chain-stage-context` Quality Contract's dead-code row becomes a whole-repo hard fail instead of a regression floor. That is a strictly stronger gate and is the point of the item

**Part 2 — complexity pass. Sequenced *after* `chain-stage-context` ships, deliberately.** `fallow health` exits 1: 74 functions above threshold across 12,574 analysed, maintainability 90.9 ("good").

- `lib/orchestration/chain-runner.ts` is both the top-priority hotspot (18.1) and `chain-stage-context`'s primary seam. Refactoring it first collides with that implementation; refactoring it before the plan lands means re-touching the new code either way. Wait for the file to settle
- Named targets from the 2026-09-10 baseline include `parseHumanKnowledgeRecord` (cognitive 33) in `lib/memory/knowledge-records.ts`, and `runHarnessSync` (56) plus `groupCatalogue` (45) in `lib/skills/exporter.ts` — a 1036-LOC file
- `lib/artifacts/behavior-conformance.ts` (13.7 and **rising**) needs no work here: `chain-stage-context` TASK-670 extracts the markdown masking scanner out of it, which mechanically reduces it. Re-measure after that lands before scoping anything for this file
- **Completion condition is a judgement, not zero.** Maintainability is already "good"; the goal is retiring the named hotspots and lowering the baseline, not driving 74 to 0

**Not in scope: boundary rules.** `boundary-conformance` stays unbound with reason `provider-not-configured` because `fallow.toml` declares entry points but no boundary zones. Authoring those is already a bullet under `analysis-tools` ("Author repository boundary zones where enforcement is wanted") and has repo-wide consequences; keep it there.

- Evidence: `missions/plans/chain-stage-context/plan.md` Design §7a (measured numbers and the exact audit invocation) · `.fallow-baselines/` (the 2026-09-10 floor) · consent record at `~/.cosmonauts/analysis-execution-consent.json`, user-owned by design — the repo cannot grant itself execution permission
- Cross-links: `analysis-tools` (boundary zones, CI enforcement policy) · `worker-inloop-analysis` (the same signals consulted while code is written, rather than after) · `factory-evals` (gate binding states are a scoreboard input)
