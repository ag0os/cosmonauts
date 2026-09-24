---
id: TASK-751
title: >-
  Stage 7 remediation E - duplicated sections, cap-note placement, prompt
  sentinels, pinned guards
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-750
createdAt: '2026-09-24T18:32:57.832Z'
updatedAt: '2026-09-24T18:42:48.562Z'
---

## Description

Close Stage 7 review 5 under D-031 and D-032. The review files are `missions/plans/qm-chain-safety/stage7-review-5-codex.md` (1, 2) and `stage7-review-5-claude.md` (LOW-1..LOW-5).

D-032 was amended on 2026-09-24 in two ways:
- A defined section heading that appears more than once blocks `ready`.
- The host P0/P1 cap works by lens identity, applying only to the performance lens. Performance claims raised by other lenses are covered by reviewer-prompt guidance and are a recorded limit. Do NOT add text recognition of performance topics in other lenses.

This is a small, final round. Keep the change minimal.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression. Binding ratified ground is INV-001..INV-005, D-018..D-023 and D-027..D-030.

Every new test must fail on the current code or kill a named mutation.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.

<!-- AC:BEGIN -->
- [x] #1 A defined report section heading that appears more than once (for example a second `## Findings` after `None recorded.`, or a second `## Human decisions`) yields `not-ready` end to end, and no calibration rewrite drops content from a repeated section (codex 1, Claude LOW-1); tested.
- [x] #2 A host cap note for an Out-of-range copy is written in Out-of-range observations, never appended to Findings, so an otherwise clean report whose only unsupported performance P1 was filed under Out-of-range stays `ready` with an empty or sentinel Findings section (Claude LOW-5, TASK-750 AC #4); tested.
- [x] #3 Prompts: the generalist `reviewer.md` states the performance P0 or P1 rule (codex 2, Claude LOW-4); the QM prompt says to write `None recorded.` under Human decisions when there are none and that the host accepts it, and to put closing remediation advice as a paragraph under Reviewed rather than under a new heading (Claude LOW-3); the host accepts the `None recorded.` sentinel under Human decisions; tested for the host part.
- [x] #4 Pinned guards (Claude LOW-2): a test fails when the `raisingLenses.length > 0` guard is removed, and a test fails when closure accepts any other-lens citation instead of the cited one.
- [x] #5 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
