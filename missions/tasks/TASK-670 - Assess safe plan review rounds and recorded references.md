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
updatedAt: '2026-09-10T02:13:15.300Z'
---

## Description

Implementation Order step 3. Owns behavior B-005 exclusively. First characterize the existing markdown fence/inline-code behavior in `tests/artifacts/behavior-conformance.test.ts`, then share that unchanged masking through `lib/artifacts/markdown-scan.ts` between `lib/artifacts/behavior-conformance.ts` and the new plan-side assessment in `lib/plans/review-rounds.ts`; expose only the focused plan contract from `lib/plans/index.ts` and prove it in `tests/plans/file-system.test.ts`.

Recorded ground: D-005, D-006, D-009, and D-012 are derived and may change only through amend-on-record. The spec's filesystem-only context channel and scope exclusions are ratified. If correctness needs heuristics, project-code execution, orchestration/runtime imports in plan assessment, automatic round repair, or weaker artifact safety, stop and escalate rather than widening.

<!-- AC:BEGIN -->
- [ ] #1 B-005 is proven by `tests/plans/file-system.test.ts` > `derives a safe latest review round and ignores quoted or fenced references`, carrying `@cosmo-behavior plan:chain-stage-context#B-005`: only one active plan's unique regular contiguous highest round is eligible and every unsafe, malformed, stale, inactive, or unreadable state returns a typed reason.
- [ ] #2 Review-round recognition accepts non-symlink regular `review.md` as legacy round 1 and `review-<positive integer>.md` only when it contains `## Findings`; a name-matching file without that section is skipped as another reviewer's artifact, is not malformed, and creates no gap.
- [ ] #3 Round-1 collisions, duplicate logical rounds, numeric gaps, recognized-name symlinks/directories, reports below the maximum, I/O failures, malformed findings, duplicate IDs, unknown severities, and partial records fail closed without mtime selection, automatic renumbering, or repair.
- [ ] #4 Addressed assessment requires every high/medium `PR-###` to have an exact round-qualified reference in non-code text within a parseable `D-###` Decision Log entry containing `Decision:`; fenced or inline-code mentions do not count, while low-only or empty rounds require reports but no edit.
- [ ] #5 Existing artifact-conformance masking behavior remains unchanged after extraction, and one shared fence/inline-code scanner serves both artifact conformance and review-reference assessment rather than a second scanner.
- [ ] #6 Plan assessment imports nothing from `../orchestration` or `../durable-runtime`, enforced by D-012's bound static correctness assertion; shared markdown masking contains no plan semantics.
- [ ] #7 Filesystem handling is total and no-follow for recognized review entries, and assessment executes no project-controlled code.
<!-- AC:END -->
