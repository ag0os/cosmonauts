---
id: TASK-407
title: >-
  Add a blast-radius review lens for new shared primitives
  (verifier/reviewer/QM)
status: Done
priority: high
labels:
  - verification
  - prompts
  - 'plan:orchestration-hardening'
dependencies: []
createdAt: '2026-06-24T17:30:31.323Z'
updatedAt: '2026-06-24T17:56:25.128Z'
---

## Description

PROBLEM (observed): two real regressions shipped through the cosmonauts
quality-manager and integration-verifier and were only caught by an external
review: (a) a validator that previously emitted a WARNING for an unresolved
qualified reference began THROWING and aborted runtime creation; (b)
`--list-agents` ignored a newly added domain-binding. Both are the new
primitive (a binding resolver) changing the semantics of PRE-EXISTING call
sites — which behavior-scoped verification (checking only the plan's enumerated
behaviors) cannot see.

WHERE (persona files — additive edits):
- `bundled/coding/prompts/integration-verifier.md`
- `bundled/coding/prompts/reviewer.md`
- `bundled/coding/prompts/quality-manager.md`

WHAT TO DO:
Add a first-class "blast-radius" review dimension: whenever a change introduces
or modifies a shared primitive/utility (resolver, validator, error path, common
helper), the agent must enumerate the PRE-EXISTING call sites that now invoke it
and verify the change did not alter their throw / return / empty / warning
semantics — and require a regression test at each affected call site. Make it an
explicit, named lens, not buried prose.

CONSTRAINTS: edits are ADDITIVE — preserve existing content, including sibling-task
additions to the same files.

<!-- AC:BEGIN -->
- [x] #1 integration-verifier.md, reviewer.md, and quality-manager.md each gain an explicit named 'blast-radius' lens: identify call sites of new/changed shared primitives in existing code and verify their throw/return/empty/warning semantics did not regress.
- [x] #2 The guidance requires a regression test at each affected existing call site.
- [x] #3 All edits are additive and preserve existing persona content.
<!-- AC:END -->
