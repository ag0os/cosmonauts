---
id: TASK-396
title: Rehydrate live bindings and share them with cached runtimes
status: To Do
priority: high
labels:
  - backend
  - api
  - testing
  - 'plan:domain-authoring'
dependencies:
  - TASK-395
createdAt: '2026-06-23T21:15:04.792Z'
updatedAt: '2026-06-23T21:15:04.792Z'
---

## Description

Complete Implementation Order step 8. Rehydrate live binding state from session custom entries and make cached orchestration runtimes observe the same project-scoped live binding store as the interactive command. This task owns B-012 and B-020 with exact behavior markers in the named extension test file.

<!-- AC:BEGIN -->
- [ ] #1 B-012 session resume/fork/new-session replacement replays the latest valid `cosmonauts.domain-binding` custom entry per role into the project-scoped live store and warns on invalid stale entries, proven in `tests/extensions/domain-bindings.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-012`.
- [ ] #2 B-020 cached orchestration runtimes read the shared live binding store and observe later `/domain-bind` changes without rebuilding the runtime, proven in `tests/extensions/domain-bindings.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-020`.
- [ ] #3 The process-global interactive bridge exposes shared domain runtime state consistently across CLI session startup, `/agent` switches, and orchestration extension runtime caches.
<!-- AC:END -->
