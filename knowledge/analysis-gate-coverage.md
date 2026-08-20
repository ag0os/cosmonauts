---
type: decision
title: Analysis gate coverage
description: Archived plan distillation for analysis-gate-coverage.
resource: knowledge/analysis-gate-coverage.md
tags:
  - 'plan:analysis-gate-coverage'
  - 'source:legacy-distillation'
timestamp: '2026-08-03T00:00:00.000Z'
scope: project
kind: semantic
writer: knowledge-surface-migration
source: memory/analysis-gate-coverage.md
date: '2026-08-20T17:05:15.000Z'
legacySource: archive
legacyPlan: analysis-gate-coverage
legacyDistilledAt: '2026-08-03T00:00:00.000Z'
legacySourceSha256: 08aa039a6f1f3157b982fde3c75d1384fa2f9aa2f8d4480d4522f719df1c2ddd
---

# Analysis gate coverage

## What Was Built

A corrective plan, not a fourth slice. It repaired the contract gap (D-029) that
made `analysis-gate-rewiring` non-functional: a completed result carried one
aggregate `verdict` plus `findings[]`, but nothing declaring **which** gate
categories were evaluated, so the Quality Manager could not distinguish "this
gate ran and was clean" from "this gate never ran" and every bound gate resolved
to `failed-to-run`. Verdict-bearing results now carry a required non-empty
`coverage` member; the Fallow adapter derives it from evidence in the
invocation's own envelope; a finding outside declared coverage is a
normalization failure; and the Quality Manager passes a bound gate only for a
declared-covered category. Bound-gate resolution — Quality Contract rows 4, 5,
and 7 — works for the first time in this design.

## Key Decisions

- **D-030 — coverage is required on *every* verdict-bearing result**, not only
  the audit. An optional field is indistinguishable from missing coverage at the
  consumer, which recreates the exact gap.
- **D-031 → D-032 (superseded mid-implementation, the important story).**
  D-031 said the dead-code family declares `boundary-conformance` when the
  provider reports zones configured. Review proved that condition is
  **unevaluable**: Fallow resolves `extends` from relative paths, `npm:`, and
  `https://` and also reads `package.json`, an escaped key `"extends"`
  defeats any local token probe, and a config subprocess can never be atomic
  with the capability subprocess. D-032 replaced it: **a boundary finding is
  itself proof boundaries were evaluated**, so the category is declared exactly
  when the invocation produced one. Coverage consults no configuration at all,
  so it cannot be forged by a stale or inherited one, and a clean run
  under-declares (safe) rather than over-declaring. Nothing is lost: the QM
  resolves a bound boundary row via its own capability, never from the audit.
- **D-034 — a capability whose contributing rules are all disabled is reported
  unbound.** `rules: { "unused-files": "off", ... }` makes the provider report
  nothing whatever the code contains; binding it would let a clean covered
  result pass a gate. Over-detecting "disabled" is the safe direction, so either
  documented rule-key spelling (plural/singular) counts.
- **D-033 / D-035 — recorded, not fixed.** Detection-cache staleness for
  externally inherited config, and a per-path `overrides` entry disabling a rule
  for the analyzed scope. Both need a guarantee the adapter cannot provide;
  recording the boundary beats shipping a check that looks complete.

## Patterns Established

- **Derive a claim from evidence in the same envelope, not from ambient state.**
  This is the plan's central lesson. Configuration-derived claims inherit every
  staleness and reach problem the configuration has; evidence-derived claims
  carry their own proof. When both are available, evidence outranks
  configuration and configuration decides only the no-evidence case — the audit
  declares `dead-code` when findings exist *or* when config leaves it evaluated.
- **When a fix needs a second process to be atomic with the first, the design is
  wrong.** Two rounds were spent patching a config-vs-capability race before
  recognising it was unfixable. Deleting the mechanism beat hardening it — the
  final design is smaller than any intermediate one.
