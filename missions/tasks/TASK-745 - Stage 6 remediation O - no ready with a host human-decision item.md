---
id: TASK-745
title: Stage 6 remediation O - no ready with a host human-decision item
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-744
createdAt: '2026-09-24T14:59:44.436Z'
updatedAt: '2026-09-24T15:11:16.992Z'
---

## Description

Both round-9 channels (`missions/plans/qm-chain-safety/mid-review-9-{codex,claude}.md`) found the same HIGH regression from TASK-744. When analysis preparation fails but the audit still completes bound and the checks pass, `hostBlocksReady` (`lib/orchestration/quality-review-run.ts`) does not block. The report can then say `ready` while also saying "Analysis preparation failed; human decision required." The Claude reviewer reproduced it: `scratchpad/mid9/probe-ready.ts` in the coordinator scratchpad.

Fix the class, not just the instance. The rule is that a report with any host-added human-decision item cannot be `ready` (spec User Experience, D-019, D-009, D-025, D-026).

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`. Do not touch it; lint on tracked paths must pass. Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.

<!-- AC:BEGIN -->
- [x] #1 A failed analysis preparation blocks `ready` even when the audit completes bound and all checks pass; tested through `launchQualityReview` with the prep failure as the ONLY blocker (no gate-owned file change, passing checks, configured model), for indexed and unindexed reports.
- [x] #2 Structural guard: the host verdict is computed after all host human-decision items are assembled, and any host human-decision item forces `not-ready`; a test enumerates each host human-item source (not configured checks/model, gate-owned change, unbound/unobserved/failed-to-run audit, prep failure, analysis-prep failure) and asserts none can coexist with `ready`.
- [x] #3 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
