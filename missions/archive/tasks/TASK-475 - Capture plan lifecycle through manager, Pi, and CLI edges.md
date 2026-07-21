---
id: TASK-475
title: 'Capture plan lifecycle through manager, Pi, and CLI edges'
status: Done
priority: medium
labels:
  - backend
  - testing
  - 'plan:episodic-log'
dependencies:
  - TASK-471
  - TASK-473
createdAt: '2026-07-17T20:07:57.906Z'
updatedAt: '2026-07-21T15:56:43.874Z'
---

## Description

Implementation Order step 5 plan-owner branch, parallel with the task-owner branch after the shared checkpoint. Add optional capture context to the plan manager and wire qualified actors plus awaitable warning transport through Pi and CLI create/edit surfaces. This task solely owns B-013 and B-023.

<!-- AC:BEGIN -->
- [x] #1 B-013 (Sources AC-001, AC-002, and AC-006) is proven with `@cosmo-behavior plan:episodic-log#B-013`: context-carrying managers capture exactly `plan.created` after persistence and real `plan.status-changed` transitions; body/title edits and same-status updates produce none, while disabled files/returns stay baseline-identical and capture cannot reject, roll back, or alter `createdAt`.
- [x] #2 B-023 (Sources AC-002 and AC-006) is proven with `@cosmo-behavior plan:episodic-log#B-023`: Pi plan tools supply their qualified runtime actor and one awaited model-visible warning edge, while successful tool text/details stay successful and disabled output stays unchanged.
- [x] #3 CLI plan create/edit uses `cosmonauts/cli` provenance when capture is enabled and preserves its existing output, file, and exit behavior when capture is disabled or fails.
- [x] #4 The project-only gate remains OFF by default at every plan seam, producing byte-identical manager/tool/CLI behavior and zero project/user episode or induced index files.
- [x] #5 Plan episodes are emitted only after primary persistence through the sole `recordEpisode` helper; helper/reporter failures remain non-fatal and visible exactly once at the owning edge.
- [x] #6 Targeted tests catch unconditional capture, same-status capture, pre-persistence capture, fabricated actors, duplicate warnings, and non-status lifecycle noise.
<!-- AC:END -->
