---
type: gotcha
title: Markdown heading edge cases never ended until one normalized predicate existed
description: >-
  Nine review rounds each found one more heading shape; the fix was normalizing
  input once and defining a heading in one function.
resource: >-
  knowledge/qm-chain-safety/gotcha-markdown-heading-edge-cases-never-ended-until-one-normalized-predicate-existed-70d7aa6cc776.md
tags:
  - markdown
  - parsing
  - refactoring
  - review
timestamp: '2026-09-24T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/qm-chain-safety/coordinator-status.md
date: '2026-09-24T00:00:00.000Z'
---
The report parser located sections with several ad hoc heading checks. Successive review rounds found, one at a time: unanchored section lookup, an unanchored plan summary, trailing whitespace, a duplicate heading bare at end of file, CRLF, an empty title, tabs, non-breaking spaces, text after an index marker, malformed index lines and an indented marker. Each fix was local and the next round found a sibling. The round that asked reviewers for one complete pass over the heading functions found the class: inconsistent definitions. The structural fix normalizes the report input once and routes every lookup through a single heading predicate and anchored matching. When a parser keeps yielding edge-case findings round after round, stop fixing instances. Ask for a class-level pass and centralize the definition.
