---
title: Session Lineage & Reasoning Capture
status: active
createdAt: '2026-04-06T18:24:28.366Z'
updatedAt: '2026-04-06T20:18:46.374Z'
---

## Overview

Capture and persist agent session transcripts during plan execution, track which sessions participated in each plan's lifecycle, and enable post-completion distillation that extracts essential reasoning and decisions into a structured format designed for future semantic search.

Today, all spawned agent sessions use `SessionManager.inMemory()` (`lib/orchestration/session-factory.ts:107`). When a session completes, its messages are returned in `SpawnResult.messages` but never persisted. The reasoning trail — design rationale from the planner, implementation decisions from workers, review findings from the quality manager — evaporates. The archive skill's distillation (`domains/shared/skills/archive/SKILL.md`) only reads `plan.md` and task files, missing the richest source of institutional knowledge.

This plan adds four capabilities:
1. **Session persistence** — save session JSONL files to disk during plan-linked chain/workflow runs
2. **Plan-session lineage** — a manifest tracking which sessions belong to which plan, their roles, relationships, and stats
3. **Transcript generation** — readable markdown summaries extracted from sessions at completion time, as intermediate input for the distiller
4. **Distiller agent** — a dedicated agent role that reads all plan artifacts (plan, tasks, transcripts) and produces structured knowledge records designed for future SQLite + vector embedding migration

## Current State

- **Session factory** (`lib/orchestration/session-factory.ts`): Always creates in-memory sessions via `SessionManager.inMemory()`. No persistence hook.
- **Agent spawner** (`lib/orchestration/agent-spawner.ts`): Returns `SpawnResult` with `messages: [...session.messages]` (typed as `unknown[]`, actually `AgentMessage[]`). Messages are not persisted.
- **Chain runner** (`lib/orchestration/chain-runner.ts`): Has `completionLabel` (typically `plan:<slug>`) which identifies the plan. Tracks stats per stage but not session content.
- **Spawn tracker** (`lib/orchestration/spawn-tracker.ts`): Tracks parent-child relationships via `spawnId`, `sessionId`, `role`. No persistence.
- **Archive** (`lib/plans/archive.ts`): Moves plan directory and task files. No session awareness.
- **Memory/Archive skill**: Distills from `plan.md` and task files only. Source-agnostic design already supports `source: "session"` in frontmatter.
- **Types** (`lib/orchestration/types.ts`): `SpawnConfig` has `runtimeContext` (prompt injection), no plan persistence context. `SpawnResult` has `messages` and `stats`.
- **Pi framework**: `SessionManager.open(path)` creates file-backed JSONL sessions. `AgentMessage` type from `@mariozechner/pi-agent-core` is the message format.
- **Roadmap**: `embedding-memory` item envisions SQLite + vector embeddings for semantic search. `decision-capture` item envisions structured decision recording. This plan provides the data capture layer both depend on.

## Design

### Data Architecture: Three Tiers

The knowledge pipeline has three tiers, each with a distinct purpose and lifecycle:

**Tier 1 — Raw sessions (JSONL)**: Complete session transcripts saved during execution. Ephemeral — for debugging and replay. Deleted after distillation or on archive. Not designed for long-term storage.

**Tier 2 — Transcripts (markdown)**: Filtered, readable summaries generated at session completion. Intermediate — the distiller's input. Kept alongside sessions, archived with the plan.

**Tier 3 — Knowledge records (structured JSONL)**: The durable output. Distilled by a dedicated agent from transcripts + plan + tasks. Each record is a self-contained unit of knowledge with metadata for future database ingestion. This is what survives long-term and will be imported into SQLite + vector embeddings.

```
Raw sessions → Transcripts → Distiller agent → Knowledge records
  (ephemeral)   (intermediate)                    (durable)
```

### Knowledge Record Format

Designed for future migration to SQLite with vector embeddings. Each record is independently embeddable and queryable:

```typescript
// lib/sessions/types.ts

/** A single unit of distilled knowledge, ready for future DB ingestion */
interface KnowledgeRecord {
  /** Unique record ID (UUID) */
  id: string;
  /** Plan that produced this knowledge */
  planSlug: string;
  /** Task ID if this knowledge came from a specific task's implementation */
  taskId?: string;
  /** Which agent role produced or surfaced this knowledge */
  sourceRole: string;
  /** Classification of the knowledge type */
  type: "decision" | "rationale" | "pattern" | "trade-off" | "gotcha" | "convention";
  /** The knowledge itself — concise, self-contained, embeddable text.
   *  This is the field that gets vectorized for semantic search. */
  content: string;
  /** File paths this knowledge relates to (for scoped retrieval) */
  files: string[];
  /** Free-form tags for categorical filtering */
  tags: string[];
  /** ISO 8601 timestamp */
  createdAt: string;
}

/** A collection of knowledge records from one plan's distillation */
interface KnowledgeBundle {
  planSlug: string;
  planTitle: string;
  distilledAt: string;
  distilledBy: string;  // agent role or "human"
  records: KnowledgeRecord[];
}
```

