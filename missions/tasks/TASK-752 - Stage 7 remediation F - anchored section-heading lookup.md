---
id: TASK-752
title: Stage 7 remediation F - anchored section-heading lookup
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-751
createdAt: '2026-09-24T19:14:26.734Z'
updatedAt: '2026-09-24T19:14:26.734Z'
---

## Description

Close `missions/plans/qm-chain-safety/stage7-review-6-claude.md` MEDIUM-1 and LOW-1.

`visibleSectionBody` in `lib/orchestration/quality-review-report.ts` locates a section with an unanchored `indexOf("## <heading>\n")`. A `### Findings` or `#### Human decisions` subheading, or any line ending in `## Findings`, matches before the real heading. That hides the real section and yields a false `ready`, which breaks D-031 floor 1 and D-032.

Use an anchored, line-based heading match: the multiline pattern `^## <heading>[ \t]*$`, as `assessQualityReviewReport` already does. Apply it to every lookup of a defined section. Keep the change minimal.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.


<!-- AC:BEGIN -->
- [ ] #1 Section lookup is anchored to whole `## <heading>` lines: end to end through the run, a Checks line ending in `details under ## Findings` followed by a real Findings entry, a `### Findings` subsection containing `None recorded.` under Gates followed by a real Findings entry, and a `#### Human decisions` subheading under Checks followed by a real Human decisions entry each yield `not-ready`; the tests fail on the current code.
- [ ] #2 The end-to-end repeated `## Human decisions` test is rewritten so its first Human decisions section is empty or the sentinel and only the repeated section has content; it fails when the repeated-heading check is removed.
- [ ] #3 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
