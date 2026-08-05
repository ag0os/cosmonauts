---
id: TASK-551
title: Worker traces before deleting and audits the changed scope at task close
status: Done
priority: high
labels:
  - 'plan:analysis-investigation-procedures'
  - documentation
  - testing
dependencies:
  - TASK-550
createdAt: '2026-08-05T15:24:21.077Z'
updatedAt: '2026-08-05T15:37:09.848Z'
---

## Description

Stage 2 of `missions/plans/analysis-investigation-procedures/plan.md`.
Implements B-022 (sources AC-010, and delivers the procedure half of
AC-004, AC-005, and AC-008).

Context the behavior describes: the Worker is green after a refactor and
has not committed yet. It must trace symbols before deleting them and
audit the changed scope before calling the task done.

Obligations the prompt must carry:

- Trace reachability and references before removing a file, export, type,
  dependency, or other structural element. A deletion made without a trace
  when the capability is available is not acceptable.
- Before commit and before marking the task Done, audit the changed scope
  from an explicit literal base — the commit SHA recorded at task start,
  which is the current pre-commit HEAD. Never omit the base, never
  substitute a branch name, a symbolic ref, or a shell variable, and never
  let the scope widen to the whole project.
- Implementing roles carry the FULL protocol because completion depends on
  it:
  - completed — correct the flagged findings narrowly: the narrowest
    change that clears the specific flagged finding at the flagged
    location; never refactor already-passing code to improve a metric and
    never enlarge the diff beyond what the finding requires.
  - unbound — record that the evidence was unavailable in the task's
    implementation notes and continue; never treat it as a clean result.
  - unsupported — degrade only the unsupported metric or scope; never
    widen the request and never treat the missing evidence as zero.
  - failed — a failed binding or a failed invocation BLOCKS completion.
    Do not mark the task Done: set it Blocked with the failure evidence
    preserved in the implementation notes.
- Proposed changes from a preview capability are proposals for review, not
  authorization to edit; the Worker applies only ordinary, narrow,
  reviewable edits itself.

Preservation constraint — this prompt has two owners across slices. The
migration-sweep clause under "Implement Changes" (the always-on explicit
old-identifier/path search paired with the `dead-code` capability) belongs
to `analysis-gate-rewiring`'s B-031. Preserve it; do not rewrite,
relocate-and-reword, or fold it into the new procedure. Re-run that
slice's prompt tests, not only this slice's.

INV-1 is the hard constraint: no concrete analyzer name, no provider name,
no command anywhere in the added content.

Seam: `bundled/coding/prompts/worker.md`
Test: `tests/prompts/analysis-procedures.test.ts` >
`requires worker trace before delete and audit at task close`
Marker: `@cosmo-behavior plan:analysis-investigation-procedures#B-022`

The test lands before the prompt edit. Pin operative sentences, not bare
tokens — asserting that the words `completed`/`unbound`/`failed` appear
proves nothing.

Record the commit SHA at task start; that SHA is the changed-scope base for
any audit run at task close.

Ratified ground: INV-1..INV-5, D-013, D-021. Do not touch the capability
runtime, the gate vocabulary, the seven capability names, or the Quality
Manager, Verifier, or Fixer prompts — those belong to the two prior slices.
A gap discovered in them is an amend-on-record against the owning plan,
never a workaround here.

<!-- AC:BEGIN -->
- [x] #1 Worker prompt requires tracing reachability and references before removing a file, export, type, or dependency
- [x] #2 Worker prompt requires a changed-scope audit before commit and before marking the task Done, from an explicit literal base equal to the commit SHA recorded at task start (the current pre-commit HEAD), with symbolic refs, branch names, shell variables, and silent widening all forbidden
- [x] #3 Worker prompt states each of the four outcomes with its own operative rule: completed findings are corrected with the narrowest change at the flagged location and never by refactoring passing code to improve a metric; unbound is recorded in implementation notes and never read as clean; unsupported degrades only that metric or scope; failed blocks completion and the task is set Blocked with the failure evidence preserved
- [x] #4 Worker prompt states that previewed changes are proposals for review and that the Worker applies only ordinary, narrow, reviewable edits itself
- [x] #5 The `analysis-gate-rewiring` migration-sweep clause in `bundled/coding/prompts/worker.md` is preserved intact, and `tests/prompts/worker.test.ts` plus every existing assertion that pins that clause still pass unchanged
- [x] #6 No concrete analyzer name, provider name, or runnable command appears anywhere in `bundled/coding/prompts/worker.md`
- [x] #7 `tests/prompts/analysis-procedures.test.ts` contains a test named `requires worker trace before delete and audit at task close` carrying marker `@cosmo-behavior plan:analysis-investigation-procedures#B-022`, which pins the operative sentence of each obligation above rather than bare tokens, and asserts the absence of any provider name across the whole prompt
- [x] #8 The project test, lint, and type-check steps pass, and no existing test is deleted, renamed, or weakened
<!-- AC:END -->

## Implementation Notes

Task-start changed-scope base: 752f8b547984bb9839026c53c1bb9a9b94db3a31. The runtime changed-scope capability was unavailable in this Codex backend and was not treated as a clean result. A manual narrow diff audit used that explicit literal base over bundled/coding/prompts/worker.md and tests/prompts/analysis-procedures.test.ts and found only the intended 50 insertions. The preserved migration-sweep paragraph hash remained identical. Verification passed: bun run test (248 files, 2868 tests), bun run lint, and bun run typecheck.
