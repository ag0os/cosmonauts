---
id: TASK-563
title: 'Stage 5: Adapt the distiller and expose the safe proposal tool'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:knowledge-surface'
dependencies:
  - TASK-562
createdAt: '2026-08-19T18:35:41.910Z'
updatedAt: '2026-08-19T18:35:41.910Z'
---

## Description

Begin Slice B at Stage 5 after Precondition 1 and own B-009 and B-013. Adapt the single resolved coding distiller and archive contract to attributable OKF proposals, and expose one distiller-only proposal adapter through the configured session extension. Tests must be observed RED before implementation, then GREEN, followed by refactoring to one proposal derivation/composer.

OKF v0.1 markdown with only `decision | trade-off | gotcha | convention`, strict machine provenance, `memory/agent/proposals/` as the sole machine-knowledge output root, and human-only promotion are fixed ground. D-010/D-015 permit no sandbox and scope enabled framework retrieval to Cosmonauts-assembled sessions. Shipped prompts and skills must remain stack-agnostic. Preserve the default-OFF gate and exclusions: no second extractor, consolidation, working state, episode/explicit-save changes, embeddings, retention, or enabled-by-default behavior. Halt and escalate rather than narrowing ratified AC/INV ground.

<!-- AC:BEGIN -->
- [ ] #1 B-009 is GREEN: the existing resolved coding distiller and archive guidance union and path-deduplicate manifest-referenced Tier-2 transcripts from active and archived roots, and fall back to plan/tasks only when neither root yields transcripts.
- [ ] #2 Distiller guidance requires 3–15 one-concept OKF markdown proposals with one of the four ratified types and full writer/source/date provenance, forbids JSONL, embeddings, and verbatim transcript/file/command excerpts, and names only `memory/agent/proposals/` as machine output.
- [ ] #3 B-013 is GREEN: only the qualified distiller receives the proposal tool; its schema accepts plan slug, type, title, description, content, tags, source, and optional source date but no path/resource; ordinary enabled sessions do not receive it.
- [ ] #4 The proposal adapter supplies the qualified writer and complete typed identity/draft through `MemoryStore.write`; two same-writer calls without source date after time advances resolve to the unchanged first proposal.
- [ ] #5 Dedicated proposal and memory pathways never write curated `knowledge/`, promotion remains a human act, and generic tools/backends remain outside this unsandboxed framework boundary without any path guard or disabled-tool claim.
- [ ] #6 One canonical proposal derivation is shared by adapter/store validation, the configured session composer remains the only enabled factory owner, and no second extractor, JSONL compatibility writer, consolidation path, WeakMap, singleton, or correctness cache is introduced.
- [ ] #7 Executable tests for B-009 and B-013 carry the exact `@cosmo-behavior plan:knowledge-surface#B-###` markers, are run RED before implementation and GREEN after refactor, cover active/archive/fallback and authority/schema/retry negatives, and every changed shipped prompt or skill remains stack-agnostic.
<!-- AC:END -->
