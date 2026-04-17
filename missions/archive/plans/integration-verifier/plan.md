---
title: Cross-Task Integration Verifier Agent
status: active
createdAt: '2026-04-14T15:07:04.184Z'
updatedAt: '2026-04-14T17:27:48.498Z'
---

## Summary

Add a plan-aware `integration-verifier` agent that runs after implementation and before merge-readiness review, so parallel worker output is checked against the plan’s declared contracts instead of only against `main`. The feature closes the current gap between plan-time architectural intent and post-task quality routing by producing a file-based integration report that `quality-manager` can consume, remediate, and re-run.

## Scope

**Included**
- New `integration-verifier` coding-domain agent and persona prompt.
- A persistent `missions/plans/<slug>/integration-report.md` artifact with an explicit markdown wire format aligned to the existing reviewer report contract.
- `quality-manager` updates so it reads the integration report, routes simple findings to `fixer`, complex findings to remediation tasks, preserves the originating `plan:<slug>` label on those tasks, and re-runs integration verification after any code-modifying remediation.
- Workflow insertion for the roadmap-listed chains: `plan-and-build`, `reviewed-plan-and-build`, `tdd`, `spec-and-build`, and `adapt`.
- Role metadata/default prompt updates so the new stage participates in model/thinking overrides and chain execution cleanly.
- Scaffold/docs/test updates needed so built-in defaults and user-facing examples do not bypass the new stage.

**Explicitly excluded**
- Changes to `implement`, `plan-and-tdd`, or `spec-and-tdd`; the roadmap item names a narrower workflow set and this plan keeps that boundary.
- A deterministic AST/static-analysis engine; the verifier remains an agent that reads plans/code with `read`/`grep` and writes a structured report.
- Retroactively rewriting old plans to a new schema; older plans remain supported through best-effort contract extraction from the existing Design/Key Contracts/Integration Seams/Files-to-Change sections.

**Assumptions**
- Quality runs operate on one active `plan:<slug>` label at a time. If no unique plan label is discoverable from the current task set, the verifier writes a `skipped` report rather than aborting the chain.
- Plans already contain enough explicit contract material in their Design section for an LLM verifier to reason about interfaces, module boundaries, data shapes, and file ownership without introducing a brand-new plan file format.

## Design

### Module structure

- `bundled/coding/coding/agents/integration-verifier.ts` — new agent definition. Single responsibility: run architectural verification against the active plan and write `integration-report.md`.
- `bundled/coding/coding/prompts/integration-verifier.md` — new persona prompt. Single responsibility: define plan-label discovery, contract-reading procedure, exact markdown report format, and “write report, do not edit code” rules.
- `bundled/coding/coding/agents/quality-manager.ts` — extend subagent allowlist so quality-manager can re-run `integration-verifier` after remediation, not just consume the first chain-stage report.
- `bundled/coding/coding/prompts/quality-manager.md` — extend the existing quality loop to read, route, and rerun the integration report; preserve plan identity when creating remediation tasks.
- `bundled/coding/coding/workflows.ts` — insert the new stage into the roadmap-listed built-in workflows.
- `lib/config/defaults.ts` — update scaffolded `plan-and-build` so freshly scaffolded projects do not override the domain workflow back to the old chain.
- `.cosmonauts/config.example.json` — update the documented example to match the scaffolded/default chain. This is docs/example parity, not a runtime seam.
- `lib/orchestration/types.ts`, `lib/agents/qualified-role.ts`, `lib/orchestration/chain-runner.ts` — extend shared role metadata only where the new role must participate: role union/config keys, config-key mapping, and default stage prompt text.
- Tests/docs — verify workflow placement, role metadata, prompt presence, scaffold defaults, and public examples.

### Dependency graph

