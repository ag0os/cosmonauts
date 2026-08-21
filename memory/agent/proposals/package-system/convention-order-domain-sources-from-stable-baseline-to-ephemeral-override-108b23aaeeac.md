---
type: convention
title: Order domain sources from stable baseline to ephemeral override
description: >-
  Source precedence rises from framework built-ins through user-wide and
  project-local packages to session-only plugin inputs.
resource: >-
  knowledge/package-system/convention-order-domain-sources-from-stable-baseline-to-ephemeral-override-108b23aaeeac.md
tags:
  - determinism
  - packages
  - plugins
  - precedence
timestamp: '2026-08-21T14:58:05.110Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/package-system/spec.md
date: '2026-08-21T14:58:05.110Z'
---
Process sources in ascending precedence: framework baseline first, then user-wide installations, then project-local installations, and finally explicit session-only plugin directories. Higher-precedence sources may override lower-precedence resources. Preserve deterministic ordering within a tier so portable-domain first-match behavior and diagnostics remain reproducible.