**Why this shape:**
- `content` is the embedding target — one concept per record, written to be meaningful standalone
- `files` enables scoped retrieval ("what do we know about lib/auth/?")
- `tags` enables categorical filtering without rigid taxonomy
- `type` classifies for different consumption patterns (decisions vs patterns vs gotchas)
- `planSlug` + `taskId` preserve provenance for tracing back to source
- Each record is independently useful — no cross-record dependencies
- Flat structure maps directly to a SQLite table row

### Module Structure

**`lib/sessions/`** — New module. Single responsibility: session persistence, lineage tracking, and knowledge format. Pure data operations (file I/O + types), no orchestration logic.

- `types.ts` — SessionRecord, SessionManifest, KnowledgeRecord, KnowledgeBundle
- `session-store.ts` — Write/read session JSONL files and generate transcript summaries
- `manifest.ts` — Plan-to-session manifest management (create, append, read)
- `knowledge.ts` — Knowledge bundle read/write operations

**`lib/orchestration/`** — Modified. Gains plan context threading and session persistence hooks.

- `types.ts` — Add `planSlug` to `SpawnConfig` and `ChainConfig`
- `session-factory.ts` — Conditional file-based sessions when `planSlug` is present
- `agent-spawner.ts` — Record completed sessions in the manifest; generate transcript
- `chain-runner.ts` — Derive `planSlug` from `completionLabel` and thread through spawns

**`bundled/coding/coding/agents/distiller.ts`** — New agent definition. Read-only agent that reads transcripts, plan, and tasks, and produces structured knowledge records.

**`bundled/coding/coding/prompts/distiller.md`** — Distiller persona prompt. Defines the distillation workflow, output format, and quality bar for knowledge records.

**`lib/plans/archive.ts`** — Modified. Include `missions/sessions/<slug>/` in archive operations.

**`domains/shared/skills/archive/SKILL.md`** — Modified. Distillation procedure updated to reference the distiller agent and knowledge record format.

### Dependency Graph

```
lib/sessions/types.ts          ← pure types, no imports
lib/sessions/manifest.ts       ← imports types.ts only
lib/sessions/session-store.ts  ← imports types.ts only
lib/sessions/knowledge.ts      ← imports types.ts only

lib/orchestration/types.ts     ← imports ThinkingLevel (unchanged)
lib/orchestration/session-factory.ts  ← imports lib/sessions/session-store.ts
lib/orchestration/agent-spawner.ts    ← imports lib/sessions/manifest.ts, session-store.ts
lib/orchestration/chain-runner.ts     ← unchanged imports, threads planSlug

lib/plans/archive.ts           ← imports lib/sessions/manifest.ts (to find session dir)
```

Direction: `lib/sessions/` is a leaf module. Orchestration depends on sessions, never the reverse. Plans/archive depends on sessions for path resolution only.

### Key Contracts

```typescript
// lib/sessions/types.ts — SessionRecord and SessionManifest

/** A record of one agent session that participated in a plan's lifecycle */
interface SessionRecord {
  sessionId: string;
  role: string;
  parentSessionId?: string;
  taskId?: string;
  startedAt: string;            // ISO 8601
  completedAt: string;          // ISO 8601
  outcome: "success" | "failed";
  sessionFile: string;          // relative path: e.g. "planner-abc123.jsonl"
  transcriptFile: string;       // relative path: e.g. "planner-abc123.transcript.md"
  stats?: {
    tokens: { input: number; output: number; total: number };
    cost: number;
    durationMs: number;
    turns: number;
    toolCalls: number;
  };
}

/** Manifest linking a plan to all sessions that participated in it */
interface SessionManifest {
  planSlug: string;
  createdAt: string;
  updatedAt: string;
  sessions: SessionRecord[];
}
```

```typescript
// lib/sessions/manifest.ts

function createManifest(sessionsDir: string, planSlug: string): Promise<SessionManifest>;
function appendSession(sessionsDir: string, planSlug: string, record: SessionRecord): Promise<void>;
function readManifest(sessionsDir: string, planSlug: string): Promise<SessionManifest | undefined>;
```

