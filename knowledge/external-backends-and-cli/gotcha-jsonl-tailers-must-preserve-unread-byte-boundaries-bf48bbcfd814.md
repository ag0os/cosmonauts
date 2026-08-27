---
type: gotcha
title: JSONL tailers must preserve unread byte boundaries
description: >-
  A live JSONL bridge must handle file-creation races, partial records, and
  malformed complete records without silently skipping data.
resource: >-
  knowledge/external-backends-and-cli/gotcha-jsonl-tailers-must-preserve-unread-byte-boundaries-bf48bbcfd814.md
tags:
  - event-stream
  - framing
  - jsonl
  - reliability
timestamp: '2026-05-05T16:24:56.227Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-backends-and-cli/plan.md
date: '2026-05-05T16:24:56.227Z'
---
When tailing an append-only event log, wait for a missing file to appear, retain bytes after the last newline, and advance the durable cursor only after a complete record parses successfully. A parse failure must leave the cursor at that record so it can be retried rather than dropping data. Stop automatically only after a terminal run event. Define a bounded wait for initial file creation so startup failures do not hang forever.
