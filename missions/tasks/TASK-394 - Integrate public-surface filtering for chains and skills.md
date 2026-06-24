---
id: TASK-394
title: Integrate public-surface filtering for chains and skills
status: Done
priority: medium
labels:
  - backend
  - testing
  - 'plan:domain-authoring'
dependencies:
  - TASK-393
createdAt: '2026-06-23T21:14:48.398Z'
updatedAt: '2026-06-24T14:02:47.117Z'
---

## Description

Implementation Order step 7. Apply the centralized `internal` deny-list rules to named chain visibility and effective skill catalogs for cross-domain consumers, without changing capability or extension resolution. This task owns B-018 and B-019 with exact behavior markers in the named tests.

<!-- AC:BEGIN -->
- [x] #1 B-018 chains named in `internal.chains` are hidden from outside the owning domain but remain usable by same-domain consumers, proven in `tests/chains/named-chain-loader.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-018`.
- [x] #2 B-019 skills named in `internal.skills` are absent from cross-domain agents' effective skill catalogs while unnamed skills and same-domain access remain available, proven in `tests/agents/skills.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-019`.
- [x] #3 Wildcard-skill agents do not bypass public-surface filtering when cross-domain skill visibility rules apply.
- [x] #4 Internal-chain and unknown-chain failures remain distinguishable where chain resolution reports errors.
<!-- AC:END -->
