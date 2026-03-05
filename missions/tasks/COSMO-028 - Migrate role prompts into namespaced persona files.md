---
id: COSMO-028
title: Migrate role prompts into namespaced persona files
status: To Do
priority: high
labels:
  - forge
  - backend
  - 'plan:prompt-architecture'
dependencies:
  - COSMO-027
createdAt: '2026-02-26T20:57:30.318Z'
updatedAt: '2026-02-26T20:57:30.318Z'
---

## Description

Create persona files under prompts/agents/coding/ for cosmo, planner, task-manager, coordinator, and worker. Migrate role-specific identity/workflow/rules into personas, deduplicating generic guidance now covered by capability files while keeping each persona operationally coherent.

<!-- AC:BEGIN -->
- [ ] #1 Persona files exist for all five built-in agents under prompts/agents/coding/
- [ ] #2 Each persona defines only its own identity and role workflow
- [ ] #3 Cross-agent identity bleed is removed (no persona claims another agent identity)
- [ ] #4 Role-specific constraints remain explicit in each persona after deduplication
- [ ] #5 Legacy role prompts are still present at the end of this task for compatibility until final cleanup
<!-- AC:END -->
