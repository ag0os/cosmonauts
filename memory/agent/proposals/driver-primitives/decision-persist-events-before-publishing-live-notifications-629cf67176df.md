---
type: decision
title: Persist events before publishing live notifications
description: >-
  Treat the append-only event log as authoritative and the activity bus as a
  lossy projection.
resource: >-
  knowledge/driver-primitives/decision-persist-events-before-publishing-live-notifications-629cf67176df.md
tags:
  - audit-log
  - driver
  - durability
  - events
timestamp: '2026-05-04T20:14:02.943Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/driver-primitives/plan.md
date: '2026-05-04T20:14:02.943Z'
---
Every execution event should be appended durably and awaited before any live bus notification is published. Publish only a selected subset to interactive consumers, but retain every event in the audit stream. If the durable append fails, abort the run rather than continuing with an incomplete record; attempt a minimal best-effort terminal record without pretending durability succeeded.
