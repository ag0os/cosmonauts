---
id: TASK-753
title: >-
  Stage 7 remediation G - anchored plan-summary sections, trailing-whitespace
  headings
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-752
createdAt: '2026-09-24T19:24:10.751Z'
updatedAt: '2026-09-24T19:27:28.306Z'
---

## Description

Close `missions/plans/qm-chain-safety/stage7-review-7-codex.md` (MEDIUM, LOW) and `stage7-review-7-claude.md` LOW-1.

`renderPlanSummary` in `lib/orchestration/quality-review-run.ts` still finds sections with an unanchored `indexOf("## <heading>\n")`. The durable plan summary can therefore omit a real finding when a line elsewhere ends in `## Findings`.

Reuse the anchored lookup that TASK-752 added in `quality-review-report.ts` (export it, or expose a body accessor), so there is one section-lookup implementation. Make the unexpected-section check treat a defined heading followed only by trailing spaces or tabs as that defined section, consistent with `sectionBodyStart`. Keep the change minimal.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.

<!-- AC:BEGIN -->
- [x] #1 The plan summary reads sections through the same anchored lookup as the report: with a Checks line ending in `details under ## Findings` and a real Findings entry, the plan summary shows that entry under Findings and does not show Checks text there; the test fails on the current code.
- [x] #2 No unanchored `indexOf("## ` section lookup remains in `lib/orchestration/quality-review-*.ts`.
- [x] #3 A clean report whose defined headings carry trailing spaces or tabs is not treated as having unexpected sections and can reach `ready`; content under such a heading is still inspected as that section; tested.
- [x] #4 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
