---
id: TASK-743
title: >-
  Stage 6 remediation M - round-7 closure items (prep failure, setup settle,
  D-028 disclosure)
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-742
createdAt: '2026-09-24T14:33:24.873Z'
updatedAt: '2026-09-24T14:42:13.495Z'
---

## Description

Remediate the verified round-7 findings in `missions/plans/qm-chain-safety/mid-review-7-codex.md` (MEDIUM, LOW) and `mid-review-7-claude.md` (MEDIUM-1..3, LOW-1). All are accidental-failure or ratified-disclosure items under the D-027 threat model.

This work is governed by D-025, D-026, D-027 and D-028. Keep the branch's changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression. Binding ratified ground is INV-001..INV-005, D-018..D-023 and D-027..D-030.

Every test must fail on the current code.

`bun run lint` has one known error, in the gitignored `.shepherd/backups/`. Do not touch it; lint on tracked paths must pass. Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.

<!-- AC:BEGIN -->
- [x] #1 An `analysisPrepare` failure degrades instead of aborting (Claude MEDIUM-2): the assessment still runs with the analysis gate recorded as failed-to-run/unbound (a human item), gate-owned items are still computed, and the verdict is `not-ready`, mirroring a `prepare` failure; tested with a frozen-lockfile mismatch.
- [x] #2 Analysis preparation is always recorded (codex MEDIUM, D-026): successful and failed `analysisPrepare` steps, including earlier successes before a later failure, appear in `checks.md` and the final report on every exit, including an assessment failure; tested with a session failure after a successful prepare.
- [x] #3 Base-runtime setup settles before the retain decision (Claude MEDIUM-1): after cancellation or deadline during export or runtime creation, the host waits the settle grace; a setup that settles is not reported as live work and its workspace is removed; tested with an abort and a short deadline asserting disposition `removed` and no false "Live work" line.
- [x] #4 Every QM report states the D-028 disclosure (Claude MEDIUM-3): a host-written line in the report (Reviewed or Checks section) and the plan summary says that host-run prepare and checks execute the reviewed change's own code with the operator's authority, unsandboxed (spec INV-001 interpretation, D-028); tested on ready, not-ready, failed and refused exits.
- [x] #5 The QM runtime's exclusion of user packages and domains is pinned (Claude LOW-1): a test through `launchQualityReview` with a user package overriding `coding/quality-manager` asserts the base definition is used.
- [x] #6 The sealing regression test can fail (codex LOW): it supplies reviewer evidence and asserts reviewer bytes and post-check materials are unchanged after a check that rewrites them before sealing would matter, and it fails if `sealReviewerEvidence` is skipped.
- [x] #7 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
