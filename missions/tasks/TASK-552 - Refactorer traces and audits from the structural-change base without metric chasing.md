---
id: TASK-552
title: >-
  Refactorer traces and audits from the structural-change base without metric
  chasing
status: To Do
priority: high
labels:
  - 'plan:analysis-investigation-procedures'
  - documentation
  - testing
dependencies:
  - TASK-551
createdAt: '2026-08-05T15:24:21.079Z'
updatedAt: '2026-08-05T15:24:21.079Z'
---

## Description

Stage 2 of `missions/plans/analysis-investigation-procedures/plan.md`.
Implements B-023 (sources AC-010, and delivers the procedure half of
AC-004, AC-005, and AC-008 for the refactoring role).

Context the behavior describes: behavior is green and a structural delta is
uncommitted. The Refactorer must trace what it moves or removes and audit
the changed scope from the structural-change base.

Obligations the prompt must carry:

- Trace reachability and references before moving or removing a file,
  export, type, or dependency. This extends the existing "trace the call
  sites" instruction under Understand the Code from reading alone to
  capability evidence where it is available.
- Audit the changed scope from an explicit literal base — the
  structural-change base, meaning the SHA of the commit the structural
  change starts from (after any characterization-test commit, before the
  structural change). Never omit the base, never substitute a symbolic ref
  or branch name, never widen to the whole project.
- Report the outcome explicitly with the full protocol: completed evidence
  is stated; unbound is recorded as unavailable evidence, never as clean;
  unsupported degrades only that metric or scope; a failed binding or
  invocation blocks completion — set the task Blocked with the failure
  evidence rather than marking it Done.
- Metric chasing is the failure mode this role must be immunized against.
  No-behavior-change discipline outranks every metric: a better number is
  never a reason to change behavior, and a finding that cannot be cleared
  without changing observable behavior is out of scope for a refactoring
  task — note it in implementation notes and leave it. This must be stated
  explicitly, not implied by the existing "never change behavior" rule.
- Proposed changes from a preview capability are proposals for review, not
  authorization to edit.

INV-1 is the hard constraint: no concrete analyzer name, no provider name,
no command anywhere in the added content.

Seam: `bundled/coding/prompts/refactorer.md`
Test: `tests/prompts/analysis-procedures.test.ts` >
`requires refactorer trace and changed scope evidence without metric chasing`
Marker: `@cosmo-behavior plan:analysis-investigation-procedures#B-023`

The test lands before the prompt edit. Pin operative sentences, not bare
tokens.

Record the commit SHA at task start; that SHA is the changed-scope base for
any audit run at task close.

Ratified ground: INV-1..INV-5, D-013, D-021. Do not touch the capability
runtime, the gate vocabulary, the seven capability names, or any other
role's prompt.


<!-- AC:BEGIN -->
- [ ] #1 Refactorer prompt requires tracing reachability and references before moving or removing a file, export, type, or dependency
- [ ] #2 Refactorer prompt requires a changed-scope audit from an explicit literal structural-change base SHA, with symbolic refs, branch names, and silent widening forbidden
- [ ] #3 Refactorer prompt states each outcome with its own operative rule: completed evidence is stated; unbound is recorded as unavailable and never read as clean; unsupported degrades only that metric or scope; failed blocks completion and the task is set Blocked with the failure evidence preserved
- [ ] #4 Refactorer prompt states explicitly that no-behavior-change discipline outranks every metric — a better number is never a reason to change behavior, and a finding that cannot be cleared without changing observable behavior is noted rather than acted on
- [ ] #5 Refactorer prompt states that previewed changes are proposals for review, not authorization to edit
- [ ] #6 No concrete analyzer name, provider name, or runnable command appears anywhere in `bundled/coding/prompts/refactorer.md`
- [ ] #7 `tests/prompts/analysis-procedures.test.ts` contains a test named `requires refactorer trace and changed scope evidence without metric chasing` carrying marker `@cosmo-behavior plan:analysis-investigation-procedures#B-023`, which pins the operative sentence of each obligation above rather than bare tokens, and asserts the absence of any provider name across the whole prompt
- [ ] #8 The project test, lint, and type-check steps pass, and no existing test is deleted, renamed, or weakened
<!-- AC:END -->
