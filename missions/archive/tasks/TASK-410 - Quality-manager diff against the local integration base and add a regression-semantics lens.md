---
id: TASK-410
title: >-
  Quality-manager: diff against the local integration base and add a
  regression-semantics lens
status: Done
priority: medium
labels:
  - prompts
  - verification
  - 'plan:orchestration-hardening'
dependencies: []
createdAt: '2026-06-24T17:30:31.330Z'
updatedAt: '2026-06-24T17:59:49.089Z'
---

## Description

PROBLEM (observed): two recurring quality-manager frictions. (1) It diffs against
`origin/main`, which is frequently BEHIND local `main`, producing stale-base
false alarms — already-merged commits get flagged as out-of-scope, and the human
has to manually tell it to reconcile against local main. (2) It passed
throw-vs-warn and CLI-inspection regressions because it lacks a
semantics-change lens.

WHERE (persona file — additive edits):
- `bundled/coding/prompts/quality-manager.md`

WHAT TO DO:
(1) Instruct the QM to establish the correct integration base FIRST — the local
merge-base against local `main` (not blindly `origin/main`) — before scoping the
diff, and to treat already-merged commits as out of scope. (2) Add a
regression-semantics check: for changed shared code, explicitly verify whether
error / throw / return / empty / warning behavior changed for EXISTING callers
(this complements the blast-radius lens added elsewhere; do not remove or
duplicate that lens, reference/reinforce it).

CONSTRAINTS: edits are ADDITIVE — preserve existing content, including sibling-task
additions to quality-manager.md.

<!-- AC:BEGIN -->
- [x] #1 quality-manager.md instructs determining the local integration base (local merge-base) before scoping a diff, and not flagging already-merged commits as out-of-scope.
- [x] #2 quality-manager.md gains a regression-semantics check for changed shared code (throw/return/empty/warning) for existing callers.
- [x] #3 All edits are additive and preserve existing persona content.
<!-- AC:END -->