```typescript
// lib/sessions/session-store.ts

function sessionsDirForPlan(projectRoot: string, planSlug: string): string;
function generateTranscript(messages: unknown[], role: string): string;
function writeTranscript(sessionsDir: string, filename: string, content: string): Promise<void>;
```

```typescript
// lib/sessions/knowledge.ts

function writeKnowledgeBundle(projectRoot: string, bundle: KnowledgeBundle): Promise<string>;
// → writes to memory/<planSlug>.knowledge.jsonl (one record per line)

function readKnowledgeBundle(projectRoot: string, planSlug: string): Promise<KnowledgeBundle | undefined>;
// → reads from memory/<planSlug>.knowledge.jsonl

function readAllKnowledge(projectRoot: string): Promise<KnowledgeRecord[]>;
// → reads all .knowledge.jsonl files, returns flat array of records
```

```typescript
// Additions to lib/orchestration/types.ts

interface SpawnConfig {
  // ... existing fields ...
  planSlug?: string;
}

interface ChainConfig {
  // ... existing fields ...
  planSlug?: string;
}
```

### Distiller Agent Design

**Definition** (`bundled/coding/coding/agents/distiller.ts`):

```typescript
const definition: AgentDefinition = {
  id: "distiller",
  description: "Reads plan artifacts and session transcripts, extracts essential knowledge into structured records for long-term memory.",
  capabilities: ["core", "coding-readonly"],
  model: "anthropic/claude-sonnet-4-6",
  tools: "coding",       // needs bash to write knowledge files
  extensions: [],
  skills: ["archive"],   // loads the archive skill for distillation guidance
  subagents: [],
  projectContext: true,
  session: "ephemeral",
  loop: false,
};
```

**Distillation workflow** (defined in persona prompt `distiller.md`):

1. Read the plan (`missions/plans/<slug>/plan.md` or archived location)
2. Read associated tasks (via `plan:<slug>` label)
3. Read session manifest to identify participating sessions
4. Read transcript files (prioritize: planner → workers for complex tasks → quality-manager)
5. For each meaningful insight, produce a `KnowledgeRecord`:
   - One concept per record. The `content` field must be self-contained and understandable without reading the plan.
   - Classify into `type`: decision, rationale, pattern, trade-off, gotcha, convention
   - Tag with relevant file paths and free-form tags
   - Write concisely — these are for long-term memory, not documentation
6. Write the `KnowledgeBundle` to `memory/<planSlug>.knowledge.jsonl`
7. Optionally write a human-readable `memory/<planSlug>.md` summary (the current memory format, generated from the knowledge records)

**Distillation quality bar** (enforced in the persona prompt):

- **Essential only**: Would a developer working on this codebase 6 months from now benefit from knowing this? If not, skip it.
- **Self-contained**: Each record's `content` must make sense without reading the plan or other records. Include enough context in the text itself.
- **Concrete**: "Used LRU over LFU because access patterns are recency-biased" not "Made a caching decision."
- **Actionable**: Patterns and conventions should be followable. Gotchas should be avoidable.
- **3-15 records per plan**: Fewer means the work was trivial (skip distillation). More means you're not filtering aggressively enough.

### Seams for Change

**Knowledge format → SQLite migration**: The `KnowledgeRecord` is designed as a future database row. When `embedding-memory` is implemented:
- `content` becomes the text column + vector embedding
- `files`, `tags` become indexed columns or junction tables
- `type` becomes a filtered enum column
- The JSONL files are the import source — read them, embed them, insert them
- No format changes needed at the capture layer

**Transcript generation**: `generateTranscript` is a pure function (messages → markdown). When we want richer extraction, we extend this function without touching orchestration.

**Manifest format**: JSON file with a flat `sessions` array. Easy to extend with new fields without breaking existing readers.

**Persistence trigger**: Keyed off `planSlug` presence in `SpawnConfig`. Non-plan sessions remain in-memory. Future work can add other persistence triggers.

**Distiller invocation**: Initially manual (spawn after archive) or as a chain stage. Future: automatic trigger in the archive workflow.

### File Layout

```
missions/
  sessions/                          # New directory (gitignored)
    <plan-slug>/                     # Per-plan session directory
      manifest.json                  # Plan-to-session lineage
      planner-<sessionId>.jsonl      # Full session (Pi JSONL) — Tier 1
      planner-<sessionId>.transcript.md   # Readable summary — Tier 2
      worker-<sessionId>.jsonl
      worker-<sessionId>.transcript.md
      ...

memory/
  <plan-slug>.knowledge.jsonl        # Knowledge records — Tier 3 (durable)
  <plan-slug>.md                     # Human-readable summary (optional, from distiller)
```

