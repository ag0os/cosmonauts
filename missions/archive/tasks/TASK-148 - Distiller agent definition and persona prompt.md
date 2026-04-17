---
id: TASK-148
title: Distiller agent definition and persona prompt
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:session-lineage'
dependencies:
  - TASK-141
  - TASK-144
createdAt: '2026-04-07T19:05:12.530Z'
updatedAt: '2026-04-07T19:16:45.626Z'
---

## Description

Create the distiller agent — a read-only coding agent that reads plan artifacts and session transcripts, then produces structured `KnowledgeBundle` JSONL files designed for future SQLite + vector embedding ingestion.\n\n**New files:**\n- `bundled/coding/coding/agents/distiller.ts` — agent definition with `id: \"distiller\"`, `capabilities: [\"core\", \"coding-readonly\"]`, `tools: \"coding\"`, `skills: [\"archive\"]`, `session: \"ephemeral\"`, `loop: false`\n- `bundled/coding/coding/prompts/distiller.md` — persona prompt defining the full distillation workflow, output format (KnowledgeRecord JSON), and quality bar\n\n**Distiller workflow** (encode in prompt):\n1. Read plan.md and tasks\n2. Read session manifest to find transcripts\n3. Read transcript files (planner first, then workers, then quality-manager)\n4. Extract 3-15 KnowledgeRecord objects: one concept per record, self-contained, classified by type enum\n5. Write KnowledgeBundle to `memory/<planSlug>.knowledge.jsonl`\n6. Optionally write `memory/<planSlug>.md` human-readable summary\n\n**Quality bar** (enforce in prompt): essential only, self-contained, concrete, actionable.

## Implementation Plan

All 5 ACs satisfied:
#1 ✅ distiller.ts exports valid AgentDefinition with all specified fields
#2 ✅ distiller.md encodes full workflow: read plan+tasks → manifest → transcripts → KnowledgeRecords → bundle → write
#3 ✅ KnowledgeRecord JSON schema with all fields and KnowledgeType enum table documented
#4 ✅ Quality bar enforced: 3-15 records, self-contained content, essential-only filter, concrete language
#5 ✅ Output written to memory/<planSlug>.knowledge.jsonl in JSONL format (one record per line)

<!-- AC:BEGIN -->
- [ ] #1 bundled/coding/coding/agents/distiller.ts exports a valid AgentDefinition with the specified fields
- [ ] #2 bundled/coding/coding/prompts/distiller.md contains the full distillation workflow: read plan+tasks, read manifest, read transcripts, produce KnowledgeRecords, write bundle
- [ ] #3 Prompt specifies the KnowledgeRecord JSON schema with all required fields and the type enum values
- [ ] #4 Prompt enforces the quality bar: 3-15 records, self-contained content, essential-only filter, concrete language
- [ ] #5 Prompt instructs writing output to memory/<planSlug>.knowledge.jsonl in JSONL format (one record per line)
<!-- AC:END -->

## Implementation Notes

Created two files:
- `bundled/coding/coding/agents/distiller.ts`: AgentDefinition with id="distiller", capabilities=["core","coding-readonly"], tools="coding", skills=["archive"], session="ephemeral", loop=false, extensions=[].
- `bundled/coding/coding/prompts/distiller.md`: Full workflow prompt covering all 8 steps (read plan → read tasks → read manifest → read transcripts → extract records → assemble bundle → write JSONL → write optional .md). Includes complete KnowledgeRecord schema with type enum table, quality bar rules (3-15 records, self-contained, concrete, actionable, no duplicates), and exact JSONL format with one record per line.

The `tools: "coding"` field was chosen (matching the task spec) even though the agent is read-only in practice — the capabilities list uses "coding-readonly" to enforce read-only discipline at the prompt level while still giving access to the full coding toolset for file reading.
