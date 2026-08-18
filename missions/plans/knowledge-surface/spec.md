# Spec — Knowledge surface

First plan of the ratified `knowledge-and-memory` sequence
(`missions/architecture/knowledge-and-memory.md` §10, human-ratified
2026-08-18). It builds the destination the later consolidation pump writes
into: a project knowledge base with a home, a single format, and retrieval
every agent can reach.

## Purpose

The extraction pipeline exists and has half-run; retrieval does not exist at
all. This repo holds 36 `memory/*.md` distillations and 10
`memory/*.knowledge.jsonl` bundles, and `lib/sessions/knowledge.ts` has zero
production consumers — records are written and never read. Meanwhile every
agent that could use that knowledge re-derives it or works without it.

This plan gives the corpus a home (`knowledge/` beside `memory/`, plus a
user-scoped twin), one authoritative format (OKF markdown), and framework-wide
retrieval (a small always-injected index plus explicit `recall`), then migrates
the existing corpus in and brings distiller coverage to consistent. It
deliberately builds the reservoir before the pump: `memory-consolidation`
(reframed as the general raw-to-curated pump) follows and writes proposals
into the structures this plan creates.

## Intent

Goal: any agent working in a cosmonauts project can reach the project's
durable knowledge — decisions, conventions, trade-offs, gotchas — through the
shared memory mechanism, without the knowledge base growing into noise and
without the always-on cost growing with the size of the corpus.

Invariants — mechanism yields to these. INV-1 through INV-4 carry ground the
human ratified 2026-08-18 in `knowledge-and-memory.md` §11; INV-5 and INV-6
promote candidates C-6 and C-4 from its §9, ratified for this plan 2026-08-18.
INV-1 and INV-2 were amended 2026-08-18 by the human's D-010 ruling (plan
Decision Log): they govern the memory system's own surfaces, not generic
project tools.

- INV-1 — Write authority is narrow and enforced by path: no dedicated
  knowledge or memory tool, and no framework memory pathway, writes inside
  `knowledge/`. Machine-produced knowledge lands outside `knowledge/` as
  proposals; content enters `knowledge/` through a human act — direct edit or
  reviewed promotion. General-purpose project tools (file edit, shell) and
  external backends remain trusted, human-supervised, git-reviewed
  project-file capabilities outside this invariant's scope; that trust
  boundary is documented, not sandboxed.
  *(Amended 2026-08-18 by human ruling D-010; original letter — "no agent
  tool writes inside `knowledge/`" — superseded: literally enforcing it
  against generic shell/file tools requires a sound portable sandbox, which
  is rejected architecture for this plan.)*
