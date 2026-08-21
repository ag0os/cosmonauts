---
type: convention
title: Exclude orchestration metadata from driver-created commits
description: >-
  Automated commits should stage product changes without capturing run records
  or memory artifacts.
resource: >-
  knowledge/driver-primitives/convention-exclude-orchestration-metadata-from-driver-created-commits-10c760f10119.md
tags:
  - driver
  - git
  - operational-artifacts
  - staging
timestamp: '2026-05-04T20:14:02.943Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/driver-primitives/plan.md
date: '2026-05-04T20:14:02.943Z'
---
When the driver owns commits, explicitly exclude operational work artifacts such as mission records, session logs, and memory outputs from staging. These files may change as a side effect of orchestration and should not be mixed into the implementation commit. Make the exclusion test observable by creating both product and operational changes and asserting only product paths are committed.
