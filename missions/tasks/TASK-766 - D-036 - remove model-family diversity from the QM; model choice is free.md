---
id: TASK-766
title: D-036 - remove model-family diversity from the QM; model choice is free
status: To Do
priority: high
labels:
  - backend
  - testing
  - docs
  - 'plan:qm-chain-safety'
  - ruling
dependencies: []
createdAt: '2026-09-25T02:13:08.104Z'
updatedAt: '2026-09-25T02:13:08.104Z'
---

## Description

Implement plan D-036 (human ruling 2026-09-24): "I want to freely set whatever model is available to Pi. No constraint, no advisory, nothing."
Delete the model-family diversity code and its tests; do not leave it dormant. Rename `qualityReview.diverseReviewerModel` to the neutral optional `qualityReview.reviewerModel` (generalist model override only). Keep the host-owned `## Reviewer models` record and `assertQualityReviewModelIdentity` (evidence integrity). Read D-036, amended D-005, D-019, B-011 and spec AC-014/AC-016.
Keep the changed-scope audit against `main` passing; no suppressions, no baseline change.
