---
title: 'Knowledge surface: project knowledge for every agent'
status: active
createdAt: '2026-08-18T20:03:19.945Z'
updatedAt: '2026-08-18T21:22:54.287Z'
---

## Overview

This plan implements the authoritative spec in
`missions/plans/knowledge-surface/spec.md` and the first slice of the ratified
sequence in `missions/architecture/knowledge-and-memory.md` §10. It adds a
human-curated project knowledge store at `knowledge/`, recognizes the
user-scoped twin at `~/.cosmonauts/knowledge/`, adds the knowledge record class
to the shared `MemoryStore` substrate, migrates the existing 36 markdown
distillations plus every record in the 10 legacy bundles, and prepares
attributable proposal output and backfill coverage.

The runtime surface remains gated by `.cosmonauts/config.json` and defaults
OFF. Repo-content migration is ordinary reviewed source content and is not
gated. This plan does not implement consolidation, working state, episode or
explicit-save changes, embeddings, retention, or autonomy-host behavior.

**Readiness: ruling revision complete 2026-08-18.** D-009 ruled option A
(AC-007 amended: OFF-identity governs the gated runtime surface; content
corrections permitted). D-010 ruled option B (INV-1/INV-2 and AC-003/AC-005
amended: the boundary governs dedicated knowledge/memory tools and framework
pathways; generic tools and external backends stay documented, trusted project
capabilities). The body now applies both selected mechanisms, Precondition 0 is
satisfied, and `review-3.md` is this revision's required review record. This
revision creates no tasks and performs no implementation.

## Architecture Context

This plan implements part of
`missions/architecture/knowledge-and-memory.md` and preserves the derived-map
boundary in `missions/architecture/code-structure-map.md`.

Relevant ratified rulings:

- `knowledge-and-memory.md` §11: knowledge is OKF markdown only, with
  `decision | trade-off | gotcha | convention` as its type vocabulary.
- `knowledge-and-memory.md` §11: machine output lands under `memory/` as
  proposals; promotion into `knowledge/` is a human act.
- `knowledge-and-memory.md` §11: agents receive a small knowledge index plus
  explicit `recall`, and memory, architecture, and knowledge injection share
  one reassessed per-turn bound.
- `code-structure-map.md`: architecture-map retrieval already implements
  `MemoryStore`; this plan coordinates its injection but does not merge the
  generated map into curated knowledge.
- The shared-memory invariants remain: sibling stores per scope, disk as the
  only correctness state, no cache, and no speculative registry/backend layer.

Boundary rules:

- `lib/memory/` owns domain-neutral record, path, store, retrieval-composition,
  and UTF-8 budget contracts. It must not import Pi, config, agents, domains,
  sessions, tasks, plans, or architecture-map infrastructure.
- `lib/architecture-map/` remains a separate `MemoryStore` adapter. Generated
  map files stay under `memory/architecture/` and are never treated as curated
  knowledge.
- Pi adapters depend inward on `lib/memory/`; stores never depend on extensions.
- New gate-selected Pi adapters live under an explicitly loaded framework path,
  not under the package auto-loaded `domains/shared/extensions/` root.
- Current disk is authoritative. Missing roots produce empty results and no
  read-time scaffolding; edits, promotions, and deletions are visible on the
  next retrieval.
- Per D-010 option B, INV-1/INV-2 govern dedicated knowledge/memory tools and
  framework knowledge pathways. Generic project tools and external backends
  remain trusted, human-supervised, git-reviewed project-file capabilities
  outside that boundary; documentation, not a sandbox, owns that trust seam.

## Decision Log

- **D-001 — Derived from the ratified architecture (2026-08-18).**
  This plan exists per `knowledge-and-memory.md` §10 (resequencing) and
  implements its §11 rulings: OKF-markdown-only records, proposals-area write
  authority, injected-index-plus-recall retrieval, and the track's
  infrastructure-first gate posture. Decided by: human (ratified 2026-08-18).
- **D-002 — Working state excluded (adjacent plan).** The ratified order
  allows item ② to ride with this plan or adjacent; it is scoped out to keep
  this plan within task bounds and ships as its own small plan reusing
  profile mechanics. Decided by: planner-proposed, 2026-08-18.
- **D-003 — Intent invariants INV-5 and INV-6 promoted from candidates
  C-6 and C-4** of `knowledge-and-memory.md` §9 into this spec's `## Intent`.
  Decided by: human (ratified 2026-08-18).
- **D-004 — Use `memory/agent/proposals/` as the plan-stage proposal path.**
  - Decision: machine-produced project proposals live under
    `memory/agent/proposals/`; curated records live only under project/user
    `knowledge/` roots.
  - Alternatives: a directory inside `knowledge/`; a new top-level proposals
    tree.
  - Why: this is the simplest exact path consistent with the human-ratified
    machine-side-under-`memory/` boundary. The architecture explicitly leaves
    the exact path to this plan; this entry corrects the earlier overstatement
    identified by `review.md PR-009`.
  - Decided by: planner-proposed, 2026-08-18.
- **D-005 — Fix one 24,000-byte combined injection ceiling.**
  - Decision: when enabled, memory, architecture-map, and knowledge sections are
    composed by one UTF-8 allocator with a total 24,000-byte cap, including
    headers and truncation notices. Non-empty sections receive a fair initial
    share and unused bytes are redistributed deterministically. Knowledge index
    content is uniform across roles; existing policy determines whether memory
    and architecture sections apply.
  - Alternatives: preserve the independent 12,000 + 24,000 bounds and add a
    third; use per-role knowledge indexes; make the cap configurable in v1.
  - Why: 24,000 bytes does not exceed the largest existing single-surface cap,
    proves INV-4 with one enforceable number, and avoids relevance policy before
    evidence warrants it.
  - Decided by: planner-proposed, 2026-08-18.
