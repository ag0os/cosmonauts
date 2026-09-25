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

## Acceptance Criteria

<!-- AC:BEGIN -->
- [ ] #1 No model-family logic remains: `modelFamily`, `assessReviewerDiversity`, the shipped alias table, `qualityReview.modelFamilies`, the implementer-model comparison and `resolveDefaultWorkerModel` are deleted, with their tests.
- [ ] #2 `qualityReview.diverseReviewerModel` is replaced by optional `qualityReview.reviewerModel` (validated as provider/id); when set, only the generalist runs on it; when unset, every lens uses its shipped model.
- [ ] #3 No report item or verdict depends on models: an unset reviewer model yields no not-configured or human-decision item, and a run whose reviewers all share the implementer's provider can reach `ready` (pinned by tests written first).
- [ ] #4 The report's `## Reviewer models` section still records each reviewer's host-observed `lens: provider/id`, with no family or Diversity lines.
- [ ] #5 `.cosmonauts/config.json` and `config.example.json` set no reviewer model and no model families.
- [ ] #6 QM prompt, AGENTS.md, docs/orchestration.md, docs/fallow-workflow-integration.md, spawning skill, external cosmonauts skill and external implement-plan command no longer mention model diversity as a requirement or blocker.
- [ ] #7 Gates pass: test, lint, typecheck, check:reachability, check:suppressions --base main, plan check-artifacts qm-chain-safety, and the changed-scope Fallow audit vs main.
<!-- AC:END -->
