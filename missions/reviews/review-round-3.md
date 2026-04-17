# Review Report

base: origin/main
range: 113862678449c43776477a3430a503df37d757a0..HEAD
overall: incorrect

## Overall Assessment

The new integration-verification flow is mostly wired through consistently, but the quality-manager prompt now has a control-flow gap that blocks successful completion when a plan exists and no integration report has been generated yet. That affects standard runs like `implement` and plan-backed `verify`, so the patch is not correct as written.

## Findings

- id: F-001
  priority: P1
  severity: high
  confidence: 0.96
  complexity: simple
  title: "[P1] Missing integration reports dead-end clean quality-manager runs"
  files: bundled/coding/coding/prompts/quality-manager.md
  lineRange: bundled/coding/coding/prompts/quality-manager.md:109-153
  summary: When `activePlanSlug` exists but `missions/plans/<slug>/integration-report.md` is absent, step 2.6 sets `latest_integration_overall = missing`, and step 5 then refuses to proceed unless that state is `correct` or `skipped`. The only instruction that creates an initial report for the `missing` case is in final validation at line 153, but that step is unreachable because line 109 already diverts the agent into remediation. In practice this breaks clean runs of workflows that do not pre-run `integration-verifier`, especially `implement` and plan-backed `verify`, because there may be no findings to remediate and no path left to generate the first report.
  suggestedFix: Allow `missing` to trigger an immediate `integration-verifier` run before remediation/final-validation gating, or treat `missing` as eligible to enter final validation where line 153 can resolve it.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. Quality-manager can complete successfully on a plan-backed run where checks pass, reviewer finds nothing, and the integration report does not exist yet.
      2. The prompt has a single reachable path that generates the initial integration report before merge-readiness is decided.

### Quality Contract

- none
