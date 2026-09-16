---
id: TASK-701
title: Close confirmed weaknesses through authorized remediation epochs
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-700
createdAt: '2026-09-16T18:36:58.150Z'
updatedAt: '2026-09-16T18:36:58.150Z'
---

## Description

Stage 8 — Remediation epochs.

Owned behavior: **B-009** (sole owner).

Process evidence-selected weaknesses in bounded remediation waves: authority/deviation classification first, then test-first repair/replacement/removal or guardrail exclusion, probe/correctness reruns, and one successor epoch per wave. AC-012, INV-005, D-013/D-020/D-021, and the user’s authority constraints are settled stop-and-escalate ground: an expectation is corrected only against a cited ratified authority (D-028), conflicting or absent authority stays `unresolved` with a drafted packet question, and the run continues rather than halting — unresolved rows batch into the single ratification packet (D-021, D-029). `tests/domains/coding-agents.test.ts` and `AgentDefinition.session` remain unmodified and excluded under `observational-memory-adoption`. Out-of-scope static health, provider, roadmap-feature, coverage, and project-health work must not be pulled in.

<!-- AC:BEGIN -->
- [ ] #1 B-009 is proved at current-epoch `remediation-ledger.md` by `tests/scripts/test-health-audit/artifacts.test.ts` > `requires authorized closure or guardrail exclusion and blocks unratified contract changes`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-009` near the executable test.
- [ ] #2 Quality Contract assertion 7 is enforced: every confirmed weakness records affected claims, scope, before/action/closure evidence, profile/matrix updates, and exactly `closed`, `excluded-from-guardrail`, or `unresolved`; no open or silently waived row passes.
- [ ] #3 Each remediation wave starts from cited governing authority and deviation classification, uses failing proof then minimal correction/refactor where repair is authorized, reruns affected correctness/probes, and opens one successor epoch for the wave rather than mutating an immutable manifest.
- [ ] #4 No test expectation or product behavior changes merely to match current production or on agent judgment alone; a correction cites the ratified authority it was checked against in its ledger row, and absent or self-contradicting authority remains `unresolved` with a drafted packet question and no code/expectation change.
- [ ] #5 Every `unresolved` confirmed weakness, critical or noncritical, is appended to the `## Ratification packet` section of `baseline.md` with its drafted options and the agent's recommendation, and the remediation wave proceeds; no unresolved row stops the run or waits for input.
- [ ] #6 Successor-epoch carry-forward rehashes every material input and re-assesses the union of invalidated profiles; omitted or changed test/SUT/contract/inventory/method/runner/config/setup inputs cannot be carried.
- [ ] #7 Evidence-selected source/test changes stay within the ledger-authorized seam; the session-field specimen is not remediated, and no deintroverter port, indiscriminate mutation, coverage campaign, whole-project static health, new provider, roadmap-feature implementation, or `project-health-audit` work is introduced.
<!-- AC:END -->
