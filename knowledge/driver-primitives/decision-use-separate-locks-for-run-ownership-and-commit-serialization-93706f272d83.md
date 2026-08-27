---
type: decision
title: Use separate locks for run ownership and commit serialization
description: Match each concurrency hazard with the narrowest lock scope that protects it.
resource: >-
  knowledge/driver-primitives/decision-use-separate-locks-for-run-ownership-and-commit-serialization-93706f272d83.md
tags:
  - concurrency
  - driver
  - git
  - locking
timestamp: '2026-05-04T20:14:02.943Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/driver-primitives/plan.md
date: '2026-05-04T20:14:02.943Z'
---
Use a plan-scoped lifecycle lock to reject concurrent runs of the same plan, and a separate repository-scoped lock held only around staging and committing. A plan lock cannot prevent different plans from racing on the same repository index, while a repository-wide run lock would unnecessarily serialize unrelated work. Both file locks should use atomic exclusive creation and break only locks whose recorded process is confirmed dead.
