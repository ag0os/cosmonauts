---
type: gotcha
title: Resolve bundled catalog paths from the framework installation
description: >-
  Relative catalog sources belong to the installed framework, not to the user's
  current working directory.
resource: >-
  knowledge/framework-extraction/gotcha-resolve-bundled-catalog-paths-from-the-framework-installation-8ffa9ae28867.md
tags:
  - catalog
  - global-cli
  - packages
  - path-resolution
timestamp: '2026-04-01T03:32:49.715Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/framework-extraction/plan.md
date: '2026-04-01T03:32:49.715Z'
---
A catalog entry that points to bundled package content must be resolved against a stable framework location derived from the executing module or installation root. Resolving it against the process working directory makes global installs fail or select unrelated project files. Tests should invoke installation from an unrelated temporary directory to catch this fault.
