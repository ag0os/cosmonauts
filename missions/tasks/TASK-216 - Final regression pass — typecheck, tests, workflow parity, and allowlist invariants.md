---
id: TASK-216
title: >-
  Final regression pass — typecheck, tests, workflow parity, and allowlist
  invariants
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:tdd-orchestration-hardening'
dependencies:
  - TASK-215
createdAt: '2026-04-28T14:30:46.534Z'
updatedAt: '2026-04-28T15:17:22.366Z'
---

## Description

Run the full quality gate suite to confirm all prior changes integrate cleanly. Verify workflow parity between `workflows.ts` and `defaults.ts`, plan frontmatter round-trip, prompt invariants, and subagent allowlist coverage all pass together. This is the integration verification step from Implementation Order step 7.

**Commands to run:**
- `bun run typecheck` — must exit 0
- `bun run lint` — must exit 0
- `bun run test` — must exit 0

**Specific test suites that must pass:**
- `tests/orchestration/workflows-parity.test.ts`
- `tests/plans/plan-manager.test.ts`
- `tests/extensions/plans.test.ts`
- `tests/prompts/task-manager.test.ts`
- `tests/prompts/tdd-coordinator.test.ts`
- `tests/prompts/verifier.test.ts`
- `tests/prompts/quality-manager.test.ts`
- `tests/domains/coding-agents.test.ts`
- `tests/domains/coding-workflows.test.ts`
- `tests/orchestration/chain-runner.test.ts`

**Scope:** No new implementation in this task. If any gate fails, findings are raised as blockers against the specific prior task responsible. Do not commit; quality-manager handles final state.

<!-- AC:BEGIN -->
- [x] #1 bun run typecheck exits 0 with all plan-type changes, new behavior-reviewer agent definition, and updated subagent allowlists in place
- [x] #2 bun run lint exits 0 with no new lint errors
- [x] #3 bun run test exits 0 across the full suite including all ten named test files
- [x] #4 tests/domains/coding-agents.test.ts confirms both tdd-coordinator → verifier and quality-manager → tdd-coordinator allowlist entries
- [x] #5 No existing passing tests regress from the changes in TASK-210 through TASK-215
<!-- AC:END -->

## Implementation Notes

Quality gates passed without code changes. Verified `bun run typecheck`, `bun run lint`, and `bun run test` all exited 0. Full suite passed (89 files / 1575 tests), including the required workflow parity, plan frontmatter, prompt-contract, allowlist, and chain-runner regression suites. `tests/domains/coding-agents.test.ts` confirmed both `quality-manager -> tdd-coordinator` and `tdd-coordinator -> verifier` allowlist invariants.
