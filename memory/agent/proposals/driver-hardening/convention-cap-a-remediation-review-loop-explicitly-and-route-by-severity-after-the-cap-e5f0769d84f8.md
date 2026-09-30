---
type: convention
title: Cap a remediation-review loop explicitly and route by severity after the cap
description: >-
  Codex rounds 3, 4 and 5 returned 5, 4 and 3 findings that were adjacent cases
  of the previous fixes; Shepherd capped the loop at round 6, with P1
  correctness defects stopping the work and everything else becoming follow-ups.
resource: >-
  knowledge/driver-hardening/convention-cap-a-remediation-review-loop-explicitly-and-route-by-severity-after-the-cap-e5f0769d84f8.md
tags:
  - convergence
  - process
  - review
timestamp: '2026-09-30T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/driver-hardening/coordinator-status.md
date: '2026-09-30T00:00:00.000Z'
---
# Cap a remediation-review loop explicitly and route by severity after the cap

driver-hardening's codex loop did not converge on its own: rounds 3, 4 and 5 returned 5, 4 and 3 findings, each an adjacent case of the previous round's fix in the same three areas (snapshot containment, git runner bounds, report parsing and probe evidence). The brief's bound of two extra rounds was exceeded because every item was cheap, derived and reversible, and that was recorded as a human item rather than decided silently.

The ruling that resolved it: one more round is the cap; after it, a P1 correctness or liveness defect in plan-owned code stops the work for the human, and anything else is recorded as a follow-up in the improvement pass, not remediated. The substitute Claude channel then converged in three rounds under the same rule. Record the cap before the round runs, and record each round's disposition table with the reason for every rejection so the next reviewer can see what is a residual by decision.
