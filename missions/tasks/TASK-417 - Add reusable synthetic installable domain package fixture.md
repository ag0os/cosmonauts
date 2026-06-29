---
id: TASK-417
title: Add reusable synthetic installable domain package fixture
status: To Do
priority: high
labels:
  - testing
  - backend
  - 'plan:coding-agnostic-framework'
dependencies: []
createdAt: '2026-06-26T15:43:52.848Z'
updatedAt: '2026-06-26T15:43:52.848Z'
---

## Description

Provide the shared test helper for tests that need installable-domain/package realism without using real bundled `coding`. This task owns B-014. Planned-behavior tests must include marker `@cosmo-behavior plan:coding-agnostic-framework#B-014` near the executable test.

<!-- AC:BEGIN -->
- [ ] #1 B-014 the synthetic package helper can write and load an installable domain package through the real package scanner/loader seams.
- [ ] #2 Loaded synthetic domains expose the requested id, lead, agents, prompts, capabilities, skills, optional chains, and root-domain provenance.
- [ ] #3 The helper supports project-installed package placement for black-box CLI tests without modeling unused domain-package features.
<!-- AC:END -->
