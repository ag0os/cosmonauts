---
type: convention
title: Backticks wrap only the filename in review citations
description: >-
  Decision Log review references must leave the finding identifier outside
  inline code so citation assessors can see it.
resource: >-
  knowledge/chain-stage-context/convention-backticks-wrap-only-the-filename-in-review-citations-d9e9ba1d25c6.md
tags:
  - artifact-conformance
  - decision-log
  - markdown
  - planning
  - review-citations
timestamp: '2026-09-10T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/reviews/improvements/run-bf33d90b-0639-4b07-ad15-3e2f10194012.md
date: '2026-09-10T00:00:00.000Z'
---
When citing a review finding in a Decision Log entry, format only the review filename as inline code and leave the finding identifier as ordinary text. Do not wrap the entire filename-plus-identifier citation in backticks: markdown scanners mask inline-code spans before searching, so the visually plausible wrapped form becomes invisible and the review remains unaddressed. Artifact checks should validate this load-bearing syntax rather than leaving it as an undocumented formatting preference.
