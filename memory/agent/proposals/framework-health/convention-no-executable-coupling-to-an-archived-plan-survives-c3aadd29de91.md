---
type: convention
title: No executable coupling to an archived plan survives
description: >-
  Archived plans are history: no live test, marker or gate may assert against
  their content or ledgers.
resource: >-
  knowledge/framework-health/convention-no-executable-coupling-to-an-archived-plan-survives-c3aadd29de91.md
tags:
  - archives
  - coupling
  - fixtures
  - testing
timestamp: '2026-09-21T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/framework-health/plan.md
date: '2026-09-21T00:00:00.000Z'
---
Once a plan is archived it has no authority over live tests or code. A test that asserts against an archived plan's ledger or a fixture frozen by an archived behavior can only fail when someone edits unrelated live content. An example was a suite-wide grep for the word "coding" compared with an archived plan's ledger, which matched only because marker comments named that plan. Such tests are deleted, not re-pinned. The same applies to fixtures that must be hand-edited on every archive. When an archive or prompt edit breaks a test, first ask whether the test is coupled to history or live state rather than to logic. If so, fix the coupling and leave the guard it was meant to be alone. Citations inside curated `knowledge/` records are history citing history and are out of scope; they stay byte-pinned by the promotion ledger.
