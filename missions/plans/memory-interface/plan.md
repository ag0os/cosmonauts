---
title: Shared memory interface + plain-text substrate (agent-memory W1)
status: active
createdAt: '2026-07-07T00:48:01.000Z'
updatedAt: '2026-07-08T01:30:00.000Z'
---

## Overview

This is the implementation plan for agent-memory W1: extract the shared memory
interface now that two real retrieval implementations exist, retrofit the shipped
architecture-map retrieval path through that interface without changing generated
map behavior, and ship the thin authored `note` sliver for Cosmo.

The spec at `missions/plans/memory-interface/spec.md` is authoritative. This
plan preserves its ratified decisions without reopening them:

- plain-text first: markdown + YAML frontmatter, human-legible and prunable;
- OKF v0.1 serialization for records;
- cheap-to-expensive retrieval: scope, then recency, then explicit pull via
  `recall(query)`; embeddings are out of W1;
- scope × type taxonomy: `session | project | user` ×
  `semantic | procedural | episodic`; the implementation names the second axis
  `kind` to avoid colliding with OKF `type: note`;
- thin authored-record sliver is in scope, with Cosmo as the first consumer;
- sibling stores per scope, one interface: project records under the target
  repo's tracked `memory/`, user records under `~/.cosmonauts/`, architecture
  map remains under `memory/architecture/`;
- index-inject + pull recall model;
- project store is git-tracked by normal project workflow;
- the authored record type is `note`.

For traceability, the spec's acceptance-criteria bullets are numbered in order
for this plan:

| Source | Spec acceptance criterion summary |
|---|---|
| AC-001 | Retrofit invariant: architecture-map index injection and shard reads stay behavior-identical, while retrieval demonstrably flows through the shared interface. |
| AC-002 | The extracted interface has two real W1 implementations: architecture-map retrieval and the general markdown memory store. |
| AC-003 | Cosmo can save a `note` end-to-end as an OKF markdown record in the correct scope store and report what/where it saved. |
| AC-004 | A later session gets compact memory index context and can retrieve note detail via `recall(query)`. |
| AC-005 | Scope filtering holds for project and user records; session scope is implemented or skipped according to the Pi-First audit. |
| AC-006 | Human edits/deletions on disk are reflected by the next retrieval. |
| AC-007 | Compact indexes are most-recent-first. |
| AC-008 | Empty stores, no-match queries, and malformed records produce honest non-fatal results. |
| AC-009 | Pi-First audit document exists and gates session/short-term machinery. |
| AC-010 | `consolidate()` exists and honestly reports its W1 no-op behavior. |
| AC-011 | Project gates pass with no model calls in the suite. |

No tasks are created by this plan. The next stage may turn this implementation
order into plan-linked tasks after review/approval.

**Review revision 2026-07-07:** this plan incorporates the plan-reviewer findings
in `missions/plans/memory-interface/review.md`: factory-time memory tool
registration for Pi allowlists, guarded execution for non-Cosmo sessions, typed
architecture adapter seams, root-shard/resource-alias preservation, absent-map
inertness, explicit store/frontmatter scope mismatch handling, UTF-8-safe index
truncation, and Drive artifact-commit mitigations.

## Architecture Context

Source-of-truth records:

- `missions/architecture/agent-memory.md` defines the shared memory ancestor:
  `write(record)` / `retrieve(scope, query)` / `consolidate()`, plain-text OKF
  records, scope-first retrieval, compact index + detail pull, and a Pi-First
  audit before short-term/session machinery.
- `missions/architecture/architectural-memory.md` defines the sibling
  architecture-memory track and states that W1 shipped `memory/architecture/`
  and should route future retrieval through the shared interface instead of
  building a second mechanism.
- `memory/code-structure-map.md` records shipped patterns and gotchas: the
  architecture map is generated derived state, extension injection is already
  index-then-detail, generation/storage/viewer must remain unchanged here,
  extension auto-load must be inert outside intended consumers, and Drive source
  commits may omit plan-local `missions/**` artifacts. Current driver code also
  excludes `memory/**`, so both B-001's audit artifact and project memory files
  need explicit post-run git-status handling.

Existing boundaries to preserve:

- `lib/architecture-map/generator.ts`, `lib/architecture-map/store.ts`, the CLI
  generation path, and the artifact viewer are out of scope. This plan changes
  the architecture map's retrieval path only.
- `lib/architecture-map/*` remains independent of CLI, domains, Pi runtime,
  tasks, plans, orchestration, and the viewer. It may depend on the new inward
  shared `lib/memory` contracts because those contracts are the common ancestor.
- Domain extensions are edges. `domains/shared/extensions/architecture-memory` and
  the new `domains/shared/extensions/agent-memory` may import `lib/memory` and
  domain-neutral core modules; no `lib/memory` module may import a domain
  extension or Pi runtime.
- Correctness must be reconstructed from persisted records and current disk
  state. No cache, in-memory map, or "latest record" tracker may decide scope,
  freshness, or recall correctness after a restart.

## Behaviors

### B-001 - Pi-First audit gates session-scope machinery

- Source: AC-009
- Context: implementation starts before any session-scoped memory store or
  scratchpad machinery exists
- Action: the implementer audits Pi's session JSONL, compaction,
  `pi.appendEntry()`, `ctx.sessionManager`, and session/fork/compact lifecycle
  hooks, then writes the findings
- Expected: `missions/plans/memory-interface/pi-first-session-memory-audit.md`
  states the evidence and an explicit W1 recommendation. The planned default is:
  do not build a session-scoped markdown store in W1; rely on Pi session state and
  compaction for short-term/session continuity, while keeping `session` in the
  shared scope vocabulary and returning `skippedScopes: [{ scope: "session", ... }]`
  if a W1 caller asks for it. If the audit evidence contradicts this, pause and
  revise the plan before building session storage.
- Seam: `missions/plans/memory-interface/pi-first-session-memory-audit.md`
- Test: `missions/plans/memory-interface/pi-first-session-memory-audit.md` >
  `Session-scope recommendation gates W1 implementation`
- Marker: `@cosmo-behavior plan:memory-interface#B-001`

### B-002 - Shared memory interface has two concrete W1 stores

- Source: AC-002
- Context: the interface is extracted under `lib/memory/` and both W1 consumers
  are wired to it
- Action: tests instantiate the general markdown memory store and the
  architecture-map retrieval adapter through the same interface
- Expected: both expose `write(record)`, `retrieve(scope, query)`, and
  `consolidate()`; the markdown store exercises real note writes and retrieval;
  the architecture adapter exercises real map retrieval, returns empty results
  when `project` is not an eligible scope, and honestly reports unsupported writes
  because generated-map writes remain owned by `generateArchitectureMap`
- Seam: `lib/memory/types.ts`
- Test: `tests/memory/interface.test.ts` >
  `exercises the shared write retrieve consolidate contract with markdown and architecture stores`
