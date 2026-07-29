---
id: TASK-528
title: Complete all analysis runtime behavior proofs through declared seams
status: To Do
priority: high
labels:
  - testing
  - integration
  - review-fix
  - 'review-round:1'
  - 'plan:analysis-capability-runtime'
dependencies: []
createdAt: '2026-07-29T18:36:32.814Z'
updatedAt: '2026-07-29T18:36:32.814Z'
---

## Description

Remediate merged findings I-002 and F-006 plus artifact gate C-006. Make all 23 active behavior tests use the exact plan-recorded title and prove the full Context/Action/Expected through each declared public seam, not only marker presence or internal helpers.

<!-- AC:BEGIN -->
- [ ] #1 All 23 active behaviors have the exact recorded test name and exact marker; B-032 remains withdrawn without an executable test.
- [ ] #2 B-003/B-004/B-006/B-007/B-010–B-012/B-025/B-027/B-033/B-035–B-037 prove their full Expected clauses through config, registered-tool, status, real-provider, or Pi seams named by the plan.
- [ ] #3 The B-012 real-engine snapshot invokes analysis_status plus all seven registered capabilities and proves the actual registration has no apply/mutating tool.
- [ ] #4 Mutation-style cases catch unsupported-input provider invocation, stripped native output, incorrect status rows, tool writes, ignored schema drift, and installed-provider cancellation regressions.
<!-- AC:END -->
