---
id: TASK-496
title: Stage 9 — Add the CDX-002 unavailable-worker resume regression
status: Done
priority: medium
labels:
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies:
  - TASK-490
createdAt: '2026-07-22T15:54:06.473Z'
updatedAt: '2026-07-22T21:32:51.434Z'
---

## Description

Implementation stage 9 test-debt closure. Owned behavior: B-019 (source AC-008). Depends on the stage-6 execution source guard. Build the persisted execution-resume fixture test-first and place the exact B-019 marker near its executable test.

Own the dedicated scaffolding and regression in `tests/cli/drive/graph-resume.test.ts`; `cli/drive/subcommand.ts` is the exercised execution seam.

The case is execution-path resume, not reconcile-only: persisted non-empty `remainingTaskIds`, inline `cosmonauts-subagent`, and a frozen worker source that no longer resolves. It must demonstrate failure against the pre-CDX-002 stale-attribution behavior.

<!-- AC:BEGIN -->
- [x] #1 B-019 is proven by `tests/cli/drive/graph-resume.test.ts` > `drops an unavailable frozen worker before execution and never attributes the fallback to it`: resumed spec omits stale source and attempt id, fallback worker executes remaining work, and no episode names the unavailable source, with the exact B-019 marker near the test.
- [x] #2 The fixture persists graph resume state with non-empty remaining task IDs and drives inline `cosmonauts-subagent` execution rather than reusing reconcile-only or driver-tool fixtures.
- [x] #3 The regression contains a targeted negative assertion that fails against pre-CDX-002 behavior where stale frozen identity survives fallback execution.
- [x] #4 `tests/cli/drive/graph-resume.test.ts`, `bun run lint`, and `bun run typecheck` pass without broadening frozen-source trust or changing reconcile-only provenance.
<!-- AC:END -->