- Marker: `@cosmo-behavior plan:memory-interface#B-002`

### B-003 - Architecture-map index injection is preserved through the interface

- Source: AC-001
- Context: a consuming coding agent starts in either an unmapped project or a
  mapped project whose architecture directory exists
- Action: `domains/shared/extensions/architecture-memory` prepares architecture
  context using the architecture memory adapter
- Expected: if `memory/architecture/` is absent, no map context is injected and
  `architecture_map_read` answers with the honest missing-map result. If the
  directory exists, the hidden context still contains the compact architecture
  index, current/stale/missing freshness banner, non-accumulating custom message
  behavior, and the instruction to use `architecture_map_read`. Tests prove the
  extension no longer reads the index through a parallel retrieval path by
  injecting a spy `MemoryStore` through the extension deps and asserting every
  read flows through it. *(Revised 2026-07-08 after review: tool registration
  moves to factory time — see B-015 — so absent-directory inertness now means
  no injection plus honest tool results, not absent registration.)*
- Seam: `domains/shared/extensions/architecture-memory/index.ts`
- Test: `tests/extensions/architecture-memory.test.ts` >
  `injects architecture index through a spy memory store while absent directories stay injection-inert`
- Marker: `@cosmo-behavior plan:memory-interface#B-003`

### B-004 - Architecture-map shard reads are preserved through the interface

- Source: AC-001
- Context: a mapped project has generated shards including
  `memory/architecture/modules/lib/agents.md` and may have the valid root-resource
  shard `memory/architecture/modules/root.md`
- Action: a consuming agent calls `architecture_map_read` with no module, with
  `module: "lib/agents"`, with the deprecated `resource: "lib/agents"` alias,
  with `module: "."`, with an unknown module, and with traversal-like input
- Expected: results match pre-retrofit behavior: index reads by default, shard
  reads by module resource, the deprecated `resource` alias remains accepted,
  `module: "."` maps to `modules/root.md`, unknown modules list available
  resources from shard frontmatter, malformed unrelated shards do not break valid
  reads, and unsafe resources are rejected
- Seam: `lib/architecture-map/retrieval.ts`
- Test: `tests/extensions/architecture-memory.test.ts` >
  `architecture_map_read uses memory interface and preserves shard alias root and failure behavior`
- Marker: `@cosmo-behavior plan:memory-interface#B-004`

### B-005 - Cosmo can save an authored note visibly

- Source: AC-003
- Context: Cosmo is running in a project and decides to save a user-provided fact
  as project-scoped or user-scoped memory
- Action: Cosmo calls `remember` with note content, title/description, scope, and
  optional tags/kind
- Expected: a markdown record is written through a markdown-store instance bound
  to Pi `ctx.cwd` and the configured/default user Cosmonauts root; the file lands
  under the correct sibling store with OKF-required frontmatter, `type: note`,
  custom `scope` and `kind` fields, and body content; the tool result states the
  saved title, scope, and human-readable path
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `remember writes a scoped OKF note and reports the saved path`
- Marker: `@cosmo-behavior plan:memory-interface#B-005`

### B-006 - Cosmo receives a compact memory index in a later session

- Source: AC-004
- Context: a previous session wrote one or more eligible note records and a new
  `main/cosmo` session starts in the same project
- Action: the agent-memory extension handles `before_agent_start`
- Expected: Cosmo receives one hidden, non-accumulating compact memory index
  built from current disk records, scoped to project plus user records, and
  instructing Cosmo to use `recall(query)` for details; absent/empty stores inject
  nothing and create no files
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `injects one non accumulating scoped memory index for Cosmo`
- Marker: `@cosmo-behavior plan:memory-interface#B-006`

### B-007 - `recall(query)` pulls matching note detail

- Source: AC-004
- Context: project and user stores contain several notes with different
  timestamps and text/tags
- Action: Cosmo calls `recall` with a query string
- Expected: matching records from eligible scopes are returned with full detail,
  path, scope, kind, and timestamp; a query matching nothing returns an honest
  empty result naming searched scopes
- Seam: `lib/memory/markdown-store.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `recall returns matching note detail from eligible scopes`
- Marker: `@cosmo-behavior plan:memory-interface#B-007`

### B-008 - Scope filtering prevents cross-project leaks

- Source: AC-005
- Context: one project has a project-scoped note, the user store has a
  user-scoped note, and a second project starts a session for the same user
- Action: each project retrieves/injects memory through the shared store
- Expected: the first project sees its project note plus the user note; the
  second project sees the user note but not the first project's project note;
  records whose frontmatter `scope` conflicts with their physical store are
  treated as malformed and skipped with a warning; session scope is either
  implemented according to the audit or, under the planned W1 audit result,
  appears in `skippedScopes` and surfaces no cross-session records
- Seam: `lib/memory/paths.ts`
- Test: `tests/memory/markdown-store.test.ts` >
  `filters project user and skipped session scopes before retrieval`
- Marker: `@cosmo-behavior plan:memory-interface#B-008`

### B-009 - Human edits and deletions are respected on next retrieval

- Source: AC-006
- Context: a note file was written, then the human edits its markdown body or
  deletes the file outside Cosmonauts
- Action: the next `retrieve()`/`recall()`/index build runs
- Expected: the edited body/frontmatter are returned as edited; the deleted note
  is absent from the compact index and recall results. No process-local cache may
  preserve stale note content as the source of truth.
- Seam: `lib/memory/markdown-store.ts`
- Test: `tests/memory/markdown-store.test.ts` >
  `reflects edited and deleted note files on the next retrieval`
- Marker: `@cosmo-behavior plan:memory-interface#B-009`

### B-010 - Empty, no-match, malformed, and scope-mismatched stores fail honestly

- Source: AC-008
- Context: the memory store is absent, empty, has no query match, contains one
  malformed markdown/frontmatter file beside healthy notes, or contains a record
  whose frontmatter scope conflicts with its physical store
- Action: retrieval runs
- Expected: absent/empty stores return no records and do not scaffold files;
  no-match returns an honest empty result naming scopes searched; malformed and
  scope-mismatched files are skipped with warnings naming the files while healthy
  records still return
- Seam: `lib/memory/okf.ts`
- Test: `tests/memory/markdown-store.test.ts` >
  `returns honest empty results and malformed record warnings without scaffolding`
- Marker: `@cosmo-behavior plan:memory-interface#B-010`

### B-011 - Consolidation is an explicit W1 no-op

- Source: AC-010
- Context: callers can invoke `consolidate()` on a W1 memory store
- Action: `consolidate()` runs against both the general markdown store and the
  architecture-map adapter
- Expected: it returns an explicit no-op result explaining that W1 performs no
  background consolidation, pruning, decay, or dreaming; record files and indexes
  are not modified by consolidation