- **D-006 — Perform a one-to-one seed conversion, not consolidation.**
  - Decision: each `memory/*.md` distillation moves to one
    `knowledge/<slug>.md` decision record with its markdown body preserved; each
    JSONL record becomes one `knowledge/<plan-slug>/<record-id>.md` record.
    `rationale` maps to `decision`; `pattern` maps to `convention`; the four
    ratified values are unchanged. The complete field matrix is in Design §6.
  - Alternatives: deduplicate/merge the two corpora; leave pointer stubs under
    `memory/`; preserve JSONL as an import format.
  - Why: one-to-one conversion makes AC-002 auditable without implementing the
    excluded consolidation pass. `review.md PR-006` requires the explicit
    field-level preservation contract added below.
  - Decided by: planner-proposed, 2026-08-18.
- **D-007 — Start user knowledge empty.**
  - Decision: no project seed record is copied to
    `~/.cosmonauts/knowledge/`; the path is recognized by the store and tested
    with an injected temporary root, but reads do not create it.
  - Alternatives: copy selected project records to the user twin; scaffold the
    real home directory during project setup.
  - Why: the corpus is project history, while user knowledge must outlive a
    project by explicit human choice. This avoids changing explicit-save
    semantics or writing outside the project as a side effect.
  - Decided by: planner-proposed, 2026-08-18.
- **D-008 — Use explicit framework adapters and a frozen per-session policy.**
  - Decision: `buildSessionParams` resolves the project gate once per session
    assembly and explicitly loads exactly one framework knowledge-context mode.
    A per-`ExtensionAPI` `WeakMap` policy is initialized at extension factory
    load and read by existing agent-memory/architecture-memory handlers before
    their first turn; fresh and resumed processes reconstruct it by assembling
    the session from config. Gate edits take effect only after session
    recreation/reload. New adapters live outside Pi's package auto-load root.
  - Alternatives: edit every agent definition; reload config independently in
    three extensions; rely on context-handler ordering; put new child
    extensions under `domains/shared/extensions/`.
  - Why: one frozen authority prevents double injection and config races, while
    explicit placement prevents OFF package hosts from auto-registering new
    tools. Addresses `review.md PR-003` and `review.md PR-004`.
  - Decided by: planner-proposed, 2026-08-18.
- **D-009 — RULED: amend AC-007; OFF-identity governs the gated runtime
  surface, not prompt-content corrections (option A).**
  - Decision: AC-007's letter is amended in `spec.md`. The OFF guarantee
    covers the gated surface — no knowledge injection, tools, retrieval, or
    gated extension discovery — pinned against frozen baselines. The distiller
    persona, archive guidance, and stale project-context/doc pointers are
    explicitly permitted content corrections even though they alter prompt
    bytes. INV-3 and AC-006 stand whole.
  - Alternatives: (B) preserve OFF prompt bytes — rejected: leaves an active
    distiller instructed to write JSONL, violating INV-3/AC-006 and keeping
    the written-and-never-read defect alive; (C) qualify INV-3/AC-006 to
    enabled mode — rejected: narrows the ratified format ruling.
  - Why: AC-007's intent was "the gate adds nothing when off," not "the
    repo's prompts are frozen"; the spec already treats migration as ungated
    repo content, and prompt corrections are the same class.
  - Supersedes: spec AC-007's original "byte-identical prompts" letter
    (marked in place in `spec.md`).
  - Decided by: human, 2026-08-18.
- **D-010 — RULED: amend INV-1/INV-2 and AC-003/AC-005 to govern the memory
  system's own surfaces (option B).**
  - Decision: the invariants' letters are amended in `spec.md`. INV-1 binds
    dedicated knowledge/memory tools and framework memory pathways — machine
    knowledge is proposals-only, promotion is human. INV-2 binds the
    knowledge retrieval feature (index, `recall`, injection) to the shared
    memory interface — no second framework retrieval path. Generic project
    tools (read/grep/find/ls/bash/edit/write) and external Codex/Claude Drive
    backends remain trusted, human-supervised, git-reviewed project-file
    capabilities outside the invariants' scope; the trust boundary is
    documented (AC-005), not sandboxed.
  - Alternatives: (A) literal enforcement via a portable filesystem sandbox —
    rejected: path-string guards cannot soundly constrain shell indirection
    or symlinks, a sound portable sandbox is major new architecture, and it
    would make `knowledge/` the only tracked content trusted tools cannot
    touch; (C) disable generic filesystem/shell tools when enabled —
    rejected: materially reduces enabled agent capability.
  - Why: the invariant's origin (C-1, consolidation context) targets
    autonomous memory machinery authoring curated knowledge — noise
    prevention — not general project editing. Git review is the actual
    enforcement for generic edits, exactly as for every other tracked file.
  - Supersedes: spec INV-1/INV-2 original letters and the AC-003/AC-005
    "no (registered) agent tool / no retrieval path" phrasings (marked in
    place in `spec.md`).
  - Decided by: human, 2026-08-18.
- **D-011 — Make proposal identity explicit at the shared draft seam.**
  - Decision: add optional `resource`, `writer`, and `date` to
    `MemoryRecordDraft`; the dedicated proposal tool accepts `planSlug` but no
    path, derives a canonical destination resource, and passes the complete
    draft to `MemoryStore.write`. The knowledge store requires and validates
    all four fields plus `source` for proposal writes.
  - Alternatives: encode plan identity in tags; let the store synthesize an
    unknown destination; bypass `MemoryStore.write` with a proposal-specific IO
    API.
  - Why: this aligns the tool schema, deterministic filename, promotion
    resource, and mutation tests without casts or an implicit second writer.
    Addresses `review.md PR-005`.
  - Decided by: planner-proposed, 2026-08-18.
- **D-012 — Reserve `recall` while the knowledge surface is enabled.**
  - Decision: `recall` is a framework-reserved tool name in enabled sessions.
    Agent-memory is the one recognized existing owner and composes through the
    shared retrieval helper; any other installed extension registering
    `recall` fails session assembly with an actionable collision diagnostic
    rather than being silently replaced or duplicated. Initial CLI, switched,
    and spawned loaders verify the final callable allowlist.
  - Alternatives: overwrite arbitrary installed tools; register
    `knowledge_recall`; infer compatibility from extension names.
  - Why: the ratified surface names `recall`, and loader-time registration is
    the first seam with actual tool maps. Addresses `review.md PR-007`.
  - Decided by: planner-proposed, 2026-08-18.
