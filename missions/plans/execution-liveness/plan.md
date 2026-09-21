---
title: 'Execution Liveness: bounded, fenced, diagnosable node attempts'
status: active
createdAt: '2026-09-11T13:24:20.117Z'
updatedAt: '2026-09-21T00:00:00.000Z'
---

## Summary

Make liveness a property of every durable attempt: a run never shows work as
`running` when nobody is working on it, and never lets two executions change
the same step. `spec.md` was revised and ratified on 2026-09-21 after three
collisions in its previous text were ruled on by the human
(`ruling-packet.md`).

This plan is spec-ready and awaits planner design. The previous plan (21
behaviors in the retired Seam/Test/Marker format, restated once by hand) and
its nine tasks, TASK-677 to TASK-685, were removed on 2026-09-21 rather than
amended; they are in git at `12d992a`. `review-1.md` is that plan's review and
stays as the list a new plan must answer: PR-001, PR-002 and PR-004 are
answered by the revised spec, the rest are for the planner.

Material for the planner, none of it binding:

- An unmerged implementation of lossless spawn completion waiters (spec
  AC-015) exists at commit `7c8811b` on branch `trial/b011-format-trial`. Its
  tests were mutation-probed, 11 of 11 killed
  (`missions/plans/framework-health/trial-d009.md`); its design has not been
  through the quality-manager or a code review. With wait expiry no longer
  failing children, a hung child keeps the parent's loop waiting until the
  hard ceiling (AC-001) exists, so it must not land before that does (human
  decision, 2026-09-21).
- On `feature/framework-health`, `c08948a` and `324e818` already deliver both
  completions when two children settle in one tick. A wait abandoned by a
  timeout still swallows the next completion.
- The spec's eighteen acceptance criteria are more than one plan should
  carry; it suggests ownership and ending (AC-001 to AC-013) as a first slice.

## Architecture Context

Source of truth: `missions/architecture/orchestration-future.md`.

This plan implements the Wave-A liveness decision (`D-007`) and advances the
target one-runtime boundary (`D-001`) for the scoped durable populations. It
provides prerequisites for—and preserves compatibility with—the future
coordinator/continuity/portability decisions `D-009`, `D-010`, and `D-011`; it
does not claim to implement their public control or package contracts.

Current exceptions are explicit: coordinator-bearing chains still use the
inline chain runner; dynamic `spawn_agent` still launches detached work outside
the scheduler; the spawn graph compiler has no production caller; and Drive has
adapter-owned timeout/task-write seams. Wave A closes only the liveness bypasses
named in Scope. It does not merge Chain topology with the full Drive task loop.

The public coordinator-neutral control port remains owned by `drive-envelope`.
The `autonomy-host` plan may share a future host process, but its wake-state is
not the run store and it must not own node-attempt claims, deadlines, or
cancellation.
