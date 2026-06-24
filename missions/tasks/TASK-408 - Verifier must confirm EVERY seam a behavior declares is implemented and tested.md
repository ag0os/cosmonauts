---
id: TASK-408
title: Verifier must confirm EVERY seam a behavior declares is implemented and tested
status: To Do
priority: medium
labels:
  - verification
  - prompts
dependencies: []
createdAt: '2026-06-24T17:30:31.326Z'
updatedAt: '2026-06-24T17:30:31.326Z'
---

## Description

PROBLEM (observed): behavior B-022 declared three seams (`manifest.ts`,
`installer.ts`, `scanner.ts`) but the worker implemented the rule at the
installer ONLY, leaving manifest/scanner unprotected (finding I-002). The narrow
acceptance criterion was satisfiable at a single site, and verification did not
catch the partial coverage.

WHERE (persona files — additive edits):
- `bundled/coding/prompts/integration-verifier.md` — verification.
- `bundled/coding/prompts/task-manager.md` and
  `bundled/coding/prompts/planner.md` — behavior/task granularity.

WHAT TO DO:
(a) integration-verifier: when a behavior or task names MULTIPLE seams
(files/modules), verify that EACH named seam is actually touched and exercised
by a test — flag a behavior whose rule is implemented at only a subset of its
declared seams. (b) task-manager/planner: prefer splitting a multi-seam rule
into one assertion per seam, or write acceptance criteria that explicitly
enumerate all seams so partial implementation is detectable.

CONSTRAINTS: edits are ADDITIVE — preserve existing content, including sibling-task
additions to the same files.


<!-- AC:BEGIN -->
- [ ] #1 integration-verifier.md instructs verifying that every declared seam of a behavior is implemented and test-covered, and flagging partial-seam implementations.
- [ ] #2 task-manager.md and/or planner.md guidance encourages one-assertion-per-seam or acceptance criteria that enumerate all seams.
- [ ] #3 All edits are additive and preserve existing persona content.
<!-- AC:END -->
