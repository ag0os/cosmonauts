---
type: decision
title: Separate backend execution root from artifact storage
description: >-
  External workers execute against the project root while run summaries and
  other artifacts remain in the run workspace.
resource: >-
  knowledge/drive-smoke-fixes/decision-separate-backend-execution-root-from-artifact-storage-6859be3f977f.md
tags:
  - artifacts
  - backend
  - driver
  - working-directory
timestamp: '2026-05-12T20:55:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/drive-smoke-fixes/plan.md
date: '2026-05-12T20:55:00.000Z'
---
A backend invocation should carry distinct project-root and run-workspace locations. Spawn repository-aware workers with the project root as their current directory so relative file and version-control operations describe the actual project. Continue directing generated summaries, logs, and run artifacts to explicit paths under the run workspace. Do not overload one working-directory field with both responsibilities.