- **D-013 — Backfill is 3-15 proposals per slug with a human review stop.**
  - Decision: derive the missing-slug set from archived plan directories minus
    the frozen pre-migration distillation inventory; each distiller invocation
    yields 3-15 valid proposals. The batch temporarily enables the gate, restores
    `.cosmonauts/config.json` byte-for-byte in a `finally` path, and halts for
    human diff review before proposal artifacts are accepted. No promotion is
    part of the batch.
  - Alternatives: accept one record per slug; trust a hand-maintained list;
    defer no-verbatim review to final quality gates.
  - Why: this gives INV-5 an owner at the write slice and makes omissions or
    under-distillation fail locally. Addresses `review.md PR-008`.
  - Decided by: planner-proposed, 2026-08-18.
- **D-014 — Keep extraction in the existing coding distiller for this plan.**
  - Decision: `bundled/coding/agents/distiller.ts` remains the extraction agent;
    record/store/proposal contracts are framework-wide. Moving extraction to a
    shared/framework agent is not part of this slice.
  - Alternatives: create a second framework distiller; move the coding agent now.
  - Why: the authoritative spec says adapt the existing mechanism, not rewrite
    extraction; moving it would create a parallel path before a second domain
    proves the need.
  - Decided by: planner-proposed, 2026-08-18.

## Behaviors

### B-001 - Project and user roots expose one OKF knowledge contract

- Source: AC-001
- Context: project or injected user roots contain valid records, reserved
  indexes, missing directories, malformed records, symlinks, or physically
  mis-scoped occupants
- Action: the knowledge `MemoryStore` retrieves requested durable scopes
- Expected: it returns only direct/recursive regular markdown records using the
  four ratified types, excludes `index.md` and symlink traversal, warns for
  malformed or wrong-scope files, and treats missing roots as empty without
  creating files
- Seam: `lib/memory/knowledge-records.ts` and
  `lib/memory/knowledge-store.ts`
- Test: `tests/memory/markdown-store.test.ts` > `reads valid project and user OKF knowledge without scaffolding scope leakage or symlink traversal`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-001`

### B-002 - Dedicated machine knowledge writes become safe proposals

- Source: AC-005
- Context: the dedicated proposal tool submits a valid record, while direct
  store callers exercise missing provenance, unknown type, user scope,
  traversal, absolute resource, symlinked proposal root, and non-identical
  occupant cases
- Action: the tool derives a resource and calls the knowledge store's shared
  `write` contract
- Expected: valid bytes exist only under a real, non-symlinked
  `memory/agent/proposals/<planSlug>/` root with writer/source/date provenance;
  no curated file or partial replacement is created; the registered tool schema
  accepts no output path
- Seam: `lib/memory/knowledge-store.ts` and the proposal Pi adapter
- Test: `tests/memory/interface.test.ts` > `routes dedicated knowledge writes to contained attributable proposals and rejects every path escape`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-002`

### B-003 - Frozen seed inventory is fully represented and JSONL is retired

- Source: AC-002
- Context: a pre-migration inventory freezes all 36 markdown paths/digests, all
  10 bundle headers, and every JSONL record ID and field
- Action: the migrated corpus and the unconditionally corrected active
  source/prompt tree are audited
- Expected: each source maps one-to-one to the destination and field matrix in
  Design §6, including byte-preserved body content and `planTitle`; no root
  distillation or `.knowledge.jsonl` remains under `memory/`, and no active
  read/write API or instruction names the legacy path
- Seam: `knowledge/`, `memory/`, `lib/sessions/`, active distiller/archive text,
  and the frozen migration inventory
- Test: `tests/memory/interface.test.ts` > `maps every frozen seed field and body to OKF and leaves no active knowledge JSONL path`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-003`

### B-004 - Store retrieval applies scope, current disk, recency, and query

- Source: AC-003
- Context: project and user roots contain matching and non-matching records with
  different timestamps, plus a human edit or deletion after store construction
- Action: a caller retrieves through `MemoryStore` with scopes, query text,
  record types, and limit
- Expected: physical scope is filtered first, results reflect current disk, text
  matches title/description/tags/resource/body, records order newest-first with
  path tie-break, and limit applies after filtering
- Seam: `lib/memory/knowledge-store.ts`
- Test: `tests/memory/markdown-store.test.ts` > `filters current knowledge by physical scope and query then applies recency and limit`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-004`

### B-005 - Enabled Pi sessions receive one final framework recall surface

- Source: AC-003
- Context: initial CLI, interactive switch, and spawned sessions assemble
  built-in and installed `AgentDefinition` fixtures with no recall, agent-memory
  recall, or a conflicting arbitrary recall extension
- Action: resource loaders register extensions and build final callable tool
  allowlists
- Expected: ordinary agents and Cosmo each expose exactly one framework recall,
  all unrelated tools remain callable, agent-memory composes rather than
  duplicates, and an arbitrary owner produces an actionable reserved-name
  failure consistently at all three seams
- Seam: `lib/agents/session-assembly.ts`, `cli/session.ts`, and
  `lib/orchestration/session-factory.ts`