- `bundled/coding/coding/workflows.ts` depends on the agent registry only by stage-name strings; it must reference the new role name but stays free of orchestration logic.
- `lib/orchestration/types.ts` defines the stable role/config surface.
- `lib/agents/qualified-role.ts` depends on role names from `types.ts` only for config-key mapping.
- `lib/orchestration/chain-runner.ts` depends on registry resolution plus default stage prompts; it must not learn integration-report semantics.
- `bundled/coding/coding/agents/integration-verifier.ts` depends on shared agent-definition contracts only.
- `bundled/coding/coding/prompts/integration-verifier.md` depends on the existing task/plan artifacts and coding tools; it owns report generation, not orchestration.
- `bundled/coding/coding/prompts/quality-manager.md` depends on the integration-report wire contract and existing remediation pathways (`fixer`, `task_create`, scoped `coordinator` runs).

Dependency direction stays inward: shared orchestration/types remain generic; domain prompts/definitions adapt those primitives to the coding domain.

### Key contracts

The stable coordination boundary is the on-disk markdown report format. Because `quality-manager` already consumes file-based reviewer output, the integration report must match that pattern explicitly rather than only describing a TypeScript shape.

#### Integration report wire format

`missions/plans/<slug>/integration-report.md` must use this exact envelope:

```markdown
# Integration Report

plan: <slug>
overall: <correct|incorrect|skipped>

## Overall Assessment

<1-3 sentence summary. For skipped runs, explain exactly why contract verification could not run.>

## Findings

- id: I-001
  priority: <P0|P1|P2|P3>
  severity: <high|medium|low>
  confidence: <0.0-1.0>
  complexity: <simple|complex>
  contract: <short contract identifier or section name>
  files: <comma-separated paths>
  lineRange: <file:startLine-endLine>
  summary: <one-paragraph explanation>
  suggestedFix: <clear fix direction>
  task:
    title: <task title for complex findings; "-" for simple>
    labels: <comma-separated labels; "-" if not needed>
    acceptanceCriteria:
      1. <outcome criterion>
      2. <outcome criterion>
```

If there are no findings, the report still writes the full document with:
- `overall: correct`
- `## Findings` followed by `- none`

If contract verification cannot run safely, the report still writes the full document with:
- `overall: skipped`
- `## Findings` followed by `- none`
- `## Overall Assessment` explaining whether the cause was no unique `plan:<slug>` label, multiple plan labels, or no auditable contracts declared in the plan.

#### Finding-shape compatibility

- Keep reviewer-compatible routing fields identical: `priority`, `severity`, `confidence`, `complexity`, and the nested `task` block are required for every finding.
- Keep the same priority range as reviewer reports: `P0|P1|P2|P3`. Do not narrow it.
- Use a distinct finding namespace `I-001`, `I-002`, ... so integration findings cannot be confused with reviewer `F-001` findings in the same quality round.
- The only intentional schema additions beyond reviewer are top-level `plan:` and per-finding `contract:`.

#### Operational contracts

```ts
// Plan selection for both integration-verifier and quality-manager
activePlanSlug := the only plan label found across current tasks
// If zero or multiple distinct plan labels exist, write overall: "skipped" with rationale.
```

```ts
// Quality-manager remediation loop
read integration-report.md
if code was modified by fixer, complex remediation tasks, failed verifier checks, or reviewer remediation:
  rerun integration-verifier
  reread integration-report.md
final success requires latest integration report to be `correct` or `skipped`
```

```ts
// Remediation task creation
// Preserve plan identity explicitly instead of relying on older tasks.
task_create({
  ...,
  labels: ["review-fix", "review-round:1", ...],
  plan: activePlanSlug,
})
```

### Integration seams

