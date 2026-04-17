---
id: TASK-149
title: Update archive skill to reference distiller agent and knowledge records
status: Done
priority: low
assignee: worker
labels:
  - backend
  - 'plan:session-lineage'
dependencies:
  - TASK-148
createdAt: '2026-04-07T19:05:19.434Z'
updatedAt: '2026-04-07T19:18:17.074Z'
---

## Description

Update `domains/shared/skills/archive/SKILL.md` to document the new distillation flow: after archiving a plan, spawn the distiller agent to read transcripts and produce structured knowledge records.\n\n**Modified files:**\n- `domains/shared/skills/archive/SKILL.md` — update the distillation procedure section to reference the distiller agent, describe the three-tier knowledge pipeline (raw sessions → transcripts → knowledge records), and instruct agents on when/how to invoke the distiller

<!-- AC:BEGIN -->
- [ ] #1 SKILL.md describes the three-tier knowledge pipeline: raw JSONL sessions → transcript markdown → knowledge records JSONL
- [ ] #2 SKILL.md instructs agents to spawn the distiller agent after archive to produce memory/<planSlug>.knowledge.jsonl
- [ ] #3 SKILL.md explains that knowledge records in memory/ are the durable output and are not moved on archive
- [ ] #4 Existing archive skill content is preserved and extended, not replaced
<!-- AC:END -->

## Implementation Notes

Updated domains/shared/skills/archive/SKILL.md with a new "Structured Knowledge Records (Distiller Agent)" section appended after the existing "Source-Agnostic Design" section. Existing content untouched.

The new section covers all four ACs:
- Three-tier pipeline diagram (raw JSONL → transcript markdown → knowledge records JSONL) with lifecycle notes
- Explicit spawn_agent distiller instruction with step-by-step distiller workflow
- Clear statement that memory/<slug>.knowledge.jsonl and memory/<slug>.md are NOT moved on archive (sessions are moved, knowledge records are not)
- All original content preserved — section added as an extension, not a replacement
