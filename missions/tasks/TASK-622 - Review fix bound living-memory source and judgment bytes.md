---
id: TASK-622
title: 'Review fix: bound living-memory source and judgment bytes'
status: In Progress
priority: high
assignee: worker
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:living-memory'
dependencies:
  - TASK-621
createdAt: '2026-09-02T18:48:19.736Z'
updatedAt: '2026-09-02T19:06:22.100Z'
---

## Description

Remediate performance finding PF-002 from quality round 1. LivingMemoryLimits currently caps counts but not per-record or aggregate body/model-prompt bytes; corpus/episode/citation inputs can make one bounded-count pass unbounded in memory and model context. Add explicit fail-closed byte bounds while preserving complete citation safety and INV-001/INV-002 authority. This is derived mechanism inside INV-005's bounded inlet/model-output requirement, not authority to truncate evidence silently. Keep the change narrow and do not raise existing count caps.

<!-- AC:BEGIN -->
- [ ] #1 Corpus and episode body admission has documented per-record and aggregate byte ceilings in the core limits contract.
- [ ] #2 Oversized individual or aggregate selected inputs are deferred or rejected with explicit evidence before model invocation; no partial evidence authorizes retirement.
- [ ] #3 The serialized model judgment request has a tested hard byte ceiling in addition to the existing one-call/count limits.
- [ ] #4 Citation completeness fails closed when an inventory item or evidence fan-in cannot be safely represented; it is never silently truncated to authorize movement.
- [ ] #5 Regression tests cover oversized records, aggregate overflow, no-model invocation on rejected input, and continued count/lossy bounds.
- [ ] #6 All existing behavior tests, lint, and typecheck pass.
<!-- AC:END -->

## Implementation Notes

Retry started from literal changed-scope audit base 007e932fb4c82ea53a518ae3090d4a72c8f7bfda. Preserving and verifying prior worker's uncommitted test-first progress.
