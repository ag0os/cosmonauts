---
type: gotcha
title: A failed reviewer session is not evidence
description: >-
  A reviewer lens whose session errored or produced no completion was being
  accepted as a clean review; it must block instead.
resource: >-
  knowledge/qm-chain-safety/gotcha-a-failed-reviewer-session-is-not-evidence-d4cd61e2e0e0.md
tags:
  - e2e
  - evidence
  - quality-manager
  - review
timestamp: '2026-09-24T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/qm-chain-safety/closure-e2e.md
date: '2026-09-24T00:00:00.000Z'
---
The first closure review found that when a panel reviewer's session failed, for example on a model or usage error, the host still recorded the lens as having reviewed, so a verdict could rest on a review that never happened. A real end-to-end QM run on production models reproduced it, and a later real run confirmed the fix. Reviewer evidence is now captured from host-observed completions only. A failed or missing session is a report defect that keeps the verdict from `ready`, and analysis-audit findings reach the report rather than being lost with the session. The host also records every reviewer's observed model, and a model that changes after resolution is an integrity failure. The broader lesson: unit tests with doubles all passed. Only a real run on real models, on a dirty checkout with before-and-after hashes, exposed this. Budget at least one such run for any verifier change.
