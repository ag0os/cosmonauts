---
id: TASK-390
title: Implement domain public-surface deny-list core and diagnostics
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:domain-authoring'
dependencies:
  - TASK-389
createdAt: '2026-06-23T21:14:17.849Z'
updatedAt: '2026-06-24T13:38:50.034Z'
---

## Description

Implementation Order step 4. Add the typed `internal` deny-list model and central public-surface rules, then use them for agent visibility diagnostics and domain authoring validation. This task owns B-005, B-006, and B-014; behavior tests must use the named files and exact markers.

<!-- AC:BEGIN -->
- [x] #1 B-005 domains with no `manifest.internal` expose all discovered agents, skills, and chains by default, proven in `tests/domains/public-surface.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-005`.
- [x] #2 B-006 `internal.agents` hides only named agents from outside the owning domain, keeps unnamed agents and omitted asset-type lists public, and reports internal-agent access distinctly from not-found, proven in `tests/agents/resolver.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-006`.
- [x] #3 B-014 missing persona validation names the domain, agent, and expected `prompts/<agent-id>.md` path, proven in `tests/domains/validator.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-014`.
- [x] #4 The public-surface rule implementation is centralized for agents, skills, and chains so later integrations do not duplicate deny-list interpretation.
<!-- AC:END -->
