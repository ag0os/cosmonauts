---
id: TASK-316
title: >-
  Update reviewer, verifier, and integration-verifier artifact-consumption
  prompts
status: To Do
priority: medium
labels:
  - testing
  - backend
  - 'plan:artifact-format-redesign'
dependencies:
  - TASK-305
  - TASK-306
createdAt: '2026-05-21T21:31:44.271Z'
updatedAt: '2026-05-21T21:31:44.271Z'
---

## Description

Update consumer prompts that review or verify completed work so they consume artifact-conformance claims only when those claims are in scope.

<!-- AC:BEGIN -->
- [ ] #1 B-017, B-018, and B-019 are covered by `tests/prompts/reviewer.test.ts`, `tests/prompts/verifier.test.ts`, and `tests/prompts/integration-verifier.test.ts`, with matching `@cosmo-behavior plan:artifact-format-redesign#B-###` markers near executable tests.
- [ ] #2 `bundled/coding/coding/prompts/reviewer.md` loads `work-artifacts` for behavior marker, architecture context, and gate-ladder claims only when artifact conformance or plan context is in scope.
- [ ] #3 `bundled/coding/coding/prompts/verifier.md` validates explicit artifact-conformance claims with evidence, reports binary pass/fail, and does not expand beyond provided claims.
- [ ] #4 `bundled/coding/coding/prompts/integration-verifier.md` treats declared `Architecture Context`, linked architecture records, `Boundary Model`, behavior seams, and abstract Quality Contract rows as auditable contracts.
- [ ] #5 The prompts do not invent unstated architecture or gate rules for ordinary code review or verification scopes.
- [ ] #6 No runtime marker scanner, gate runner, or artifact-conformance CLI is introduced.
<!-- AC:END -->
