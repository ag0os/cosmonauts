---
id: TASK-322
title: 'Verify test files, exact markers, and structured conformance evidence'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:artifact-conformance-gate'
dependencies:
  - TASK-321
createdAt: '2026-05-22T15:55:51.777Z'
updatedAt: '2026-05-22T16:27:30.184Z'
---

## Description

Complete filesystem-backed artifact conformance in `lib/artifacts/behavior-conformance.ts`. Owns behavior tests in `tests/artifacts/behavior-conformance.test.ts` for B-006, B-007, and B-008. Tests must carry markers `@cosmo-behavior plan:artifact-conformance-gate#B-006`, `#B-007`, and `#B-008`. Source ACs: AC-006, AC-007, AC-008, AC-010. Named tests: `reports missing test files using project root relative paths`; `checks exact marker text in any referenced file type without parsing test ASTs`; `returns structured evidence for passing and failing behaviors`.

<!-- AC:BEGIN -->
- [ ] #1 B-006 / AC-006: Safe project-root-relative Test paths pass file-existence validation only when the referenced file exists; missing files produce `missing-test-file` issues with root-relative path evidence.
- [ ] #2 B-007 / AC-007, AC-010: Existing safe referenced files are read as UTF-8 text and pass only when they contain the exact marker text, without importing or invoking Vitest, TypeScript compiler APIs, or any framework-specific AST parser.
- [ ] #3 B-007 / AC-007: Missing exact marker text produces a `missing-marker` issue, and arbitrary referenced file types are handled by text inclusion only.
- [ ] #4 B-008 / AC-008: `ArtifactConformanceResult` includes `ok`, `planSlug`, optional `planPath`, behavior-level evidence, top-level issue aggregation, issue kinds, messages, and relevant field/path/marker details.
- [ ] #5 Boundary conformance is preserved: `lib/artifacts` does not depend on CLI, Drive, tasks, prompt runtime, or plan manager code.
- [ ] #6 The named library tests for B-006 through B-008 pass and include the required `@cosmo-behavior` markers.
<!-- AC:END -->
