---
id: TASK-497
title: Stage 10 — Enforce OFF-state identity and integrated quality gates
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies:
  - TASK-492
  - TASK-494
  - TASK-495
  - TASK-496
createdAt: '2026-07-22T15:54:28.826Z'
updatedAt: '2026-07-22T21:48:25.041Z'
---

## Description

Implementation stage 10 integration gate. Owned behaviors: B-001 (source AC-001) and B-021 (source AC-009). Depends on completion of stages 6–9 and therefore the atomic stages 1–5 checkpoint. This task implements the final exact parity and integration regressions; it is not a substitute owner for any other behavior or design constraint.

Own final parity/integration evidence in `tests/driver/drive-on-graph-routing.test.ts`, including retained/extended evidence in `tests/cli/drive/run.test.ts`, `tests/extensions/orchestration-driver-tool.test.ts`, `tests/extensions/orchestration-driver-detached.test.ts`, `tests/driver/backends/cosmonauts-subagent-resolution.test.ts`, `tests/plans/plan-manager.test.ts`, `tests/tasks/task-manager.test.ts`, and `tests/memory/episode-transition-lock.test.ts`.

Ratified hard gate: `episodicLog.enabled` remains OFF by default. Absent/false must be byte-identical to current main across session/manifest layout, all workdir files, legacy/normalized ordering, CLI/tool output, manager baseline bytes, and unlocked concurrent manager semantics; no ledger, transition lock, or episode artifact may remain.

<!-- AC:BEGIN -->
- [x] #1 B-001 is proven by `tests/driver/drive-on-graph-routing.test.ts` > `keeps OFF-state Drive files events layout and output byte-identical across hardened paths`, with the exact B-001 marker; exact supporting assertions also cover CLI, driver-tool, detached extension, plain-worker backend layout, plan manager, task manager, and transition-lock bypass in every additional evidence file named in the task description.
- [x] #2 B-021 is proven by `tests/driver/drive-on-graph-routing.test.ts` > `integrates detached hardening without regressing the Drive baseline`, with the exact B-021 marker and all stages integrated as one change set.
- [x] #3 `bun run test` passes the user-provided 2,645-test baseline plus all new regressions, followed in order by clean `bun run lint` and `bun run typecheck`; any failure blocks completion.
- [x] #4 Artifact conformance finds exactly one `@cosmo-behavior plan:episodic-log-detached-hardening#B-###` marker near executable evidence for every B-001 through B-029, in each behavior's root-relative named test file.
- [x] #5 Targeted negative evidence catches terminal reordering, random F-005 identity, skipped intent capture, stale launch snapshots, bridge over-forwarding or non-termination, stamped completion downgrade, hook reclassification or post-hook writes, source-resolution fallthrough, non-worker trust, stale transition reads, raw-case lock paths, OFF lock acquisition, and OFF layout leakage.
- [x] #6 Duplication and boundary review confirms one ledger, fallback guard, bridge drain, and terminal helper; no increase in filesystem lock-protocol implementations; run-state owns terminal persistence; enabled locks release before capture and fail soft; no new artifact is scanner-visible or git-tracked.
- [x] #7 The gate default, architecture/MemoryStore surfaces, config loader, episode serializer, agent-memory extension, architecture map, historical `memory/episodic-log.md`, and excluded manager mutation paths remain unchanged.
<!-- AC:END -->