- Test: `tests/cli/session.test.ts` > `enforces one reserved enabled recall across initial switched and spawned loader paths`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-005`

### B-006 - Dedicated knowledge and memory pathways use the shared boundary

- Source: AC-003, AC-005
- Context: enabled ordinary, Cosmo, agent-memory, and distiller sessions use
  injected `MemoryStore` spies while shipped documentation describes generic Pi
  project tools and Codex/Claude Drive backends
- Action: framework index injection, knowledge and agent-memory recall, the
  existing `remember` operation, and the dedicated proposal operation run, then
  the documented trust boundary is audited
- Expected: every framework knowledge index/detail read calls
  `MemoryStore.retrieve`, and agent-memory composition uses the shared retrieval
  combiner; existing `remember` writes authored notes/profiles/playbooks through
  `MemoryStore.write` to ordinary memory, while a dedicated machine knowledge
  write calls `MemoryStore.write` and creates only a proposal. Framework adapters
  perform no direct knowledge-file IO. Documentation states that generic
  read/grep/find/ls/bash/edit/write tools and external backends can access
  ordinary project files under human supervision and git review and are not
  sandboxed by this feature
- Seam: `lib/extensions/knowledge-surface/`,
  `lib/extensions/knowledge-context/`,
  `lib/extensions/knowledge-proposals/`,
  `domains/shared/extensions/agent-memory/index.ts`, and `docs/memory.md`
- Test: `tests/extensions/agent-memory.test.ts` > `routes remember recall and knowledge proposals through MemoryStore and documents trusted generic access`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-006`

### B-007 - One provider-visible budget bounds populated and empty contexts

- Source: AC-004
- Context: enabled memory, architecture, and knowledge sections are each
  oversized in one case, while all eligible stores are empty in another
- Action: all `before_agent_start` and context transforms complete
- Expected: the final provider-visible populated context is at most 24,000 UTF-8
  bytes including notices, keeps each non-empty surface discoverable, omits
  body-only sentinels, and directs detail reads to the proper tool; the empty
  case adds no message, heading, or warning
- Seam: `lib/memory/injection-budget.ts`, the framework knowledge context
  adapter, and existing memory/map context handlers
- Test: `tests/extensions/architecture-memory.test.ts` > `bounds the final three-surface provider context and emits nothing for an empty surface`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-007`

### B-008 - The default OFF gated surface matches frozen baselines

- Source: AC-007
- Context: config is absent, false, malformed, or edited during a live OFF
  session for Cosmo, map consumer, extension-free agent, distiller, and a Pi
  package host
- Action: initial/switch/spawn/package sessions assemble and turns run against
  frozen pre-plan gated-surface baselines plus the D-009 content-correction
  allowlist
- Expected: gated extension discovery, knowledge tool schemas,
  hidden/provider messages, and visible results or filesystem effects
  attributable to the gated adapters equal the baseline; every prompt byte
  outside the permitted distiller-persona, archive-guidance, and
  project-context/doc pointer corrections equals the baseline; no knowledge
  adapter/store is constructed; a config edit has no effect until explicit
  session reload
- Seam: config/session assembly, package extension discovery, existing memory
  extensions, distiller prompt, archive guidance, and project context including
  `AGENTS.md`
- Test: `tests/episodic/pre-w3-disabled-baselines.test.ts` > `keeps the gated knowledge surface inert off while allowing only the ruled content corrections`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-008`

### B-009 - Distiller guidance requires distilled OKF proposals

- Source: AC-006
- Context: the existing distiller receives archived artifacts and only filtered
  Tier-2 transcript markdown
- Action: it follows its active persona and archive-skill contract
- Expected: both require 3-15 one-concept OKF proposals using only the four
  knowledge types, require writer/source/date, forbid JSONL, embeddings, and
  verbatim transcript/file/command excerpts, name
  `memory/agent/proposals/` as the only output root, and retain the coding
  distiller as the extraction mechanism
- Seam: `bundled/coding/prompts/distiller.md`,
  `bundled/coding/agents/distiller.ts`, and
  `domains/shared/skills/archive/SKILL.md`
- Test: `tests/prompts/archive-skill.test.ts` > `requires the existing distiller to emit attributable distilled OKF proposals and forbids legacy output`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-009`

### B-010 - Backfill is repository-derived, complete, and human-reviewed

- Source: AC-006
- Context: archived plan directories and the frozen pre-migration distillation
  inventory determine the missing set
- Action: a temporary enabled batch invokes the adapted distiller once per
  missing slug, restores repo config, validates outputs, and stops for review
- Expected: the derived set is exactly the current 19 slugs, each slug has 3-15
  valid attributable proposals, config bytes equal the pre-run bytes even on
  failure, a human approves the no-verbatim diff before acceptance, and no
  proposal is promoted automatically
- Seam: archive inventory, `.cosmonauts/config.json`,
  `memory/agent/proposals/`, and the backfill review index
- Test: `tests/prompts/archive-skill.test.ts` > `derives all missing archives and requires 3-15 restored-config human-reviewed proposals per slug`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-010`

### B-011 - Shipped documentation states the bounded live contract

- Source: AC-008
- Context: a user reads memory documentation, archive guidance, config examples,
  and live non-prompt pointers after migration
- Action: documentation obligations are audited
- Expected: text names both roots, four types, proposal/promotion flow, shared
  recall, 24,000-byte bound, OFF default, migration, provenance/no-verbatim
  rules, and all excluded features; examples remain stack-agnostic and no
  ratified prompt file is silently changed around D-009
- Seam: `docs/memory.md`, `README.md`, `ROADMAP.md`, archive guidance, and live
  architecture cross-links
- Test: `tests/prompts/archive-skill.test.ts` > `documents the stack-agnostic knowledge surface budget gate authority and exclusions`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-011`

### B-012 - Package auto-loading cannot expose gated adapters

- Source: AC-007
- Context: Pi loads this package's declared
  `./domains/shared/extensions` root without Cosmonauts session assembly while
  the gate is OFF
- Action: extension discovery and factory registration complete
- Expected: no knowledge-surface/context/proposal adapter is discovered, no new
  tool is registered, and the existing shared extension/tool set remains the
  frozen baseline
- Seam: `package.json`, explicit framework adapter placement, and Pi package
  resource loading
- Test: `tests/domains/main-domain.test.ts` > `keeps gate-selected framework knowledge adapters outside package auto-discovery`
- Marker: `@cosmo-behavior plan:knowledge-surface#B-012`

## Design

### 1. Ruled runtime and trust boundaries

