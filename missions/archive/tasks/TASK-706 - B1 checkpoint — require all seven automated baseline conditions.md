---
id: TASK-706
title: B1 checkpoint — require all seven automated baseline conditions
status: Cancelled
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
  - superseded
dependencies:
  - TASK-705
createdAt: '2026-09-16T18:37:59.779Z'
updatedAt: '2026-09-23T14:08:08.808Z'
---

## Description

Stage 10 gate **B1**. Owned behaviors: **none**; TASK-705 is the sole B-011 owner.

B1 is the automation boundary. It may certify only eligibility for human ratification, never establishment, and it is reached with no human input at any earlier stage. Every failed row returns to its owning stage; unresolved confirmed weaknesses have no accepted-uncertainty bypass.



### 2026-09-19 — B1 fails on three conditions, all of them owner questions

Candidate `epoch-20260919-82f69ac-c1` at `82f69ac`; `validate` exits 0 and the
canonical digest is `b1fc6461e5b8f760449f43ccf75041d2cb79b969e3521f359401d1acb1ebe8d5`.

AC #1 is not satisfiable by any further agent work. Conditions 1, 2, 5 and 7 are
`met`. Conditions 3, 4 and 6 are `not-met`, and each is blocked on a question the
ratification packet already carries:

- **Condition 3** — six counted guardrails. One is `tests/agents/skills.test.ts:329`,
  which asserts hand-declared literals against themselves (Q-005: repairing it
  means either coupling a framework test to a bundled domain or dropping the only
  site carrying `plan:artifact-format-redesign#B-013`). Five are in
  `tests/agent-packages/claude-binary-runner.test.ts`, where a ratified spec
  requirement and a later deliberate human commit disagree (Q-004).
- **Condition 4** — no critical portfolio reaches `protected`, because the method
  promotes an entry only at zero gaps and zero uncertainty (Q-002).
- **Condition 6** — fourteen of fifteen required probes have no definition,
  because no ratified step authors one (Q-001).

"Returns to its owning stage" is therefore the wrong reading here: stage 8 has
processed every weakness to a definite outcome, and what remains is the owner's
five answers. B1 stays blocked until those are given, at which point the
affected stages rerun against the answers rather than against agent judgment.

<!-- AC:BEGIN -->
- [ ] #1 Baseline conditions 1–7 are each `met` against the committed, current candidate epoch; any `not-met` or `blocked` row returns to its owning stage rather than being waived.
- [ ] #2 Every confirmed weakness is fixed against a cited ratified authority, replaced, removed, excluded, or carried as a packet question in `baseline.md`, and every critical portfolio is `protected` with required probe evidence counted correctly.
- [ ] #3 Remaining uncertainty is demonstrably noncritical, bounded, documented, and listed for owner review; it does not include an unresolved confirmed weakness.
- [ ] #4 The candidate revision and canonical digest recompute exactly, and full-spine artifact-conformance for B-001…B-011 passes (including B-011 correctness) while generic mutation remains unbound.
- [ ] #5 B1 emits `eligible-for-ratification` and still records `not established`; no automation-created owner block, accepted-uncertainty decision, score, or overall-health verdict exists.
<!-- AC:END -->

## Implementation Notes

SUPERSEDED 2026-09-20 by plan framework-health (D-002, D-010c; human-decided). The audit method this task belongs to was discarded: its fault-sensitivity axis had no discriminating power (3,134 of 3,166 'reasoned', 1 probe-confirmed). Not completed and will not be. Left Blocked, not Done, so the record does not claim work that did not happen; archives with the test-health-audit plan when Stage 2 re-specifies it.
