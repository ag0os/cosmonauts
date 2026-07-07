## Purpose

Cosmonauts agents re-derive user, project, and session context every turn.
Cosmo — the always-on, cross-domain assistant — cannot remember a fact the
user told it yesterday; coding agents cannot carry project conventions across
sessions except through hand-curated files. The `agent-memory` track exists to
fix this without polluting context: surface the right memory at the right
time, never everything.

This slice (W1) lays the track's foundation, and it is deliberately timed.
The track's premature-abstraction guard said: design *toward* one shared
memory mechanism, but extract it only when the second real implementation
exists. Architectural-memory W1 (the derived code-structure map) shipped
2026-07-03 and is the first implementation — its extension already injects a
compact index and serves shard detail on demand through a `retrieve()`-shaped
tool. That precondition is now met.

W1's central act is extracting the **shared pluggable memory interface** —
`write(record)` / `retrieve(scope, query)` / `consolidate()` — and
retrofitting the shipped map's *retrieval* onto it while the map keeps
working unchanged for its five consuming agents. Around that seam it stands
up the general-memory substrate: plain-text markdown records (OKF v0.1,
scope × type), scope-filtered recency-ordered retrieval, a `recall(query)`
tool, and compact-index-plus-detail injection — the same pattern the map
already proved. One thin authored record type ships end-to-end ("remember
this" → file on disk → recalled in a later session) so `write()` has a real
caller and the user gets a visible "it remembered" moment; the retrofit alone
exercises only the retrieval side.

This is **W1** of the `agent-memory` track. Source of truth:
`missions/architecture/agent-memory.md`. Committed track scope is W1–W2, then
a reassess gate.

## Users

- **Cosmo (and, through the same seam, any agent that consumes memory)** —
  can durably save a fact the user states and recall it in a later session in
  the same project, without the user re-explaining. Cosmo is the first
  consumer of the authored-record sliver.
- **The human working with agents** — every memory is a plain markdown file
  they can `cat`, edit, or delete, and the system respects the edit: memory
  is *proposed truth the user can override*, never hidden mutated state. The
  same human keeps their architectural map working exactly as before — the
  retrofit must be invisible to the five map-consuming agents
  (planner, plan-reviewer, coordinator, worker, quality-manager) and to
  `cosmonauts architecture generate` / `cosmonauts serve`.
- **The developer building W2 (profile + playbooks)** — inherits a working
  interface with two real implementations behind it, a substrate that already
  handles scope filtering and OKF serialization, and a Pi-First audit that
  settles how much short-term/session machinery to build versus lean on Pi.

The substrate targets **any project cosmonauts runs in**, with this repo as
the first dogfooding target — same stance as the architectural map.

## User Experience

### The architectural map, through the new seam (invisible retrofit)

Nothing changes from the outside. In a mapped project, the five consuming
agents still receive the compact index with its freshness banner at session
start, still call `architecture_map_read` for module shards, and still see
honest stale/missing states. Generation (`cosmonauts architecture generate`)
and the viewer (`cosmonauts serve`) are untouched — the retrofit covers the
map's *retrieval* path only; its generate/store write path stays native to
`lib/architecture-map`. The difference is internal: retrieval now flows
through the shared interface, which the developer can verify by boundary and
test, not something the human or the five agents should be able to detect.

### Saving a memory (the authored-record sliver)

The user tells Cosmo something worth keeping — "remember that staging deploys
happen from the `release` branch." Cosmo saves it *explicitly and visibly*:
it says what it saved and where. The record lands as a markdown file with OKF
frontmatter under the store for its scope — project-scoped facts in the
project's memory store, user-scoped facts under the user's home store
(`~/.cosmonauts/`). Saving is deliberate (the agent decides to save, the user
can see it happened); there is no silent background capture in W1.

### Recalling a memory

In a later session in the same project, Cosmo starts with a compact memory
index in context — scope-eligible records only, ordered by recency — and can
pull any record's full detail with a `recall(query)` tool when it senses a
gap. Pull, not push: no similarity scoring, no always-on relevance gate. The
user experiences it as: they mention staging, and Cosmo already knows about
the `release` branch — or asks recall() and then knows. In a *different*
project, that project-scoped fact never appears; user-scoped facts follow the
user everywhere.

### Scope behavior

- **Session-scoped** memory never surfaces outside its own session.
  (Whether W1 builds any session-scope machinery at all is gated on the
  Pi-First audit below — Pi's session state and compaction may already cover
  it.)
- **Project-scoped** memory surfaces only in sessions running in that
  project.
- **User-scoped** memory is eligible in every session for that user.

Scope filtering is the first and cheapest retrieval filter, applied before
anything else — it kills most context pollution for free.

### Owning your memory (human legibility and override)

The human can open any record file, read it in plain markdown, edit it, or
delete it. The next retrieval reflects the change: an edited record is
recalled as edited; a deleted record is gone from the index and from
recall(). No database, no export step, no hidden copy.

### Record format (OKF)

Records are markdown + YAML frontmatter conforming to OKF v0.1, the same
convention the architectural map shipped with: `type` (from a project-defined
vocabulary), `title`, `description`, `resource`, `tags`, `timestamp`, plus
custom keys where needed. Scope is expressed in the record's frontmatter/
location so a human can tell at a glance what a record is and where it
applies. `index.md` is the progressive-disclosure index per store. OKF is
serialization only; retrieval and consolidation stay behind the interface.

### The Pi-First audit (gating deliverable)

Before any short-term/session-memory machinery is built, an audit reviews
what Pi already provides — session state, compaction, any memory or
scratchpad primitives — and produces a short findings document with a
recommendation. The audit's finding *gates* W1's session-scope scope: if Pi
already covers short-term needs, W1 builds nothing there and says so. This
mirrors how the `analysis-tools` audit gated the map's substrate choice in
the sibling slice.

### Failure, empty, and edge flows

- **recall() on an empty or absent store** — an honest "no memories for this
  scope/query" result, not an error and not fabricated content. A project
  with no memory store behaves like the map extension does today: quietly
  inert, no scaffolding as a side effect of asking.
- **A corrupt or malformed record file** (bad frontmatter, missing required
  keys) — skipped with an honest note in the retrieval result naming the
  file; one bad file never breaks the session or hides the healthy records.
- **A record deleted or edited mid-session by the human** — the next
  retrieval reflects reality on disk; stale in-context copies are a known
  limit, not silently refreshed state.
- **recall() with a query matching nothing** — an honest empty result that
  names the scopes searched.
- **The retrofit under failure** — every existing architecture-map failure
  behavior (missing map, stale map, unknown module, unsafe resource) behaves
  exactly as it does today.

## Acceptance Criteria

- **Retrofit invariant:** in a mapped project, the five consuming agents
  receive the index injection with freshness banner and can read module
  shards on demand, with behavior identical to pre-retrofit — and the full
  pre-existing architecture-map test suite passes unmodified in substance.
  The map's retrieval demonstrably flows through the shared interface
  (developer-verifiable via tests/boundaries).
- **Interface with two real implementations:** the extracted
  `write`/`retrieve(scope, query)`/`consolidate` interface has both the
  architectural-map retrieval and the general-memory store behind it — not
  one implementation plus a speculative stub.
- **Save end-to-end:** telling Cosmo to remember a fact produces a markdown
  record file with valid OKF v0.1 frontmatter under the correct scope's
  store, and Cosmo states what it saved and where.
- **Recall end-to-end:** in a *new* session in the same project, Cosmo has
  the compact memory index available without asking and can retrieve the
  saved fact's detail via `recall()`.
- **Scope filtering holds:** a project-scoped record never surfaces in a
  session for a different project; a user-scoped record surfaces across
  projects; session-scoped records (if the audit green-lights building them)
  never surface outside their session. Each verifiable by test or by demo.
- **Human override is respected:** after the human edits a record file, the
  next retrieval returns the edited content; after deletion, the record is
  absent from index and recall.
- **Recency ordering:** the compact index presents records most-recent-first
  using their timestamps. (No automatic decay or pruning in W1.)
- **Honest empties and failures:** recall() against an empty store, a
  no-match query, and a store containing one malformed record each produce
  the honest behaviors described above, with test coverage.
- **Pi-First audit document exists** with findings on Pi's session/short-term
  primitives and an explicit recommendation that records what session-scope
  machinery W1 did or did not build as a result.
- **Consolidation is honest:** `consolidate()` exists on the interface with
  its W1 behavior explicitly documented (minimal/no-op is acceptable);
  nothing implies background consolidation exists.
- **Full project gates pass** (test, lint, typecheck); the suite makes no
  model calls.

## Scope

Included:
- Extraction of the shared pluggable memory interface
  (`write`/`retrieve(scope, query)`/`consolidate`) from the two real
  implementations, shaped so consumers declare which record types and
  retrieval strategy they need — exercised by exactly the two W1 consumers.
- Retrofit of the architectural map's *retrieval* path (index injection +
  shard reads) onto the interface, behavior-preserving.
