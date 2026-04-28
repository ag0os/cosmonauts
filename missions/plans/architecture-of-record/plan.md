---
title: Cross-Plan Architectural Memory
status: active
createdAt: '2026-04-24T21:21:28.284Z'
updatedAt: '2026-04-24T21:21:28.284Z'
---

## Summary

Add a living `memory/architecture.md` artifact that is rebuilt from durable knowledge bundles, refreshed automatically after distillation, and injected into planner-family sessions as startup context. This closes the current gap where knowledge is captured per plan but never synthesized across plans, so future planning can align to the established architecture instead of rediscovering it.

## Scope

Included:
- Generate and maintain `memory/architecture.md` from existing `memory/*.knowledge.jsonl` bundles.
- Extend knowledge records with optional architecture categorization for deterministic future rebuilds while preserving backward compatibility with existing bundles.
- Add a mechanical rebuild surface shared by CLI and agents.
- Refresh the architecture document automatically after distiller writes a bundle.
- Inject architecture-of-record context into `planner`, `adaptation-planner`, and `tdd-planner` sessions at startup.
- Extend `plan-reviewer` guidance so it checks design consistency against the architecture-of-record when the file exists.
- Document the new command/artifact in repo docs.

Explicitly excluded:
- Embedding search or automatic semantic retrieval beyond loading `memory/architecture.md`.
- The separate `reuse-scan` skill/template work from `ROADMAP.md`.
- New memory storage backends (SQLite/vector DB).
- Automatic re-distillation of historical plans; rebuild works from the bundles already present in `memory/`.

Assumptions:
- `memory/*.knowledge.jsonl` is the authoritative rebuild input, regardless of whether the source plan is currently archived or still active, so incremental distiller refreshes and full rebuilds do not diverge.
- Legacy bundles that lack explicit architecture categorization will be mapped with deterministic fallback rules; new bundles should carry explicit categorization.
- `memory/architecture.md` remains small enough to inject verbatim into planner-family prompts for now.

## Decision Log

- **D-001 — Single mechanical writer for `architecture.md`**
  - Decision: Introduce one shared rebuild path in code and have both the CLI command and distiller invoke it.
  - Alternatives: Let the distiller hand-edit markdown directly; add a second agent dedicated to curation.
  - Why: `memory/architecture.md` becomes prompt input for future planning, so duplicate writers would drift quickly. One rebuild path keeps incremental refresh and manual rebuild identical.
  - Decided by: planner-proposed

- **D-002 — Extend `KnowledgeRecord` with optional architecture concern metadata**
  - Decision: Add an optional `architectureConcern` field for records that should flow into the architecture-of-record.
  - Alternatives: Rely on heuristics only; make the field mandatory and break existing bundles.
  - Why: New bundles need deterministic section placement, but old bundles already in `memory/` must still rebuild without migration.
  - Decided by: planner-proposed

- **D-003 — Inject architecture context in session assembly, not by editing planner prompts**
  - Decision: Append architecture-of-record context inside `buildSessionParams()` for eligible planner-family roles when the file exists.
  - Alternatives: Create a static skill; inject only in CLI paths; edit each planner prompt to mention a file it must read manually.
  - Why: `buildSessionParams()` already feeds both spawned sessions and CLI sessions into the resource loaders, so one seam covers every planner entry point.
  - Decided by: planner-proposed

- **D-004 — Keep `plan-reviewer` on explicit file reads instead of auto-injection**
  - Decision: Update the prompt to require reading `memory/architecture.md` when present and reviewing deviations explicitly.
  - Alternatives: Auto-inject reviewer context too; leave reviewer unchanged.
  - Why: The roadmap requires startup injection for planners, not every reviewer. A prompt-level requirement is enough to add the new review dimension without broadening prompt bloat.
  - Decided by: planner-proposed

## Design

### Module structure

**`lib/sessions/` (existing, extended)** — durable knowledge-bundle contracts and readers.
- `lib/sessions/types.ts` adds the stable architecture concern type used by distiller output and rebuild logic.
- `lib/sessions/knowledge.ts` adds bundle-level enumeration on top of the existing JSONL parser instead of introducing a second parser.
- `lib/sessions/index.ts` re-exports the new API/type.
- Responsibility stays: knowledge bundle schema + file IO only.

**`lib/memory/architecture.ts` (new)** — architecture-of-record artifact lifecycle.
- Reads all knowledge bundles.
- Filters `decision | convention | trade-off` records into architecture entries.
- Uses `record.architectureConcern` when present; falls back to deterministic inference for legacy bundles.
- Renders/writes `memory/architecture.md`.
- Loads and strips the markdown body for planner-session context injection.
- Responsibility stays: one artifact (`memory/architecture.md`) and its read/write/render/injection helpers.

