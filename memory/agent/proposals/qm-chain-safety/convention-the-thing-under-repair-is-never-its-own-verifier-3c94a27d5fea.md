---
type: convention
title: The thing under repair is never its own verifier
description: >-
  A plan that fixes a verifier substitutes independent review channels for that
  verifier and records the substitution as a ratified decision.
resource: >-
  knowledge/qm-chain-safety/convention-the-thing-under-repair-is-never-its-own-verifier-3c94a27d5fea.md
tags:
  - process
  - quality-manager
  - review
  - verification
timestamp: '2026-09-24T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/qm-chain-safety/coordinator-status.md
date: '2026-09-24T00:00:00.000Z'
---
The QM was never run to verify qm-chain-safety, because a verifier that can damage the work cannot certify the fix for that damage. Wherever the implementation workflow calls the QM, the plan substituted two independent read-only channels: a Claude subagent reviewer and a read-only `codex exec` review, each framed as correctness and liveness, with full outputs saved in the plan directory. When one channel was unavailable, for example codex out of usage, the substitution was amended by human ruling rather than skipped. Closure required SHIP from both channels plus real end-to-end runs. Stages were reviewed at their boundaries on both channels, and each remediation round was re-reviewed, because fixes repeatedly introduced new defects. Apply the same pattern to any plan that changes Drive, the reviewer or a gate: decide up front which independent path verifies it.
