---
type: gotcha
title: Review scope must use the actual local integration base
description: >-
  Diff-based review first resolves the local merge base so already-integrated
  commits are not mistaken for current work.
resource: >-
  knowledge/orchestration-hardening/gotcha-review-scope-must-use-the-actual-local-integration-base-d79330e02510.md
tags:
  - diff-base
  - git
  - review
  - scope
timestamp: '2026-06-24T17:59:49.089Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/tasks/TASK-410 - Quality-manager diff against the local
  integration base and add a regression-semantics lens.md
date: '2026-06-24T17:59:49.089Z'
---
Do not blindly scope review against a remote tracking branch, which may lag the developer's local integration branch and pull already-merged commits into the apparent change set. Establish the merge base against the actual local integration target before judging scope, then exclude changes already present there. An incorrect base creates noisy scope findings and can distract reviewers from real semantic regressions.
