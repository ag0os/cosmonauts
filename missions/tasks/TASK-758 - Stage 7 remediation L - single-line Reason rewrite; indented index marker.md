---
id: TASK-758
title: Stage 7 remediation L - single-line Reason rewrite; indented index marker
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-757
createdAt: '2026-09-24T20:26:11.463Z'
updatedAt: '2026-09-24T20:26:11.463Z'
---

## Description

Close `missions/plans/qm-chain-safety/stage7-review-12-codex.md` (MEDIUM) and `stage7-review-12-claude.md` LOW-1.

**Codex MEDIUM (INV-003).** In `amendUnindexedQualityReviewReport`, the `^Reason:\s*.*$` replacement lets `\s*` cross newlines when `Reason:` is empty. It then consumes the following lines: a malformed marker line, or the `## Checks` heading, which drops host check results from the final report. Audit every `Reason:`/`Verdict:` line match in `lib/orchestration/quality-review-*.ts` for the same pattern, and restrict each to its own line (`[ \t]*`).

**Claude LOW-1.** An indented marker line such as `  <!-- COSMO_QM_REPORT {...} --> F-9 crash` escapes the malformed-marker rule, which is anchored at column 0. Allow leading spaces and tabs in the marker-start and malformed-marker regexes, so an indented marker line blocks `ready` and ends the section. A whole-line, unindented host index is still the only valid index.

Keep the change minimal. Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.


<!-- AC:BEGIN -->
- [ ] #1 An unindexed report with an empty `Reason:` line keeps every following line through the amendment, including a malformed marker line (same-line suffix, trailing whitespace, unclosed) and the `## Checks` heading with host check results; end to end with host checks the verdict is `not-ready` where a marker is present and the marker text is in the final report; the tests fail on the current code.
- [ ] #2 No `Reason:` or `Verdict:` line match in `lib/orchestration/quality-review-*.ts` can span a newline.
- [ ] #3 An indented index-marker line with a suffix blocks `ready` and keeps its text end to end; a clean host-rendered report with its unindented whole-line index still reaches `ready`; tested.
- [ ] #4 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