On archive, `missions/sessions/<slug>/` moves to `missions/archive/sessions/<slug>/`. Knowledge records stay in `memory/` — they're the durable output that outlives the archive.

## Approach

### Session Persistence (session-factory.ts)

When `SpawnConfig.planSlug` is present, use `SessionManager.open(path)` instead of `SessionManager.inMemory()`. The path is `missions/sessions/<planSlug>/<role>-<sessionId>.jsonl`. Generate a UUID upfront as the filename stem, passed to `SessionManager.open()`.

### Transcript Generation (session-store.ts)

After a spawn completes, extract a readable transcript from `SpawnResult.messages`:
- User prompts (the instructions the agent received)
- Assistant text content (reasoning, decisions, explanations)
- Tool call names only (not arguments or results — too noisy)
- Thinking content if present (valuable reasoning)

Follows Pi's `AgentMessage` type union: filter `Message` types, extract `TextContent` and `ThinkingContent` from assistant messages, skip `ToolCall` details and `ToolResultMessage` content.

### Plan Context Threading (chain-runner.ts)

Derive `planSlug` from `completionLabel`:

```typescript
function derivePlanSlug(completionLabel?: string): string | undefined {
  if (!completionLabel?.startsWith("plan:")) return undefined;
  return completionLabel.slice(5);
}
```

Thread `planSlug` through to every `spawner.spawn()` call in `runStage()`.

### Manifest Recording (agent-spawner.ts)

After each spawn completes (success or failure), the spawner:
1. Generates the transcript via `generateTranscript(result.messages, role)`
2. Writes the transcript file
3. Appends a `SessionRecord` to the manifest

Happens in the `finally` block alongside `session.dispose()`, ensuring sessions are always recorded even on failure.

### Knowledge Bundle Operations (knowledge.ts)

JSONL format for knowledge records — one JSON object per line. This is the format the future SQLite importer will read:

```jsonl
{"id":"...","planSlug":"...","type":"decision","content":"...","files":["..."],"tags":["..."],"createdAt":"..."}
{"id":"...","planSlug":"...","type":"pattern","content":"...","files":["..."],"tags":["..."],"createdAt":"..."}
```

The `KnowledgeBundle` wrapper (with `planTitle`, `distilledAt`, `distilledBy`) is stored as a header comment line or a metadata record with `type: "_meta"`.

### Archive Integration (archive.ts)

Extend `archivePlan` to:
1. Check for `missions/sessions/<slug>/` directory
2. Move it to `missions/archive/sessions/<slug>/`
3. Add `archivedSessionsPath` to `ArchiveResult`

Knowledge records in `memory/` are NOT moved — they're the durable layer that persists.

## Files to Change

### New Files

- `lib/sessions/types.ts` — SessionRecord, SessionManifest, KnowledgeRecord, KnowledgeBundle interfaces
- `lib/sessions/manifest.ts` — Manifest create/append/read operations
- `lib/sessions/session-store.ts` — Session directory resolution, transcript generation, file writing
- `lib/sessions/knowledge.ts` — Knowledge bundle read/write/list operations
- `lib/sessions/index.ts` — Public API re-exports
- `bundled/coding/coding/agents/distiller.ts` — Distiller agent definition
- `bundled/coding/coding/prompts/distiller.md` — Distiller persona prompt with distillation workflow and quality bar
- `tests/sessions/manifest.test.ts` — Manifest CRUD tests
- `tests/sessions/session-store.test.ts` — Transcript generation tests
- `tests/sessions/knowledge.test.ts` — Knowledge bundle read/write tests

### Modified Files

- `lib/orchestration/types.ts` — Add `planSlug` to `SpawnConfig` and `ChainConfig`
- `lib/orchestration/session-factory.ts` — Conditional file-backed sessions when `planSlug` present
- `lib/orchestration/agent-spawner.ts` — Post-completion transcript generation and manifest recording
- `lib/orchestration/chain-runner.ts` — Derive `planSlug` from `completionLabel`, thread through spawns
- `lib/plans/archive.ts` — Move sessions directory during archive
- `domains/shared/skills/archive/SKILL.md` — Update distillation procedure to reference distiller agent and knowledge records

## Risks

1. **Session file size** — JSONL files can be large (workers read many files via tool calls). Mitigated: transcripts are the distiller's input, not raw JSONL. Full JSONL is for debugging/replay only and can be deleted after distillation.

