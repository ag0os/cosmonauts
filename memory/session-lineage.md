---
source: archive
plan: session-lineage
distilledAt: 2026-04-15T15:07:51Z
---

# Session Lineage & Reasoning Capture

## What Was Built

Added plan-scoped session capture for chain and workflow execution. When a spawn carries a `planSlug`, Cosmonauts now persists the raw Pi session as JSONL under `missions/sessions/<slug>/`, writes a readable transcript markdown file, and records the session in a per-plan manifest with lineage and stats. The same plan also introduced a dedicated `lib/sessions/` module, a distiller agent, and archive support so session artifacts move into `missions/archive/sessions/<slug>/` while durable memory stays in `memory/`.

## Key Decisions

- **Made persistence opt-in through `planSlug`.** Plan-linked runs get file-backed sessions, but ordinary interactive and non-plan spawns still use in-memory sessions so existing behavior stays unchanged.
- **Kept `lib/sessions/` as a leaf module.** Session types, manifests, transcripts, and knowledge-bundle I/O live in `lib/sessions/` with no imports from `lib/orchestration/`, so orchestration depends on the data layer rather than the reverse.
- **Used transcripts as the distillation input, not raw JSONL.** Transcript generation keeps user prompts, assistant text/thinking, and tool call names, while dropping tool arguments and tool-result payloads to make later distillation readable and signal-heavy.
- **Defined durable memory as JSONL knowledge records with a metadata header.** `memory/<slug>.knowledge.jsonl` starts with a `_meta` line and then stores one self-contained `KnowledgeRecord` per line, matching the future SQLite/vector-ingestion shape.
- **Separated ephemeral session artifacts from durable memory.** `archivePlan` moves `missions/sessions/<slug>/` into the archive, but `memory/<slug>.knowledge.jsonl` and `memory/<slug>.md` are intentionally never moved.
- **Made lineage capture best-effort in the spawner `finally` path.** Failed spawns should still record outcome/transcript data when possible, but lineage write failures must not crash the real work.

## Patterns Established

- **Plan session layout**: `missions/sessions/<slug>/manifest.json` plus `<role>-<uuid>.jsonl` and matching `<role>-<uuid>.transcript.md` files.
- **Plan identity threading**: `completionLabel: plan:<slug>` is the canonical chain/workflow label; `derivePlanSlug()` is the seam that turns that label into persistence context for downstream spawns.
- **Two memory outputs for different consumers**: `memory/<slug>.md` is the human summary, while `memory/<slug>.knowledge.jsonl` is the structured machine-ingest format.
- **Transcript-first distillation order**: planner reasoning first, then worker implementation sessions, then reviewer/quality sessions so later distillation preserves design intent before implementation detail.
- **Per-record knowledge shape**: each knowledge record is one concept with explicit `type`, `files`, `tags`, provenance, and standalone `content` suitable for semantic search.

## Files Changed

- `lib/sessions/types.ts`, `lib/sessions/knowledge.ts`, `lib/sessions/manifest.ts`, `lib/sessions/session-store.ts`, `lib/sessions/index.ts` — new leaf module for session lineage types, transcript generation, manifest persistence, and knowledge-bundle JSONL I/O.
- `lib/orchestration/types.ts` and `lib/orchestration/chain-runner.ts` — added `planSlug` plumbing and derivation from `plan:<slug>` completion labels.
- `lib/orchestration/session-factory.ts` — switches plan-linked spawns from `SessionManager.inMemory()` to file-backed `SessionManager.open()` sessions under `missions/sessions/<slug>/`.
- `lib/orchestration/agent-spawner.ts` — captures final messages before disposal, writes transcript markdown, and appends manifest records after success or failure.
- `lib/plans/archive.ts` — archives session directories alongside plans and tasks while leaving `memory/` untouched.
- `bundled/coding/coding/agents/distiller.ts` and `bundled/coding/coding/prompts/distiller.md` — define the distiller role and its knowledge-record output contract.
- `domains/shared/skills/archive/SKILL.md` — documents the three-tier pipeline from raw sessions to transcripts to durable knowledge records.

## Gotchas & Lessons

- **`SessionManager.open()` does not prove persistence until the session actually writes.** Tests for file-backed sessions need to verify the JSONL file after a real prompt run, not immediately after construction.
- **Transcript generation must happen before disposal loses access to session state.** `agent-spawner` captures `session.messages` before `session.dispose()` for this reason.
- **Manifest writes are simple JSON rewrites with no locking.** The initial implementation assumes low write contention; future highly parallel plans may need append-only or locking semantics.
- **Distillation must degrade gracefully when session artifacts are missing.** Older plans or in-memory runs may have no manifest/transcripts, so the archive skill and distiller still need to produce memory from plan and task content alone.
- **Lineage is observability, not execution-critical state.** Errors while writing manifests or transcripts are intentionally swallowed so instrumentation failures do not abort agent execution.
