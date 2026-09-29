---
type: gotcha
title: "Review fixes regress: five codex rounds each found a new record-consistency defect"
description: "Each remediation round after an independent review introduced a fresh inconsistency in the plan, record or closeout evidence, so re-review after every fix round is mandatory."
resource: knowledge/project-health-audit/gotcha-review-fixes-regress-five-codex-rounds-each-found-a-new-record-consistency-defect-835f55e78c2e.md
tags:
  - codex
  - process
  - review
timestamp: '2026-09-29T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/project-health-audit/coordinator-status.md
date: '2026-09-29T00:00:00.000Z'
---
Codex round 1 found a wording conflict and a stale line reference; fixing them added review-record files that round 2 showed widened the closeout diff; round 3 shipped conditionally; the QM's test remediation then broke the analyzed-tree claim in round 4; round 5 converged only after the test was reverted. None of the rounds found a code defect in the refactors. The lesson is procedural: record edits are as reviewable as code edits, the seven-path closeout check must be rerun after every commit, and the loop ends only when a round adds nothing new.
