---
id: TASK-617
title: Slice 1 remediation — Add the production project corpus consolidation source
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-616
createdAt: '2026-09-02T17:47:54.260Z'
updatedAt: '2026-09-02T17:47:54.260Z'
---

## Description

The v1 corpus source adapter was never built, so the shipped system cannot read the knowledge corpus at all. `lib/memory/consolidation-sources.ts` exports only `createProjectEpisodeConsolidationSource`; the only corpus source in the repo is `livingMemoryCorpusSource(...)`, a test helper in `tests/memory/interface.test.ts`. The sole production composition root (`cli/memory/subcommand.ts`) registers only the episode source. Ground truth: `cosmonauts memory consolidate --dry-run --no-model --json` against the live 237-record corpus returns sources `[{sourceId:"project-episodes",admitted:0,omitted:0}]` and `kind: "noop"`.

Consequence: the L4 regulator, retirement authority, citation inventory, retire-when evaluation, and index-pressure targeting are all unreachable from the real corpus. This violates AC-016 ("the corpus and the episodic log are the v1 sources") and makes AC-012's "consolidate() is the L4 entry point" vacuous in production. Every behavior test injects fixture sources directly into the factory, which is why all 21 markers went green without the adapter existing.

Add `createProjectCorpusConsolidationSource({ projectRoot, userCosmonautsRoot })` to `lib/memory/consolidation-sources.ts` and register it AHEAD of the episode source in the `cli/memory/subcommand.ts` composition root. Reuse the existing knowledge read path (`createKnowledgeMemoryStore`) rather than writing a second corpus reader — no duplicate reader may remain (Quality Contract gate 4).

Exact record contract the pipeline already requires (do not invent a new shape): `kind: "knowledge"`; `id` and `path` are scope-relative; `digest` is the SHA-256 of the exact raw file bytes; `content` is those raw bytes; `metadata` carries `type`, `title`, `description`, `resource`, `timestamp` (strings), `tags` (string[]), and `scopeRoot` (absolute scope root, consumed by `toIndexRecords` and the retire-when path resolver), plus the record's `retire-when` and `files` frontmatter when present. Corpus records are never pruned: do NOT implement `finalize`.

Bounds per D-010: admit at most `limit` project bodies (the caller passes the 50-record corpus cap); report the remainder as `omitted`. User-scope records are collected for target/citation measurement but are NEVER mutation candidates. Exclude every reserved `index.md` and the whole `retired/` subtree (D-017); default retrieval already excludes retired — do not opt in.

Binding ratified ground — stop and escalate rather than adjust it: tests use temporary fixture copies only and never move, edit, or delete anything under this repository's live `knowledge/`; `knowledgeSurface` stays on; no live-corpus retirement round is run; no TTL, OM adoption/fork, scheduling, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change enters scope. This task adds a READ-ONLY source adapter and one composition-root registration; it introduces no new retirement, removal, or mutation authority whatsoever.

<!-- AC:BEGIN -->
- [ ] #1 A production `createProjectCorpusConsolidationSource` exists in `lib/memory/consolidation-sources.ts`, reuses the existing knowledge read path rather than adding a second corpus reader, and emits capped immutable snapshots whose id/path are scope-relative, whose digest is the SHA-256 of the exact raw bytes, and whose metadata carries type/title/description/resource/timestamp/tags/scopeRoot plus retire-when and files when present.
- [ ] #2 The source is registered in the `cli/memory/subcommand.ts` composition root ahead of the episode source, and `cosmonauts memory consolidate --dry-run --no-model --json` against a temp fixture project reports a corpus source with a non-zero admitted count and surfaces deterministic corpus observations.
- [ ] #3 Bounds hold per D-010: at most the passed limit of project bodies is admitted and the remainder is reported as omitted; user-scope records are measured for index/citation purposes but never become mutation candidates; every reserved index.md and the entire retired/ subtree are excluded, and retired records are never opted into.
- [ ] #4 The adapter is read-only: it exports no remove, unlink, rename, or write operation, adds no retirement or mutation authority, and a dry run against a temp fixture leaves every store byte-identical.
- [ ] #5 Project-native universal correctness evidence passes after every commit; the Slice 0 B-001 receipt test and every existing living-memory behavior marker B-001..B-021 remain green and unmodified, and no existing behavior is re-owned or weakened to accommodate the new source.
<!-- AC:END -->
