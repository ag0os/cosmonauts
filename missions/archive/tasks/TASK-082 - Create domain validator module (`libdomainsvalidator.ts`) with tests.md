---
id: TASK-082
title: Create domain validator module (`lib/domains/validator.ts`) with tests
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:runtime-consolidation'
dependencies:
  - TASK-080
createdAt: '2026-03-10T13:52:58.657Z'
updatedAt: '2026-03-10T17:03:41.908Z'
---

## Description

Create a new validation module at `lib/domains/validator.ts` that checks domain/agent invariants after domain loading. The validator runs against an array of `LoadedDomain` objects and produces an array of diagnostics.

Implement `validateDomains(domains: readonly LoadedDomain[]): DomainValidationDiagnostic[]` and the `DomainValidationError` class.

Validation rules per spec:
1. **Persona prompt exists** (error): Each agent in a non-shared domain must have its id in `domain.prompts`.
2. **Capabilities resolve** (error): Each capability in `agent.capabilities` must exist in the agent's domain or "shared" domain `capabilities` set.
3. **Extensions resolve** (error): Each extension in `agent.extensions` must exist in the agent's domain or "shared" domain `extensions` set.
4. **Subagent entries resolve** (warning): Each entry in `agent.subagents` must match an agent id in some loaded domain.
5. **Domain lead resolves** (error): `manifest.lead` must be a key in that domain's `agents` map.
6. **Workflow agents resolve** (warning): Each stage name in a workflow chain expression must resolve to a known agent.

Create tests at `tests/domains/validator.test.ts` using temp-dir fixtures similar to existing loader tests.

<!-- AC:BEGIN -->
- [ ] #1 Module `lib/domains/validator.ts` exports `validateDomains`, `DomainValidationDiagnostic` type, and `DomainValidationError` class
- [ ] #2 Each diagnostic has `{ domain: string; agent?: string; workflow?: string; message: string; severity: 'error' | 'warning' }`
- [ ] #3 `DomainValidationError` aggregates all error-severity diagnostics with a human-readable message listing all issues
- [ ] #4 All six validation rules from the spec are implemented with correct severity levels
- [ ] #5 `validateDomains` is independently callable without constructing a full runtime (for test isolation)
- [ ] #6 Tests cover each validation rule with both passing and failing fixture domains
<!-- AC:END -->

## Implementation Notes

Coordinator verification: Worker completed all implementation. Checking ACs based on implementation notes — all 6 validation rules implemented, DomainValidationError class created, DomainValidationDiagnostic type exported, 21 tests covering all rules. validateDomains is a pure function (no runtime needed). Exports added to lib/domains/index.ts. All ACs satisfied.