- Plain-text general-memory substrate: OKF v0.1 markdown records tagged
  scope × type; project-scoped store in the repo and user-scoped store under
  `~/.cosmonauts/`; per-store `index.md`.
- Scope-filtered, recency-ordered retrieval; compact-index injection plus an
  agent-initiated `recall(query)` tool (pull, not push).
- One authored record type (`type: note`) end-to-end, with Cosmo as first
  consumer (explicit save → file → later-session recall).
- The Pi-First audit of Pi's session/short-term primitives; its finding
  gates any session-scope machinery in this slice.
- Tests for scope filtering, override, honest empties/failures, and the
  retrofit invariant; no model calls in the suite.

Excluded:
- W2 records beyond the single sliver type: the full user profile, explicit
  playbooks, and the "save that as a playbook?" explicit-save flow.
- W3 episodic log (agent action history / autonomy audit trail).
- W4 background consolidation ("dreaming"), decay, pruning, playbook mining —
  gated on the autonomy scheduler, which is itself out of scope.
- Embedding, SQLite, or vector retrieval backends — optional later, behind
  the interface, shared with architectural memory if ever built.
- An always-on relevance gate at prompt assembly (push-style recall) —
  reconsidered in a later wave, per the ratified pull-not-push recall model.
- Any change to how the architectural map is *generated*, stored, or viewed;
  the retrofit is retrieval-only.
