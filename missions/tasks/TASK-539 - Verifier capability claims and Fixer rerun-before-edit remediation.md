---
id: TASK-539
title: Verifier capability claims and Fixer rerun-before-edit remediation
status: To Do
priority: high
labels:
  - 'plan:analysis-gate-rewiring'
  - backend
dependencies:
  - TASK-535
  - TASK-536
createdAt: '2026-07-30T16:29:50.579Z'
updatedAt: '2026-07-30T16:29:50.579Z'
---

## Description

Stage 4 of `missions/plans/analysis-gate-rewiring/plan.md`, for
`bundled/coding/prompts/verifier.md` and `bundled/coding/prompts/fixer.md`,
proved in the new `tests/prompts/analysis-procedures.test.ts`. Read Design
sections 2 and 4 and decisions D-013, D-019 first.

The verifier gains a generic capability-claim validation procedure — it is
a validator, not the transport for the Quality Manager's gate findings.
The fixer gains the remediation half of D-019: rerun the routed capability
request before editing and treat its own fresh structured result as ground
truth.

This task delivers the fixer-side rerun clause that B-016's Quality
Manager routing pairs with. `quality-manager.md` is not edited here.

Ratified ground: D-019 is settled and B-032 stays withdrawn. D-013 is
ratified — `trace` and `fix-preview` carry `verdict: "not-applicable"`, so
neither role may read a pass or fail out of them. INV-5 is absolute: no
capability tool mutates the codebase, a fix preview is a proposal, and the
fixer applies ordinary reviewable edits. A runtime gap is an
amend-on-record against `analysis-capability-runtime`, never a prompt
workaround naming a provider or command.

Gate kinds: `correctness` (hard fail), `artifact-conformance` (hard fail),
`duplication` / `complexity` / `dead-code` (bound — resolve via capability
from an explicit base). Record the commit HEAD at task start; that SHA is
the changed-scope base for any audit at task close.


<!-- AC:BEGIN -->
- [ ] #1 `B-017` — `tests/prompts/analysis-procedures.test.ts` > `gives verifier a provider agnostic capability claim protocol` proves the verifier validates a capability/scope/base/metric claim by calling status and the named generic tool, reports completed, unbound, unsupported, and failed distinctly, and uses no provider command.
- [ ] #2 `B-018` — `tests/prompts/analysis-procedures.test.ts` > `keeps fixer remediation replayed trace first preview only and agent edited` proves the fixer reruns the routed capability request before editing, treats its own fresh result as ground truth, traces before deletion, may request a fix preview, treats proposed actions as proposals, and applies only ordinary narrow edits.
- [ ] #3 An unbound or failed capability at the fixer's rerun yields `not-resolved` returned to the Quality Manager for re-analysis, never a guess from the stale routed designations (`D-019`, `INV-3`).
- [ ] #4 The existing minimal-change constraint on auxiliary analysis findings survives the rewiring, and the fixer's existing `resolved` / `not-resolved` reporting contract is unchanged (`AC-011`).
- [ ] #5 Neither prompt names a provider, a command, or any apply/fix-application operation (`INV-1`, `INV-5`, `AC-008`).
- [ ] #6 Tests carry `@cosmo-behavior plan:analysis-gate-rewiring#B-017` and `#B-018` near the executable tests, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
