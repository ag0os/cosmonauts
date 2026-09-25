---
type: decision
title: Reviewer model choice is free and never affects the verdict
description: >-
  Model-family diversity was built and then removed by human ruling; only an
  optional reviewerModel for the generalist remains.
resource: >-
  knowledge/qm-chain-safety/decision-reviewer-model-choice-is-free-and-never-affects-the-verdict-1065fa39444f.md
tags:
  - configuration
  - models
  - quality-manager
  - review
timestamp: '2026-09-24T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/qm-chain-safety/plan.md
date: '2026-09-24T00:00:00.000Z'
---
The plan originally required the generalist reviewer to run on a model family different from the implementer's, using a provider-to-family alias table and a default-implementer comparison, with report items for same-family or unresolvable models. The human ruled against any constraint or advisory: any model Pi can reach may be used. The diversity code and its tests were deleted, not left dormant. `qualityReview.reviewerModel` is optional, applies only to the generalist, and accepts any Pi model id, including slash-bearing ones. The report's host-owned Reviewer models section remains a record of observed identities, not a check. This concerns the product only. Cross-model review channels stayed a coordination practice for verifying the plan itself. Residuals: only the generalist has a model knob, and an unresolvable `reviewerModel` fails at spawn rather than at config load.
