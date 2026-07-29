---
id: TASK-524
title: Align trace target legality across generic and provider contracts
status: To Do
priority: medium
labels:
  - api
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:analysis-capability-runtime'
dependencies: []
createdAt: '2026-07-29T18:36:32.695Z'
updatedAt: '2026-07-29T18:36:32.695Z'
---

## Description

Remediate merged findings F-004 and UR-003 without violating INV-4. Every trace request accepted by the generic schema must either execute for the bound provider or degrade before provider execution. Do not globally require Fallow-only fields unless cross-tool evidence supports that generic restriction.

<!-- AC:BEGIN -->
- [ ] #1 Every trace target accepted by the generic TypeScript and TypeBox schemas executes for the bound provider or returns a structured pre-execution unsupported/invalid request outcome, never a provider invalid-output failure.
- [ ] #2 Symbol and duplicate-location legality is consistent across types, schemas, docs, resolver, and runtime validation.
- [ ] #3 Tests cover every target variant with and without provider-specific optional identity fields.
- [ ] #4 The final contract remains plausible for at least two real tools under INV-4.
<!-- AC:END -->
