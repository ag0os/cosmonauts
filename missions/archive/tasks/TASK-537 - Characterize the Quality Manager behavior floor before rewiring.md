---
id: TASK-537
title: Characterize the Quality Manager behavior floor before rewiring
status: Done
priority: high
labels:
  - 'plan:analysis-gate-rewiring'
  - testing
dependencies: []
createdAt: '2026-07-30T16:29:02.084Z'
updatedAt: '2026-07-30T16:48:09.534Z'
---

## Description

Stage 3 of `missions/plans/analysis-gate-rewiring/plan.md`. Pin today's
Quality Manager behavior with tests that pass against the CURRENT prompt,
before any rewiring edit, so the rewiring cannot quietly drop it.

Do not change `bundled/coding/prompts/quality-manager.md` in this task. If
a characterization test fails against today's prompt, the test is wrong,
not the prompt — a test written to expect a behavior the prompt does not
have is drift, not evidence.

The plan's Assumptions name the floor: feature-branch audits, the
minimal-change fixer constraint, migration-shaped stale-reference sweeps,
the QC ledger, local-base logic, and the round budget. Quality Contract
row 1's threshold includes this characterized floor, so these tests are
the gate that the next task cannot silently regress.

Ratified ground: none reopened here. AC-011 is the reason this task
exists — nothing the Quality Manager sees today may be lost.

Gate kinds: `correctness` (hard fail). Record the commit HEAD at task
start; that SHA is the changed-scope base for any audit at task close.

<!-- AC:BEGIN -->
- [x] #1 Characterization tests in `tests/prompts/quality-manager.test.ts` pin the legacy `QC-*` contract parsing and the abstract gate-ladder parsing, including the universal / degraded / protocol-pending classification, as they behave today.
- [x] #2 Characterization tests pin the findings ledger: stable finding ids, the disposition lifecycle, the terminal-disposition sign-off gate, and that a fresh empty re-review does not close a prior finding.
- [x] #3 Characterization tests pin the local-base rule — the local `main`/`master` merge-base is preferred over `origin/main`, and already-merged local-base history is not reported as a feature-branch scope violation.
- [x] #4 Characterization tests pin the migration-shaped stale-reference sweep across runtime source, tests, and docs, and the minimal-change constraint on auxiliary analysis findings.
- [x] #5 Characterization tests pin the three-round remediation budget and its escalation-with-failure-summary exit.
- [x] #6 Every characterization test passes against the unmodified prompt, `git diff` for this task shows no change to `bundled/coding/prompts/quality-manager.md`, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
