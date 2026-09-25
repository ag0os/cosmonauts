---
type: trade-off
title: >-
  Host-run checks execute reviewed code with host authority, disclosed in every
  report
description: >-
  The QM's no-mutation guarantee covers the QM itself; base-owned prepare and
  checks run reviewed code in the clone after evidence is sealed, and every
  report says so.
resource: >-
  knowledge/qm-chain-safety/trade-off-host-run-checks-execute-reviewed-code-with-host-authority-disclosed-in-every-report-286cb8e6e3a2.md
tags:
  - checks
  - execution-liveness
  - quality-manager
  - trust-boundary
timestamp: '2026-09-24T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/qm-chain-safety/plan.md
date: '2026-09-24T00:00:00.000Z'
---
The invariant that a QM run cannot change the operator checkout holds by construction for the QM and its panel. Running the project's checks, however, necessarily executes the reviewed change's code. The human chose to accept this rather than add an OS sandbox, which the spec excludes. The checks run last, in the private clone, from base-owned configuration, after all reviewer evidence is sealed. Every report carries a disclosure of this residual. A dependency install needed by the analysis provider may run earlier only as a base-owned `analysisPrepare` argv that does not execute lifecycle scripts, and the report records it. Crash-time cleanup of the clone and orphaned check processes is left to execution-liveness, which must register these host-run processes as descendants of the QM attempt when it lands. Whole-branch QM reviews can exceed the default 900-second assessment timeout, so raise `qualityReview.assessmentTimeoutMs` in base-owned config for large ranges.
