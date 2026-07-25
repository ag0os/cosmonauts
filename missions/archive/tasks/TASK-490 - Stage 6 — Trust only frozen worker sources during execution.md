---
id: TASK-490
title: Stage 6 — Trust only frozen worker sources during execution
status: Done
priority: medium
labels:
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies:
  - TASK-489
createdAt: '2026-07-22T15:52:46.617Z'
updatedAt: '2026-07-22T20:37:04.031Z'
---

## Description

Implementation stage 6. Owned behavior: B-020 (source AC-008 and SR-001 residual). Depends on the atomic stages 1–5 checkpoint. Implement the execution and reconcile cases test-first and place the exact B-020 marker near the executable test.

Own the exact source predicate in `lib/driver/episode-identity.ts`, execution-path handling in `cli/drive/subcommand.ts`, and evidence in `tests/cli/drive/run.test.ts`.

Ratified D-003 constraint: an executing resume trusts a frozen qualified source only when parsed `agentId === "worker"`. Any other agent source is prior provenance only; the actual resolved worker supplies the executing identity. Reconcile-only resume preserves historical provenance unchanged.

<!-- AC:BEGIN -->
- [x] #1 B-020 is proven by `tests/cli/drive/run.test.ts` > `trusts only frozen worker agent ids for execution and preserves reconcile provenance`: non-worker frozen sources cannot select or attribute execution, the actual resolved worker mints a new identity, and reconcile-only artifacts retain prior source, with the exact B-020 marker near the test.
- [x] #2 `lib/driver/episode-identity.ts` exposes one exact parsed `agentId === "worker"` predicate, and `cli/drive/subcommand.ts` applies it only to execution-path resume rather than rewriting reconcile-only history.
- [x] #3 Legitimate available frozen worker sources retain stable execution provenance, while syntactically valid arbitrary-agent sources are never attributed as the worker that ran.
- [x] #4 The affected Vitest suite, `bun run lint`, and `bun run typecheck` pass without changing deterministic F-005 identity, the gate default, or gate-OFF bytes.
<!-- AC:END -->
