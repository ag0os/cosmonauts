---
type: trade-off
title: Separate persistent installs from session-only development inputs
description: >-
  Copied or cloned packages provide reproducible persistence, while links and
  plugin directories trade portability for immediate development feedback.
resource: >-
  knowledge/package-system/trade-off-separate-persistent-installs-from-session-only-development-inputs-cbb3da2f3646.md
tags:
  - development
  - packages
  - plugins
  - symlinks
timestamp: '2026-04-01T03:32:49.716Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/package-system/plan.md
date: '2026-04-01T03:32:49.716Z'
---
Use store-backed copies or clones for normal installation and deterministic reuse. Offer links for live local editing and explicit plugin directories for one session without store mutation. The latter modes are intentionally less portable and may inherit platform-specific filesystem constraints, but they keep package development fast and avoid repeated installation cycles.