- Seam: `lib/memory/types.ts`
- Test: `tests/memory/interface.test.ts` >
  `consolidate reports an honest W1 no-op for markdown and architecture stores`
- Marker: `@cosmo-behavior plan:memory-interface#B-011`

### B-012 - Agent-memory tools are allowlisted but guarded outside Cosmo

- Source: AC-004
- Context: Pi builds the session tool allowlist before `before_agent_start`, and
  shared extensions can be auto-loaded by package hosts or attached to other
  agents
- Action: the agent-memory extension registers tool names at factory load, then
  `before_agent_start` runs for `main/cosmo`, then for a non-Cosmo identity in
  the same extension instance, and the non-Cosmo session attempts to call
  `remember`/`recall`
- Expected: `remember` and `recall` are present in Cosmo's real allowlist, but
  execution is session/turn-authorized: non-Cosmo calls return an unauthorized
  result, inject no memory context, create no stores, and cannot inherit Cosmo's
  prior authorization state
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `memory tools are factory registered for allowlist but guarded after non Cosmo turns`
- Marker: `@cosmo-behavior plan:memory-interface#B-012`

### B-013 - Memory index injection obeys a UTF-8-safe independent byte budget

- Source: AC-004
- Context: eligible note records, including multi-byte text, would produce an
  oversized compact index
- Action: the agent-memory extension builds Cosmo's hidden index context
- Expected: the injected message is at most 12,000 UTF-8 bytes including header
  and truncation footer, never exceeds budget because of a split multi-byte
  character, preserves scope/freshness honesty for the included excerpt, and
  tells Cosmo to use `recall(query)` for full detail. This budget is independent
  from the existing architecture-map 24,000-byte budget because W1 has disjoint
  consumers; any future agent that consumes both must reassess the combined
  budget.
- Seam: `domains/shared/extensions/agent-memory/index.ts`
- Test: `tests/extensions/agent-memory.test.ts` >
  `truncates multibyte memory index within its independent byte budget and points to recall`
- Marker: `@cosmo-behavior plan:memory-interface#B-013`

### B-014 - Compact memory indexes are most-recent-first

- Source: AC-007
- Context: eligible project and user notes have different OKF `timestamp` values
- Action: the markdown store builds the compact index used for injection
- Expected: index entries appear most-recent-first by timestamp, with path as a
  deterministic tie breaker; no automatic decay or pruning is applied in W1
- Seam: `lib/memory/markdown-store.ts`
- Test: `tests/memory/markdown-store.test.ts` >
  `builds compact indexes most recent first`
- Marker: `@cosmo-behavior plan:memory-interface#B-014`

### B-015 - `architecture_map_read` is present in real session allowlists

*(Added 2026-07-08 after review.)*

- Source: AC-001
- Context: real Cosmonauts sessions freeze the tool allowlist via
  `buildToolAllowlist()` at session creation, before `before_agent_start`, and
  Pi 0.79.8's `_refreshToolRegistry` filters runtime-registered tools against
  that frozen list. The shipped extension registers `architecture_map_read`
  only inside `before_agent_start`, so the tool is filtered out of every real
  session today — a latent shipped defect the retrofit must fix, not preserve
- Action: the architecture-memory extension registers `architecture_map_read`
  at extension factory load; execution behavior is otherwise unchanged
- Expected: `buildToolAllowlist` output for agent definitions that load the
  architecture-memory extension includes `architecture_map_read`; mapped-project
  behavior is unchanged; in unmapped projects the tool returns the honest
  missing-map result instead of being unregistered
- Seam: `domains/shared/extensions/architecture-memory/index.ts`
- Test: `tests/domains/coding-agents.test.ts` >
  `architecture_map_read is allowlisted for consuming agents`
- Marker: `@cosmo-behavior plan:memory-interface#B-015`

## Design

### Boundary model

Create a new domain-neutral core module under `lib/memory/`. This is the answer
to the spec's interface-location open question: the extracted interface lives in
`lib/` because it is shared substrate, not a capability owned by Cosmo or the
coding domain. Domain extensions consume it at the edge.

Responsibilities:

- `lib/memory/types.ts` — shared contracts only: scopes, memory kinds, record
  drafts, retrieval query/result shapes, skipped-scope reporting, and the
  `MemoryStore` interface.
- `lib/memory/okf.ts` — OKF v0.1 markdown/frontmatter parse/render/validation for
  authored records. It has no filesystem or Pi imports.
- `lib/memory/paths.ts` — project/user store path resolution and safe relative
  path helpers. It owns the W1 store layout and the invariant that physical store
  scope and frontmatter scope must match.
- `lib/memory/markdown-store.ts` — general-memory plain-text store for authored
  `note` records. It owns filesystem IO for project/user stores.
- `lib/memory/index.ts` — public exports; add this to `fallow.toml` public entry
  points.
- `lib/architecture-map/retrieval.ts` — architecture-map adapter implementing
  the shared interface for the shipped generated map retrieval path. It imports
  `lib/memory` contracts and existing architecture-map config/freshness helpers.
- `domains/shared/extensions/architecture-memory/index.ts` — Pi edge that keeps
  the existing `architecture_map_read` tool and index injection but delegates
  reads to the adapter.
- `domains/shared/extensions/agent-memory/index.ts` — Pi edge for Cosmo's
  `remember` and `recall` tools plus compact note-index injection.

Dependency direction:

- `lib/memory/*` must not import Pi, CLI, domains, tasks, plans, orchestration,
  architecture-map, or artifact-viewer modules.
- `lib/architecture-map/retrieval.ts` may import `lib/memory` contracts and
  existing architecture-map config/freshness helpers; generation, storage, and
  viewer modules must not import it.
- Extensions may import both `lib/memory` and `lib/architecture-map/retrieval.ts`.

### Shared interface contract

Implement the interface with simple data shapes rather than a registry or class
hierarchy. W1 has exactly two concrete stores, so avoid domain-registration
machinery until W2 proves it is needed.