- General domain-registration machinery for memory beyond what the two W1
  consumers need.
- Anything in the autonomy track (ambient-cosmo, executive-assistant,
  heartbeat/daemon).

## Assumptions

Ratified (from `missions/architecture/agent-memory.md`, preserved — not
re-opened here):
- **Plain-text first**: markdown + frontmatter (gray-matter), human-legible
  and prunable; heavier backends only behind the interface, only if
  scope+keyword retrieval proves insufficient.
- **OKF v0.1** is the record format (ratified 2026-07-02), shared with
  architectural memory; serialization only.
- **Retrieval is cheap-to-expensive**: scope → recency → explicit recall();
  embeddings last and out of W1. Compact index always-loaded + detail on
  demand is the shared ancestor pattern.
- **Scope × type taxonomy**: session/project/user × semantic/procedural/
  episodic.

Ratified by the human 2026-07-07 (spec-writer proposed, human confirmed):
- **MLV includes the thin authored-record sliver** (one record type +
  recall(), Cosmo as consumer) rather than pure plumbing. Rationale: the
  retrofit exercises only `retrieve()`; without the sliver, `write()` ships
  with zero real callers — the premature-abstraction trap relocated.
- **Sibling stores per scope, one interface** — project records beside the
  repo's existing `memory/` content, user records under `~/.cosmonauts/`,
  architectural map untouched at `memory/architecture/`. A single shared
  physical store was rejected because user scope cannot live in a repo
  anyway. This resolves the track doc's "shared physical store vs. sibling
  stores" open decision for W1.
- **Recall model is index-inject + pull** (the map's proven pattern); no
  relevance gate in W1. This resolves the track doc's "recall() trigger
  model" open decision for W1.
- **Slug `memory-interface`** (concept-focused, per the code-structure-map
  precedent).

Proposed by the spec-writer 2026-07-07 after the human asked that
product-level open questions be answered in the spec (human away at decision
time — veto before planning if wrong):
- **The project-scoped store is git-tracked** in the target repo, like
  `memory/architecture/` and the distilled bundles: reviewable, shared with
  teammates, prunable through normal git workflow — consistent with
  "proposed truth the user can override" and the dogfooding stance. Known
  friction to carry into planning: Drive excludes some directories from
  per-task source commits, so agent-saved memories may be left untracked
  mid-run (same gotcha class as the map's audit artifact — check `git
  status` after runs).
- **The sliver record type is `note`** — honest about provenance (an
  agent-saved remark the user can promote or prune), low ceremony, and it
  leaves `fact` free for a later curated tier. W1's documented type
  vocabulary is `note` plus the architectural map's existing types; the
  vocabulary grows with W2's profile/playbook records.

Other assumptions:
- **Per-plan distilled bundles** (`memory/<slug>.md`) stay a separate
  convention in W1; whether they converge onto this interface is
  reconsidered at W2+, not silently absorbed now.
- Cosmo (`main/cosmo`) is the sliver's first consumer; extending
  injection/recall to other agents is cheap follow-on, not W1 obligation.
- The retrofit's "keeps working" constraint is verified by the existing test
  suite plus regenerating the map — note that `memory/architecture/` is not
  currently generated/committed in this working copy, so verification
  includes a fresh generate, not just diffing tracked files.
- "Index available without asking" reuses the existing extension/injection
  mechanism the map shipped (`before_agent_start` context injection); the
  exact wiring is planner design work, not new product scope.
- The distilled memory's file inventory for `lib/architecture-map/` is
  slightly stale (narrative/OKF/render logic lives in `generator.ts` and
  `store.ts`); the planner should trust the code, not the inventory.

## Open Questions

These are deliberately left to the planner or to in-slice evidence — they are
HOW decisions or audit-gated, not unresolved product scope:

- **Where the extracted interface lives** — shared `lib/` module vs. a
  memory capability/extension. A HOW decision for the planner, but its answer
  shapes how domains declare record types later; flagged, not resolved.
- **Session-scope machinery** — built or skipped, per the Pi-First audit's
  finding (deliberately gated on the audit, mirroring how analysis-tools
  gated the map's substrate; the audit document must record the outcome).
- **Injection budget** — the map extension truncates its index to a
  byte budget; does the memory index share one combined budget with the map
  index for the five coding agents, or are they independent? Matters once
  both inject into the same session; the planner has the real numbers.
