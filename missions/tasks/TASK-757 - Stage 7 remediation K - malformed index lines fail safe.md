---
id: TASK-757
title: Stage 7 remediation K - malformed index lines fail safe
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-756
createdAt: '2026-09-24T20:15:17.496Z'
updatedAt: '2026-09-24T20:15:17.496Z'
---

## Description

Close `missions/plans/qm-chain-safety/stage7-review-11-codex.md` HIGH and the related `stage7-review-11-claude.md` residual.

TASK-756 recognizes the report index only as a whole line (`^<!-- COSMO_QM_REPORT <json> -->$`). Two lines now slip through:
- A line that starts with the marker but carries a same-line suffix, such as `<!-- COSMO_QM_REPORT {...} --> F-9 crash`, is no longer seen as the index. The after-index check misses the suffix too, so a clean report can reach `ready`, and the unindexed amendment can discard the suffix.
- An index line with trailing whitespace behaves the same way.

At `2d1f305` both cases blocked `ready`.

Fail safe: any line that starts with `<!-- COSMO_QM_REPORT` and is not exactly one whole-line index counts as unexpected content and blocks `ready`, whether or not an index is available. Text after a recognized index still blocks too. No calibration or amendment path may remove such a line. Keep the change minimal, and keep the whole-line index rule.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.


<!-- AC:BEGIN -->
- [ ] #1 End to end with host checks, a clean report whose index line carries a same-line suffix (`<!-- COSMO_QM_REPORT {...} --> F-9 crash`) yields `not-ready`, and `F-9 crash` is still present in the final report; the test fails on the current code.
- [ ] #2 An index line with trailing whitespace, and a marker line with no closing `-->`, each block `ready` and keep their text; a host-rendered whole-line index still reaches `ready` when clean; tested.
- [ ] #3 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