```ts
export type MemoryScopeName = "session" | "project" | "user";
export type MemoryKind = "semantic" | "procedural" | "episodic";

export interface MemoryScopeContext {
  readonly projectRoot: string;
  readonly scopes: readonly MemoryScopeName[];
  readonly sessionId?: string;
}

export interface MemoryRecordDraft {
  readonly type: string; // W1 authored records use exactly "note".
  readonly scope: MemoryScopeName;
  readonly kind: MemoryKind;
  readonly title: string;
  readonly description: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly timestamp?: string;
  readonly source?: string; // e.g. "main/cosmo".
}

export interface MemoryQuery {
  readonly text?: string;
  readonly recordTypes?: readonly string[];
  readonly resource?: string;
  readonly limit?: number;
}

export interface RetrievedMemoryRecord {
  readonly type: string;
  readonly scope: MemoryScopeName;
  readonly kind?: MemoryKind;
  readonly title: string;
  readonly description: string;
  readonly resource: string;
  readonly tags: readonly string[];
  readonly timestamp: string;
  readonly content: string;
  readonly path: string;
}

export interface MemoryWarning {
  readonly path?: string;
  readonly message: string;
}

export interface MemorySkippedScope {
  readonly scope: MemoryScopeName;
  readonly reason: string;
}

export interface MemoryRetrieveResult {
  readonly records: readonly RetrievedMemoryRecord[];
  readonly searchedScopes: readonly MemoryScopeName[];
  readonly skippedScopes: readonly MemorySkippedScope[];
  readonly warnings: readonly MemoryWarning[];
  readonly details?: unknown;
}

export type MemoryWriteResult =
  | { readonly kind: "written"; readonly path: string; readonly record: RetrievedMemoryRecord }
  | { readonly kind: "unsupported"; readonly reason: string }
  | { readonly kind: "failed"; readonly reason: string; readonly path?: string };

export type MemoryConsolidateResult = { readonly kind: "noop"; readonly reason: string };

export interface MemoryStore {
  write(record: MemoryRecordDraft): Promise<MemoryWriteResult>;
  retrieve(scope: MemoryScopeContext, query: MemoryQuery): Promise<MemoryRetrieveResult>;
  consolidate(): Promise<MemoryConsolidateResult>;
}
```

Notes on the contract:

- `retrieve(scope, query)` keeps the spec's signature shape. The `scope` object
  carries the project root and eligible scopes so implementations can filter
  before parsing/scoring.
- `recordTypes` is how W1 consumers declare their vocabulary: Cosmo asks for
  `note`, architecture-map retrieval asks for `code-structure-index` or
  `code-structure-module`.
- `skippedScopes` is the owner for audit-gated session-scope behavior; W1 callers
  must not silently drop `session` if it was requested but not implemented.
- `details` is allowed only for adapter-specific typed metadata that callers
  already expose today, such as architecture freshness. Domain-neutral behavior
  must live in the typed fields, warnings, or skipped scopes.
- `write()` unsupported on the architecture adapter is an honest derived-store
  contract, not a placeholder. Generated architecture map writes stay owned by
  `generateArchitectureMap`.
- *(Added 2026-07-08 after review.)* An absent or empty `MemoryQuery.text`
  means **match all eligible records** (list mode) — the path compact-index
  building (B-006, B-014) relies on. The `recall` tool itself requires
  non-empty query text at the tool layer; only internal callers use list mode.
- *(Added 2026-07-08 after review.)* `MemoryWriteResult`'s `failed` arm is
  reachable (unwritable store, permission error) and must be honest: `remember`
  reports the failure with path and reason, leaves no partial record file, and
  the session continues. It is not a placeholder.
- *(Added 2026-07-08 after review.)* `MemoryConsolidateResult` is deliberately
  the `noop` shape alone in W1 — a `consolidated` variant would be unreachable
  scaffolding for W4 and violates this plan's own dead-code gate. W4 widens the
  union when real consolidation behavior exists.

### Store factories and root binding

Write-side paths are bound at store construction, not guessed inside
`write(record)`:

```ts
export interface MarkdownMemoryStoreOptions {
  readonly projectRoot: string;
  /** Path to the user's Cosmonauts root; defaults to join(homedir(), ".cosmonauts"). */
  readonly userCosmonautsRoot?: string;
  readonly now?: () => Date;
}

export function createMarkdownMemoryStore(
  options: MarkdownMemoryStoreOptions,
): MemoryStore;
```

Definitions:

- `projectRoot` is the active Pi `ctx.cwd` for the session/tool execution.
- `userCosmonautsRoot` means the `~/.cosmonauts` directory itself, not the final
  `memory/agent` directory. The user store is resolved as
  `<userCosmonautsRoot>/memory/agent/`.
- Tests inject a temp `userCosmonautsRoot` so they never touch the real home
  directory.
- `retrieve(scope, query)` should use the bound project/user roots and validate
  that `scope.projectRoot` matches the bound project root; a mismatch is a caller
  error in tests, not an alternate lookup mode.

Architecture retrieval has its own factory:

```ts
export interface ArchitectureMapMemoryDeps {
  readonly loadConfig: (projectRoot: string) => Promise<ArchitectureMapConfig>;
  readonly analyzer: Pick<SourceAnalyzer, "getConfigInputs">;
  readonly checkFreshness: (options: {
    readonly projectRoot: string;
    readonly config: ArchitectureMapConfig;
    readonly analyzer: Pick<SourceAnalyzer, "getConfigInputs">;
  }) => Promise<ArchitectureMapFreshness>;
}

export type ArchitectureMapRetrieveStatus =
  | "index"
  | "module"
  | "unknown-module"
  | "unsafe-resource"
  | "missing-index"
  | "scope-ineligible";

export interface ArchitectureMapRetrieveDetails {
  readonly kind: "architecture-map";
  readonly status: ArchitectureMapRetrieveStatus;
  readonly freshness: ArchitectureMapFreshness;
  readonly resource?: string;
  readonly path?: string;
  readonly availableModules?: readonly string[];
}

export function createArchitectureMapMemoryStore(
  deps?: ArchitectureMapMemoryDeps,
): MemoryStore;
```

The default deps mirror the current extension deps:
`loadArchitectureMapConfig`, `typescriptSourceAnalyzer`, and
`checkArchitectureMapStatFreshness`. Tests can inject the deps exactly as the
existing architecture-memory extension tests do.

### Store layout and OKF record shape

Use sibling stores:

- Project store: `<projectRoot>/memory/agent/`
- User store: `~/.cosmonauts/memory/agent/`
- Architecture map store: unchanged, `<projectRoot>/memory/architecture/`

General-memory authored notes live under `notes/` in their scope store:

- project note: `memory/agent/notes/<timestamp>-<slug>-<hash>.md`
- user note: `~/.cosmonauts/memory/agent/notes/<timestamp>-<slug>-<hash>.md`

`index.md` is a progressive-disclosure index per store. It is regenerated on
writes for human browsing. Retrieval and injection do not trust a stale
`index.md`; they scan current note files so human edits/deletions are respected
without relying on process state. The general store's `index.md` is not an
authored memory record, is never returned by `retrieve()`, and does not introduce
a second authored record type; W1 authored records are exactly `type: note`.

`index.md` determinism *(Added 2026-07-08 after review)*: because the project
store is git-tracked, `index.md` content must be a pure function of the current
record set — no generation timestamps or volatile keys. Regenerating it with an
unchanged record set is byte-identical, and a no-op write rewrites nothing.
This is the same tracked-derived-churn rule the architecture map needed
(timestamp inheritance); tests cover idempotent regeneration.

Authored note frontmatter contract:

