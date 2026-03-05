---
id: COSMO-024
title: Forge archive distillation skill
status: To Do
priority: medium
labels:
  - forge
  - skill
  - plan:forge-lifecycle
dependencies:
  - COSMO-023
createdAt: '2026-02-26T00:00:00.000Z'
updatedAt: '2026-02-26T00:00:00.000Z'
---

## Description

Create `skills/domains/forge-archive/SKILL.md` — a Pi skill that teaches agents how to distill archived plans and tasks into memory files.

The skill should cover: how to find archived materials in `forge/archive/`, what to extract (what was built, key decisions, patterns established, files changed, gotchas and lessons), the output format for memory files in `memory/`, and the procedure for reading all source materials before writing the memory file.

The skill is source-agnostic in spirit — it teaches distillation as a general capability, with forge archives as the primary use case. Future sources (conversations, design reviews) can extend the pattern.

<!-- AC:BEGIN -->
- [ ] #1 SKILL.md exists at `skills/domains/forge-archive/SKILL.md` with proper frontmatter (name, description)
- [ ] #2 Covers the distillation procedure: locate archived plan + tasks, read all materials, extract learnings
- [ ] #3 Defines the memory file output format (frontmatter + sections: what was built, key decisions, patterns, files changed, gotchas)
- [ ] #4 Explains where memory files go (`memory/` at project root) and naming convention
- [ ] #5 Includes guidance on what makes good vs bad distillation (concise, actionable, decision-focused — not a changelog)
<!-- AC:END -->
