---
id: TASK-767
title: >-
  D-036 remediation - reviewerModel accepts any Pi model id; pin model-mismatch
  verdict independence
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-766
createdAt: '2026-09-25T02:30:54.872Z'
updatedAt: '2026-09-25T02:30:54.872Z'
---

## Description

From d036-review-1 (both channels): F-1 MEDIUM, the reviewerModel validator rejects slash-bearing model ids (588 of 1057 Pi 0.80.6 catalog models, e.g. openrouter/...), which contradicts D-036's "any model Pi can reach"; F-2/F-3 LOW, no test pins that a configured/observed generalist mismatch leaves the verdict unchanged. The silently ignored legacy keys are accepted as safe (both channels).


<!-- AC:BEGIN -->
- [x] #1 `qualityReview.reviewerModel` accepts any `provider/id` whose id may contain slashes (matching resolveModel's first-slash split); a loader test with `openrouter/anthropic/claude-sonnet-4.5` fails on the old regex.
- [x] #2 The model-freedom test matrix includes a configured reviewer model that differs from the observed one; it reaches `ready`, records the observed model, and fails if a substitution verdict branch is reintroduced.
- [x] #3 (From real QM run 4, UR-003) An invalid reviewerModel error names the expected `<provider>/<model-id>` shape.
<!-- AC:END -->
