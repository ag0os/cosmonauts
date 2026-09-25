---
type: decision
title: 'Whether a test can fail is answered by mutation probes, never by reasoning'
description: >-
  Test health is measured by mutating the production code a test exercises and
  recording killed or survived; a judgment that cannot fail is not evidence.
resource: >-
  knowledge/framework-health/decision-whether-a-test-can-fail-is-answered-by-mutation-probes-never-by-reasoning-072cd51e45e2.md
tags:
  - mutation-testing
  - test-health
  - testing
  - verification
timestamp: '2026-09-23T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/framework-health/stage2-probes.md
date: '2026-09-23T00:00:00.000Z'
---
The superseded test-health audit had agents assess about 3,100 test declarations and reason about fault sensitivity. Nearly all came back as reasoned, one was probe-confirmed, and the method reproduced the defect it was built to find, so its profiles were discarded. The replacement is mechanical. A deterministic census (`bun run probe:census`, `scripts/probe-census.ts`) samples test declarations, stratified by the first directory under `tests/`. A declaration is found through the TypeScript AST, because a line regex missed chained `test.each` forms. For each one, the shipped material it exercises is mutated, and the result is killed or survived. That material can be code under lib/cli/domains/scripts/bundled, shipped external skills or commands, or a pinned dependency's code for Pi contract tests; it is never test code. Probes run in a throwaway git worktree of the committed tree, with `cp` backups inside it, so an interruption leaves nothing behind. A survivor closes only after it is strengthened or replaced and probed again as killed: an edit is not evidence. The first sample was 75 declarations, 66 killed and 9 survived, and every survivor was closed this way.
