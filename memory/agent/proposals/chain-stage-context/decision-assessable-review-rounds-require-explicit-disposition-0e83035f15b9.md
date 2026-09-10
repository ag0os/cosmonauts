---
type: decision
title: Assessable review rounds require explicit disposition
description: >-
  A review artifact with findings remains blocking until a Decision Log entry
  cites that exact round and each blocking finding.
resource: >-
  knowledge/chain-stage-context/decision-assessable-review-rounds-require-explicit-disposition-0e83035f15b9.md
tags:
  - artifact-conformance
  - decision-log
  - fail-closed
  - planning
  - reviews
timestamp: '2026-09-10T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/reviews/improvements/run-bf33d90b-0639-4b07-ad15-3e2f10194012.md
date: '2026-09-10T00:00:00.000Z'
---
Do not infer disposition from later plan edits, timestamps, or task completion. Treat each assessable review round as outstanding until parseable Decision Log entries make round-qualified references to every blocking finding. Artifact checks should scan the plan directory for the latest assessable round and report an uncited round even when no chain is running. This closes the process gap where a review file can sit beside a revised plan without any durable evidence that its findings were considered.
