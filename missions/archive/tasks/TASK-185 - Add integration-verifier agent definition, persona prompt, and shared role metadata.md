---
id: TASK-185
title: >-
  Add integration-verifier agent definition, persona prompt, and shared role
  metadata
status: Done
priority: high
assignee: worker
labels:
  - backend
  - frontend
  - 'plan:integration-verifier'
dependencies: []
createdAt: '2026-04-14T19:28:28.281Z'
updatedAt: '2026-04-14T19:36:26.447Z'
---

## Description

Create the `integration-verifier` agent as a registrable, configurable coding-domain stage. This covers all shared infrastructure needed before workflow wiring or quality-manager integration can begin.

**Files to create/modify:**
- `bundled/coding/coding/agents/integration-verifier.ts` — new agent definition: coding-domain capabilities, `coding` tools, `coding-readonly` discipline, no subagents.
- `bundled/coding/coding/prompts/integration-verifier.md` — new persona prompt: plan-label discovery procedure, contract-reading workflow, exact `integration-report.md` markdown wire format (see plan Key Contracts), `I-###` finding namespace, no-findings form (`overall: correct`, `## Findings\n- none`), skipped form (`overall: skipped`, rationale in Overall Assessment), strict rule forbidding repository edits outside `missions/plans/<slug>/integration-report.md`.
- `lib/orchestration/types.ts` — add `"integration-verifier"` to `AgentRole`, add `integrationVerifier?` to `ModelConfig` and `ThinkingConfig`.
- `lib/agents/qualified-role.ts` — add `case "integration-verifier": return "integrationVerifier"` to `roleToConfigKey`.
- `lib/orchestration/chain-runner.ts` — add `"integration-verifier"` entry to `DEFAULT_STAGE_PROMPTS` (e.g. `"Read the active plan, verify implementation against declared contracts, and write missions/plans/<slug>/integration-report.md."`).

**Tests to update:**
- `tests/domains/coding-agents.test.ts` — import the new definition, include it in `ALL_DEFINITIONS`, assert quality-manager's subagents do not yet need updating (that is Task 2), but the new agent passes all existing structural invariant checks.
- `tests/agents/qualified-role.test.ts` — add `["integration-verifier", "integrationVerifier"]` to the `roleToConfigKey` parameterized test; assert qualified form `"coding/integration-verifier"` also maps correctly.
- `tests/orchestration/agent-spawner.test.ts` — add model/thinking override coverage asserting `getModelForRole` and `getThinkingForRole` resolve for the `integrationVerifier` config key.
- `tests/orchestration/chain-runner.test.ts` — assert `getDefaultStagePrompt("integration-verifier")` returns a non-generic string (not `"Execute your assigned role."`).

**Wire format reference (from plan Key Contracts):**
```
# Integration Report

plan: <slug>
overall: <correct|incorrect|skipped>

<!-- AC:BEGIN -->
- [x] #1 bundled/coding/coding/agents/integration-verifier.ts exists with a valid AgentDefinition (tools: "coding", session: "ephemeral", no subagents, at least one coding capability)
- [x] #2 bundled/coding/coding/prompts/integration-verifier.md exists and contains the full integration-report.md wire format envelope, I-### finding namespace, no-findings form, skipped form with rationale requirement, and an explicit rule forbidding edits outside missions/plans/<slug>/integration-report.md
- [x] #3 lib/orchestration/types.ts includes "integration-verifier" in AgentRole and integrationVerifier? in both ModelConfig and ThinkingConfig
- [x] #4 lib/agents/qualified-role.ts roleToConfigKey maps both "integration-verifier" and "coding/integration-verifier" to "integrationVerifier"
- [x] #5 lib/orchestration/chain-runner.ts DEFAULT_STAGE_PROMPTS includes an integration-verifier entry with a non-generic prompt string
- [x] #6 tests/agents/qualified-role.test.ts covers the integrationVerifier config-key mapping
- [x] #7 tests/orchestration/chain-runner.test.ts asserts getDefaultStagePrompt("integration-verifier") returns a role-specific (non-fallback) string
- [x] #8 tests/domains/coding-agents.test.ts includes integration-verifier in ALL_DEFINITIONS and it passes all structural invariant checks
<!-- AC:END -->

## Implementation Notes

Verified the existing TASK-185 implementation on HEAD (commit 0d3f618). Confirmed the integration-verifier agent definition, persona prompt, shared role metadata, qualified-role mapping, default stage prompt, and test coverage are present. Validation passed with `bun run test -- tests/agents/qualified-role.test.ts tests/orchestration/agent-spawner.test.ts tests/orchestration/chain-runner.test.ts tests/domains/coding-agents.test.ts tests/prompts/loader.test.ts`, `bun run lint`, and `bun run typecheck`. No additional code changes were required in this session.

## Overall Assessment

<summary>

## Findings

- id: I-001
  priority: <P0|P1|P2|P3>
  severity: <high|medium|low>
  confidence: <0.0-1.0>
  complexity: <simple|complex>
  contract: <identifier>
  files: <comma-separated paths>
  lineRange: <file:startLine-endLine>
  summary: <explanation>
  suggestedFix: <fix direction>
  task:
    title: <title or "-">
    labels: <labels or "-">
    acceptanceCriteria:
      1. <outcome>
```