**`domains/shared/extensions/memory/index.ts` (new)** — exposes a `memory_rebuild` tool that calls the shared rebuild function.
- No orchestration logic.
- Single responsibility: agent-accessible rebuild trigger.

**`cli/memory/subcommand.ts` (new)** — exposes `cosmonauts memory rebuild`.
- Calls the same shared rebuild function as the extension tool.
- Single responsibility: human-facing CLI entry point.

**Planner session assembly surfaces (existing, modified)**
- `lib/agents/session-assembly.ts` appends architecture-of-record context before the identity marker for `planner`, `adaptation-planner`, and `tdd-planner` only.
- `lib/orchestration/session-factory.ts` and `cli/session.ts` remain unchanged in behavior; they already consume `params.promptContent` from `buildSessionParams()`.

**Distiller/reviewer prompt surfaces (existing, modified)**
- `bundled/coding/coding/agents/distiller.ts` adds the new shared memory extension.
- `bundled/coding/coding/prompts/distiller.md` requires `architectureConcern` for architecture-worthy records and a `memory_rebuild` call after bundle write.
- `bundled/coding/coding/prompts/plan-reviewer.md` adds a review dimension for architecture-of-record consistency and an explicit read step.

### Dependency graph

```
lib/sessions/types.ts
        ↓
lib/sessions/knowledge.ts
        ↓
lib/memory/architecture.ts
      ↙   ↓    ↘
cli/memory/subcommand.ts
lib/agents/session-assembly.ts
domains/shared/extensions/memory/index.ts
                      ↓
bundled/coding/coding/agents/distiller.ts (via extension config)
```

Rules:
- `lib/memory/architecture.ts` may import from `lib/sessions/*`, `node:*`, and `gray-matter` only.
- `lib/sessions/*` must not import from `lib/memory/*`.
- CLI and extension layers depend on `lib/memory/architecture.ts`; the core rebuild logic must not depend on Commander or Pi extension APIs.
- Distiller prompt changes call the tool; they do not hand-render `memory/architecture.md`.

### Key contracts

```ts
// lib/sessions/types.ts
export type ArchitectureConcern =
  | "modules"
  | "data"
  | "apis"
  | "conventions"
  | "adrs";

export interface KnowledgeRecord {
  id: string;
  planSlug: string;
  taskId?: string;
  sourceRole: string;
  type: "decision" | "rationale" | "pattern" | "trade-off" | "gotcha" | "convention";
  content: string;
  files: string[];
  tags: string[];
  createdAt: string;
  architectureConcern?: ArchitectureConcern;
}
```

Contract rule: `architectureConcern` is optional for backward compatibility, but new distiller output must set it on records of type `decision`, `convention`, or `trade-off` that belong in `memory/architecture.md`.

```ts
// lib/sessions/knowledge.ts
export async function readAllKnowledgeBundles(
  projectRoot: string,
): Promise<KnowledgeBundle[]>;
```

Contract rule: this API must reuse the existing `parseBundle()` path so JSONL parsing stays single-sourced.

```ts
// lib/memory/architecture.ts
export interface ArchitectureRebuildResult {
  path: string;
  bundleCount: number;
  entryCount: number;
}

export async function rebuildArchitectureRecord(
  projectRoot: string,
): Promise<ArchitectureRebuildResult>;

export async function appendArchitectureContext(
  basePrompt: string,
  options: { projectRoot: string; agentId: string },
): Promise<string>;
```

Contract rules:
- `rebuildArchitectureRecord()` is the only function allowed to render/write `memory/architecture.md`.
- `appendArchitectureContext()` must return `basePrompt` unchanged when the agent is not in the planner-family allowlist or when `memory/architecture.md` does not exist.

```ts
// domains/shared/extensions/memory/index.ts
memory_rebuild(): { path: string; bundleCount: number; entryCount: number }
```

Contract rule: the tool is parameterless and always rebuilds `memory/architecture.md` from the current project root.

### Integration seams

