---
id: COSMO-027
title: Create layered prompt foundation files
status: To Do
priority: high
labels:
  - forge
  - backend
  - 'plan:prompt-architecture'
dependencies: []
createdAt: '2026-02-26T20:57:25.259Z'
updatedAt: '2026-02-26T20:57:25.259Z'
---

## Description

Introduce the new Layer 0 and capability packs for the prompt architecture migration. Add prompts/cosmonauts.md plus capabilities/core.md, coding-readwrite.md, coding-readonly.md, tasks.md, spawning.md, and todo.md by extracting reusable guidance from the current base prompt without embedding agent identity.

<!-- AC:BEGIN -->
- [ ] #1 prompts/cosmonauts.md exists and defines platform-wide operating norms for all agents
- [ ] #2 All six capability files exist under prompts/capabilities/ with responsibilities matching the plan
- [ ] #3 Capability files contain no agent identity statements (for example, no 'You are Cosmo')
- [ ] #4 Readonly capability guidance does not instruct read-write or commit workflows
- [ ] #5 Legacy prompt files remain unchanged in this task to keep migration incremental
<!-- AC:END -->
