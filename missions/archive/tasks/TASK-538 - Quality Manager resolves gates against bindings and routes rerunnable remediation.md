---
id: TASK-538
title: >-
  Quality Manager resolves gates against bindings and routes rerunnable
  remediation
status: Done
priority: high
labels:
  - 'plan:analysis-gate-rewiring'
  - backend
dependencies:
  - TASK-535
  - TASK-537
createdAt: '2026-07-30T16:29:50.575Z'
updatedAt: '2026-07-30T17:42:34.438Z'
---

## Description

Stage 4 of `missions/plans/analysis-gate-rewiring/plan.md`, for
`bundled/coding/prompts/quality-manager.md`. Replace the prose-block-and-
command path with direct capability calls. Read Design section 2 and
decisions D-010, D-013, D-016, D-019, D-021 first.

The Quality Manager calls `analysis_status` and the changed-scope audit
capability itself and consumes the structured result directly. It no
longer derives an audit command for the verifier from the prose block, and
the verifier is no longer the transport for the Quality Manager's
findings.

Everything TASK-537 characterized must still hold — legacy `QC-*` rows,
the ladder classification, the findings ledger, local-base logic, the
migration sweep, the minimal-change constraint, and the round budget. If a
characterization test now fails, the rewiring dropped something: restore
the behavior rather than editing the characterization. A test rewritten to
expect the wrong behavior is drift.

Ratified ground: D-019 is settled — route the exact capability request
plus human-readable designations; the deterministic-ID replay protocol
(B-032) stays withdrawn and must not be resurrected or renumbered. D-013
is ratified: `trace` and `fix-preview` carry `verdict: "not-applicable"`.
AC-006 forbids omitting the base. If the delivered runtime contract cannot
express what this prompt needs, that is an amend-on-record against
`analysis-capability-runtime`, deliberately reopened — never a
prompt-level workaround that reintroduces a provider name or command.

Scope: `bundled/coding/prompts/quality-manager.md` only. `verifier.md` and
`fixer.md` belong to the next task; the migration-sweep clause is its own
task; the legacy prose injection is deleted by the bridge-deletion task —
leave the injection in place here.

Gate kinds: `correctness` (hard fail), `artifact-conformance` (hard fail),
`duplication` / `complexity` / `dead-code` (bound — resolve via capability
from an explicit base). Record the commit HEAD at task start; that SHA is
the changed-scope base for any audit at task close.

<!-- AC:BEGIN -->
- [x] #1 `B-013` — `tests/prompts/quality-manager.test.ts` > `runs bound feature branch gates directly through the changed scope capability` proves the prompt instructs supplying the literal merge-base SHA as the base, consuming per-gate verdicts and findings from the direct tool result, and never synthesizing a command or a verifier handoff.
- [x] #2 `B-014` — `tests/prompts/quality-manager.test.ts` > `runs bound dirty base gates from an explicit HEAD base` proves the prompt instructs supplying the literal HEAD SHA as the base and forbids skipping the audit because no branch range exists.
- [x] #3 `B-015` — `tests/prompts/quality-manager.test.ts` > `uses runtime unbound status for degraded gate reporting` proves a genuinely unbound bindable gate is reported unbound / not enforced with reviewer judgment — neither a pass nor a hard failure — using the vocabulary amended into `gate-contracts.md` by TASK-535.
- [x] #4 `B-016` — `tests/prompts/quality-manager.test.ts` > `separates failed to run gates and routes findings for direct replay` proves a capability tool error is a failed-to-run blocker distinct from degraded, and that findings route as the exact capability request (capability, base/scope/metric) plus human-readable designations — file:line, category, quoted message — never copied model-authored payload (`D-019`).
- [x] #5 A bound gate whose result carries no classifiable per-gate verdict is reported failed-to-run, not a pass (`INV-3`).
- [x] #6 The TASK-537 characterization tests still pass unmodified against the rewired prompt, and the prompt names no provider or command (`INV-1`, `AC-011`).
- [x] #7 Tests carry `@cosmo-behavior plan:analysis-gate-rewiring#B-013`, `#B-014`, `#B-015`, and `#B-016` near the executable tests, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->

## Implementation Notes

Record correction (post-review, codex finding Low-2): AC #6's wording 'still pass unmodified' is inaccurate. Four characterization assertions written by TASK-537 were updated here, and one characterization test ('pins feature-branch audits to the literal local merge-base SHA') was replaced by the B-013 test. Verified independently: no behavior floor was weakened. Three edits were forced by the bridge deletion (they pinned wording naming the removed prose block) and one strengthened B-031 ('otherwise add explicit verifier claims' -> 'always add'). The correct claim is semantic floor preservation, not literal test immutability.