- **Prompt assembly seam** — `buildSessionParams()` currently assembles prompts and returns `promptContent` once, then both runtime loaders consume that value (`lib/agents/session-assembly.ts:126-199`, `lib/orchestration/session-factory.ts:71-85`, `cli/session.ts:92-105`). The architecture context must be appended in `buildSessionParams()` before `appendAgentIdentityMarker()` so spawned sessions and CLI sessions stay consistent.
- **Existing frontmatter pattern** — prompt assembly already strips markdown frontmatter with `gray-matter` in `lib/domains/prompt-assembly.ts:17,170-172`. Reuse that pattern when converting `memory/architecture.md` into prompt context so frontmatter never leaks into planner prompts.
- **Knowledge bundle seam** — `lib/sessions/knowledge.ts` already owns bundle parsing/writing (`lib/sessions/knowledge.ts:47-136`). The rebuild path must add bundle enumeration there instead of re-reading JSONL from a second module.
- **Planner-family targeting seam** — the concrete planner-family roles are the existing `planner`, `adaptation-planner`, and `tdd-planner` agent definitions (`bundled/coding/coding/agents/planner.ts:4`, `bundled/coding/coding/agents/adaptation-planner.ts:4`, `bundled/coding/coding/agents/tdd-planner.ts:4`). Session-assembly role gating must use these exact ids.
- **Distiller seam** — the distiller currently has coding tools but no extensions, and only the `archive` skill (`bundled/coding/coding/agents/distiller.ts:9-11`). Add the memory extension there so the prompt can trigger rebuild mechanically after it writes `memory/<planSlug>.knowledge.jsonl` (`bundled/coding/coding/prompts/distiller.md:11-158`).
- **Plan-reviewer seam** — the current review dimensions end at quality-contract completeness and the workflow writes `missions/plans/<slug>/review.md` (`bundled/coding/coding/prompts/plan-reviewer.md:11-88`). Add the architecture-of-record read/check within this existing structure rather than creating a second reviewer.
- **CLI registration seam** — top-level subcommands are dispatched from the explicit map in `cli/main.ts:557-566`. `memory` must be added there and implemented as its own subcommand module.

### Seams for change

- **Concern taxonomy** — keep the concern list centralized in the `ArchitectureConcern` type and one inference function so future sections (e.g. observability) add in one place.
- **Legacy inference** — inference exists only for old bundles. New bundles should rely on explicit `architectureConcern`; future cleanup can remove heuristics once old bundles are re-distilled.
- **Planner startup scope** — the allowlist of roles that auto-load architecture context lives in one constant inside `lib/memory/architecture.ts` (or adjacent helper), so future roles can opt in without editing prompt files.

## Approach

Use the existing knowledge-bundle layer as the source of truth, not the human-readable `memory/*.md` summaries. The implementation composes as:

`distiller writes bundle → shared rebuild function regenerates architecture.md → planner-family session assembly appends architecture context → plan-reviewer validates deviations explicitly`

Patterns to follow:
- Reuse the existing JSONL parser in `lib/sessions/knowledge.ts:47-136` rather than introducing a parallel file reader.
- Reuse the existing frontmatter-stripping pattern from `lib/domains/prompt-assembly.ts:17,170-172` for prompt-safe markdown consumption.
- Follow the shared-extension registration style already used by `domains/shared/extensions/plans/index.ts:7-204`.
- Follow the existing CLI subcommand pattern used by `cli/skills/subcommand.ts:1-113` for a focused one-command subprogram instead of inventing a deeper command tree.

Key implementation choices:
- `memory/architecture.md` is fully regenerated on each rebuild, not edited in place. This avoids merge logic, stale section ordering, and duplicate-entry drift.
- New records carry explicit `architectureConcern`; old records use fallback classification so historical knowledge is still visible on day one.
- Missing `memory/architecture.md` is a no-op for session assembly. Planning must never fail just because memory has not been built yet.
- `plan-reviewer` treats the architecture-of-record as strong context, not immutable truth: deviations are valid when the plan makes them explicit and justified.

## Files to Change

- `lib/sessions/types.ts` — add `ArchitectureConcern` and optional `architectureConcern` on `KnowledgeRecord`.
- `lib/sessions/knowledge.ts` — add bundle enumeration (`readAllKnowledgeBundles`) and shared helpers for rebuild consumers.
- `lib/sessions/index.ts` — export the new bundle API and concern type.
- `lib/memory/architecture.ts` — new shared rebuild/render/context-loading module for `memory/architecture.md`.
- `domains/shared/extensions/memory/index.ts` — new `memory_rebuild` tool that calls the shared rebuild function.
- `bundled/coding/coding/agents/distiller.ts` — add the new `memory` extension to distiller.
- `bundled/coding/coding/prompts/distiller.md` — require `architectureConcern` for architecture-worthy records and invoke `memory_rebuild` after bundle write.
- `bundled/coding/coding/prompts/plan-reviewer.md` — add architecture-of-record review instructions and workflow step.
- `lib/agents/session-assembly.ts` — append architecture context for planner-family roles before adding the identity marker.
- `cli/memory/subcommand.ts` — new `cosmonauts memory rebuild` CLI surface.
- `cli/main.ts` — register the `memory` subcommand.
- `README.md` — document `memory/architecture.md` and `cosmonauts memory rebuild`.
- `AGENTS.md` — document that planner-family roles load the architecture-of-record and that distillation maintains it.
- `tests/sessions/knowledge.test.ts` — cover bundle enumeration and backward-compatible parsing.
- `tests/memory/architecture.test.ts` — cover filtering, legacy inference, rendering, link resolution, and malformed-bundle skip behavior.
- `tests/extensions/memory.test.ts` — cover `memory_rebuild` registration and tool execution.
- `tests/agents/session-assembly.test.ts` — cover planner-family context injection, missing-file fail-open behavior, and non-planner exclusion.
- `tests/cli/memory/subcommand.test.ts` — cover the new Commander subprogram and rebuild output.
- `tests/prompts/plan-reviewer.test.ts` — cover the new architecture-of-record review dimension.
- `tests/prompts/distiller.test.ts` — cover the new prompt requirements around `architectureConcern` and `memory_rebuild`.

