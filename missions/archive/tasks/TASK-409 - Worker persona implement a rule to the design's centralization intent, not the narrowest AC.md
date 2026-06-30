---
id: TASK-409
title: >-
  Worker persona: implement a rule to the design's centralization intent, not
  the narrowest AC
status: Done
priority: medium
labels:
  - prompts
  - 'plan:orchestration-hardening'
dependencies: []
createdAt: '2026-06-24T17:30:31.328Z'
updatedAt: '2026-06-24T17:58:16.806Z'
---

## Description

PROBLEM (observed): B-022's design prose explicitly said to centralize the
root-domain rule in a shared helper used by manifest/installer/bundled/scanner,
but the worker satisfied the acceptance criterion at the installer only. Workers
should implement a named rule ONCE and wire all the seams the design names.

WHERE (persona file — additive edits):
- `bundled/coding/prompts/worker.md`

WHAT TO DO:
Add guidance that when the plan/design names a rule plus multiple seams/files,
the worker implements the rule ONCE (a shared helper/function) and wires EVERY
named seam, rather than satisfying the acceptance criterion at a single site.
When the design intent is broader than a single-site AC, follow the broader
design intent and note the discrepancy in the task notes.

CONSTRAINTS: edits are ADDITIVE — preserve existing content, including sibling-task
additions to worker.md.

<!-- AC:BEGIN -->
- [x] #1 worker.md instructs implementing a named rule once (shared helper) and wiring all design-named seams, following design intent when broader than a single-site AC.
- [x] #2 All edits are additive and preserve existing persona content.
<!-- AC:END -->
