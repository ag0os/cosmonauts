---
id: TASK-444
title: Add architecture generate CLI and CLI-owned narrative provider
status: To Do
priority: high
labels:
  - backend
  - devops
  - testing
  - 'plan:code-structure-map'
dependencies:
  - TASK-443
createdAt: '2026-07-03T14:13:20.475Z'
updatedAt: '2026-07-03T14:13:20.475Z'
---

## Description

Implementation order step 5. Behavior ownership: owns B-009 only. Wire `cosmonauts architecture generate` and alias dispatch through the CLI edge, instantiate the concrete Pi narrative provider only at that edge, and preserve the generator result union as the command's source of truth for printed statuses and exit behavior. Planned-behavior tests must carry `@cosmo-behavior plan:code-structure-map#B-009`.

<!-- AC:BEGIN -->
- [ ] #1 The top-level CLI dispatches `architecture generate` and `arch generate` with the planned `--no-narrative`, `--json`, and `--plain` surfaces.
- [ ] #2 The CLI constructs the concrete narrative provider only outside `lib/architecture-map` and honors `--no-narrative` by using the generator's pending-narrative semantics.
- [ ] #3 Written, unchanged, unsupported, and failed generator results produce the planned user-facing status output and exit behavior.
- [ ] #4 B-009: non-TypeScript projects report an unsupported-project result explaining W1's TypeScript-only support and do not create or modify `memory/architecture/`.
- [ ] #5 Tests for B-009 carry the required `@cosmo-behavior plan:code-structure-map#B-009` marker and cover unsupported-project no-write behavior.
- [ ] #6 Quality Contract: architecture-map core does not import CLI or Pi runtime/session APIs.
<!-- AC:END -->
