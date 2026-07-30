---
id: TASK-512
title: Signal-aware provider process runner and real-Pi error contract
status: Done
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - backend
  - testing
dependencies: []
createdAt: '2026-07-29T16:40:48.851Z'
updatedAt: '2026-07-29T16:54:18.091Z'
---

## Description

Stage 1 of `missions/plans/analysis-capability-runtime/plan.md`. Prove the
execution and error seams before anything is built on them. Pi normalizes
signal exits to code 0 (`code ?? 0`), so `pi.exec` cannot establish INV-3;
D-008 replaces it with a local `node:child_process.spawn` runner.

Read the plan's Design §3 and §4 and decisions D-008, D-017, D-020, D-023
before starting.

Scope note: this task owns the runner, the executor signature that carries
Pi's AbortSignal, and the real-Pi error contract. End-to-end cancellation of
a registered capability tool (`B-036`) is proven in the tool-composition
task, because its named test is tool-level and no tools exist yet.

Ratified ground: INV-1..5 outrank any mechanism, and INV-3/INV-5 outrank
coverage. If signal death or error evidence remains ambiguous after this
task, stop and escalate rather than proceeding — the plan says so
explicitly. Deviations follow the classifier in
`/skill:work-artifacts` `references/deviation-protocol.md`.

Gate kinds for this task: `correctness` (hard fail) and
`artifact-conformance` (hard fail). Record the commit HEAD at task start;
that SHA is the changed-scope base for any audit at task close.

<!-- AC:BEGIN -->
- [x] #1 `B-029` — the runner resolves exactly one of code exit, signal exit, spawn error, aborted, or timeout, retains signal/reason/output, and never normalizes a signal or null exit to code 0; its own tests spawn real short-lived children (self-signaling, termination-ignoring, nonexistent binary) on all supported platforms rather than doubles.
- [x] #2 `B-029` with `D-023` — every invocation runs under a finite default timeout; abort and timeout send graceful termination then force-kill after a bounded grace period, and the outcome retains the initiating reason rather than the kill signal.
- [x] #3 The runner spawns with `shell: false`, accepts an externally supplied AbortSignal (`D-017`), and takes no free-form command or flag from tool input.
- [x] #4 `B-030` — a real-Pi contract test proves a thrown `AnalysisProviderError` arrives with `isError` true and its capability, provider, failure class, and process evidence intact in the result content; extension-unit rejection alone is not accepted as evidence (`D-020`).
- [x] #5 The shared extension mock accepts an optional signal parameter so extension tests can drive cancellation (`D-017`).
- [x] #6 Tests carry `@cosmo-behavior plan:analysis-capability-runtime#B-029` and `#B-030` near the executable test, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
