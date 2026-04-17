---
id: TASK-141
title: '`lib/sessions` module: types, knowledge bundle, and index'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:session-lineage'
dependencies:
  - TASK-140
createdAt: '2026-04-07T19:03:59.080Z'
updatedAt: '2026-04-07T19:10:52.458Z'
---

## Description

Create the `lib/sessions/` leaf module with foundational types and knowledge bundle I/O. This is the data layer that all other session-lineage work depends on.\n\n**New files:**\n- `lib/sessions/types.ts` — `SessionRecord`, `SessionManifest`, `KnowledgeRecord`, `KnowledgeBundle` interfaces (exact shapes defined in plan)\n- `lib/sessions/knowledge.ts` — `writeKnowledgeBundle`, `readKnowledgeBundle`, `readAllKnowledge`; JSONL format (one record per line) with a `_meta` header record for bundle metadata\n- `lib/sessions/index.ts` — re-exports all public API from `types.ts`, `knowledge.ts`\n- `tests/sessions/knowledge.test.ts` — write/read roundtrip tests for `KnowledgeBundle`\n\n**Constraints:** `lib/sessions/` must have zero imports from `lib/orchestration/` — dependency direction is inward only (QC-001).

<!-- AC:BEGIN -->
- [ ] #1 SessionRecord, SessionManifest, KnowledgeRecord, KnowledgeBundle interfaces exist in lib/sessions/types.ts with all fields specified in the plan (including required fields for future SQLite migration: content, type enum, files, tags, planSlug, createdAt)
- [ ] #2 writeKnowledgeBundle writes one KnowledgeRecord per line in JSONL format to memory/<planSlug>.knowledge.jsonl
- [ ] #3 readKnowledgeBundle reads and deserializes a bundle written by writeKnowledgeBundle — roundtrip produces identical records (QC-007)
- [ ] #4 readAllKnowledge reads all .knowledge.jsonl files in memory/ and returns a flat array of KnowledgeRecord
- [ ] #5 lib/sessions/index.ts exports all public types and functions
- [ ] #6 lib/sessions/ contains no imports from lib/orchestration/ (QC-001 enforced at code level)
<!-- AC:END -->

## Implementation Notes

Created lib/sessions/ as a leaf module with zero imports from lib/orchestration/ (QC-001 satisfied). JSONL format: line 1 is a _meta record containing bundle metadata, remaining lines are KnowledgeRecord objects. parseBundle is a pure internal function. readAllKnowledge silently skips malformed files. noUncheckedIndexedAccess required explicit string casts for array index access. 13 tests covering write/read roundtrip, multi-bundle aggregation, missing-file handling, and JSONL structure verification."