- Built-in coding workflows currently place `quality-manager` directly after implementation in the named chains at `bundled/coding/coding/workflows.ts:9`, `bundled/coding/coding/workflows.ts:16`, `bundled/coding/coding/workflows.ts:33`, `bundled/coding/coding/workflows.ts:47`, and `bundled/coding/coding/workflows.ts:61`. Those exact chain strings are the insertion points for the new stage.
- Fresh project configs override domain workflow names on collision (`lib/workflows/loader.ts:38-49`), and the scaffold path serializes `createDefaultProjectConfig()` directly (`lib/config/loader.ts:109-123`). The correctness seam is therefore `lib/config/defaults.ts`; `.cosmonauts/config.example.json` is example/documentation parity only.
- Chain execution already supports arbitrary one-shot stages; the only hard gate is role resolution in `runStage()` (`lib/orchestration/chain-runner.ts:511-512`). The new role therefore needs a real agent definition plus a role-specific default prompt entry in the existing prompt map (`lib/orchestration/chain-runner.ts:53-67`), not runner redesign.
- Model/thinking overrides and CLI/runtime config targeting are keyed through `AgentRole`/`ModelConfig`/`ThinkingConfig` (`lib/orchestration/types.ts:13`, `lib/orchestration/types.ts:70-72`, `lib/orchestration/types.ts:90-92`) plus `roleToConfigKey()` (`lib/agents/qualified-role.ts:68-73`). The new role must be threaded through both so per-role overrides remain coherent.
- Quality-manager can currently spawn only `reviewer`, `fixer`, `coordinator`, and `verifier` (`bundled/coding/coding/agents/quality-manager.ts:18`), while its prompt routes findings, creates remediation tasks, and reruns checks at `bundled/coding/coding/prompts/quality-manager.md:84-129`. Re-running integration verification after any code-modifying remediation therefore requires both allowlist and prompt updates.
- The task tool already exposes a `plan` parameter that auto-injects `plan:<slug>` (`domains/shared/extensions/tasks/index.ts:19-60`). The updated quality-manager flow must use that parameter whenever it creates remediation tasks so plan identity survives beyond the original implementation tasks.
- Reviewer reports are an exact markdown document with `# Review Report`, top-level `overall:`, `## Findings`, and a nested `task:` block for each finding (`bundled/coding/coding/prompts/reviewer.md:87-123`). The integration report must define its own equally explicit file-level contract so quality-manager is not forced to infer structure from prose.

### Seams for change

- The markdown report shape is the stable core. Future automation can parse `integration-report.md` without depending on the verifier’s internal reasoning.
- Contract extraction is the volatile edge. Keep it in the prompt/procedure layer so later work can tighten plan structure or add deterministic helpers without changing workflow placement or remediation routing.
- Workflow placement is stable for the named chains in scope, but rerun behavior belongs in quality-manager; that isolates future remediation-loop changes from chain topology.

## Approach

- Add `integration-verifier` as a normal one-shot coding-domain agent rather than adding special-case logic to the runner. The runner already executes arbitrary one-shot stages; the new behavior belongs in the domain layer.
- Give the agent `coding-readonly` discipline but `coding` tools. This is a deliberate exception: it must write exactly one artifact (`integration-report.md`) and should otherwise behave like a readonly reviewer. Avoid a new custom write-report tool unless the role later proves too permissive.
- Reuse reviewer routing semantics exactly, not approximately. The report format will stay file-based and reviewer-like so `quality-manager` can extend one remediation path instead of learning a second contract.
- Make quality-manager the owner of reruns. The chain stage provides the initial report after coordinator/tdd-coordinator, but any later code change inside the quality loop must invalidate the old integration report and trigger a rerun.
- Preserve plan identity explicitly on remediation tasks via the `task_create.plan` parameter. Do not rely on the original implementation tasks remaining sufficient to infer a unique active plan.
- Keep plan parsing heuristic and explicit: verify only contracts the plan actually states in Design/Key Contracts/Integration Seams/Files to Change. Do not invent missing contracts; surface `skipped` when the plan is underspecified or the current task set is multi-plan.
- Update only the workflows named in the roadmap. Avoid quietly broadening the rollout to `implement` or the TDD composite workflows.

## Files to Change

