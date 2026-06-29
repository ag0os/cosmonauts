---
id: TASK-414
title: Make CLI shared+main-only mode and init runnable
status: To Do
priority: high
labels:
  - api
  - backend
  - testing
  - 'plan:coding-agnostic-framework'
dependencies: []
createdAt: '2026-06-26T15:43:37.109Z'
updatedAt: '2026-06-26T15:43:37.109Z'
---

## Description

Update CLI no-domain/run/init guard semantics so `main` is treated as the runnable framework default. This task owns B-022 and B-023. Planned-behavior tests must include markers near executable tests: `@cosmo-behavior plan:coding-agnostic-framework#B-022` and `#B-023`.

<!-- AC:BEGIN -->
- [ ] #1 B-022 CLI mode selection treats shared+main-only runtimes as runnable for interactive and print modes, and still guards with domain-neutral copy when `main` is absent.
- [ ] #2 B-023 CLI init proceeds from the default lead `main/cosmo` in a shared+main-only runtime and does not instruct users to install `coding`.
- [ ] #3 Run-mode selection, no-domain guard, and init guard consume one shared runnable-default predicate so the paths cannot diverge.
- [ ] #4 Existing additional-domain runtimes such as bundled `coding` remain runnable exactly as before.
<!-- AC:END -->
