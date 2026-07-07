---
id: TASK-449
title: Add cosmonauts serve CLI startup and non-fatal browser opening
status: Done
priority: medium
labels:
  - backend
  - api
  - devops
  - testing
  - 'plan:code-structure-map'
dependencies:
  - TASK-448
createdAt: '2026-07-03T14:13:58.696Z'
updatedAt: '2026-07-03T17:05:20.580Z'
---

## Description

Implementation order step 8. Behavior ownership: owns B-020 only. Wire the artifact-viewer server to the top-level `cosmonauts serve` command with host/port/open options while keeping viewer behavior read-only and bounded. Planned-behavior tests must carry `@cosmo-behavior plan:code-structure-map#B-020`.

<!-- AC:BEGIN -->
- [x] #1 The top-level CLI dispatches `serve` with the planned `--host`, `--port`, `--open`, and `--no-open` options and prints the local server URL.
- [x] #2 The serve command starts the artifact-viewer HTTP server without adding static export or file-watching behavior in W1.
- [x] #3 B-020: when the platform browser opener fails under `--open`, the HTTP server remains running, the URL is still printed, and the opener failure is reported as a non-fatal warning.
- [x] #4 Serve startup and dispatch tests cover the command path without mutating plan, task, or architecture artifacts beyond the viewer's read-only behavior.
- [x] #5 Tests for B-020 carry the required `@cosmo-behavior plan:code-structure-map#B-020` marker.
<!-- AC:END -->
