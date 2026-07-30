---
id: TASK-534
title: Stop treating an ambiguous tree-kill result as proof the process tree is gone
status: Done
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - backend
dependencies: []
createdAt: '2026-07-30T15:02:35.793Z'
updatedAt: '2026-07-30T15:06:53.358Z'
---

## Description

Remediation for the single remaining finding from independent codex review
round 4. Rounds 1-3 findings are all closed and re-verified.

`taskkillProcessTree` treats exit code 128 as success, and `processTreeGone`
then relies on that flag plus the already-exited parent without verifying
descendants. Natural code and signal exits mark the parent closed before
starting cleanup, so a 128 result after the root exits can settle a clean
outcome while a descendant is still alive.

The defect is not the missing Windows mechanism — it is asserting a
guarantee from an ambiguous signal. That is the same failure shape this
plan rejects everywhere else: INV-3 requires that evidence which cannot be
established is reported as such, never as clean. Fix the claim, not the
platform.

Deliberately out of scope: Windows Job Objects. This slice scoped a
signal-aware read-only runner, not cross-platform process-tree ownership.
Reaching for Job Objects here would repeat the TASK-522 pattern where a
security-motivated mechanism expanded past what the plan was reviewed for.
If they are genuinely required for a complete Windows guarantee, say so in a
decision entry and defer.

The reviewer could not exercise this branch on a POSIX host, so make the
classification directly unit-testable with injected results instead of
relying on host platform coverage.

Ratified ground: INV-3, INV-5, D-014, D-025, D-026, D-027. Every previously
closed finding must stay closed — in particular the single synchronous
combined pre-spawn validation, exit reconciliation against complete
evidence, and the metric-filtered verdict. If a fix here would require
weakening an existing assertion, stop and escalate.

Gate kinds: `correctness` (hard fail), `artifact-conformance` (hard fail).
Record the commit HEAD at task start as the changed-scope base.

<!-- AC:BEGIN -->
- [x] #1 An ambiguous or unverified tree-termination result is never reported as a cleaned process tree. Specifically, a `taskkill` exit code that does not positively establish termination (notably 128) no longer counts as success when deciding whether descendants are gone.
- [x] #2 The decision is fail-safe: when descendant termination cannot be positively established, the runner does not settle a clean outcome on that basis. It reports the uncertainty rather than asserting cleanliness, consistent with INV-3's rule that unestablished evidence is never presented as a clean result.
- [x] #3 The classification is unit-testable without Windows: the exit-code-to-outcome decision is exercised directly with injected results, including the 128 case and at least one positively-successful case, so the branch is covered on any host.
- [x] #4 Windows Job Objects are NOT introduced. Full cross-platform tree ownership is out of this slice's scope; if complete Windows guarantees require them, record that as a dated decision entry naming the limitation and deferring the mechanism, rather than implementing it here.
- [x] #5 POSIX process-group cleanup behavior is unchanged, and the existing abort, timeout, and natural-exit descendant tests still pass.
- [x] #6 `cosmonauts plan check-artifacts analysis-capability-runtime` reports zero issues with `Withdrawn: 1`, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
