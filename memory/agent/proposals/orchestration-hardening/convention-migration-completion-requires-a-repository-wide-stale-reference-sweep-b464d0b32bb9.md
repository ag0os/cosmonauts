---
type: convention
title: Migration completion requires a repository-wide stale-reference sweep
description: >-
  Any rename or move is incomplete until the old identifier is searched across
  runtime source, tooling, tests, and documentation.
resource: >-
  knowledge/orchestration-hardening/convention-migration-completion-requires-a-repository-wide-stale-reference-sweep-b464d0b32bb9.md
tags:
  - migration
  - repository
  - stale-references
  - verification
timestamp: '2026-06-24T17:55:28.891Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/tasks/TASK-406 - Require a repo-wide stale-reference sweep
  for migration tasks (not testsdocs only).md
date: '2026-06-24T17:55:28.891Z'
---
For file, directory, symbol, export, or path migrations, search the entire repository for the old reference before declaring completion. Prioritize runtime and operational source because a tests-and-documentation-only sweep can leave production paths broken, but include scripts, configuration, tests, and docs as well. Run this check immediately after migration-shaped work rather than deferring it to a final dead-code gate.
