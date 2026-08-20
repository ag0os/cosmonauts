---
id: TASK-562
title: 'Precondition 1: Resolve the coding distiller location before Stage 5'
status: Done
priority: high
labels:
  - backend
  - 'plan:knowledge-surface'
dependencies:
  - TASK-561
createdAt: '2026-08-19T18:35:29.509Z'
updatedAt: '2026-08-20T16:47:59.279Z'
---

## Description

Run the plan’s coding-location precondition after Slice A is GREEN and immediately before Stage 5. This is a sequencing checkpoint and owns no B-### behavior. It must account for the active `coding-extraction` plan rather than assuming the location observed during planning is still current.

D-014 requires one existing coding extraction mechanism; D-022 is the recorded derived collision protocol. If extraction has landed, stop before prompt/agent implementation and amend the plan’s file/test ownership on the record to the installed coding-domain location resolved by `DomainResolver`. Never create a second framework distiller or duplicate extractor.

<!-- AC:BEGIN -->
- [x] #1 Current repository and `DomainResolver` evidence establishes the single installed coding distiller and its prompt/test ownership immediately before Stage 5 starts.
- [x] #2 When `bundled/coding/` still owns the distiller, the Stage 5 handoff names that existing location; when `coding-extraction` has landed, implementation remains stopped until D-022 is applied on the record to the resolved installed-domain paths.
- [x] #3 The precondition introduces no duplicate distiller, framework extraction path, consolidation mechanism, source implementation, or shipped prompt/skill change.
- [x] #4 The resolved location and its evidence (paths checked, `DomainResolver` output) are recorded as a dated confirmation note appended to this task file — or as the D-022 on-record plan amendment when extraction has landed — before TASK-563 starts; without that record this task is not complete.
<!-- AC:END -->

## Implementation Notes

## Confirmation — 2026-08-20 (immediately before Stage 5)

- Sequencing evidence: TASK-561 is Done with AC #1–#8 checked; TASK-563 remains To Do with every AC unchecked.
- Cross-plan evidence: coding-extraction remains active, says it “awaits planner design,” and has no plan:coding-extraction tasks. bundled/coding/, its cosmonauts.json, and its domain manifest are present. Extraction has therefore not landed, so the D-022 installed-domain plan-amendment branch is not triggered.
- Runtime/DomainResolver evidence: constructing CosmonautsRuntime with discoverFrameworkBundledPackageDirs returned bundledDirs: ["/Users/cosmos/Projects/cosmonauts/bundled/coding"], registry IDs shared,coding,main, and one coding root/provenance entry: rootDirs: ["/Users/cosmos/Projects/cosmonauts/bundled/coding"], origin bundled:coding, precedence 0.5, kind domain-root. The registry reports hasDistillerAgent: true and prompt distiller; DomainResolver.resolvePersonaPath("distiller", "coding") returned /Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/distiller.md.
- Filesystem ownership checked: bundled/coding/agents/distiller.ts, bundled/coding/prompts/distiller.md, domains/shared/skills/archive/SKILL.md, tests/prompts/archive-skill.test.ts, and tests/extensions/agent-memory.test.ts all exist. A repository scan excluding .git/, node_modules/, and missions/ found only the one distiller source and one persona prompt under bundled/coding/.
- Stage 5 handoff: adapt the existing coding/distiller only at bundled/coding/agents/distiller.ts and bundled/coding/prompts/distiller.md; keep archive guidance ownership at domains/shared/skills/archive/SKILL.md; add B-009 coverage in tests/prompts/archive-skill.test.ts and B-013 coverage in tests/extensions/agent-memory.test.ts. Do not create a framework distiller, duplicate extractor, consolidation path, or alternate prompt/test owner.