2. **Pi SessionManager.open() behavior** — Need to verify `SessionManager.open()` works with a pre-generated path. If Pi generates its own session ID, there may be a filename mismatch. Mitigation: generate a UUID upfront, accept it may differ from Pi's internal session ID.

3. **Transcript extraction from `unknown[]`** — `SpawnResult.messages` is typed `unknown[]`. We need defensive extraction with fallbacks for unexpected message shapes.

4. **Concurrent manifest writes** — Multiple workers completing simultaneously could race on manifest.json writes. For v1, the spawner completes sequentially per parent, so races are unlikely. Future: switch to append-only JSONL or file locking.

5. **Distillation quality** — The distiller agent's output quality depends on prompt engineering. The knowledge records must be genuinely useful, not verbose summaries. Mitigated: strict quality bar in the persona prompt (3-15 records, self-contained, essential only).

6. **Knowledge record format stability** — Changing the record shape after records exist requires migration. Mitigated: JSONL is schema-flexible (new fields are additive), and the format is deliberately minimal.

## Quality Contract

- id: QC-001
  category: architecture
  criterion: "lib/sessions/ has no imports from lib/orchestration/ — dependency direction is inward only"
  verification: reviewer

- id: QC-002
  category: correctness
  criterion: "Transcript generation produces valid markdown from mock AgentMessage arrays covering user, assistant (with text + thinking + tool calls), and tool result message types"
  verification: verifier
  command: "bun run test -- --grep 'transcript'"

- id: QC-003
  category: integration
  criterion: "When planSlug is set in SpawnConfig, the session factory creates a file-backed session and the JSONL file exists on disk after the spawn completes"
  verification: verifier
  command: "bun run test -- --grep 'session persistence'"

- id: QC-004
  category: integration
  criterion: "Manifest records all sessions for a plan with correct roles, session IDs, and outcome status"
  verification: verifier
  command: "bun run test -- --grep 'manifest'"

- id: QC-005
  category: behavior
  criterion: "When planSlug is NOT set (default), session behavior is identical to current — in-memory, no files written, no manifest"
  verification: verifier
  command: "bun run test -- --grep 'no planSlug'"

- id: QC-006
  category: integration
  criterion: "archivePlan moves missions/sessions/<slug>/ to missions/archive/sessions/<slug>/ when sessions exist"
  verification: verifier
  command: "bun run test -- --grep 'archive.*session'"

- id: QC-007
  category: correctness
  criterion: "KnowledgeBundle JSONL write/read roundtrips correctly — records written match records read back"
  verification: verifier
  command: "bun run test -- --grep 'knowledge'"

- id: QC-008
  category: architecture
  criterion: "KnowledgeRecord type has content (string), type (enum), files (string[]), tags (string[]), planSlug, and createdAt fields — all required for future SQLite + vector migration"
  verification: reviewer

## Implementation Order

1. **Session types and knowledge format** — `lib/sessions/types.ts`, `knowledge.ts`, `index.ts` + tests. Foundation types including `KnowledgeRecord` and `KnowledgeBundle`. JSONL read/write for knowledge bundles. No orchestration changes yet. Independently testable.

2. **Manifest operations** — `lib/sessions/manifest.ts` + tests. Manifest create/append/read. Independently testable with temp directories.

3. **Transcript generation** — `lib/sessions/session-store.ts` + tests. Pure function: messages in, markdown out. Depends on understanding `AgentMessage` structure. Independently testable with mock messages.

4. **Plan context threading** — Add `planSlug` to `SpawnConfig` and `ChainConfig` in `lib/orchestration/types.ts`. Update `chain-runner.ts` to derive slug from `completionLabel` and pass through. No behavioral change yet.

5. **Session persistence in factory** — Modify `session-factory.ts` to use `SessionManager.open()` when `planSlug` is present. Key integration point.

6. **Post-completion recording** — Modify `agent-spawner.ts` to generate transcripts and write manifest entries after each spawn. Depends on steps 1-5.

7. **Archive integration** — Extend `lib/plans/archive.ts` to move session directories. Update `ArchiveResult` type.

8. **Distiller agent** — Create agent definition (`bundled/coding/coding/agents/distiller.ts`) and persona prompt (`bundled/coding/coding/prompts/distiller.md`). The prompt defines the distillation workflow, output format, and quality bar. Update the archive skill to reference the distiller.

9. **Updated archive skill** — Modify `domains/shared/skills/archive/SKILL.md` to document the new distillation flow: run the distiller agent after archive, which reads transcripts and produces knowledge records.