```md
---
type: note
title: Staging deploy branch
description: Staging deploys happen from the release branch.
resource: memory/agent/notes/20260707T010203000Z-staging-deploy-1a2b3c4d.md
tags: [agent-memory, note, deploy]
timestamp: '2026-07-07T01:02:03.000Z'
scope: project
kind: semantic
source: main/cosmo
---

Staging deploys happen from the `release` branch.
```

Rules:

- W1 writes exactly `type: note` for authored records.
- `scope` and `kind` are custom OKF-compatible keys that carry the ratified
  scope × type taxonomy without overloading OKF's `type` key.
- Physical store scope and frontmatter `scope` must match. A project-store file
  with `scope: user`, or a user-store file with `scope: project`, is malformed
  and skipped with a warning. Store location decides eligibility; frontmatter
  cannot upgrade or leak a record across scopes.
- Missing required OKF fields, unsupported `type`, invalid scope/kind,
  store/frontmatter scope mismatch, or unparseable frontmatter make a file
  malformed. Retrieval skips it and returns a warning naming the file.
- The project store is git-trackable because it lives under the target repo's
  `memory/`. Do not add ignore rules. The known Drive commit exclusion for
  `memory/**` is an operational risk, not a reason to change the store path.

### General-memory retrieval

The markdown store applies filters in this order:

1. Scope eligibility from `MemoryScopeContext.scopes`.
2. Existing store directories only. Missing stores return empty results and do
   not create directories.
3. Record file scan under `notes/**/*.md`, excluding `index.md`.
4. OKF validation, including physical-store/frontmatter scope match; malformed
   files become warnings, not thrown errors.
5. Query matching over lowercase title, description, tags, resource, and body.
   Absent/empty `text` matches all eligible records (list mode).
6. Recency ordering by `timestamp` descending, with `path` as deterministic tie
   breaker.
7. Optional `limit` truncation.

This is deliberately cheap. No embeddings, SQLite, decay, pruning, or relevance
push gate is introduced in W1.

Result bounds *(Added 2026-07-08 after review)*: the `recall` tool defaults
`limit` to 5 and caps a caller-supplied `limit` at 20, because it returns full
record bodies — an unbounded broad-query result would dwarf the budgeted index
injection and pollute context, the exact failure the track exists to prevent.
The honest-empty and searched-scopes reporting is unaffected. Internal
list-mode callers (index building) pass their own explicit limit.

Cost stance *(Added 2026-07-08 after review)*: retrieval and index building
re-scan and re-parse every note file in eligible stores on each call — per
agent turn for injection. This is accepted for W1 scale and documented in
`docs/memory.md`; there is no cache to invalidate, which is what makes human
edits/deletions trustworthy (B-009). W1 never deletes records, so the cost
curve only rises: the W2/reassess gate must revisit scan cost (consolidation,
caching, or store caps) before memory stores grow into the hundreds of records.

### Architecture-map retrieval retrofit

Add `lib/architecture-map/retrieval.ts` as the only architecture-map core change
besides exports. It should move the retrieval logic currently embedded in
`domains/shared/extensions/architecture-memory/index.ts` behind the shared
interface:

- load architecture-map config through injected/default `loadConfig`;
- check turn-time freshness through injected/default `checkFreshness` using the
  injected/default analyzer; the default remains `checkArchitectureMapStatFreshness`,
  not the content-hash freshness path;
- return empty `scope-ineligible` details if `MemoryScopeContext.scopes` omits
  `project`, because architecture-map records are project-scoped;
- read `memory/architecture/index.md` for index retrieval;
- map a module resource to `memory/architecture/modules/<resource>.md`, with the
  shipped special case `resource === "."` → `memory/architecture/modules/root.md`;
- preserve the deprecated tool parameter alias by normalizing `resource` to the
  same query field as `module` in the extension before calling the adapter;
- validate resources against traversal and absolute paths;
- list available modules by scanning shard frontmatter, not by trusting index
  text;
- return typed `ArchitectureMapRetrieveDetails` so the extension can render the
  same missing/stale/unknown/unsafe messages and details shape it exposes today.

Allowlist decision *(Added 2026-07-08 after review)*: real Cosmonauts sessions
freeze the tool allowlist via `buildToolAllowlist()` at session creation —
verified against Pi 0.79.8 (`agent-session.js` `_refreshToolRegistry` filters
runtime-registered tools against the frozen `allowedToolNames`) and against
`lib/orchestration/definition-resolution.ts:45` (only factory-time extension
tool names are unioned in). The shipped lazy `ensureToolRegistered` therefore
leaves `architecture_map_read` out of every real session allowlist today — a
latent shipped defect. This retrofit **fixes** it rather than preserving it:
`architecture_map_read` is registered at factory load, the same treatment as
`remember`/`recall` (B-015). The spec's retrofit invariant is read against the
spec's intended behavior ("five consuming agents can pull shards on demand"),
which the shipped code does not actually deliver in real sessions.

Absent-project behavior accordingly becomes: if `memory/architecture/` does not
exist, `before_agent_start` injects nothing, and the (factory-registered) tool
answers with the honest missing-map result. The one pre-existing test asserting
absent-directory *non-registration* is updated to assert this new contract —
the single documented exception to the no-substantive-test-rewrite rule. A
present directory with missing index/fingerprint still goes through the adapter
and renders the existing `missing` freshness/banner behavior.

Delegation proof seam *(Added 2026-07-08 after review)*: the extension deps
gain an injectable adapter factory (`createStore?: (deps) => MemoryStore`,
defaulting to `createArchitectureMapMemoryStore`), so B-003's "no parallel
retrieval path" claim is proven by injecting a spy `MemoryStore` and asserting
all index/shard reads flow through it — an executable test, not a review-only
promise.

Do not touch `generateArchitectureMap`, `storeArchitectureMapBundle`, CLI
subcommands, or the artifact viewer in this slice.

### Agent-memory extension and Cosmo wiring

Create `domains/shared/extensions/agent-memory/index.ts` and add
`"agent-memory"` to `domains/main/agents/cosmo.ts` only. Do not add it to coding
agents or Cody in W1.

Pi tool-allowlist constraint: real Cosmonauts sessions call
`buildToolAllowlist()` before `before_agent_start`; tool names registered only
inside `before_agent_start` are not allowlisted. Therefore `agent-memory` must
register `remember` and `recall` at extension factory load so the names are
present in `loader.getExtensions().extensions` and in Cosmo's real allowlist.

Authorization/gating rules:

- Factory-time registration is for allowlisting only; it is not permission.
- Maintain a session/turn-local `activeAgentId` or boolean authorization value in
  the extension closure.
- Reset authorization to false on `session_start` and `session_shutdown`.
- On every `before_agent_start`, set authorization to true only when the runtime
  identity marker is exactly `main/cosmo`; set it false for every other marker or
  missing marker.
