---
id: TASK-320
title: Add required-field and marker conformance validation
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:artifact-conformance-gate'
dependencies:
  - TASK-319
createdAt: '2026-05-22T15:55:36.257Z'
updatedAt: '2026-05-22T16:19:14.405Z'
---

## Description

Extend the artifact-conformance checker at seam `lib/artifacts/behavior-conformance.ts` to report structured field and marker issues. Owns behavior tests in `tests/artifacts/behavior-conformance.test.ts` for B-003 and B-004. Tests must carry markers `@cosmo-behavior plan:artifact-conformance-gate#B-003` and `@cosmo-behavior plan:artifact-conformance-gate#B-004`. Source ACs: AC-003, AC-004. Named tests: `reports the behavior id and field when a required field is missing`; `rejects markers with the wrong slug behavior id or syntax`.

<!-- AC:BEGIN -->
- [ ] #1 B-003 / AC-003: A behavior missing any required Source, Context, Action, Expected, Seam, Test, or Marker field returns an issue naming the behavior ID and missing field.
- [ ] #2 B-004 / AC-004: A malformed marker, wrong plan slug, or wrong behavior ID returns an `invalid-marker` issue with expected and actual marker text.
- [ ] #3 B-004 / AC-004: Marker comparison expects exactly `@cosmo-behavior plan:<slug>#<behaviorId>` after trimming optional surrounding backticks.
- [ ] #4 Structured issue objects include stable kind, message, behavior ID, field/line when relevant, and expected/actual marker evidence as planned.
- [ ] #5 The named library tests for B-003 and B-004 pass and include the required `@cosmo-behavior` markers.
<!-- AC:END -->
