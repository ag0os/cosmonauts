---
id: TASK-319
title: Implement behavior-section parser and empty-section diagnostics
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:artifact-conformance-gate'
dependencies: []
createdAt: '2026-05-22T15:55:28.848Z'
updatedAt: '2026-05-22T15:55:28.848Z'
---

## Description

Build the foundation of the artifact-conformance library at seam `lib/artifacts/behavior-conformance.ts`, with public export through `lib/artifacts/index.ts`. Owns behavior tests in `tests/artifacts/behavior-conformance.test.ts` for B-001 and B-002. Tests must carry markers `@cosmo-behavior plan:artifact-conformance-gate#B-001` and `@cosmo-behavior plan:artifact-conformance-gate#B-002` near the executable tests. Source ACs: AC-001, AC-002. Named tests: `parses behavior entries from the Behaviors section`; `reports missing or empty behavior sections as conformance failures`.

<!-- AC:BEGIN -->
- [ ] #1 B-001 / AC-001: The parser extracts `### B-###` entries from an exact `## Behaviors` section, including ID, title, field values, field lines, and test reference text without reading test files.
- [ ] #2 B-001 / AC-001: Required behavior field labels are normalized for Source, Context, Action, Expected, Seam, Test, and Marker, including the planned `Expected result` alias and supported dash variants in behavior headings.
- [ ] #3 B-002 / AC-002: Missing `## Behaviors`, present-but-empty sections, and sections without parseable `### B-###` entries produce top-level conformance issues instead of passing an empty behavior list.
- [ ] #4 The public parser/checker types needed by later tasks are exported from `lib/artifacts` without importing CLI, Drive, task, prompt, or plan-manager code.
- [ ] #5 The named library tests for B-001 and B-002 pass and include the required `@cosmo-behavior` markers.
<!-- AC:END -->
