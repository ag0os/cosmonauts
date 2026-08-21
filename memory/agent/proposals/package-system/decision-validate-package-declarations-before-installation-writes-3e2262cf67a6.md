---
type: decision
title: Validate package declarations before installation writes
description: >-
  Installation validates the package manifest and every declared domain location
  before copying, linking, or committing anything to a store.
resource: >-
  knowledge/package-system/decision-validate-package-declarations-before-installation-writes-3e2262cf67a6.md
tags:
  - installer
  - manifest
  - packages
  - validation
timestamp: '2026-04-01T03:32:49.716Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/package-system/plan.md
date: '2026-04-01T03:32:49.716Z'
---
Treat the manifest as the package-to-runtime contract: require package identity and descriptive metadata, require explicit domain declarations, and verify that each declaration resolves to a domain manifest inside the package. Complete validation before mutating an installation store. This keeps discovery from encountering partially valid packages and gives installation-time errors precise ownership.