- `remember` and `recall` execute only when authorization is currently true.
  Unauthorized calls return a text result explaining that agent memory is
  available only to `main/cosmo`; they do not create stores, scan stores, or write
  files.

Extension construction seam *(Added 2026-07-08 after review)*: export
`createAgentMemoryExtension(deps?)` mirroring the shipped
`createArchitectureMemoryExtension(deps)` pattern, with injectable
`userCosmonautsRoot`, `storeFactory` (defaults to `createMarkdownMemoryStore`),
and `now`. The default export wires production defaults
(`homedir()/.cosmonauts`). Extension tests inject a temp `userCosmonautsRoot`
through this seam so they can never write into the maintainer's real home
store; production and tests thereby agree on how the user root is resolved.

Tools:

- `remember` writes an authored `note` through a `createMarkdownMemoryStore({
  projectRoot: ctx.cwd, userCosmonautsRoot })` instance. Parameters: `content`
  (required), optional `title`, `description`, `scope` (`project | user`, default
  chosen by Cosmo/tool guidance as project for project-specific facts), optional
  `kind` (`semantic | procedural | episodic`, default `semantic`), optional
  `tags`.
- Omitted-field defaults *(Added 2026-07-08 after review)* — a minimal
  `remember({ content })` call is supported and deterministic: `title` defaults
  to the first line of `content` trimmed to 60 characters; `description`
  defaults to the derived title; `tags` defaults to `[]`; `scope` defaults to
  `project`; `kind` defaults to `semantic`; `timestamp` comes from the injected
  `now()`. No omitted field may produce an OKF-invalid record; B-005's test
  covers the minimal-call path. Write failures (unwritable store, permission
  error) return the `failed` result honestly, leave no partial file, and are
  covered beside B-010's failure cases.
- `recall` pulls details through the same factory-bound store with `recordTypes:
  ["note"]` and current eligible scopes (`project`, `user` in W1). It requires
  non-empty query text, defaults `limit` to 5, and caps it at 20 (see General-
  memory retrieval result bounds).
- Prompt-surface minimization *(Added 2026-07-08 after review)*: factory-time
  registration means external Pi hosts that auto-load
  `domains/shared/extensions` expose these tools to every agent. Execution
  stays guarded (B-012), and the exposure is kept minimal: short descriptions,
  no `promptSnippet`. Cosmo does not need a snippet — the injected memory index
  already points at `recall`, and the Cosmo prompt covers `remember`. This is
  an accepted, documented trade-off: allowlist correctness requires factory
  registration; two guarded, quiet tools in foreign hosts is the cost.

Injection:

- On `before_agent_start`, build a hidden custom message with custom type
  `agent-memory-context` only for `main/cosmo` and only when eligible records
  exist.
- On `context`, remove older `agent-memory-context` messages so repeated turns do
  not accumulate stale indexes.
- The index message lists recent records with title, scope, kind, timestamp,
  description, and path; it never includes all record bodies. The index build
  uses list-mode retrieval (no query text) with an explicit limit of the 50
  most recent records before byte-budget truncation, so entry count and byte
  budget are both bounded. *(Limit added 2026-07-08 after review.)*
- Empty or absent stores inject nothing and create no files.

Update `domains/main/prompts/cosmo.md` minimally so Cosmo knows saving is
explicit and visible: use `remember` only for things worth keeping, prefer
project scope for project facts, user scope for cross-project preferences, and
state what was saved and where.

### Session-scope decision

Based on the Pi API and local Pi docs already reviewed for planning, W1 should
not build a session-scoped markdown store by default:

- Pi sessions persist JSONL entries, custom extension entries, custom messages,
  branch summaries, and compactions.
- `pi.appendEntry()` and `ctx.sessionManager.getEntries()`/`getBranch()` already
  cover session-local extension state when needed.
- Pi compaction is the active short-term/session context mechanism.

The implementation still must create the audit artifact first (B-001). If the
audit finds a real W1 gap that Pi does not cover, stop and revise the plan rather
than silently adding session-store machinery. Under the planned audit result,
`session` remains a type-level scope for future W3/W4 work, but `remember` does
not expose it and `retrieve()` returns `skippedScopes: [{ scope: "session",
reason: "Session-scoped markdown memory is not built in W1; Pi session state and
compaction cover short-term memory." }]` if a caller includes it.

### Injection byte budget

Use an independent 12,000-byte UTF-8 budget for the general memory index.

Rationale:

- The existing architecture-map budget remains 24,000 bytes and is behaviorally
  preserved.
- W1 consumers are disjoint: architecture map injects into five coding agents;
  general memory injects into `main/cosmo` only.
- The general memory index is only a recall hint; detail is pulled with
  `recall(query)`, so it should stay smaller than the architecture map's code
  inventory.

Implementation rule: budget includes header and truncation footer. Do not copy a
raw byte-slice truncator that can split a UTF-8 sequence and then expand via
U+FFFD. Use a UTF-8-safe truncation helper: truncate by code points/grapheme
iteration or decrement the byte slice until `Buffer.byteLength(rendered, "utf-8")`
is within budget after decoding. The footer must say the index was truncated and
direct Cosmo to `recall(query)` for detail. If a future plan adds an agent that
consumes both indexes, that plan must reassess a combined budget instead of
inheriting the independent defaults.

### State ownership and failure handling

- Source of truth is disk. The store may build short-lived arrays while scanning,
  but no persisted correctness decision depends on process-local state.
- `agent-memory-context` and `architecture-map-context` are transient custom
  messages with context filters that prevent accumulation.
- The only in-memory state in `agent-memory` is session/turn authorization for
  already-registered tools. It is reset on session lifecycle events and on every
  `before_agent_start`; it never decides record eligibility or recall content.
- No W1 state has a pending lifecycle. `consolidate()` is a reported no-op;
  malformed-record warnings are per-retrieval observations, not stored state.
- Writes create stores. Reads do not scaffold absent stores.
- Project/user path resolution must be safe for arbitrary target projects,
  including monorepos and unusual nesting. Project roots come from Pi `ctx.cwd`;
  user roots default to `homedir()/.cosmonauts` but tests inject a temp
  `userCosmonautsRoot`.

## Files to Change

- `lib/memory/types.ts` (new) — shared memory contracts, scope/kind unions,
  result shapes, skipped-scope reporting, and `MemoryStore` interface.
- `lib/memory/okf.ts` (new) — OKF markdown render/parse/validation for authored
  `note` records.
- `lib/memory/paths.ts` (new) — project/user store path resolution, display path
  formatting, safe relative path helpers, physical/frontmatter scope-match
  checks, and W1 session-scope skipped handling.
- `lib/memory/markdown-store.ts` (new) — factory-bound general-memory `note`
  store implementing write/retrieve/consolidate over plain markdown files.
