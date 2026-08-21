---
type: decision
title: Centralized design intent outranks a narrow single-site criterion
description: >-
  When a design defines one rule across several seams, implement the rule once
  and wire all named consumers rather than patching only the easiest site.
resource: >-
  knowledge/orchestration-hardening/decision-centralized-design-intent-outranks-a-narrow-single-site-criterion-06ae294dcc0a.md
tags:
  - centralization
  - design-intent
  - implementation
  - seams
timestamp: '2026-06-24T17:58:16.806Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/tasks/TASK-409 - Worker persona implement a rule to the
  design's centralization intent, not the narrowest AC.md
date: '2026-06-24T17:58:16.806Z'
---
A named cross-cutting rule should have one implementation authority, such as a shared helper, with every design-named seam routed through it. If a task criterion can be read more narrowly than the ratified design, follow the broader centralization intent and record the discrepancy instead of duplicating or partially applying the rule. This prevents locally correct patches from leaving sibling paths inconsistent.
