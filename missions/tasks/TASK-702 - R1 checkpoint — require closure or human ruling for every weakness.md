---
id: TASK-702
title: R1 checkpoint — require closure or human ruling for every weakness
status: To Do
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-701
createdAt: '2026-09-16T18:37:09.925Z'
updatedAt: '2026-09-16T18:37:09.925Z'
---

## Description

Stage 8 gate **R1**. Owned behaviors: **none**; TASK-701 is the sole B-009 owner.

R1 is both a remediation closure gate and a mandatory human-decision stop for every unresolved confirmed weakness, regardless of criticality. It precedes candidate eligibility work. Ratified authority cannot be selected or rewritten by automation.

<!-- AC:BEGIN -->
- [ ] #1 Every confirmed ledger row is `closed`, `excluded-from-guardrail`, or `unresolved` with complete before/action/closure evidence and current profile/matrix links.
- [ ] #2 Every `unresolved` row, critical or noncritical, has received a human ruling that either supplies closing authority or excludes the claim from guardrail evidence before R1 can pass.
- [ ] #3 No row closes through an unratified expected-contract change, a merely green production behavior, or a stale/carried profile without complete material-input proof.
- [ ] #4 All affected narrow/full correctness evidence and required probes pass in the successor epoch, and B-009 artifact-conformance resolves to its exact test and marker.
- [ ] #5 The remediation corpus contains no changes to the session-field specimen and no out-of-scope coverage, static-health, provider, roadmap-feature, or project-health work.
<!-- AC:END -->