- `lib/memory/index.ts` (new) — public exports for `lib/memory`.
- `lib/architecture-map/retrieval.ts` (new) — architecture-map `MemoryStore`
  adapter plus typed architecture retrieval details.
- `lib/architecture-map/index.ts` — export the retrieval adapter without changing
  generator/store APIs.
- `domains/shared/extensions/architecture-memory/index.ts` — replace local map
  file-reading logic with the architecture adapter while preserving tool names,
  `module`/`resource` parameters, messages, and freshness behavior; move
  `architecture_map_read` registration to factory load (B-015) and add the
  injectable `createStore` adapter-factory dep for the delegation spy test.
- `domains/shared/extensions/agent-memory/index.ts` (new) — exported
  `createAgentMemoryExtension(deps)` seam (`userCosmonautsRoot`, `storeFactory`,
  `now`) plus default export; factory-registered but guarded Cosmo memory
  tools with deterministic `remember` defaults and bounded `recall`, index
  injection, identity gating, authorization reset, context de-duplication, and
  UTF-8-safe truncation.
- `domains/main/agents/cosmo.ts` — add the `agent-memory` extension.
- `domains/main/prompts/cosmo.md` — add concise guidance for explicit visible
  save and pull recall.
- `docs/memory.md` (new) — document W1 store layout, OKF `note` record shape,
  scope behavior, recall model, injection budget, consolidation no-op, and Drive
  git-status gotchas for `missions/**` and `memory/**` artifacts.
- `fallow.toml` — add `lib/memory/index.ts` as a public entry point.
- `tests/memory/interface.test.ts` (new) — shared interface contract evidence
  across markdown and architecture stores, including both stores' no-op
  consolidation and architecture scope-ineligible behavior.
- `tests/memory/markdown-store.test.ts` (new) — OKF writes, retrieval, scope
  filtering, scope/frontmatter mismatch, recency, human override,
  empty/no-match/malformed behavior, skipped session scope, no-op
  consolidation side-effect checks, list-mode (no-query) retrieval, write
  `failed` honesty, and byte-idempotent `index.md` regeneration.
- `tests/extensions/architecture-memory.test.ts` — update/add tests proving
  architecture retrieval goes through the shared interface via an injected spy
  store, factory-time tool registration with honest missing-map results in
  unmapped projects (the documented absent-directory contract change),
  `module`/`resource` aliasing, root resource `.`, and existing failure
  behavior.
- `tests/domains/coding-agents.test.ts` — assert `buildToolAllowlist` for the
  five consuming agents includes `architecture_map_read` (B-015).
- `tests/extensions/agent-memory.test.ts` (new) — Cosmo gating, factory-time tool
  registration with execution authorization, post-Cosmo non-Cosmo blocking,
  `remember`, `recall`, compact index injection, non-accumulation,
  empty-store inertness, and multi-byte budget truncation.
- `tests/domains/main-domain.test.ts` — assert `main/cosmo` resolves the new
  extension, that real extension tool collection/buildToolAllowlist includes
  `remember` and `recall`, and that adding the extension does not enable built-in
  read/write tools for Cosmo.
- `missions/plans/memory-interface/pi-first-session-memory-audit.md` (new) —
  B-001 audit artifact with marker and session-scope recommendation.

Files intentionally not changed: `lib/architecture-map/generator.ts`,
`lib/architecture-map/store.ts`, CLI architecture generation subcommands,
`lib/artifact-viewer/*`, and `memory/architecture/*` generated output.

## Risks

- **Memory tools unavailable in real Cosmo sessions:** Pi builds tool allowlists
  before `before_agent_start`. Mitigation: factory-register `remember`/`recall`,
  add a real buildToolAllowlist test, and guard execution by session/turn
  authorization instead of lazy registration. The same constraint silently
  broke the shipped `architecture_map_read` in real sessions; B-015 applies the
  same factory-registration fix there. *(Updated 2026-07-08 after review.)*
- **Architecture retrofit drift:** moving retrieval out of the extension could
  accidentally change user-visible messages. Mitigation: keep the existing
  architecture-memory tests, add interface-spy coverage, preserve resource
  aliasing and root-resource `.` mapping, and do not change
  generation/store/viewer files. The absent-directory registration expectation
  changes deliberately (B-015) and is the only sanctioned behavioral delta.
- **Auto-loaded extension leakage:** shared package extension dirs can be loaded
  outside intended agents, and factory registration makes the tools *visible*
  (not just latent) in external Pi hosts. Mitigation: execution is guarded and
  authorization resets on session lifecycle and every `before_agent_start`;
  tests cover non-Cosmo after Cosmo in the same instance; prompt surface is
  minimized (short descriptions, no `promptSnippet`). Residual exposure — two
  quiet, refusing tools in foreign hosts — is an accepted, documented trade-off
  for allowlist correctness. *(Updated 2026-07-08 after review.)*
- **Scope leaks:** user/project stores live in different physical roots.
  Mitigation: path resolution happens before record scanning; physical store
  scope must match frontmatter scope; cross-project tests use two temp projects
  plus one temp user root.
- **Stale index after human edits:** a persisted `index.md` can lag manual edits.
  Mitigation: injection and recall scan current record files rather than trusting
  `index.md`; `index.md` is a human browsing artifact regenerated on writes.
- **Drive excludes plan and memory artifacts from per-task source commits:**
  B-001's `missions/plans/.../pi-first-session-memory-audit.md` and any
  project-store files under `memory/**` can be written but left uncommitted.
  Mitigation: implementation tasks must check git status after Drive; the final
  integration/quality step must explicitly include required `missions/**` and
  `memory/**` artifacts in the final state commit or document why none were
  produced.
- **Session-scope scope creep:** building a markdown session store would duplicate
  Pi session/compaction machinery. Mitigation: audit first; if evidence rejects
  the planned no-store default, revise the plan before implementation.
- **Budget creep and Unicode bugs:** two independent hidden context injections
  could become too expensive if future agents consume both, and byte slicing can
  exceed budget with multi-byte text. Mitigation: W1 consumers are disjoint;
  B-013 records the independent 12,000-byte budget and UTF-8-safe truncation; a
  future combined-consumer plan must reassess budgets.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native test, lint, and typecheck evidence passes; existing architecture-map generation/store/viewer behavior AND the pre-existing architecture-memory extension suite remain covered without substantive test rewrites (sole sanctioned delta: the absent-directory registration expectation, B-015); a fresh `cosmonauts architecture generate --no-narrative` followed by index + shard retrieval through the retrofitted path succeeds end-to-end; no test makes model calls | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | All B-001..B-015 entries have required fields and exact markers in their referenced tests/evidence files, including the plan-local Pi audit artifact | artifact evidence | hard fail |
