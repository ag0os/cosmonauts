---
id: TASK-529
title: Remove the provider sandbox boundary per the ratified D-025 deferral
status: Blocked
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - backend
dependencies: []
createdAt: '2026-07-29T20:55:57.651Z'
updatedAt: '2026-07-29T21:03:50.236Z'
---

## Description

Scope correction, decided by the human on 2026-07-29 and recorded as the
rewritten `D-025` in `missions/plans/analysis-capability-runtime/plan.md`.
Read that entry before starting.

TASK-522 implemented an OS-enforced sandbox for provider subprocesses and
amended the plan to require it, failing closed when no confinement binary
exists. `resolveSandboxExecutable` branches on darwin and linux and then
throws `Provider sandbox boundary is unavailable on <platform>` — there is
no Windows branch, and bubblewrap is not installed by default on many Linux
distributions. That makes every analysis capability uncallable on those
platforms, which narrows ratified AC-003 ("agents have callable capability
tools") and AC-011 ("at least as losslessly"), and contradicts TASK-526's
own requirement of POSIX and Windows resolution.

The human decision is to defer sandboxing entirely to a follow-up plan.
D-012 stands unchanged as the INV-5 mechanism, on top of D-014's consent
gate. `D-012`'s supersession pointer has already been removed from the plan.

This is a revert of one mechanism, not of the remediation round. The
surrounding work is correct and independently valuable — especially the
switch from the `node_modules/.bin` Node shim to the platform-native
analyzer binary, which fixed a confirmed INV-3 violation where the shim's
`process.exit(null)` turned a signal death into exit code 0. Keep it.

Be surgical: the sandbox and the process-tree termination work landed in the
same file. Termination stays; confinement goes.

Ratified ground: INV-1..INV-5 and AC-001..AC-012 outrank any mechanism, and
`D-025` as now written is human-decided ground. If removing the sandbox
appears to genuinely weaken INV-5 beyond what D-012 covers, stop and
escalate rather than reintroducing confinement.

Gate kinds: `correctness` (hard fail), `artifact-conformance` (hard fail).
Record the commit HEAD at task start as the changed-scope base.

<!-- AC:BEGIN -->
- [x] #1 No provider invocation runs through `sandbox-exec`, `bwrap`, or any other OS confinement wrapper; `process-runner.ts` spawns the resolved analyzer directly with `shell: false`, and every sandbox-resolution, sandbox-profile, temporary-sandbox-root, and sandbox-unavailable code path is gone.
- [x] #2 No platform can fail solely because a confinement executable is missing. A provider that resolves on darwin, linux, or win32 is executable on that platform, restoring ratified AC-003 and AC-011.
- [x] #3 D-012's enforcement is intact and proven: `--no-cache` on every analysis and introspection invocation, dry-run for fix preview, non-writing version detection, and `B-012`'s whole-worktree snapshot (including ignored provider cache paths) across status plus all seven capabilities.
- [x] #4 Every other remediation from TASK-521 and TASK-523..528 is preserved unchanged — in particular the native platform-binary resolution that replaced the `node_modules/.bin` Node shim, complete process-tree termination on abort and timeout, spawn-time consent re-checking, bounded output capture, metric-specific complexity results, and trace target legality. Removing the sandbox must not regress any of them.
- [x] #5 Tests that existed only to prove sandbox confinement are removed rather than weakened; tests that prove non-sandbox properties are kept. No test is left asserting a property the code no longer has, and no behavior loses its named test or marker.
- [ ] #6 `cosmonauts plan check-artifacts analysis-capability-runtime` reports zero issues with `Withdrawn: 1`, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->

## Implementation Notes

task failed
