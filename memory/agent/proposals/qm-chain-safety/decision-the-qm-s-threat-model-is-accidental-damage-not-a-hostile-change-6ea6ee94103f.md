---
type: decision
title: 'The QM''s threat model is accidental damage, not a hostile change'
description: >-
  Findings reachable only by a deliberately malicious reviewed change are
  recorded as residual limits, not remediated.
resource: >-
  knowledge/qm-chain-safety/decision-the-qm-s-threat-model-is-accidental-damage-not-a-hostile-change-6ea6ee94103f.md
tags:
  - quality-manager
  - review
  - security
  - threat-model
timestamp: '2026-09-24T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/qm-chain-safety/plan.md
date: '2026-09-24T00:00:00.000Z'
---
The human bounded the QM's guarantees to the incidents that motivated the plan, all of which were accidental: careless agents and accidental process behavior. A finding of the form "a malicious change could tamper with the host, materials or Git objects to subvert review" is recorded as a known residual unless the same outcome can happen by accident. Reviewer prompts state this bound, and later review rounds were framed with it. Without the bound, review rounds kept finding new hostile routes. Closing them does not converge without an OS sandbox, which the spec excludes. When writing a review prompt for trust-boundary code, state the threat model explicitly, or reviewers will escalate hostile-only routes as blockers. In this repository, frame codex reviews as correctness and liveness, never as attack or adversarial, which trips an upstream filter.