D-009 option A partitions OFF verification into two explicit sets. The gated
runtime surface—knowledge extension discovery, adapter/tool registration,
retrieval, index/context injection, store construction, and resulting runtime
or filesystem effects—must match frozen OFF baselines. The only excluded
content deltas are the ruled corrections to the distiller persona, archive
guidance, and stale project-context/doc pointers, including `AGENTS.md`; tests
pin those exact correction regions and fail any additional prompt delta. INV-3
and AC-006 therefore apply unconditionally while AC-007 still proves that the
gate adds nothing when OFF.

D-010 option B governs dedicated knowledge/memory tools and framework memory
pathways. Knowledge index injection, `recall`, agent-memory composition, the
existing `remember` operation, and the dedicated proposal operation all depend
inward on `MemoryStore`. `remember` continues to write authored
notes/profiles/playbooks under ordinary memory; only machine knowledge output
uses the proposal path outside curated `knowledge/`. Generic Pi project tools
and external Codex/Claude backends remain unchanged trusted project-file
capabilities. `docs/memory.md` must state that human supervision and git review,
not this feature, govern their direct file access. No path-string guard,
portable sandbox, tool disablement, backend restriction, or prompt-only claim
of technical enforcement is added.

### 2. Gate, packaging, and session coordination

Add a project-only config shape:

```ts
interface ProjectKnowledgeSurfaceConfig {
  readonly enabled?: boolean;
}
interface ResolvedKnowledgeSurfaceConfig {
  readonly enabled: boolean;
}
```

Only literal true enables it; absent/false/malformed resolve false. Storage is
config-free. Session assembly freezes the resolved value for the life of the
resource loader; editing config requires a session reload/new session.

New Pi adapters are explicitly loaded from new framework directories such as
`lib/extensions/knowledge-surface/`,
`lib/extensions/knowledge-context/`, and
`lib/extensions/knowledge-proposals/`. They are not children of
`domains/shared/extensions`, so `package.json` package auto-discovery cannot
load them. `fallow.toml` marks only these explicit entry points dynamic.

Exactly one of normal (`recall` + context) or context-only (known agent-memory
owner) is loaded. Enabled distiller sessions additionally load proposal output.
At factory load, the selected adapter writes this per-session policy:

```ts
interface KnowledgeSurfaceSessionPolicy {
  readonly enabled: true;
  readonly contextOwner: "knowledge-surface";
  readonly recallOwner: "knowledge-surface" | "agent-memory";
  readonly canPropose: boolean;
}
```

A module-local `WeakMap<object, KnowledgeSurfaceSessionPolicy>` keys by that
session's `ExtensionAPI`. Existing agent-memory and architecture-memory handlers
read it before injection: when present, they do not emit independent context;
when absent, they execute the byte-identical legacy path. Every new process
rebuilds the map by reloading extensions from persisted config; no fabricated
default is used for enabled correctness. No extension independently reloads
config, eliminating live-session disagreement. Provider-visible integration
tests run all context transforms before measuring bytes.

`recall` is reserved while enabled. The real loader registry—not extension name
heuristics—detects a non-framework collision after `DefaultResourceLoader`
reload and fails with the conflicting extension path. Initial CLI, `/agent`
switch, and spawned factories share this rule.

### 3. Record and provenance contract

Add in `lib/memory/knowledge-records.ts`:

```ts
const KNOWLEDGE_RECORD_TYPES = [
  "decision", "trade-off", "gotcha", "convention",
] as const;
type KnowledgeRecordType = (typeof KNOWLEDGE_RECORD_TYPES)[number];

interface KnowledgeProvenance {
  readonly writer: string;
  readonly source: string;
  readonly date: string;
}
```

A record requires OKF `type`, `title`, `description`, `resource`, `tags`,
`timestamp`, `scope`, and `kind` plus top-level `writer`, `source`, and `date`.
Knowledge uses project/user scope and semantic kind; `resource` is a normalized
POSIX path rooted at `knowledge/`. Parsers reject absolute/traversal resources,
invalid dates/types/scopes, symlink traversal, and resource/path disagreement
with file warnings. `knowledge/index.md` is a reserved human browse/migration
index, never a record or runtime truth source.

Extend only the shared draft/result data needed at the interface:

```ts
interface MemoryRecordDraft {
  // existing fields unchanged
  readonly resource?: string;
  readonly writer?: string;
  readonly date?: string;
}
```

Retrieved records expose the same optional provenance. Existing memory/map
records remain valid without it; knowledge proposal writes require it.

### 4. Read-wide/write-narrow knowledge store

`createKnowledgeMemoryStore({ projectRoot, userCosmonautsRoot?, now? })`
implements the existing `MemoryStore`:

- `retrieve` selects physical scope roots, reads regular `.md` records without
  following symlinks, validates resource/path/scope, filters, sorts, and limits.
  Missing roots are empty; there is no cache.
- `write` accepts only project-scoped semantic knowledge drafts with four-type,
  safe destination resource and complete provenance. It writes to the proposal
  root, never `record.resource`.
- `consolidate` remains the existing explicit no-op.

The proposal tool accepts `planSlug`, type, title, description, content, tags,
source, and optional source date—never resource/path. It computes:

```text
key = sha256(canonical JSON of planSlug,type,title,content,source)[0..11]
resource = knowledge/<planSlug>/<type>-<slug(title)>-<key>.md
proposal = memory/agent/proposals/<planSlug>/<basename(resource)>
writer = qualified current distiller id
date = sourceDate ?? now().toISOString()
```

The store independently validates all derived fields. It rejects symlinked
proposal ancestors, confirms realpath containment under the real proposal root,
uses atomic exclusive creation, treats identical bytes as idempotent, and
refuses non-identical occupants. Proposal frontmatter keeps the intended
curated resource so human promotion is a reviewed move/copy. A proposal exits
only by human promotion or rejection/deletion; there is no pending state.

Per D-010 option B, this store and its adapters own the enforceable dedicated
knowledge/memory boundary. Generic tools and backends are intentionally not
wrapped or filtered; their trusted direct project-file access is documented and
is not represented as store-enforced safety.

### 5. Recall and combined context

