# Review Report

base: origin/main
range: 113862678449c43776477a3430a503df37d757a0..HEAD
overall: incorrect

## Overall Assessment

The new integration-verifier role is wired through the workflows and quality-manager flow, but two prompt-level regressions make common orchestration paths fail. In particular, quality-manager can no longer route complex fixes when no unique plan slug is available, and integration-verifier's skipped path has no valid output location.

## Findings

- id: F-001
  priority: P1
  severity: high
  confidence: 0.95
  complexity: simple
  title: "[P1] Complex remediation is blocked when quality-manager has no active plan slug"
  files: bundled/coding/coding/prompts/quality-manager.md, bundled/coding/coding/workflows.ts, lib/config/defaults.ts
  lineRange: bundled/coding/coding/prompts/quality-manager.md:47-47
  summary: `quality-manager` is now instructed to never create planless remediation tasks, but the default `verify` workflow (`bundled/coding/coding/workflows.ts:25-28`, `lib/config/defaults.ts:18-21`) runs `quality-manager` without guaranteeing any `plan:<slug>` task exists. In that scenario, any reviewer or integration finding marked `complex` has no allowed remediation path: the prompt still routes complex findings through `task_create`, while line 47 forbids creating those tasks when `activePlanSlug` is unavailable. That makes the documented review/remediation workflow stall instead of fixing complex issues.
  suggestedFix: Allow planless remediation tasks when `activePlanSlug` is unavailable, or define a fallback remediation path for complex findings in no-plan runs instead of forbidding `task_create` outright.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. -
      2. -

- id: F-002
  priority: P2
  severity: medium
  confidence: 0.86
  complexity: simple
  title: "[P2] Integration-verifier cannot write the required skipped report without a slug"
  files: bundled/coding/coding/prompts/integration-verifier.md
  lineRange: bundled/coding/coding/prompts/integration-verifier.md:3-15
  summary: The new prompt says to "write a skipped report" when there are zero or multiple `plan:<slug>` labels, but it also says the only allowed output is `missions/plans/<slug>/integration-report.md` and explicitly forbids inventing a slug (`bundled/coding/coding/prompts/integration-verifier.md:3-15`, `37-38`, `90-91`). If a plan workflow runs in a repo with leftover tasks from another plan, or with no active plan label at all, the agent is given contradictory instructions and has no valid path where it may write the required skipped report.
  suggestedFix: Define a concrete fallback report path for skipped runs without a unique slug, or change the workflow so `integration-verifier` is never spawned until a unique plan slug has already been resolved.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. -
      2. -

### Quality Contract

- none