- INV-2 — Read is wide and single-pathed at the framework level: the
  knowledge retrieval feature (index, `recall`, injection) reaches every
  agent through the shared memory interface
  (`write`/`retrieve`/`consolidate`); no second framework retrieval path.
  Generic file access by trusted project tools is not a retrieval path and is
  outside this invariant's scope.
  *(Amended 2026-08-18 by human ruling D-010; original letter — "every agent
  reaches knowledge through the shared memory interface … no second
  retrieval path" — superseded for the same reason as INV-1.)*
- INV-3 — One format: knowledge records are OKF v0.1 markdown with the
  `decision | trade-off | gotcha | convention` type vocabulary. After
  migration, nothing writes `.knowledge.jsonl`.
- INV-4 — The always-on cost is bounded and shared: the injected knowledge
  index lives inside one combined per-turn budget with the memory index and
  the architecture map; detail is pulled on demand, never bulk-injected; the
  bound does not grow with corpus size.
- INV-5 — Knowledge records are distilled, never verbatim: no raw transcript
  excerpts, file contents, or command output land in a git-tracked knowledge
  record. (Transcripts plausibly carry secrets; knowledge is tracked —
  verbatim excerpting is an exfiltration path with a friendly name.)
- INV-6 — Every machine-written record carries provenance (writer, source,
  date) and is reviewable as a diff.

Where convenience and the write boundary pull against each other, the boundary
wins: INV-1 outranks coverage — a record that cannot enter `knowledge/`
through the human path stays a proposal.

## Users

- **Every agent** (planner, worker, reviewer, quality-manager, Cosmo, …) —
  retrieves project knowledge instead of re-deriving it; sees the compact
  index; pulls detail with `recall`.
- **The human (project owner)** — owns `knowledge/` as ordinary git-tracked
  markdown: edits, prunes, and promotes proposals. Their curation is what
  keeps the base trustworthy.
- **The distiller** — the extraction path from archived plans and transcripts;
  its output becomes OKF proposal records instead of orphaned JSONL.
- **`memory-consolidation` (successor plan)** — inherits a real destination:
  the proposals area, the record format, and retrieval that makes its output
  actually reachable.

## User Experience

**Layout.** `knowledge/` sits beside `memory/` at the project root —
human-curated, git-tracked, readable by all agents. A user-scoped twin lives
under `~/.cosmonauts/knowledge/` for cross-project knowledge (distinct from
the profile: the profile is who you are; user knowledge is what you know that
outlives any one repo). `memory/` remains the machine-managed store.

**Retrieval.** A compact knowledge index is injected alongside the memory
index and architecture map, inside one reassessed combined budget; `recall`
pulls full records on demand. Filtering stays cheap-to-expensive: scope, then
recency, then explicit recall — embeddings only if those prove insufficient,
and then behind the same interface.

**A fresh project** starts with an empty surface and zero noise: nothing to
inject, nothing to report, no behavior change beyond the surface existing.

**Migration (this repo).** The 36 `memory/*.md` distillations and the records
in the 10 `.knowledge.jsonl` bundles become OKF knowledge records under
`knowledge/`, provenance preserved. The JSONL read/write path retires with
them.

**Distiller coverage.** Archived plans without a distillation are enumerated
and a backfill run produces OKF proposal records for each; the human promotes
them. Future archive-time distillation lands the same way — as proposals or a
human-reviewed commit, never a silent machine write into `knowledge/`.

**Gate.** The runtime surface (injection, retrieval, tools) ships behind a
config gate, off by default, per the standing infrastructure-first posture.
Repo-content migration is not gated — it is ordinary tracked files. Enabling
the surface (including for this repo) is a separate adoption decision.

## Acceptance Criteria

- [ ] AC-001 — `knowledge/` exists beside `memory/` with a user-scoped twin
  under `~/.cosmonauts/knowledge/`; records are OKF v0.1 markdown carrying the
  `decision | trade-off | gotcha | convention` type vocabulary; the layout and
  record class are documented.
- [ ] AC-002 — The seed corpus is migrated: every existing `memory/*.md`
  distillation and every record in the 10 `.knowledge.jsonl` bundles is
  represented as an OKF knowledge record with provenance preserved, and the
  JSONL read/write path is removed.
- [ ] AC-003 — With the gate enabled, every agent can retrieve knowledge
  through the shared memory interface (scope, then recency, then explicit
  `recall`), covered by tests; no framework retrieval path exists outside the
  interface. *(Amended 2026-08-18 by human ruling D-010; original letter said
  "no retrieval path" — superseded.)*
- [ ] AC-004 — With the gate enabled, a compact knowledge index is injected
  inside a reassessed combined per-turn budget spanning all three injected
  surfaces (memory index, architecture map, knowledge index); the bound is
  documented and enforced; an oversized corpus degrades by omitting detail,
  never by unbounded injection.
- [ ] AC-005 — No dedicated knowledge/memory tool writes inside `knowledge/`;
  machine-produced records land as proposals outside it; both pinned by
  tests. The trust boundary for generic project tools and external backends
  is documented. *(Amended 2026-08-18 by human ruling D-010; original letter
  said "no registered agent tool" — superseded.)*
- [ ] AC-006 — Archived plans lacking a distillation are enumerated and a
  backfill run produces OKF proposal records for each; the distiller's output
  format is OKF proposals, not JSONL.
- [ ] AC-007 — With the gate off (the default), the gated runtime surface is
  inert: no knowledge injection, no knowledge tools or retrieval, no gated
  extension discovered — pinned against frozen baselines. Content corrections
  shipped by this plan — the distiller persona and archive guidance emitting
  OKF proposals instead of JSONL, and stale pointer updates in project
  context and docs — are explicitly permitted, ordinary reviewed repo changes
  even though they alter prompt bytes. *(Amended 2026-08-18 by human ruling
  D-009; original letter — "byte-identical prompts" — superseded: it
  collided with INV-3/AC-006, since the same prompt cannot be byte-frozen
  and simultaneously stop instructing JSONL.)*
- [ ] AC-008 — Project gates pass (the test, lint, and type-check steps);
  shipped skills and prompts remain stack-agnostic; `docs/memory.md` and
  affected pointers document the knowledge surface.

## Scope

Included:

- The `knowledge/` layout (project + user twin), the OKF knowledge record
  class, and its documentation.
- Migration of the seed corpus and retirement of the `.knowledge.jsonl`
  format and its read/write path.
- Framework-wide retrieval through the shared memory interface, the injected
  knowledge index, and the combined-budget reassessment.
- The proposals area (destination directory and promotion convention) —
  mechanism only; nothing fills it automatically yet.
- Distiller output moved to OKF proposals; the coverage backfill run.
- The config gate and OFF-state identity.

Excluded:

- The consolidation pass itself — `memory-consolidation`, the successor plan.
- The working-state singleton — ratified item ② of the sequence; rides
  adjacent as its own small plan.
- Any change to episodes, the episodic log, or explicit-save semantics.
- Embeddings or any similarity backend (last filter, only if needed, behind
  the interface — not v1).
- Raw-session deletion (the ratified retention direction) — implementation
  belongs with the archive/consolidation flow, not here.
- `autonomy-host`, and turning any gate on by default.

## Assumptions

- `missions/architecture/knowledge-and-memory.md` governs; this spec derives
  from its ratified rulings and does not reopen them.
- The shared memory interface in `lib/memory/` is the substrate; adding a
  record class/scope/store is expected, replacing the interface is not.
- The existing distiller (currently `bundled/coding/agents/distiller.ts`) is
  the extraction mechanism; adapting its output format is in scope, rewriting
  extraction is not.
- The backfill's proposal review is human work by design; the plan only owes
  the proposals and the enumeration, not the promotions.

## Open Questions

- The exact proposals path — `memory/agent/proposals/` per the architecture
  doc; the planner confirms or amends on the record.
- The combined injection budget number, and whether the knowledge index is
  uniform across agents or scoped per role.
- Where the distiller lives once knowledge is framework-wide — it is a
  coding-domain agent today, but extraction is domain-agnostic.
- Whether the user twin starts empty (likely: yes; user knowledge arrives via
  explicit-save offers, not migration).
- Whether `memory/*.md` files move or are superseded-in-place with pointers —
  moving is cleaner; external references to `memory/<slug>.md` paths exist in
  archived artifacts (which stay as historical record either way).
