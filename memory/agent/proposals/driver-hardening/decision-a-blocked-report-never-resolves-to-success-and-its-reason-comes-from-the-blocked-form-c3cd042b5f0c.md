---
type: decision
title: >-
  A blocked report never resolves to success, and its reason comes from the
  blocked form
description: >-
  When a worker response carries both a fenced JSON report and an outcome line,
  or several fenced reports, any blocked form wins and any other disagreement is
  unknown; the human reason is taken from the last blocked report or the raw
  text.
resource: >-
  knowledge/driver-hardening/decision-a-blocked-report-never-resolves-to-success-and-its-reason-comes-from-the-blocked-form-c3cd042b5f0c.md
tags:
  - INV-002
  - INV-004
  - drive
  - report-parser
timestamp: '2026-09-30T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/driver-hardening/plan.md
date: '2026-09-30T00:00:00.000Z'
---
# A blocked report never resolves to success, and its reason comes from the blocked form

Workers emit a fenced JSON report and an outcome line, and sometimes more than one report. The original parser returned the first valid fenced report, so a fenced success followed by a final "outcome: blocked" ran postflight and could retry, contrary to INV-002 and INV-004. Rule now: if any form says blocked, the report is blocked with no postflight and no retry on either Drive path; any other disagreement is unknown with the raw text retained; agreeing forms behave as before. The reason recorded for the human is the notes of the last blocked fenced report (never the notes of a success report that happened to come first), falling back to the raw text.

Raw worker text is embedded in the task's Drive record inside a code fence longer than any backtick run in it (D-039), because unfenced headings in a worker's final message restructured or duplicated the notes section and made the append throw, losing the reason.