A domain-neutral retrieval combiner accepts explicitly constructed store/query
pairs, merges records/warnings/skipped scopes/stats, sorts once, and applies the
visible limit. It constructs no registry. Normal recall queries knowledge;
agent-memory recall uses the same combiner for authored memory plus knowledge.
Extension code imports no filesystem IO for knowledge.

A pure allocator uses:

```ts
const COMBINED_INJECTION_MAX_BYTES = 24_000;
type InjectionSectionId = "memory" | "architecture" | "knowledge";
interface InjectionSection {
  readonly id: InjectionSectionId;
  readonly content: string;
  readonly truncationNotice: (includedBytes: number) => string;
}
```

It counts common/section headers and notices, assigns equal initial shares,
redistributes unused bytes deterministically, truncates at UTF-8 boundaries, and
final-clamps. Knowledge injection contains at most 50 newest metadata rows
(type/title/description/scope/timestamp/resource/tags/provenance), never bodies.
The final test measures provider-visible context after existing handlers and
covers both all-three oversized and all-empty cells.

### 6. Complete seed field matrix

Freeze a test inventory before deletion: each legacy path and SHA-256; each
bundle header (`planSlug`, `planTitle`, `distilledAt`, `distilledBy`); and each
record's complete fields and ordinal.

For every `memory/<slug>.md`:

| Destination field | Source/derivation |
|---|---|
| path/resource | `knowledge/<slug>.md` |
| type | `decision` (legacy plan distillation wrapper) |
| title | first H1 exactly |
| description | `Archived plan distillation for <slug>.` |
| tags | `plan:<slug>`, `source:legacy-distillation` |
| timestamp | original `distilledAt` |
| scope/kind | `project` / `semantic` |
| writer/source/date | `knowledge-surface-migration` / original `memory/<slug>.md` / migration ISO time |
| custom legacy keys | original `source`, `plan`, `distilledAt`, source SHA-256 |
| body | original post-frontmatter markdown body byte-for-byte |

For every JSONL record:

| Destination field | Source/derivation |
|---|---|
| path/resource | `knowledge/<planSlug>/<id>.md` |
| type | identity for four ratified values; `rationale → decision`; `pattern → convention` |
| title | `<planTitle> — <mapped-type> <1-based bundle ordinal>` |
| description | `Migrated <legacy-type> record <id> from <planSlug>.` |
| tags | legacy `tags` exactly |
| timestamp | record `createdAt` |
| scope/kind | `project` / `semantic` |
| writer/source/date | bundle `distilledBy` / `memory/<planSlug>.knowledge.jsonl#<id>` / bundle `distilledAt` |
| custom legacy keys | `id`, `planSlug`, `planTitle`, optional `taskId`, `sourceRole`, `files`, original `type`, `createdAt`, bundle `distilledAt`, bundle `distilledBy`, source SHA-256 |
| body | legacy `content` byte-for-byte |

`knowledge/index.md` maps every frozen source/ID to destination. Add all
destinations and update permitted live pointers before removing the 46 legacy
source files. Archived plans/tasks/reviews remain immutable historical evidence.
Delete `lib/sessions/knowledge.ts`, remove bundle exports/types from
`lib/sessions/index.ts` and `lib/sessions/types.ts`, and remove JSONL tests; no
compatibility reader/writer remains.

### 7. Distiller and backfill

The extraction agent remains `bundled/coding/agents/distiller.ts`. Its active
persona and archive guidance unconditionally require 3-15 synthesized,
one-concept proposals and prohibit raw transcript excerpts, file contents,
command output, embeddings, and JSONL.

The backfill test derives missing slugs at runtime from
`missions/archive/plans/*/plan.md` minus the frozen legacy markdown plan slugs;
it does not trust the same hand-maintained expected list as output generation.
The currently verified result is 19 slugs:

`agent-thinking-levels`, `analysis-capabilities`,
`coding-agnostic-framework`, `dialogic-planner`, `domain-authoring`,
`drive-smoke-fixes`, `driver-primitives`, `external-agent-orchestration`,
`external-backends-and-cli`, `fallow-temp-exceptions-cleanup`,
`framework-extraction`, `main-domain-and-cosmo-rename`, `observability`,
`orchestration-hardening`, `orchestration-surface-consolidation`,
`package-system`, `quality-contracts`, `roadmap-system`, `ruby-rails-skills`.

Explicit trusted procedure under the D-009/D-010 rulings:

1. record `.cosmonauts/config.json` bytes and digest;
2. temporarily enable the surface for the developer-controlled repository;
3. invoke the adapted distiller once per derived slug, requiring 3-15 successful
   proposal writes;
4. restore original config bytes in `finally`, including failure/cancellation;
5. validate config identity, proposal schema/provenance/counts, and review index;
6. halt for a human to inspect the complete diff for INV-5 and approve or reject
   proposal artifacts; do not promote them.

The trust boundary is explicit: this procedure runs project-controlled
configuration only in this reviewed repository and only after human plan
approval. Arbitrary target projects are not executed by a migration script.

### 8. Capability evidence and Pi-first result

`analysis_status` reported complexity, duplication, boundary-conformance,
dead-code, changed-scope audit, trace, and fix-preview all unbound with
`execution-not-consented` for provider `fallow`. Explicit cognitive complexity,
duplication, boundaries, and JSONL-file trace calls also returned unbound. This
is absent evidence, not a clean baseline; Quality Contract rows remain degraded.

Pi 0.80.6 supplies `DefaultResourceLoader`, factory registration,
`before_agent_start`, context transforms, real loader tool maps, and the
cross-extension API object used for per-session coordination. The design reuses
those seams and adds no custom session runtime or registry. Per D-010 option B,
Pi's lack of a portable generic filesystem sandbox requires no replacement
mechanism in this plan: generic tools and external backends remain the
documented trust boundary.

## Files to Change

The list below applies the selected D-009 option A and D-010 option B mechanisms;
workers must not infer sandbox, tool-disablement, or additional prompt changes.

- `tests/config/loader.test.ts` ↔ `lib/config/types.ts`,
  `lib/config/loader.ts`, `lib/config/index.ts` — literal-true/default-OFF gate.
