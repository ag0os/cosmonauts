---
id: TASK-670
title: Assess safe plan review rounds and recorded references
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:chain-stage-context'
dependencies:
  - TASK-669
createdAt: '2026-09-10T02:13:15.300Z'
updatedAt: '2026-09-10T18:00:00.000Z'
---

## Description

Implementation Order step 3. Owns behavior B-005 exclusively. First characterize the existing markdown fence/inline-code behavior in `tests/artifacts/behavior-conformance.test.ts`, then share that unchanged masking through `lib/artifacts/markdown-scan.ts` between `lib/artifacts/behavior-conformance.ts` and the new plan-side assessment in `lib/plans/review-rounds.ts`; expose only the focused plan contract from `lib/plans/index.ts` and prove it in `tests/plans/file-system.test.ts`.

Recorded ground: D-005, D-006, D-009, and D-012 are derived and may change only through amend-on-record. The spec's filesystem-only context channel and scope exclusions are ratified. If correctness needs heuristics, project-code execution, orchestration/runtime imports in plan assessment, automatic round repair, or weaker artifact safety, stop and escalate rather than widening.

<!-- AC:BEGIN -->
- [ ] #1 B-005 is proven by `tests/plans/file-system.test.ts` > `derives a safe latest review round and ignores quoted or fenced references`, carrying `@cosmo-behavior plan:chain-stage-context#B-005`: only one active plan's unique regular contiguous highest round is eligible and every unsafe, malformed, stale, inactive, or unreadable state returns a typed reason.
- [ ] #2 Two distinct sets are derived, per D-006, and conflating them is a defect: the **allocation set** is every non-symlink regular `review.md` or `review-<positive integer>.md` regardless of content, and it alone governs collision and contiguity (because the reviewer allocates the lowest unused number across all of them); the **assessable rounds** are the allocation-set members containing `## Findings`. A name-matching file without that section still occupies its number for contiguity, is never assessed, and is never `malformed-review`. "Latest" is the highest assessable round.
- [ ] #3 Round-1 collisions, duplicate logical rounds, numeric gaps, recognized-name symlinks/directories, reports below the maximum, I/O failures, malformed findings, duplicate IDs, unknown severities, and partial records fail closed without mtime selection, automatic renumbering, or repair.
- [ ] #4 Addressed assessment requires every high/medium `PR-###` to have an exact round-qualified reference in non-code text within a parseable `D-###` Decision Log entry containing `Decision:`; fenced or inline-code mentions do not count, while low-only or empty rounds require reports but no edit.
- [ ] #5 Existing artifact-conformance masking behavior remains unchanged after extraction, and one shared fence/inline-code scanner serves both artifact conformance and review-reference assessment rather than a second scanner.
- [ ] #6 Plan assessment imports nothing from `../orchestration` or `../durable-runtime`, enforced by D-012's bound static correctness assertion; shared markdown masking contains no plan semantics.
- [ ] #7 Filesystem handling is total and no-follow for recognized review entries, and assessment executes no project-controlled code.
- [ ] #8 A regression fixture reproduces the `living-memory-fidelity` shape — `review-1.md` through `review-18.md` with no `PR-###` block, topped by a conforming `review-19.md` — and asserts it **passes**: allocation set `1..19` is contiguous, the assessable set is `{19}`, and round 19 is assessed. A fixture that instead treats skipped files as absent (allocation set `{19}`, gap `1..18`) must fail this test, since that inversion blocks the case permanently.
- [ ] #9 A non-findings-bearing file numbered *above* the latest assessable round is ignored rather than blocking; a revision report naming a round *below* the latest assessable round is a typed block. Both are covered by named cases in AC #1's test.
- [ ] #10 D-013.4: active status is proven, never inferred. `lib/plans/review-rounds.ts` reads the plan frontmatter `status` strictly and requires the literal `active` after case-normalization and trimming; absent, unrecognized, or unparseable status yields a typed `plan-status-indeterminate` block. Tests cover missing `status`, an unrecognized value, and unparseable frontmatter, and assert each blocks. `parseStatus` in `lib/plans/file-system.ts` normalizes both falsy and unrecognized values to `active`, so an implementation routed through `PlanManager.getPlan` fails these cases; that shared reader stays unchanged.
- [ ] #11 D-013.5: the resolved plan directory is proven to remain inside `missions/plans/` before any enumeration, so a plan directory that is itself a symlink pointing outside the plans root blocks exactly as a symlinked round entry does. A test creates such a directory symlink and asserts the typed block.
<!-- AC:END -->
