# UX Review: round 1

## Overall

incorrect

## Assessment

The new `cosmonauts export --help` surface exposes the intended flags and modes, and the authoring skill is clear. However, the documented export flow currently fails before producing success JSON, and the docs include copy-paste examples that do not have the required package files behind them.

## Findings

- id: U-001
  dimension: user-experience
  severity: high
  priority: P1
  confidence: 0.95
  complexity: simple
  file:lineRange: lib/agent-packages/export.ts:43-55
  summary: |
    The happy-path export flow never reaches the promised success JSON. Running either documented mode, for example `cosmonauts export coding/explorer --out /tmp/explorer` or `cosmonauts export --definition <valid-json> --out /tmp/agent`, fails during compilation with a raw Bun error: `Could not resolve: "file:///.../lib/agent-packages/claude-binary-runner.ts"`, including a code frame from the temporary entry file. From the user's seat, the command that should create the binary instead stops with an internal bundler diagnostic and no actionable Cosmonauts-level recovery guidance.
  suggestedFix: Render the temporary compile entry with an import form Bun can compile, and wrap compile failures with a concise export-specific error while preserving details only as needed.

- id: U-002
  dimension: user-experience
  severity: medium
  priority: P2
  confidence: 0.9
  complexity: simple
  file:lineRange: README.md:194-219, docs/orchestration.md:13-15, docs/orchestration.md:105-106
  summary: |
    The docs present explicit-definition export commands as runnable examples, but the referenced files are not present or prepared. `README.md` tells users to run `cosmonauts export --definition packages/cosmo-planner/package.json --out bin/cosmo-planner`, then shows a JSON definition whose `prompt.path` requires `planner-claude-system.md`; neither path exists in the repo. `docs/orchestration.md` also shows `--definition package.json`, which from the project root points at the npm manifest rather than an `AgentPackageDefinition`. Users copying the first export example hit file-not-found or invalid-definition errors before they learn the feature.
  suggestedFix: Either make the examples clearly placeholder-based, or include a minimal runnable definition/prompt setup before the export command.
