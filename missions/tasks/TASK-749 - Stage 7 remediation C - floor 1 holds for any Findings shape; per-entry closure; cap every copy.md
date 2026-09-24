---
id: TASK-749
title: >-
  Stage 7 remediation C - floor 1 holds for any Findings shape; per-entry
  closure; cap every copy
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-748
createdAt: '2026-09-24T17:02:31.679Z'
updatedAt: '2026-09-24T17:02:31.679Z'
---

## Description

Remediate the verified findings in `missions/plans/qm-chain-safety/stage7-review-3-codex.md` (1, 2, 3) and `stage7-review-3-claude.md` (H-1, L-1..L-4), under plan D-031 (amend-on-record 2026-09-24).

D-031 gives host B-010 calibration two hard floors:
1. It never produces or permits a false `ready`.
2. It never silently drops a reviewer finding.

Unsupported performance P0/P1 must be capped or raised as a human item. Recognizing a genuine measurement or different-lens evidence in text stays heuristic, and its misses are recorded limits. Do NOT extend that text recognition.

**The floor-1 principle: fail safe.** TASK-748 replaced "any Findings content blocks `ready`" with a parse of `- ` bullets only, so a finding in any other markdown shape now reaches `ready`. Restore the fail-safe direction. Findings content that is not fully accounted for as recognized, ID-keyed, evidenced-closed dismissal entries blocks `ready`. That covers numbered lists, `*`/`+` bullets, prose, text before the first bullet, and trailing paragraphs. Closure is decided per entry, never per ID.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression. Binding ratified ground is INV-001..INV-005, D-018..D-023 and D-027..D-030.

Every new test must fail on the current code, and the tests must kill the named mutations.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.


<!-- AC:BEGIN -->
- [ ] #1 Floor 1 holds for every Findings shape (codex 1, Claude H-1): a real finding under `## Findings` written as a numbered item, a `*` or `+` bullet, a prose paragraph, prose before the first bullet, or a trailing paragraph after a closed dismissal entry yields `not-ready` end to end through the run; only a Findings body made entirely of evidenced-closed dismissal entries (or empty) lets `ready` through; tests fail if the Findings condition in the host ready check is replaced with `false` and if ID-less entries stop blocking.
- [ ] #2 Closure is per entry (codex 2): an evidenced dismissal of `F-1` does not close a separate open `F-1` entry in either section; the open entry blocks `ready`; tested.
- [ ] #3 The P0/P1 cap applies to every entry sharing an unsupported performance ID in both sections (codex 3): a duplicate `PF-1 P0` in Out-of-range observations is capped or raised as a human item, and a cap that cannot be applied in place becomes a human item rather than only a Findings note; tested.
- [ ] #4 Leading-ID recognition tolerates ordinary decoration (Claude L-1, codex LOW): leading `AC-`/`D-`/`INV-`/`B-` tokens are not finding IDs, and `**F-001**`, backticked IDs and a leading `[P2]` prefix map to their ID; the QM prompt tells the QM to start each Findings and Out-of-range entry with the reviewer finding ID; an unrecognized entry still fails safe (carried over, human item); tested.
- [ ] #5 Capped-entry rewrites treat entry text literally (Claude L-2): an entry containing `$$`, `$&`, a backtick-dollar sequence or `$' is rewritten without duplication or expansion; tested.
- [ ] #6 D-019 deduplication is tested for real (Claude L-3, codex AC #4 OPEN): with an implementer model present and `diverseReviewerModel` unset, the not-configured item appears exactly once in the report and plan summary, and the test fails if the deduplication is removed.
- [ ] #7 Surviving mutations are killed (Claude L-4): tests fail when the reviewer-section `priority: P0` check is removed, when unmapped P0 detection is removed, when the unmapped check over Out-of-range observations is removed, and when other-lens `independentlySupported` closure is replaced with same-lens acceptance (the test supplies only other-lens evidence, or only same-lens evidence).
- [ ] #8 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
