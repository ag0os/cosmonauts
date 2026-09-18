---
id: TASK-702
title: >-
  R1 checkpoint — require closure or a batched packet question for every
  weakness
status: Blocked
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-701
createdAt: '2026-09-16T18:37:09.925Z'
updatedAt: '2026-09-18T01:32:14.217Z'
---

## Description

Stage 8 gate **R1**. Owned behaviors: **none**; TASK-701 is the sole B-009 owner.

R1 is a remediation closure gate. It does not stop for human input: an unresolved confirmed weakness passes R1 as a recorded, batched packet question. It precedes candidate eligibility work. Ratified authority cannot be selected or rewritten by automation, and an agent may correct an expectation only against a cited authority (D-028).

<!-- AC:BEGIN -->
- [ ] #1 Every confirmed ledger row is `closed`, `excluded-from-guardrail`, or `unresolved` with complete before/action/closure evidence and current profile/matrix links.
- [ ] #2 Every `unresolved` row, critical or noncritical, appears as a line item in the `## Ratification packet` section of `baseline.md` with its drafted options and the agent's recommendation; a row missing from the packet fails R1, but a row present in it passes without any human input.
- [ ] #3 No row closes through an unratified expected-contract change, a merely green production behavior, or a stale/carried profile without complete material-input proof.
- [ ] #4 All affected narrow/full correctness evidence and required probes pass in the successor epoch, and B-009 artifact-conformance resolves to its exact test and marker.
- [ ] #5 The remediation corpus contains no changes to the session-field specimen and no out-of-scope coverage, static-health, provider, roadmap-feature, or project-health work.
<!-- AC:END -->

## Implementation Notes

spawn failed with exit code 143