- `tests/agents/session-assembly.test.ts`, `tests/cli/session.test.ts`,
  `tests/orchestration/session-factory.security.test.ts`, and
  `tests/interactive/agent-switch.test.ts` ↔
  `lib/agents/session-assembly.ts`, `cli/session.ts`, and
  `lib/orchestration/session-factory.ts` — explicit framework adapter selection,
  frozen policy, reserved recall, and real final allowlists.
- `tests/domains/main-domain.test.ts` ↔ `package.json`, new
  `lib/extensions/knowledge-surface/index.ts`, new
  `lib/extensions/knowledge-context/index.ts`, new
  `lib/extensions/knowledge-proposals/index.ts`, and new
  `lib/extensions/knowledge-surface/session-policy.ts` — explicit non-auto-loaded
  adapter placement and mutually exclusive modes.
- `tests/extensions/agent-memory.test.ts` and
  `tests/extensions/architecture-memory.test.ts` ↔
  `domains/shared/extensions/agent-memory/index.ts` and
  `domains/shared/extensions/architecture-memory/index.ts` — consume the frozen
  session policy and preserve the absent-policy legacy path.
- `tests/memory/markdown-store.test.ts`, `tests/memory/interface.test.ts` ↔
  `lib/memory/types.ts`, `lib/memory/index.ts`, new
  `lib/memory/knowledge-records.ts`, new `lib/memory/knowledge-store.ts`, new
  `lib/memory/multi-store-retrieval.ts`, and new
  `lib/memory/injection-budget.ts` — record/store/proposal/retrieval/budget core.
- `tests/episodic/pre-w3-disabled-baselines.test.ts` ↔ all config/session/
  extension/distiller/project-context seams — freeze OFF adapter discovery,
  tools, retrieval, contexts, store construction, gated-adapter-attributable
  runtime/filesystem effects, and all prompt bytes outside the exact D-009
  correction allowlist.
- New `tests/fixtures/knowledge-seed-inventory.json`, existing `memory/*.md`,
  existing `memory/*.knowledge.jsonl`, and new `knowledge/` — complete audited
  field migration.
- `tests/sessions/knowledge.test.ts` ↔ delete
  `lib/sessions/knowledge.ts`; update `lib/sessions/index.ts` and
  `lib/sessions/types.ts` — retire JSONL API/types after B-003 evidence moves.
- `tests/prompts/archive-skill.test.ts` ↔
  `bundled/coding/prompts/distiller.md`,
  `bundled/coding/agents/distiller.ts`, and
  `domains/shared/skills/archive/SKILL.md` — unconditional OKF proposal guidance
  and legacy JSONL retirement per D-009 option A.
- `tests/prompts/archive-skill.test.ts` ↔ new
  `memory/agent/proposals/` backfill records/review index — 3-15 per derived
  slug plus human review evidence.
- `tests/tasks/file-system.test.ts`, `tests/cli/scaffold/subcommand.test.ts`, and
  `tests/plans/archive.test.ts` ↔ `lib/tasks/file-system.ts`,
  `cli/scaffold/commands/missions.ts`, `lib/plans/archive.ts`, and
  `domains/shared/extensions/plans/index.ts` — project layout/proposal readiness
  plus permitted live project-context correction.
- `tests/prompts/archive-skill.test.ts` ↔ `docs/memory.md`, `README.md`,
  `ROADMAP.md`, `AGENTS.md`, `domains/shared/skills/roadmap/SKILL.md`,
  `docs/designs/cosmo-ambient-assistant.md`, and permitted live cross-links in
  `missions/architecture/knowledge-and-memory.md` and
  `missions/architecture/code-structure-map.md` — update stale live pointers
  and document the ruled knowledge/trust surface. D-009 option A permits the
  corresponding project-context/doc corrections.
- `tests/extensions/agent-memory.test.ts` ↔ the explicit framework knowledge
  adapters, `domains/shared/extensions/agent-memory/index.ts`, and
  `docs/memory.md` — prove knowledge/memory reads, existing `remember` writes,
  and dedicated proposal writes use `MemoryStore`, with only machine knowledge
  output restricted to proposals; document generic Pi project tools and
  Codex/Claude backends as trusted, human-supervised, git-reviewed access
  outside INV-1/INV-2. Generic tool and external-backend source files are
  unchanged; no sandbox or disable mechanism is added.
- `fallow.toml` — declare only the new explicit framework extension entry
  points as dynamically loaded; add no suppression for core exports.

## Risks

- **R-001 — OFF-baseline scope drift (medium).** D-009 option A resolves the
  former blocking prompt collision. The remaining risk is allowing an
  unapproved prompt delta or accidentally exempting gated runtime output; the
  frozen gated-surface baseline plus exact correction allowlist must fail both.
  `review.md PR-002`.
- **R-002 — Governed/trusted boundary confusion (high).** D-010 option B
  resolves the former blocking all-tool/all-agent collision. Dedicated tools
  and framework pathways must still use `MemoryStore`, while documentation must
  state that generic tools and external backends are trusted and not sandboxed;
  neither side may be represented as the other. `review.md PR-001`.
- **R-003 — Migration completeness/semantics (high).** Missing fields or
  synthesized body changes fail AC-002. The full matrix and frozen hashes/IDs
  mitigate. Stop if a source cannot map without changing meaning; do not add a
  fifth type or consolidate. `review.md PR-006`.
- **R-004 — Proposal path escape (high).** Project-controlled symlinks could
  redirect a naive write. Realpath/non-symlink ancestor validation, exclusive
  atomic creation, and negative tests are mandatory. Generic-tool edits are the
  documented D-010 option B trust boundary, not a proposal-store escape defect.
- **R-005 — Duplicate tools/double injection (medium).** Explicit adapter
  placement, reserved recall, one WeakMap policy, absent-policy legacy behavior,
  and provider-visible tests own this. `review.md PR-003/PR-004/PR-007`.
- **R-006 — Distillation exfiltration (high).** Prompt prohibitions are not proof.
  Proposal-only output and task-local human diff approval own INV-5; rejected
  content is deleted, never promoted. `review.md PR-008`.
