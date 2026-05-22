---
id: TASK-325
title: Perform artifact-conformance integration and no-scope-creep verification
status: Done
priority: medium
labels:
  - testing
  - backend
  - 'plan:artifact-conformance-gate'
dependencies:
  - TASK-323
  - TASK-324
createdAt: '2026-05-22T15:56:19.689Z'
updatedAt: '2026-05-22T16:35:08.421Z'
---

## Description

Complete the plan's coherence and final verification pass after library, CLI, and guidance work land. This task owns cross-cutting validation only; it must not add new product scope beyond the approved plan. Relevant seams: public `lib/artifacts` exports, CLI registration, path handling, issue evidence, and guidance scope language. Source ACs: AC-001 through AC-010 as integrated behavior evidence.

<!-- AC:BEGIN -->
- [ ] #1 All planned behavior tests for B-001 through B-012 exist with matching `@cosmo-behavior plan:artifact-conformance-gate#B-###` markers and the named tests from the plan are present.
- [ ] #2 The integrated public API, CLI command, and guidance together preserve the approved dependency direction: CLI depends inward on `lib/artifacts` and slug validation; `lib/artifacts` does not depend on CLI, Drive, tasks, prompt runtime, or plan manager code.
- [ ] #3 Path handling and issue evidence remain coherent across library and CLI output: unsafe paths are rejected before reads, missing files/markers are distinguishable, and structured result fields are preserved in JSON mode.
- [ ] #4 No excluded scope has slipped in: no full Quality Contract runner, `.cosmonauts` gate bindings, Drive auto-wiring, AST/proximity parser, HTML rendering, memory ingestion, or legacy-plan back-migration.
- [ ] #5 Project verification commands `bun run test`, `bun run lint`, and `bun run typecheck` pass after the integrated changes.
<!-- AC:END -->
