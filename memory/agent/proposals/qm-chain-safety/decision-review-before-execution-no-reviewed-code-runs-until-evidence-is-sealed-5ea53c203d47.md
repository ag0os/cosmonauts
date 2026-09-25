---
type: decision
title: 'Review before execution: no reviewed code runs until evidence is sealed'
description: >-
  The QM run order builds every quality runtime from a base export and seals
  reviewer evidence before any reviewed code executes.
resource: >-
  knowledge/qm-chain-safety/decision-review-before-execution-no-reviewed-code-runs-until-evidence-is-sealed-5ea53c203d47.md
tags:
  - execution-order
  - quality-manager
  - review
  - trust-boundary
timestamp: '2026-09-24T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/qm-chain-safety/plan.md
date: '2026-09-24T00:00:00.000Z'
---
The order is capture, export the review base's project files from the operator's source repository, build every quality runtime (the QM and every panel spawn) from the framework plus that export, write and digest the materials, assess, and seal and verify the evidence. Only after that do the base-owned `qualityReview.prepare` and `checks` run in the clone, and the host merges their results. A failing or not-run check forces not-ready. Quality sessions use an untrusted in-memory settings manager, so the reviewed change's `.pi` settings, packages and system-prompt appends never apply, and gate-deciding `git show base:` reads use the source repository, not the clone. This replaced patching routes one at a time. Rounds 4 to 6 each found a new way for reviewed code to reach the host (argv, scripts, domains, object-database tampering, `.pi` settings, materials races), and that approach did not converge. The rule: the change under review must not choose what reviews it or what the host loads.