- **A guard catches only the direction it inspects.** `assertFallowFindingsCovered`
  detects under-declaration (a finding outside coverage); over-declaration with
  no findings is indistinguishable from a clean run at that seam, so it must be
  prevented upstream at the binding. Two review rounds were spent because a test
  comment claimed the guard proved more than it did.
- **Escalate rather than amend when the colliding text is ratified.** D-031 was
  human-decided; proving it unimplementable produced a drafted decision and a
  halt, not a unilateral rewrite. The replacement is stronger than anything
  amend-on-record would have produced.

## Files Changed

- `lib/analysis/types.ts` — `AnalysisGateCoverage` as a non-empty readonly tuple,
  intersected into `AnalysisCompletedResultBase` only when
  `Verdict extends AnalysisVerdict`, so `trace`/`fix-preview` structurally
  cannot carry it (D-013 enforced by the type, not convention).
- `domains/shared/extensions/project-tools/fallow-provider.ts` — evidence-derived
  coverage, the contradiction guard, `deadCodeEvaluated`/`boundariesConfigured`
  rule gating, and a synchronous configuration-identity capture folded into the
  existing single pre-spawn validation.
- `bundled/coding/prompts/quality-manager.md` — replaced only the two
  unsatisfiable "complete coverage" bullets; slice 2's exclusive-bucket and
  boundary-own-capability rules preserved.
- `docs/analysis-provider-validation.md` — `coverage[]` two-tool row (Knip
  `--include`), plus recorded guarantee boundaries; `docs/analysis-capabilities.md`.
- `tests/fixtures/fallow-2.54.2/zero-change-audit.json` — new captured
  `live-engine` envelope; `scripts/capture-fallow-envelopes.ts` extended so the
  capture is reproducible.

## Gotchas & Lessons

- **The captured `dead-code` envelope contains a `boundary_violations` entry.**
  This single fact drove the whole D-031/D-032 arc: a real dead-code invocation
  emits `boundary-conformance` findings, so the plan's literal coverage
  enumeration would have hard-failed on the repo's own fixture.
- **A no-change audit returns no sub-envelopes at all** (`changed_files_count: 0`,
  `verdict: pass`, zero counters). Requiring sub-envelopes would break every
  legitimate empty-scope audit. The zero-scope branch is atomic: all envelopes
  absent *and* all three counters zero, or it throws.
- **Confident correctness claims in comments and decision entries were the
  weak point.** "A false negative is impossible" (escaped `extends`), "the same
  residual as D-027" (a subprocess boundary is not an OS path-to-exec race), and
  "no bounded approach exists" (a final universal-glob override is decidable)
  were each disproven by review. Prefer stating what is *not* covered.
- **Review fixes reliably introduce the next defect — six codex rounds here.**
  Rounds 3, 4, and 5 were the same false-pass class surfacing on a new path each
  time (boundary binding → dead-code binding → audit disagreeing with its own
  binding). When a class recurs, generalize the rule instead of patching the
  next instance.
- **Suppressing a coverage declaration can make B-042 fire on legitimate
  output.** Withholding a category the provider still reports findings for turns
  a valid result into an error. Any "declare less" change must be checked
  against the contradiction guard.
- **A test helper can silently destroy what a test proves.** The unconfigured
  replay substituted a boundary-free envelope, so the test was not comparing
  like with like. Removing the substitution was the fix, not adjusting the
  expectation.
- **Drive's 30-minute default per-task timeout is real.** TASK-547 timed out
  mid-verification with complete, coherent work in the worktree; it reported
  `Blocked`. Verify before discarding, and raise `--task-timeout` for tasks that
  must capture live provider envelopes.
- **The `missions/tasks/config.json` writer bug is still live** — it rewrites an
  unchanged file with spaces against Biome's tabs after every Drive run. Restore
  it rather than committing the churn; the `biome.json` exclusion must stay.
