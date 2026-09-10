---
type: gotcha
title: Aggregate abort status can hide completed work and truthful verification
description: >-
  A verifier that correctly reports unmet criteria can make an otherwise
  completed run appear wholly aborted when blocked verification has no distinct
  outcome.
resource: >-
  knowledge/chain-stage-context/gotcha-aggregate-abort-status-can-hide-completed-work-and-truthful-verification-7ebc944ecefe.md
tags:
  - drive
  - observability
  - run-status
  - task-results
  - verification
timestamp: '2026-09-10T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/reviews/improvements/run-bf33d90b-0639-4b07-ad15-3e2f10194012.md
date: '2026-09-10T00:00:00.000Z'
---
Verification failure is evidence about the implementation, not necessarily evidence that prior tasks did not complete. If the only available outcome maps a verifier's honest negative result to run abortion, operators lose visibility into completed work and the actionable gate findings. Model verification-only negative results as a distinct blocked-with-findings outcome, preserve completed task counts and summaries, and reserve aborted for execution failure or loss of control.
