---
id: TASK-744
title: Stage 6 remediation N - analysis-prep failure keeps observed audit evidence
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-743
createdAt: '2026-09-24T14:49:08.272Z'
updatedAt: '2026-09-24T14:49:08.272Z'
---

## Description

Remediate the round-8 findings in `missions/plans/qm-chain-safety/mid-review-8-codex.md` (MEDIUM 1, LOW 2) and `mid-review-8-claude.md` (LOW). All three are in `lib/orchestration/quality-review-run.ts` and `quality-review-report.ts`. The work is governed by D-025 (host-verified gate state), D-026 (prep is recorded) and INV-005/AC-008/B-005.

Keep the branch's changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression. Every test must fail on the current code.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`. Do not touch it; lint on tracked paths must pass. Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.


<!-- AC:BEGIN -->
- [ ] #1 An `analysisPrepare` failure never erases an observed audit (codex MEDIUM): when the host observed a bound, completed audit (pass or fail), that observed gate state and its introduced findings are kept in the report; the prep failure is added as a separate human-decision item and forces `not-ready`; only when no bound audit was observed is the gate recorded as failed-to-run; tested with a prep failure plus an observed failing audit carrying a finding.
- [ ] #2 Unindexed reports get the same host gate override as indexed ones (Claude LOW): the QM-written gate lines are replaced, not appended to, so `## Gates` never contains contradictory states; tested with an unindexed report after a prep failure.
- [ ] #3 The setup settle-grace timer is cleared when setup settles first (codex LOW); a test with a large grace and a fast-settling setup asserts the run returns promptly.
- [ ] #4 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