- `bundled/coding/coding/agents/integration-verifier.ts` — new agent definition with coding-domain capabilities, tasks/plans access, and no subagents.
- `bundled/coding/coding/prompts/integration-verifier.md` — new prompt defining plan-label discovery, contract verification procedure, exact `integration-report.md` markdown format, `I-###` finding IDs, skipped/no-findings rules, and strict “report only” write rules.
- `bundled/coding/coding/agents/quality-manager.ts` — add `integration-verifier` to the quality-manager subagent allowlist.
- `bundled/coding/coding/prompts/quality-manager.md` — load/read/rerun the integration report, route findings using the reviewer-compatible fields, preserve plan identity on remediation tasks via `task_create.plan`, and require final integration sign-off after any code-modifying remediation path.
- `bundled/coding/coding/workflows.ts` — insert `integration-verifier` before `quality-manager` in `plan-and-build`, `reviewed-plan-and-build`, `tdd`, `spec-and-build`, and `adapt`.
- `lib/config/defaults.ts` — update scaffolded `plan-and-build` to include `integration-verifier`.
- `.cosmonauts/config.example.json` — mirror the documented `plan-and-build` change.
- `lib/orchestration/types.ts` — add `integration-verifier` to role/config types and per-role model/thinking override maps.
- `lib/agents/qualified-role.ts` — map `integration-verifier` to `integrationVerifier` for config override resolution.
- `lib/orchestration/chain-runner.ts` — add the role-specific default stage prompt text.
- `README.md` — update the standard full-pipeline chain example so docs match the new stage order.
- `AGENTS.md` — update the workflow table/example for `plan-and-build`.
- `tests/domains/coding-agents.test.ts` — include the new agent definition and assert quality-manager can spawn it.
- `tests/agents/qualified-role.test.ts` — assert `integration-verifier` maps to `integrationVerifier`.
- `tests/orchestration/agent-spawner.test.ts` — add model/thinking override coverage for the new config key.
- `tests/orchestration/chain-runner.test.ts` — cover the new default stage prompt and registry fixture entry.
- `tests/config/scaffold.test.ts` — assert scaffolded `plan-and-build` includes `integration-verifier`.
- `tests/prompts/loader.test.ts` — ensure the new persona prompt loads.
- `tests/domains/coding-workflows.test.ts` — new test asserting the bundled coding workflows insert `integration-verifier` only in the roadmap-listed chains and at the correct position.

## Risks

- **Must fix** — If the integration report wire format is only described abstractly, workers can produce incompatible report/routing implementations. **Blast radius:** integration-verifier output, quality-manager parsing/routing, and any later automation reading `integration-report.md`. **Countermeasure:** define the exact markdown envelope, finding fields, no-findings form, skipped form, and `I-###` ID namespace in the plan and prompt.
- **Must fix** — If remediation tasks do not preserve the originating `plan:<slug>` label, plan identity becomes split between old implementation tasks and new review-fix tasks. **Blast radius:** active-plan detection, integration-report placement, plan completion checks, and archival completeness. **Countermeasure:** require `task_create.plan = activePlanSlug` on all quality-manager-created remediation tasks.
- **Must fix** — If quality-manager reruns integration verification only for integration-originated findings, ordinary reviewer/verifier remediation can still leave a stale integration report behind. **Blast radius:** final merge-readiness decisions after any code-modifying remediation path. **Countermeasure:** rerun integration-verifier after every code-modifying remediation path, regardless of which check produced the fix.
- **Must fix** — If scaffolded `plan-and-build` remains unchanged, new projects will override the updated domain workflow back to `coordinator -> quality-manager`. **Blast radius:** every freshly scaffolded project using default config; users think the feature exists but never execute it. **Countermeasure:** update `lib/config/defaults.ts`. Update `.cosmonauts/config.example.json` for docs parity only.
- **Mitigated** — The verifier uses `coding` tools so it can write `integration-report.md`, which creates risk of accidental source edits. **Blast radius:** any repository file if the role prompt is too permissive. **Countermeasure:** keep `coding-readonly` discipline, explicitly forbid edits outside the report path, and add review criteria for that constraint.
- **Mitigated** — A run may have no unique active `plan:<slug>` label or may surface multiple plan labels in the current task set. **Blast radius:** raw chain users and unusual remediation flows could otherwise see a hard failure before quality-manager starts. **Countermeasure:** require a `skipped` report with rationale instead of stage failure.
- **Accepted** — The verifier only enforces contracts the plan actually declares; implicit or omitted couplings can still escape to normal review. **Blast radius:** some architectural mismatches may still be found later by reviewer/humans, but no existing user-facing flow breaks because reviewer/quality-manager still run. **Rationale:** discovering undeclared contracts is a broader planning-quality problem and outside this roadmap item’s scope.