| 3 | `boundary-conformance` | bindable | bound | `lib/memory/*` has no Pi/CLI/domain imports; architecture generation/store/viewer files are unchanged; architecture retrieval path crosses the shared interface; `remember`/`recall` and `architecture_map_read` are factory-registered for allowlisting but execution-gated | project-discovered | hard fail |
| 4 | `mutation` | bindable | bound | Targeted negative tests fail on realistic faults: Cosmo tools or `architecture_map_read` lazily registered and missing from real allowlist, non-Cosmo call after Cosmo writes a note, cross-project project-note leak, user-store `scope: project` leak, malformed record throwing the session, architecture traversal or root `.` mishandled, stale disk edit cached, multibyte index truncation exceeding budget, or non-idempotent `index.md` regeneration churning tracked files | project-discovered | hard fail |
| 5 | `complexity` | bindable | unbound | New memory core stays small and does not introduce a registry/plugin framework beyond the two W1 stores | reviewer judgment | unbound, not enforced mechanically; reviewer must inspect |
| 6 | `dead-code` | bindable | unbound | No unused memory backend, config surface, or session-store scaffold ships for future waves | reviewer judgment | unbound, not enforced mechanically; reviewer must inspect |

## Implementation Order

1. **Write the Pi-First audit and lock the W1 session decision (B-001).** Use the
   local Pi docs and installed types as evidence. If the audit rejects the
   planned no-session-store outcome, stop and revise this plan before continuing.
   Because Drive can omit `missions/**`, the task owning this artifact must check
   git status and ensure the audit file is committed or explicitly handed off.

2. **Add shared contracts and factories test-first (B-002 starts; B-011).**
   Create the `lib/memory` type/result contracts, `skippedScopes`, markdown
   store factory, architecture adapter factory/deps contract, and minimal no-op
   consolidation behavior. Add contract tests that instantiate both W1 stores
   through the interface. Keep implementation skeletal until failing tests
   demand behavior. B-002 is only *started* here: its Expected requires real
   note writes/retrieval (built in step 3) and real map retrieval (built in
   step 4), so B-002 completes at the end of step 4 and its contract test runs
   green only then. *(Attribution clarified 2026-07-08 after review.)*

3. **Build the markdown note store with red/green/refactor loops (B-008,
   B-009, B-010, B-011, B-014; store-level mechanics for B-005/B-007).** Start
   with OKF write/read roundtrip, then add factory-bound roots, deterministic
   omitted-field defaults, write-failure honesty, scope filtering,
   scope/frontmatter mismatch warnings, recency ordering, list-mode (no-query)
   retrieval, byte-idempotent `index.md` regeneration, human override,
   malformed-file warnings, empty/no-match behavior, skipped session scope, and
   no-op consolidation one behavior at a time — evidence in
   `tests/memory/markdown-store.test.ts`. B-005 and B-007 themselves complete
   in step 5, where their named extension-level tests exist. Do not add
   embeddings, pruning, decay, or session storage.

4. **Retrofit architecture retrieval through the interface (B-003, B-004,
   B-015; B-002 completes).** Move extension-local retrieval logic into
   `lib/architecture-map/retrieval.ts`, wire the extension to the adapter via
   the injectable `createStore` dep, move `architecture_map_read` registration
   to factory load, and keep the existing architecture-memory tests
   substantively intact apart from the documented absent-directory
   registration delta. Preserve freshness details, deprecated `resource` alias,
   root-resource `.` mapping, unsafe rejection, and unknown-module listing.
   Verify no changes are made to generation/store/viewer files.

5. **Add Cosmo's agent-memory extension (B-005, B-006, B-007, B-012, B-013).**
   Implement factory-time `remember`/`recall` registration first so real
   buildToolAllowlist evidence passes, then add session/turn authorization reset,
   non-Cosmo blocking, `remember` (including the minimal `{ content }` call and
   failure honesty), bounded `recall`, non-accumulating compact index
   injection, and UTF-8-safe byte-budget truncation — all through the exported
   `createAgentMemoryExtension(deps)` seam with a temp `userCosmonautsRoot`.
   Update Cosmo's definition and prompt only after extension tests prove the
   edge behavior.

6. **Document W1 and public surface.** Add `docs/memory.md`, export
   `lib/memory/index.ts`, update `fallow.toml`, and update main-domain tests for
   the new extension wiring and allowlist contract.

7. **Run the Quality Contract and artifact status check.** Verify project-native
   gates, behavior marker evidence, boundary imports, and targeted negative tests.
   Run a fresh `cosmonauts architecture generate --no-narrative` on this repo and
   exercise index + shard retrieval through the retrofitted path end-to-end (the
   spec's fresh-generate verification — `memory/architecture/` is not currently
   generated in this working copy, so there are no tracked map files to diff).
   Check `git status` explicitly for required `missions/**` and `memory/**`
   artifacts that Drive may have excluded from per-task source commits. If
   failures show the interface is too broad, inline or narrow it before tasks are
   marked done; do not carry speculative registry/session/embedding hooks as
   future-proofing.

## Review Synthesis (2026-07-08)

Two independent review channels ran against the committed plan draft
(`058ab96`) and found disjoint defect sets:

- **Chain plan-reviewer** (`review.md`, PR-001..PR-004 + missing-coverage
  list): extension construction/test-injection seam for the user root,
  deterministic `remember` defaults, no-query retrieval semantics, and an
  executable adapter-spy seam for the delegation proof. All four applied.
- **Independent adversarial workflow** (4 lenses → refute-first verifiers; 12
  verified findings across two runs, 0 refuted): headline — the plan's own
  (correct) Pi allowlist premise proves the shipped lazy
  `architecture_map_read` registration is dead in real sessions; fixed via
  B-015 factory registration for both extensions instead of preserving the
  defect. Also applied: external-host prompt-surface minimization (accepted
  trade-off, documented), `recall` result bounds, per-turn scan-cost stance
  with a W2/reassess trigger, B-002/B-005/B-007 implementation-order
  attribution, gate-1 coverage of the extension suite + fresh-generate check,
  and the removal of the unreachable `consolidated` result variant.
- Two findings lost their verifier agents to a session usage limit and were
  verified by the orchestrator directly against the repo before applying:
  `MemoryWriteResult`'s missing failure arm (independently converged with the
  chain's missing-coverage list) and tracked `index.md` regeneration
  determinism. The codebase-feasibility finder lens failed twice (API error,
  then usage limit); its territory was substantially covered by the verifier
  passes (which traced Pi dist internals and cosmonauts session wiring) and by
  the chain reviewer's code_refs, but a dedicated feasibility sweep did not
  run — recorded here honestly.

Dispositions: no finding rejected. Two accepted-with-documentation rather than
redesigned: external-host tool visibility (inherent to allowlist-correct
factory registration; minimized and risk-logged) and per-turn store scan cost
(W1-scale acceptable; revisit gated at W2/reassess).
