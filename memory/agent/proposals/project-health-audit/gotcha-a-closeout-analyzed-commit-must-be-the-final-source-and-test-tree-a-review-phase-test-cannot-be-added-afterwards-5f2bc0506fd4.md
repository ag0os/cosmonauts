---
type: gotcha
title: "A closeout analyzed commit must be the final source and test tree; a review-phase test cannot be added afterwards"
description: "Adding a test during the review phase broke the ratified closeout claim; restamping the record's commit fields would falsify provenance, so the test was held as a proposal."
resource: knowledge/project-health-audit/gotcha-a-closeout-analyzed-commit-must-be-the-final-source-and-test-tree-a-review-phase-test-cannot-be-added-afterwards-5f2bc0506fd4.md
tags:
  - closeout
  - provenance
  - review
timestamp: '2026-09-29T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/project-health-audit/plan.md
date: '2026-09-29T00:00:00.000Z'
---
The record names an analyzed commit whose source and test tree the floors and digests describe, and the tip may differ from it only by the closeout artifacts (task-state, plan-record and review-record paths excluded, ratified as Q-016). When the Quality Manager asked for a caller-level test and the coordinator added it, codex pointed out that the tip no longer matched the analyzed tree. Editing after.commit and closeout.analyzedCommit by hand would attribute evidence produced at one commit to another, which INV-005 forbids and which the falsified-epoch lesson already covered. The fix was to remove the test, preserve it verbatim as a proposal file, and let the human choose a post-plan follow-up (Q-017 chose that) or a full closeout re-run. Plan for review-phase test additions before the closeout, or expect to redo stage 16.
