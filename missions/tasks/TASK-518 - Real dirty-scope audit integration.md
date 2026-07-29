---
id: TASK-518
title: Real dirty-scope audit integration
status: To Do
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - backend
  - testing
dependencies:
  - TASK-517
createdAt: '2026-07-29T16:40:48.864Z'
updatedAt: '2026-07-29T16:40:48.864Z'
---

## Description

Stage 4 of `missions/plans/analysis-capability-runtime/plan.md`. Live
probing on 2026-07-27 showed the reference provider's changed-scope audit
from HEAD already covers tracked, staged, and untracked files, so this is
expected to pass as verification rather than to require new composition.
Treat a failure as a real signal, not as a reason to relax the assertion.

This behavior is why the two sibling plans can trust a dirty-base audit.
If it cannot be made honest, the changed-scope capability is left failed
and the gate-rewiring slice reports failed-to-run — that is the correct
outcome under INV-3, not a defeat.

Ratified ground: INV-3 — a result that cannot be classified reliably is an
error, never a pass. AC-006 and AC-009 are spec criteria.

Gate kinds: `correctness` (hard fail) and `artifact-conformance` (hard
fail). Record the commit HEAD at task start; that SHA is the changed-scope
base for any audit at task close.

<!-- AC:BEGIN -->
- [ ] #1 `B-026` — against a temporary Git project holding one tracked modification, one staged change, and one untracked source file, the real pinned adapter's changed-scope audit from base HEAD accounts for all three classes in both the changed scope and the normalized/native evidence.
- [ ] #2 If the provider does not account for a class, the adapter is amended before the slice closes: composed with read-only Git dirty-path discovery and read-only path-scoped sub-analyses, or changed-scope audit is left failed. A pass is never claimed from incomplete scope (`INV-3`).
- [ ] #3 The integration test runs the real pinned engine and states that it does.
- [ ] #4 The test carries `@cosmo-behavior plan:analysis-capability-runtime#B-026`, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