## Quality Contract

- id: QC-001
  category: architecture
  criterion: "`integration-report.md` uses an explicit markdown wire format with reviewer-compatible routing fields (`overall`, `priority`, `severity`, `confidence`, `complexity`, nested `task` block) and a distinct `I-###` finding namespace."
  verification: reviewer

- id: QC-002
  category: integration
  criterion: "The bundled coding workflows named in the roadmap insert `integration-verifier` immediately before `quality-manager`, and scaffolded `plan-and-build` defaults include the same stage."
  verification: verifier
  command: "bun run test -- tests/domains/coding-workflows.test.ts tests/config/scaffold.test.ts"

- id: QC-003
  category: correctness
  criterion: "Role metadata supports the new stage end-to-end: the coding domain exports the agent, quality-manager can spawn it, and per-role model/thinking override keys resolve as `integrationVerifier`."
  verification: verifier
  command: "bun run test -- tests/domains/coding-agents.test.ts tests/agents/qualified-role.test.ts tests/orchestration/agent-spawner.test.ts"

- id: QC-004
  category: behavior
  criterion: "When no unique `plan:<slug>` label is available or the plan does not declare auditable contracts, integration-verifier writes a full `overall: skipped` report with rationale instead of aborting the chain."
  verification: reviewer

- id: QC-005
  category: behavior
  criterion: "Quality-manager reruns integration verification after any code-modifying remediation path (fixer, failed-check remediation, reviewer findings, or scoped remediation tasks) and requires the latest integration report to be `correct` or `skipped` before success."
  verification: reviewer

- id: QC-006
  category: behavior
  criterion: "Quality-manager-created remediation tasks preserve the originating plan identity by passing `plan: <activePlanSlug>` to `task_create` in addition to review-round labels."
  verification: reviewer

- id: QC-007
  category: behavior
  criterion: "The integration-verifier prompt forbids repository edits outside `missions/plans/<slug>/integration-report.md`, despite using `coding` tools."
  verification: reviewer

- id: QC-008
  category: integration
  criterion: "The chain runner exposes a role-specific default prompt for `integration-verifier`, so chain execution does not fall back to the generic `Execute your assigned role.` text."
  verification: verifier
  command: "bun run test -- tests/orchestration/chain-runner.test.ts"

## Implementation Order

1. **Define the role surface first** — add `integration-verifier` agent/prompt, extend shared role metadata (`types.ts`, `qualified-role.ts`, `chain-runner.ts`), and add the low-level tests so the new stage is registrable, configurable, and spawnable.
2. **Lock the report and remediation contracts** — update the integration-verifier and quality-manager prompts together so the report format, `I-###` finding namespace, plan-label discovery, `task_create.plan` propagation, and rerun triggers are explicit before workflow wiring begins.
3. **Insert the stage into named workflows** — update bundled coding workflows plus scaffolded `plan-and-build` defaults and add workflow-focused tests proving the stage placement and config override behavior.
4. **Refresh public surfaces** — update `README.md`, `AGENTS.md`, and `.cosmonauts/config.example.json` so docs/examples and prompt assets match the shipped workflow behavior.
5. **Run targeted verification** — execute the workflow/role/prompt test slices from the quality contract to confirm the new stage is wired through without broad regression noise.
