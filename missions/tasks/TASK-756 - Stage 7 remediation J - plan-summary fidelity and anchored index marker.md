---
id: TASK-756
title: Stage 7 remediation J - plan-summary fidelity and anchored index marker
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-755
createdAt: '2026-09-24T20:01:23.264Z'
updatedAt: '2026-09-24T20:08:35.819Z'
---

## Description

Close `missions/plans/qm-chain-safety/stage7-review-10-codex.md` (MEDIUM, both LOWs) and `stage7-review-10-claude.md` (MEDIUM, LOW, and the no-fallback residual). All of these are small, fail-safe or display-fidelity items. Keep the change minimal.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.

<!-- AC:BEGIN -->
- [x] #1 The index marker is recognized only at the start of a line, both in `nextSectionStart` and in the after-index check: a finding that mentions `<!-- COSMO_QM_REPORT {} -->` inline, followed by another finding, keeps both findings in the plan summary and the final report; the test fails on the current code.
- [x] #2 The plan summary carries the host disclosures that the final report places before the first section: `Live work: …`, `Workspace retained: …` and `Index unavailable.` whenever the final report has them; tested on a cancellation or deadline with live work.
- [x] #3 On the assessment-failure path where the unindexed amendment runs, `Index unavailable.` lands before the first section, not after the index; tested.
- [x] #4 The host annotation and `Index unavailable.` insertions fall back to appending before the index, or at the end when there is no index, if the report has no heading, so no annotation can be dropped; tested with a direct unit test of the insertion helper.
- [x] #5 The CRLF-duplicate lifecycle test is built from an LF report with an appended `## Findings\r\n` duplicate, and fails on `5ddfd96`-era parsing (remove the normalization and the shared heading trim to confirm).
- [x] #6 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
