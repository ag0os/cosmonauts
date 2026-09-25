---
id: TASK-759
title: Stage 8 remediation A - stale QM caller prose and named-chain entry-point test
status: Done
priority: high
labels:
  - backend
  - testing
  - docs
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-727
createdAt: '2026-09-24T20:54:16.272Z'
updatedAt: '2026-09-24T21:01:08.321Z'
---

## Description

Close `missions/plans/qm-chain-safety/stage8-review-1-claude.md` (MEDIUM-1, MEDIUM/LOW-2, LOW-3, LOW-4) and `stage8-review-1-codex.md` (MEDIUM). This owns the remaining part of B-012.

The QM is review-only (D-001, D-025). It ends at a durable findings report. Callers route remediation through tasks, Drive and independent review. Nothing claims that the QM fixes code, completes plans or leaves a clean tree. Keep D-014/D-015: behavior is tested at the observer, entry-point and outcome level, not by matching sentences.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.

<!-- AC:BEGIN -->
- [x] #1 `domains/shared/capabilities/spawning.md` describes the review-only QM: merge-readiness comes from the QM findings report verdict, remediation routes through tasks, Drive and independent review (not a `fixer` stage after the QM), and nothing tells a lead to inspect what the QM changed; it agrees with `/skill:spawning`.
- [x] #2 `docs/fallow-workflow-integration.md` (including the sections around lines 235 and 299-311) describes the review-only QM: host-run checks and gate resolution feed the findings report, remediation is caller-owned through tasks, Drive and re-review, and there is no QM-run fixer, re-verify loop or `qm.md` output.
- [x] #3 `external-commands/implement-plan.md` states the review base accurately (the host resolves it from a fixed list of local candidates, `main`, then `master`, then `origin/main`, as in `findReviewBase`), and tells the caller to check that the reviewed range matches the intended base; `ROADMAP.md` no longer describes shared `review-round-N.md` overwriting as current behavior.
- [x] #4 An end-to-end test drives at least one QM-ending named chain, and `verify`, through the shipped named-chain entry point (named-chain resolution and the `run` start path the CLI uses, including the durable route for `verify`), with a stubbed QM review execution, and asserts that the run stops at the QM stage with a durable findings report and no later stage; the test fails if the chain gains a stage after the QM or if the durable route stops delivering the report.
- [x] #5 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
