---
id: TASK-211
title: '`verifier` named-test RED-verification claim contract'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:tdd-orchestration-hardening'
dependencies: []
createdAt: '2026-04-28T14:29:25.945Z'
updatedAt: '2026-04-28T14:36:49.400Z'
---

## Description

Extend `bundled/coding/coding/prompts/verifier.md` to support named-test RED-verification claims for `phase:red-verify` tasks. Add claim fields, observed-outcome classification, per-claim result fields, and the rule that only `assertion-failure` passes. The agent definition file (`verifier.ts`) is unchanged.

**Files to change:**
- `bundled/coding/coding/prompts/verifier.md` — extend claim examples, RED-verification validation rule, and per-claim result schema
- `tests/prompts/verifier.test.ts` — create if absent; add coverage for named-test claim pattern, outcome classification, and pass/fail rule

**Key contracts (from plan):**
```yaml
# Claim shape for phase:red-verify tasks
- test_file: tests/path/to/file.test.ts
  test_name: "descriptive test name"
  expected: fails-on-assertion
  command: bun run test -- tests/path/to/file.test.ts
```
Observed outcome classes: `assertion-failure | test-error | not-collected | compile/startup-error | passed`
- Claim passes ONLY when `observed_outcome === "assertion-failure"`
- All other outcomes explicitly fail the claim
- Per-claim results extend existing verifier schema with `test_file`, `test_name`, `observed_outcome`, `failure_reason` alongside existing `id`, `claim`, `result`, `evidence`, `notes`

<!-- AC:BEGIN -->
- [x] #1 verifier.md defines a named-test claim format with fields test_file, test_name, expected: fails-on-assertion, and command
- [x] #2 verifier.md defines exactly five observed_outcome classes: assertion-failure, test-error, not-collected, compile/startup-error, passed
- [x] #3 verifier.md states a claim passes only when observed_outcome === assertion-failure; all other outcomes explicitly fail the claim
- [x] #4 Per-claim result fields for named-test claims include test_file, test_name, observed_outcome, and failure_reason alongside the existing id, claim, result, evidence, notes fields
- [x] #5 bundled/coding/coding/agents/verifier.ts is not modified
- [x] #6 tests/prompts/verifier.test.ts covers the named-test claim pattern, each of the five outcome classifications, and the assertion-failure-only pass rule
<!-- AC:END -->

## Implementation Notes

Updated bundled/coding/coding/prompts/verifier.md for phase:red-verify named-test claims, observed_outcome classification, assertion-failure-only pass criteria, and extended per-claim result fields. Added tests/prompts/verifier.test.ts covering claim shape, all five outcome classes, pass/fail rule, and result fields. verifier.ts was not modified. Verification: bun run test passed; bun run typecheck passed; bun x biome check bundled/coding/coding/prompts/verifier.md tests/prompts/verifier.test.ts passed. bun run lint still reports unrelated pre-existing formatting issues in domains/shared/extensions/plans/index.ts and missions/tasks/config.json.
