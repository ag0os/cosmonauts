---
id: TASK-081
title: >-
  Create qualified-role utility module (`lib/agents/qualified-role.ts`) with
  tests
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:runtime-consolidation'
dependencies:
  - TASK-080
createdAt: '2026-03-10T13:52:44.214Z'
updatedAt: '2026-03-10T17:06:19.106Z'
---

## Description

Extract scattered inline role string manipulation into a single shared utility module at `lib/agents/qualified-role.ts`. Implements four functions: `qualifyRole`, `unqualifyRole`, `splitRole`, and `roleToConfigKey`. These replace `baseRoleName` (duplicated in agent-spawner.ts and chain-runner.ts), `qualifyAgentId` (runtime-identity.ts), inline `indexOf("/")` splitting (resolver.ts, orchestration/index.ts), and `roleToConfigKey` (agent-spawner.ts).

Create tests at `tests/agents/qualified-role.test.ts`.

Source functions to extract from:
- `runtime-identity.ts:13` qualifyAgentId → qualifyRole
- `agent-spawner.ts:368` baseRoleName → unqualifyRole
- `chain-runner.ts:68` baseRoleName → unqualifyRole
- `resolver.ts:117-118` inline slash split → splitRole
- `orchestration/index.ts:41-42` inline split → unqualifyRole
- `agent-spawner.ts:348-366` roleToConfigKey → roleToConfigKey

API per spec:
```typescript
function qualifyRole(id: string, domain?: string): string;
function unqualifyRole(qualified: string): string;
function splitRole(qualified: string): { domain: string | undefined; id: string };
function roleToConfigKey(role: string): string | undefined;
```

<!-- AC:BEGIN -->
- [ ] #1 Module `lib/agents/qualified-role.ts` exports `qualifyRole`, `unqualifyRole`, `splitRole`, and `roleToConfigKey`
- [ ] #2 `qualifyRole('worker', 'coding')` returns `'coding/worker'`; `qualifyRole('worker')` returns `'worker'`
- [ ] #3 `unqualifyRole('coding/worker')` returns `'worker'`; `unqualifyRole('worker')` returns `'worker'`
- [ ] #4 `splitRole('coding/worker')` returns `{ domain: 'coding', id: 'worker' }`; `splitRole('worker')` returns `{ domain: undefined, id: 'worker' }`
- [ ] #5 `roleToConfigKey('coding/task-manager')` returns `'taskManager'`; unknown roles return `undefined`
- [ ] #6 Tests at `tests/agents/qualified-role.test.ts` cover all functions including edge cases (no domain, already qualified, unknown roles)
<!-- AC:END -->

## Implementation Notes

Module and tests were already implemented and committed (3fab085) by previous worker attempt but ACs weren't checked off. Verified: all 22 tests pass, lint clean, typecheck clean. Module exports qualifyRole, unqualifyRole, splitRole, and roleToConfigKey with correct behavior per spec. Tests cover all functions including edge cases (no domain, deeply nested paths, unknown roles, qualified roles).
