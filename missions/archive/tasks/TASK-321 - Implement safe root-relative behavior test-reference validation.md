---
id: TASK-321
title: Implement safe root-relative behavior test-reference validation
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:artifact-conformance-gate'
dependencies:
  - TASK-320
createdAt: '2026-05-22T15:55:42.925Z'
updatedAt: '2026-05-22T16:23:21.632Z'
---

## Description

Add safe parsing and path validation for behavior `Test` fields at seam `lib/artifacts/behavior-conformance.ts`. Owns behavior test coverage in `tests/artifacts/behavior-conformance.test.ts` for B-005. Test must carry marker `@cosmo-behavior plan:artifact-conformance-gate#B-005`. Source AC: AC-005. Named test: `rejects empty absolute traversal and symlink-escape test references before reading files`.

<!-- AC:BEGIN -->
- [ ] #1 B-005 / AC-005: Empty or malformed Test values return `invalid-test-reference` issues with actionable field/path evidence.
- [ ] #2 B-005 / AC-005: POSIX absolute paths, Windows absolute paths, NUL-byte paths, and traversal outside the project root are rejected before any file contents are read.
- [ ] #3 B-005 / AC-005: Existing symlink candidates that resolve outside the real project root are rejected before reading contents.
- [ ] #4 B-005 / AC-005: Valid Test references are interpreted as project-root-relative paths, parsing the first inline-code span or text before `>` and preserving optional named-test text as evidence only.
- [ ] #5 The named library test for B-005 passes and includes the required `@cosmo-behavior` marker.
<!-- AC:END -->
