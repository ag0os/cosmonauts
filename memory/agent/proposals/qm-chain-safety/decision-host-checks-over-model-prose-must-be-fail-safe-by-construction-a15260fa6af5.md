---
type: decision
title: Host checks over model prose must be fail-safe by construction
description: >-
  The host never parses closure or dismissal inside Findings: any Findings
  content except the sentinel blocks ready, and evidenced dismissals live only
  in Out-of-range observations.
resource: >-
  knowledge/qm-chain-safety/decision-host-checks-over-model-prose-must-be-fail-safe-by-construction-a15260fa6af5.md
tags:
  - fail-safe
  - parsing
  - quality-manager
  - verdicts
timestamp: '2026-09-24T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/qm-chain-safety/plan.md
date: '2026-09-24T00:00:00.000Z'
---
Host calibration over free-form markdown written by models has two hard floors. It never produces a false `ready`, and it never silently drops a reviewer finding ID: every ID appears as the leading ID of an entry, or the host carries it over as a human item. The first design parsed dismissals and closures inside Findings. Each review round found a new false-ready shape, including numbered items, `*` bullets, prose, an indented sub-finding riding a closed entry, keyword-only closure and reviewer-order dependence. So the check was inverted. Findings blocks `ready` on any content except the sentinel `None recorded.`. A dismissal counts only under Out-of-range observations, with a positive dismissal word after its ID and closure evidence from a lens other than every lens that raised the ID. The P0/P1 performance cap applies only in those two sections. Any unknown or duplicated section with content blocks `ready`. Recognizing whether a quoted string is a real measurement stays a recorded heuristic limit. General lesson: when parsing free-form model prose for a safety verdict, design the check so that anything unrecognized fails closed, rather than chasing phrasings.
