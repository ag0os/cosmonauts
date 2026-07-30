---
id: TASK-528
title: Complete all analysis runtime behavior proofs through declared seams
status: Done
priority: high
labels:
  - testing
  - integration
  - review-fix
  - 'review-round:1'
  - 'plan:analysis-capability-runtime'
dependencies: []
createdAt: '2026-07-29T18:36:32.814Z'
updatedAt: '2026-07-29T20:28:43.410Z'
---

## Description

Remediate merged findings I-002 and F-006 plus artifact gate C-006. Make all 23 active behavior tests use the exact plan-recorded title and prove the full Context/Action/Expected through each declared public seam, not only marker presence or internal helpers.

### Correction to the source finding (verified 2026-07-29)

F-006 claimed three required test names do not exist exactly. That part is
**wrong** and was independently checked: every one of the 23 active behaviors
already has its plan-recorded test name present verbatim in the referenced
file, and B-032 correctly has none. AC #1 is therefore a verification step —
confirm and move on. **Do not rename existing tests**; a rename would break
the plan's recorded name for no benefit.

The surviving, legitimate half of the finding is rigor, not naming: some named
tests assert narrower properties than their Expected clause. The clearest real
instance is complexity, where the metric-specific assertion is missing — but
that is owned by TASK-527, so do not duplicate it here. Focus this task on
ACs #2–#4.

<!-- AC:BEGIN -->
- [x] #1 All 23 active behaviors have the exact recorded test name and exact marker; B-032 remains withdrawn without an executable test.
- [x] #2 B-003/B-004/B-006/B-007/B-010–B-012/B-025/B-027/B-033/B-035–B-037 prove their full Expected clauses through config, registered-tool, status, real-provider, or Pi seams named by the plan.
- [x] #3 The B-012 real-engine snapshot invokes analysis_status plus all seven registered capabilities and proves the actual registration has no apply/mutating tool.
- [x] #4 Mutation-style cases catch unsupported-input provider invocation, stripped native output, incorrect status rows, tool writes, ignored schema drift, and installed-provider cancellation regressions.
<!-- AC:END -->
