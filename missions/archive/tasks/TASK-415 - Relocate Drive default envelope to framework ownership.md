---
id: TASK-415
title: Relocate Drive default envelope to framework ownership
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:coding-agnostic-framework'
dependencies: []
createdAt: '2026-06-26T15:43:42.746Z'
updatedAt: '2026-06-29T17:34:53.643Z'
---

## Description

Create the framework-owned default Drive envelope resolver and framework-owned envelope copy while leaving the old bundled envelope file untouched for explicit compatibility. This task owns B-010 and B-013. Planned-behavior tests must include markers near executable tests: `@cosmo-behavior plan:coding-agnostic-framework#B-010` and `#B-013`.

<!-- AC:BEGIN -->
- [x] #1 B-010 omitted-envelope resolution returns the framework default envelope under `lib/prompts/framework/drive/` and does not reference `bundled/coding`.
- [x] #2 B-013 missing framework default envelope failure names the missing default path and tells callers how to provide an explicit envelope.
- [x] #3 The framework default envelope content exists in the framework-owned location and the old bundled envelope file remains untouched as a compatibility copy.
<!-- AC:END -->
