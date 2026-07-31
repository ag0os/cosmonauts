---
id: TASK-548
title: Capture and validate zero-change audit coverage
status: To Do
priority: high
labels:
  - backend
  - testing
  - docs
  - review-fix
  - 'review-round:1'
  - 'plan:analysis-gate-coverage'
dependencies:
  - TASK-547
createdAt: '2026-07-31T16:39:13.285Z'
updatedAt: '2026-07-31T16:39:13.285Z'
---

## Description

Merged review round 1 findings SR-001/F-002 at `domains/shared/extensions/project-tools/fallow-provider.ts:1994-2069`. The current zero-change fallback declares coverage from `changed_files_count: 0` plus per-category zero summary counters when Fallow omits sub-envelopes. Independent review probed pinned Fallow 2.54.2 and confirmed this is its legitimate no-change envelope shape, so do not blindly remove the fallback and break valid no-change audits. Close the evidence gap required by B-041: commit provenance-labeled real-envelope evidence, replay it through normalization, document why these category-specific counters establish empty-scope coverage, and prove malformed/missing/nonzero counter variants fail closed instead of receiving unsupported coverage. Preserve INV-2/INV-3, D-029/D-031, and non-empty coverage on every completed verdict-bearing result. Keep the remediation narrow and do not change capability/gate vocabulary.

<!-- AC:BEGIN -->
- [ ] #1 A provenance-labeled captured Fallow 2.54.2 zero-change audit envelope is committed and replayed through the adapter.
- [ ] #2 The legitimate zero-change envelope's declared coverage is asserted, while missing, malformed, or contradictory zero-change summary evidence fails closed and cannot silently pass an undeclared analyzer.
- [ ] #3 Provider validation documents zero-scope summary derivation separately from sub-envelope derivation, and project artifact/lint/typecheck/test gates pass.
<!-- AC:END -->
