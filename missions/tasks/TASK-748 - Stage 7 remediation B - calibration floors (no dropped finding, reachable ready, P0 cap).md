---
id: TASK-748
title: >-
  Stage 7 remediation B - calibration floors (no dropped finding, reachable
  ready, P0 cap)
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-747
createdAt: '2026-09-24T16:29:08.319Z'
updatedAt: '2026-09-24T16:29:08.319Z'
---

## Description

Implement plan D-031, amend-on-record 2026-09-24, for the verified findings in `missions/plans/qm-chain-safety/stage7-review-2-codex.md` (1 and 4) and `stage7-review-2-claude.md` (both MEDIUMs and the LOWs listed below).

D-031 makes host B-010 calibration defense in depth, with two hard floors: never a false `ready`, and never a silently dropped reviewer finding. Measured-cost and closure-evidence text recognition stays heuristic, and its known misses are recorded limits. Do NOT keep tightening that text parsing.

Parse findings as entries: a bullet plus its continuation lines, identified by the entry's own leading ID. Do not match on any ID mentioned in the text.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression. Every test must fail on the current code. `bun run lint` has one known error, in the gitignored `.shepherd/backups/`; lint on tracked paths must pass. Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.


<!-- AC:BEGIN -->
- [ ] #1 Findings are parsed as entries (bullet plus continuation lines) keyed by the entry's leading ID: a multiline entry with `priority: P1` on a continuation line is calibrated (codex 1); a finding mentioned only inside another entry (`F-2 P2: similar to F-1`) is still carried over as open (codex 4); a leading non-finding token like `TASK-747 regression: F-001 [P1]` is not treated as a finding ID (Claude LOW); rewriting a capped entry preserves all its lines, including file:line and fix (Claude LOW).
- [ ] #2 Out-of-range observations are a valid home (Claude MEDIUM): a reviewer finding placed under `## Out-of-range observations` counts as reported and is not duplicated or turned into a human item; an evidenced dismissal is recognized in either section and does not by itself block `ready`; a report whose reviewer findings are all out-of-range or evidenced dismissals, with gates/checks/model clean, can be `ready`; the QM prompt's carry-every-ID instruction names both sections; tested end to end.
- [ ] #3 Unsupported performance priorities above P2 are capped (Claude MEDIUM): P0 as well as P1 without accepted measured cost is capped to P2 in the report text or raised as a human item; the performance-reviewer prompt states the rule for P0 and P1; tested.
- [ ] #4 The "unconfigured diversity appears once" test is rewritten so it fails when deduplication is removed (Claude LOW), or deleted if no reachable duplicate path exists, with the reason noted.
- [ ] #5 The changed-scope audit against `main` still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