## Risks

- **Planner startup fails when `memory/architecture.md` is missing**
  - Blast radius: direct `planner` sessions, `plan-and-build`, `tdd`, and `adapt` workflows all fail before design starts.
  - Classification: **Must fix**.
  - Countermeasure: `appendArchitectureContext()` returns the base prompt unchanged on `ENOENT` and never treats missing architecture memory as an error.

- **`memory/architecture.md` diverges between automatic refresh and manual rebuild**
  - Blast radius: planners and reviewers consume stale or inconsistent architecture context; future plans drift because the “source of truth” changes depending on how it was built.
  - Classification: **Mitigated**.
  - Countermeasure: both distiller refresh and CLI rebuild call the same `rebuildArchitectureRecord()` function; no second renderer is allowed.

- **Legacy bundles land in the wrong section**
  - Blast radius: historical guidance is harder to find, and planners may under-read older decisions, but current runtime behavior is unaffected.
  - Classification: **Mitigated**.
  - Countermeasure: new bundles carry explicit `architectureConcern`; rebuild keeps deterministic fallback inference only for legacy bundles and can be improved independently.

- **Architecture-of-record becomes overly prescriptive and blocks legitimate design changes**
  - Blast radius: `plan-reviewer` reports false positives and planners cargo-cult old decisions instead of making explicit improvements.
  - Classification: **Mitigated**.
  - Countermeasure: prompt language must require either alignment or explicit, justified deviation; the document is context, not a hard validator.

- **Architecture document grows large enough to bloat planner prompts**
  - Blast radius: higher token cost and slower planning sessions; current correctness remains intact.
  - Classification: **Accepted**.
  - Countermeasure: none in this plan beyond keeping the document curated; prompt-size optimization belongs to later memory-retrieval work.

## Quality Contract

- id: QC-001
  category: architecture
  criterion: "`memory/architecture.md` is rendered by one shared code path (`rebuildArchitectureRecord`) that is called by both the CLI subcommand and the distiller-triggered tool; no second markdown renderer exists."
  verification: reviewer

- id: QC-002
  category: integration
  criterion: "The new rebuild surfaces typecheck cleanly and the targeted memory/session/prompt/CLI tests pass."
  verification: verifier
  command: "bun run typecheck && bun run test -- tests/sessions/knowledge.test.ts tests/memory/architecture.test.ts tests/extensions/memory.test.ts tests/agents/session-assembly.test.ts tests/cli/memory/subcommand.test.ts tests/prompts/plan-reviewer.test.ts tests/prompts/distiller.test.ts"

- id: QC-003
  category: behavior
  criterion: "When `memory/architecture.md` is absent, planner-family session assembly returns the original prompt path unchanged and non-planner agents never receive injected architecture context."
  verification: reviewer

- id: QC-004
  category: behavior
  criterion: "Rebuilding architecture memory skips malformed `.knowledge.jsonl` inputs and still emits a valid `memory/architecture.md` from the remaining valid bundles."
  verification: reviewer

- id: QC-005
  category: correctness
  criterion: "New distiller guidance emits `architectureConcern` on architecture-worthy `decision`, `convention`, and `trade-off` records before triggering `memory_rebuild`."
  verification: reviewer

- id: QC-006
  category: behavior
  criterion: "`plan-reviewer` checks architecture-of-record consistency only when the file exists and accepts explicitly justified deviations instead of treating the document as immutable truth."
  verification: reviewer

## Implementation Order

1. **Extend the durable-memory contract** — add `ArchitectureConcern`, bundle enumeration, and the new `lib/memory/architecture.ts` rebuild/render logic with unit tests. This goes first because every other change depends on the shared artifact contract.
2. **Add operational rebuild surfaces** — create the shared memory extension tool, wire distiller to call it, and add the `cosmonauts memory rebuild` CLI subcommand. This makes the architecture document maintainable before any planner starts consuming it.
3. **Consume the architecture-of-record in planning flows** — inject planner-family startup context in session assembly and update `plan-reviewer` prompt instructions. This is safe only after the document can be rebuilt consistently.
4. **Document the new workflow** — update `README.md` and `AGENTS.md` so humans and future agents know how the artifact is generated and used.
