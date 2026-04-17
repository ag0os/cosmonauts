---
id: TASK-193
title: 'Verification sweep: tests, lint, and non-persisted-output reviewer check'
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:spec-plan-quality-gates-a'
dependencies:
  - TASK-192
createdAt: '2026-04-17T15:29:07.666Z'
updatedAt: '2026-04-17T15:41:42.319Z'
---

## Description

Run all verification steps for the Quality Contract (QC-001 through QC-007) after all three prompt edits and three prompt-contract tests are in place.

**Steps:**
1. Run targeted prompt tests: `bun run test -- tests/prompts/cosmo.test.ts tests/prompts/spec-writer.test.ts tests/prompts/planner.test.ts`
2. Run repo lint: `bun run lint`
3. Perform a reviewer inspection pass covering QC-007 (the non-persisted-output boundary):
   - Confirm `Readiness Check` does not appear as a new top-level section in the persisted spec output format in `spec-writer.md` (the only persisted sections must remain: Purpose, Users, User Experience, Acceptance Criteria, Scope, Assumptions, Open Questions)
   - Confirm `Plan Readiness Check` does not appear as a new section in the persisted plan output format in `planner.md` (`planner.md:218-248`)
4. Confirm no files outside the six listed in Files to Change were modified (`cosmo.md`, `spec-writer.md`, `planner.md`, `cosmo.test.ts`, `spec-writer.test.ts`, `planner.test.ts`)

If any check fails, open findings against the relevant preceding task before marking this task Done.

<!-- AC:BEGIN -->
- [x] #1 bun run test -- tests/prompts/cosmo.test.ts tests/prompts/spec-writer.test.ts tests/prompts/planner.test.ts exits with no failures (QC-001 through QC-005)
- [x] #2 bun run lint exits with no errors or warnings introduced by the modified or added files (QC-006)
- [x] #3 Reviewer confirms the Readiness Check block does not appear as a new persisted section in the spec-writer.md output format (QC-007)
- [x] #4 Reviewer confirms Plan Readiness Check is not present in the persisted plan output format sections of planner.md (QC-007)
- [x] #5 No files outside the six Files to Change were modified during implementation
<!-- AC:END -->

## Implementation Notes

Verification-only task; no repository code changes were needed, so no commit was created.

Results:
- Targeted prompt tests passed: `bun run test -- tests/prompts/cosmo.test.ts tests/prompts/spec-writer.test.ts tests/prompts/planner.test.ts`
- `bun run lint` reported only pre-existing formatting issues in `.cosmonauts/config.json` and `missions/tasks/config.json`; no lint findings were reported for the six plan files.
- Reviewer check passed: `Readiness Check` is kept conversational before the persisted spec format at `bundled/coding/coding/prompts/spec-writer.md:107-109`, and the persisted spec sections remain unchanged there.
- Reviewer check passed: `Plan Readiness Check` is kept conversational before the persisted plan format at `bundled/coding/coding/prompts/planner.md:153-167`, and it does not appear in the plan output format section.
- Scope check passed: `git diff --name-only HEAD~4..HEAD` and `git diff --stat HEAD~4..HEAD` show only the six planned files changed across TASK-189 through TASK-192.
