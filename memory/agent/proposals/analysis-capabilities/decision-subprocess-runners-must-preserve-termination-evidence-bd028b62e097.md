---
type: decision
title: Subprocess runners must preserve termination evidence
description: >-
  Provider execution needs a signal-aware runner that distinguishes exits,
  crashes, spawn errors, cancellation, and timeout rather than normalizing them.
resource: >-
  knowledge/analysis-capabilities/decision-subprocess-runners-must-preserve-termination-evidence-bd028b62e097.md
tags:
  - cancellation
  - error-handling
  - subprocesses
  - timeouts
timestamp: '2026-07-29T16:36:48.071Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/analysis-capabilities/plan.md
date: '2026-07-29T16:36:48.071Z'
---
Use a shell-free process runner whose outcome type distinguishes numeric exit, signal termination, spawn failure, cancellation, and timeout. Propagate the host tool's cancellation signal through every adapter layer. Apply a finite timeout to every invocation, terminate gracefully, then force-kill after a bounded grace period while retaining the initiating reason. Only explicitly documented exit codes plus classifiable output may become completed analysis; null or signal exits must never become success.
