---
id: TASK-443
title: 'Implement narrative reuse, pending status, and completion lifecycle'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:code-structure-map'
dependencies:
  - TASK-442
createdAt: '2026-07-03T14:13:13.185Z'
updatedAt: '2026-07-03T14:13:13.185Z'
---

## Description

Implementation order step 4, narrative lifecycle slice. Behavior ownership: owns B-005, B-006, B-010, and B-021 only. Complete the generator's narrative seam so model-backed prose is optional, testable with fakes, invalidated by skeleton changes rather than full source-body changes, and pending narratives can be completed later without destabilizing unchanged records. Planned-behavior tests must carry markers for the owned behavior IDs.

<!-- AC:BEGIN -->
- [ ] #1 B-005: body-only source edits may update source freshness metadata but reuse prior module narrative, keep the skeleton hash stable, and do not call the narrative provider for that module.
- [ ] #2 B-006: public-interface or barrel-surface edits change only the affected module's skeleton hash, call the narrative provider for that module, and preserve unrelated module narratives.
- [ ] #3 B-010: disabled, budget-exhausted, or failed narrative generation writes the mechanical spine with `pending` narrative status and a reason, and the index shows an explicit pending one-line narrative.
- [ ] #4 B-021: a later refresh with unchanged source/config and an available provider completes pending narratives up to the configured budget, reports `written`, and leaves unaffected module files untouched.
- [ ] #5 Narrative provider contracts stay in the architecture-map core while the concrete Pi-backed provider remains a CLI-edge concern.
- [ ] #6 Tests for B-005, B-006, B-010, and B-021 carry the required `@cosmo-behavior plan:code-structure-map#...` markers and never make live model calls.
- [ ] #7 Quality Contract: narrative invalidation is based on `skeletonHash`, not `sourceHash`, with timestamp inheritance preventing no-op churn.
<!-- AC:END -->
