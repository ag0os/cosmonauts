---
id: COSMO-045
title: Add tests for thinkingLevel on definitions and getThinkingForRole resolution
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:agent-thinking-levels'
dependencies:
  - COSMO-040
  - COSMO-041
createdAt: '2026-03-05T16:03:09.792Z'
updatedAt: '2026-03-05T16:11:55.708Z'
---

## Description

Add test coverage for the new thinkingLevel field on agent definitions and the `getThinkingForRole()` resolution logic.

**Files to change:**
- `tests/agents/definitions.test.ts`:
  - Add test that validates thinkingLevel on all built-in definitions is either a valid ThinkingLevel string or undefined
  - Add test that PLANNER_DEFINITION and TASK_MANAGER_DEFINITION have thinkingLevel "high"
  - Add test that other definitions have thinkingLevel undefined

- `tests/orchestration/agent-spawner.test.ts`:
  - Add test fixtures with thinkingLevel set on some definitions
  - Add tests for getThinkingForRole() covering all 4 resolution tiers:
    - Tier 1: Explicit ThinkingConfig role override takes precedence
    - Tier 2: Definition thinkingLevel used when no override
    - Tier 3: ThinkingConfig.default used for unknown/unset roles
    - Tier 4: Returns undefined when nothing is configured
  - Add tests for precedence (tier 1 > tier 2 > tier 3 > tier 4)

<!-- AC:BEGIN -->
- [ ] #1 definitions.test.ts validates that thinkingLevel on all built-in definitions is either a valid ThinkingLevel or undefined
- [ ] #2 definitions.test.ts verifies planner and task-manager have thinkingLevel "high"
- [ ] #3 agent-spawner.test.ts covers all 4 resolution tiers of getThinkingForRole()
- [ ] #4 agent-spawner.test.ts verifies correct precedence ordering between tiers
- [ ] #5 All new tests pass
<!-- AC:END -->

## Implementation Notes

Added 12 new tests across two files:\n\n**definitions.test.ts** (3 tests):\n- Validates all built-in definitions have thinkingLevel as valid ThinkingLevel or undefined\n- Verifies planner and task-manager have thinkingLevel \"high\"\n- Verifies all other definitions have thinkingLevel undefined\n\n**agent-spawner.test.ts** (9 tests):\n- Tier 2: definition thinkingLevel for known role\n- Tier 4: undefined for role with no thinkingLevel, undefined when nothing configured\n- Tier 1 > Tier 2: explicit override beats definition\n- Tier 3: thinking.default for unknown/unset roles\n- Tier 2 > Tier 3: definition beats default\n- Tier 1 > Tier 3: explicit override beats default\n- Tier 3 > Tier 4: default beats undefined\n- Tier 1 > Tier 2 > Tier 3: full precedence chain\n\nAlso added thinkingLevel: \"high\" to the FIXTURE_PLANNER definition to support tier 2 tests.\n\nNote: Pre-existing test failure in definitions.test.ts (model regex doesn't match openai-codex/gpt-5.3-codex with dots) is unrelated."
