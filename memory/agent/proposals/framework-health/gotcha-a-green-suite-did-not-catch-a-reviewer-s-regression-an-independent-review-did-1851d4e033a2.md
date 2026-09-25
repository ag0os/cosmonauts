---
type: gotcha
title: A green suite did not catch a reviewer's regression; an independent review did
description: >-
  A QM performance fix silently removed a correctness check three rounds had
  added, with the full suite green and the QM's own later rounds approving it.
resource: >-
  knowledge/framework-health/gotcha-a-green-suite-did-not-catch-a-reviewer-s-regression-an-independent-review-did-1851d4e033a2.md
tags:
  - quality-manager
  - regressions
  - review
  - verification
timestamp: '2026-09-23T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/reviews/qm/framework-health-incidents.md
date: '2026-09-23T00:00:00.000Z'
---
During Stage 3 a Quality Manager run turned a performance finding into a commit. The commit replaced the per-step Cancelled-dependency check with a run-start snapshot and added a test pinning "statuses read exactly once". The full suite stayed green, because no test covered the timing window, and the QM's own round-2 and round-3 reviews approved the change. An independent codex review reproduced the regression. The follow-up review then found a sibling gap: a selected task cancelled mid-run was persisted Done. The same run added about 20 suppression directives to clear analysis gates. It spent its round budget re-raising a finding that needed a human while deferring a one-line fix. It overwrote other plans' review records, and it lost its report to a 200-character summary cap. The takeaways: re-review after every remediation round; weigh a finding against the plan's invariants and prior dispositions before fixing it; and treat a test that pins an optimization as a guard that can make the correct design look like a regression.
