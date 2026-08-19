---
id: TASK-562
title: 'Precondition 1: Resolve the coding distiller location before Stage 5'
status: To Do
priority: high
labels:
  - backend
  - 'plan:knowledge-surface'
dependencies:
  - TASK-561
createdAt: '2026-08-19T18:35:29.509Z'
updatedAt: '2026-08-19T18:35:29.509Z'
---

## Description

Run the plan’s coding-location precondition after Slice A is GREEN and immediately before Stage 5. This is a sequencing checkpoint and owns no B-### behavior. It must account for the active `coding-extraction` plan rather than assuming the location observed during planning is still current.

D-014 requires one existing coding extraction mechanism; D-022 is the recorded derived collision protocol. If extraction has landed, stop before prompt/agent implementation and amend the plan’s file/test ownership on the record to the installed coding-domain location resolved by `DomainResolver`. Never create a second framework distiller or duplicate extractor.

<!-- AC:BEGIN -->
- [ ] #1 Current repository and `DomainResolver` evidence establishes the single installed coding distiller and its prompt/test ownership immediately before Stage 5 starts.
- [ ] #2 When `bundled/coding/` still owns the distiller, the Stage 5 handoff names that existing location; when `coding-extraction` has landed, implementation remains stopped until D-022 is applied on the record to the resolved installed-domain paths.
- [ ] #3 The precondition introduces no duplicate distiller, framework extraction path, consolidation mechanism, source implementation, or shipped prompt/skill change.
<!-- AC:END -->
