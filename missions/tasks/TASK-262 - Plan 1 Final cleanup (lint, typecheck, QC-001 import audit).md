---
id: TASK-262
title: 'Plan 1: Final cleanup (lint, typecheck, QC-001 import audit)'
status: To Do
priority: low
labels:
  - backend
  - testing
  - 'plan:driver-primitives'
dependencies:
  - TASK-259
  - TASK-260
  - TASK-261
createdAt: '2026-05-04T17:34:41.238Z'
updatedAt: '2026-05-04T18:25:57.795Z'
---

## Description

Verify full CI green and QC-001 compliance across all Plan 1 modules.

See **Implementation Order step 14**, QC-001, QC-019 in `missions/plans/driver-primitives/plan.md`.

This task is a gate: it should not start until TASK-259, TASK-260, and TASK-261 are Done. It does not add new features; it only fixes any remaining lint/type errors, confirms the import boundary, and spot-checks QC coverage.

<!-- AC:BEGIN -->
- [ ] #1 bun run test passes (all pre-existing 1810+ tests plus all new driver/extension tests).
- [ ] #2 bun run lint passes with zero errors or warnings.
- [ ] #3 bun run typecheck passes with zero errors.
- [ ] #4 QC-001 confirmed: grep of import lines in lib/driver/**/*.ts shows zero imports from any domains/ path; backend files show zero imports from cli/.
- [ ] #5 All QC-002 through QC-019 verifier commands pass when run individually (spot-check at least QC-002, QC-012, QC-016, QC-018).
<!-- AC:END -->

## Implementation Notes

Reset from false Done to To Do. Provider failure during chain run on 2026-05-04 — openai-codex/gpt-5.5 returned empty responses; coordinator confabulated success. No implementation landed. Retry pending.