- **R-007 — Corpus scan cost (medium).** Prompt bytes are constant but full
  disk-authoritative scan IO grows. Stats remain visible; cache/embeddings are
  excluded. Stop and amend if measured enabled starts become unusable.
- **R-008 — Structural evidence absent (medium).** Analysis gates are unbound
  due to execution-not-consented; reviewer judgment must inspect retrieval,
  budget, policy, and path-authority centralization.

## Quality Contract

Plan-specific assertions:

1. Every frozen markdown and JSONL field/header/body maps exactly through Design
   §6; deleting any destination or `planTitle`/provenance field fails B-003.
2. Proposal traversal, absolute resource, missing provenance, wrong scope/type,
   symlink ancestor, collision, and interrupted-write mutations create neither
   curated nor partial files (B-002).
3. Initial CLI, switch, spawn, and package-host fixtures prove one reserved
   recall when enabled and an inert gated runtime when OFF: no gated discovery,
   tool, retrieval, context, store, or gated-adapter-attributable filesystem
   effect. Prompt bytes outside the exact distiller/archive/project-context
   correction allowlist remain identical (B-005/B-008/B-012).
4. Final provider-visible three-surface context, after every handler, is at most
   24,000 UTF-8 bytes; oversized bodies are absent and empty stores emit nothing
   (B-007).
5. Executable extension tests invoke the existing `remember`, framework
   knowledge/agent-memory recall and index paths, and the dedicated proposal
   operation. Every path calls the shared `MemoryStore` seam; `remember` keeps
   authored notes/profiles/playbooks in ordinary memory, while machine knowledge
   output creates only proposals. Shipped documentation explicitly identifies
   generic project tools and external backends as trusted, human-supervised,
   git-reviewed access outside that technical boundary and promises no sandbox
   (B-006).
6. Backfill completeness is computed from repository archive directories, each
   slug yields 3-15 proposals, config restores on failure/cancellation, and
   human no-verbatim approval is recorded before acceptance (B-010).
7. Static checks find no active JSONL writer/instruction, embeddings,
   consolidation, working state, episode/explicit-save change, retention, or
   default-ON setting.

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | All behavior tests plus project-native test, lint, and type-check evidence pass | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | All 12 behavior entries resolve to existing test files with exact markers | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Path authority, migration, budget, OFF gated-surface identity, correction-allowlist, backfill, and dedicated-path bypass negative cases survive realistic faults | pending | unbound globally; named negatives mandatory, reviewer judgment required |
| 4 | `duplication` | bindable | unbound | One knowledge parser/store/retrieval combiner/budget allocator/session policy | pending | execution not consented; reviewer judgment required |
| 5 | `complexity` | bindable | unbound | Store, allocator, policy, and adapters stay focused | pending | execution not consented; reviewer judgment required |
| 6 | `boundary-conformance` | bindable | unbound | `lib/memory/` stays Pi/config/domain independent; dedicated/framework pathways enforce D-010 option B and generic/external trust remains documentation-only | pending | execution not consented; reviewer judgment required |
| 7 | `dead-code` | bindable | unbound | JSONL API/types/tests are removed and explicit extension entries are reachable | pending | execution not consented; reviewer judgment required |

## Implementation Order

**Precondition 0 — human rulings (satisfied 2026-08-18).** D-009 option A and
D-010 option B are recorded verbatim in the Decision Log, their amended spec
letters carry supersession markers, and this revision applies the selected
mechanisms to B-003/B-006/B-008/B-009, design, files, risks, quality gates, and
implementation instructions. `review-3.md` records the required new review
round. No task or implementation is part of this revision.

Implementation stages remain:

1. **Characterize and freeze (B-003, B-008, B-012).** Capture effective prompts,
   real final tools, package discovery, current files, config behavior, seed
   hashes/headers/records, and repository-derived backfill inputs before
   production changes.
2. **Gate/session/package policy (B-005, B-007, B-008, B-012).** Test literal
   config, explicit adapter placement, reconstructed WeakMap policy, reserved
   recall, initial/switch/spawn loaders, config edits, and existing injector
   suppression one behavior at a time.
3. **Knowledge record/store core (B-001, B-002, B-004).** RED parser/path cases,
   then retrieval, then proposal derivation/containment/atomicity; refactor with
   disk-only truth.
4. **Recall and combined context (B-004-B-007).** Add shared result composition,
   knowledge recall, known agent-memory composition, metadata-only index, and
   final provider-visible allocator in that order. Apply D-010 option B at every
   dedicated/framework seam and document the generic/external trust boundary
   before claiming B-006; add no sandbox or tool/backend restriction.
5. **Distiller/proposal adaptation (B-002, B-009).** Apply D-009 option A
   unconditionally; test active guidance and tool authority before changing
   output. Do not implement consolidation or a second extractor.
6. **Atomic migration/retirement (B-003).** Generate and validate all
   destinations against the field matrix; update human-approved live pointers;
   then remove all 46 legacy files and session JSONL API/types/tests in the same
   slice. No temporary migration code survives.
7. **Backfill with review stop (B-010).** Execute the six-step temporary-gate
   procedure, validate 3-15 per repository-derived slug, restore config on every
   exit, and halt for human no-verbatim diff approval. Do not promote.
8. **Layout/docs (B-001, B-011).** Add only the scaffold/archive and pointer
   changes permitted by D-009 option A, keep user-home reads non-scaffolding,
   document the D-010 option B trust boundary, and keep the repo gate OFF.
9. **Integrated refactor/gates (B-001-B-012).** Run correctness and artifact
   conformance, manually inspect unbound structural gates, and verify every
   exclusion. Stop/amend rather than adding consolidation, embeddings, cache
   correctness state, retention, working state, sandboxing, or backend/tool
   restrictions.

Candidate task slices remain stages 1-2, 3, 4, 5, 6, 7, 8, and 9 (eight tasks).
Each worker owns named behaviors and runs RED → GREEN → REFACTOR; no stage
batches tests after implementation.
