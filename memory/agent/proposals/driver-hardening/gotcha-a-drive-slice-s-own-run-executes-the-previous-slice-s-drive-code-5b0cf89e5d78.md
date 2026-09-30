---
type: gotcha
title: A Drive slice's own run executes the previous slice's Drive code
description: >-
  Each cosmonauts -p host loads the branch source at launch, so the run that
  lands a Drive fix still exhibits the pre-fix behavior; only the next run shows
  it live.
resource: >-
  knowledge/driver-hardening/gotcha-a-drive-slice-s-own-run-executes-the-previous-slice-s-drive-code-5b0cf89e5d78.md
tags:
  - drive
  - hosts
  - verification
timestamp: '2026-09-30T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/driver-hardening/coordinator-status.md
date: '2026-09-30T00:00:00.000Z'
---
# A Drive slice's own run executes the previous slice's Drive code

The print-mode cosmo host that runs a Drive slice is a fresh process that loads the branch source when it starts. The worker then changes lib/driver, Drive commits it, but the host that made that commit is still running the code from before the slice. Three consecutive runs in driver-hardening each exhibited the exact defect their task was fixing: unconditional snapshot-ref deletion, then universal ref retention, then the task-file exemption case.

Read a run's Drive behavior as evidence about the previous commit. To see a fix live, wait for the next slice's run, or probe the helper by hand with exactly the arguments Drive's call site passes (read the call site first: a hand probe that omitted a newly added argument produced a false "still broken" reading, and a record written before observing the result produced a false "verified live"; both had to be corrected on record). Improvement candidate: the Drive record names the source commit the host loaded.
