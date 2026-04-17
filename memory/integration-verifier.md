---
source: archive
plan: integration-verifier
distilledAt: 2026-04-15T14:47:25Z
---

# Cross-Task Integration Verifier Agent

## What Was Built

Added a plan-aware `integration-verifier` stage to the coding domain so workflow output is checked against the active plan’s declared contracts before final quality review. The stage writes `missions/plans/<slug>/integration-report.md` in a fixed markdown format, and `quality-manager` now consumes that report, routes remediation, preserves `plan:<slug>` identity on new tasks, and reruns integration verification after code-changing fixes. The new stage is wired into the shipped `plan-and-build`, `reviewed-plan-and-build`, `tdd`, `spec-and-build`, and `adapt` workflows, plus scaffolded defaults and public examples.

## Key Decisions

- **Kept the integration report file-based and reviewer-shaped.** The report is an explicit markdown wire contract, not an inferred object shape, so `quality-manager` can reuse existing routing fields (`priority`, `severity`, `confidence`, `complexity`, nested `task`) without learning a second remediation model.
- **Made `quality-manager` own reruns.** The initial chain stage produces the first integration report, but any later code-modifying remediation inside the quality loop must invalidate that report and trigger a fresh `integration-verifier` run.
- **Used `task_create.plan` for remediation tasks.** Review-fix tasks must carry the originating plan slug explicitly instead of relying on older implementation tasks to keep plan identity discoverable.
- **Treat `skipped` as a valid non-blocking outcome.** When there is no unique `plan:<slug>` label or the plan lacks auditable contracts, the verifier writes a full skipped report instead of failing the chain.
- **Limited rollout to named workflows in scope.** `implement`, `plan-and-tdd`, `spec-and-tdd`, and `verify` were intentionally left unchanged.

## Patterns Established

- **Plan-driven verification artifact**: architectural verification now communicates through `missions/plans/<slug>/integration-report.md`, with top-level `plan:` and `overall:` fields plus `I-###` finding IDs.
- **Reviewer-compatible finding schema**: integration findings use the same remediation-routing fields as reviewer findings, so simple findings can go to `fixer` and complex findings can become scoped tasks.
- **Unique active-plan discovery**: both verifier and quality routing derive the target plan from the only `plan:<slug>` label in the active task set; ambiguous or missing plan labels produce `overall: skipped`.
- **Role/config parity for new stages**: adding a workflow stage requires threading the role through agent registration, role-to-config-key mapping (`integrationVerifier`), and chain-runner default prompts.
- **Scaffold defaults matter more than example config**: fresh projects override bundled workflow definitions from generated config, so `lib/config/defaults.ts` is the correctness seam; `.cosmonauts/config.example.json` is documentation parity only.

## Files Changed

- `bundled/coding/coding/agents/integration-verifier.ts` and `bundled/coding/coding/prompts/integration-verifier.md` — introduced the new role, its report-writing contract, and the restriction that it only writes `integration-report.md`.
- `bundled/coding/coding/agents/quality-manager.ts` and `bundled/coding/coding/prompts/quality-manager.md` — taught quality-manager to spawn the verifier, consume `integration-report.md`, route `I-###` findings, preserve `plan:<slug>` on remediation tasks, and rerun verification after code changes.
- `bundled/coding/coding/workflows.ts` and `lib/config/defaults.ts` — inserted `integration-verifier` before `quality-manager` in the in-scope workflows and in scaffolded `plan-and-build` defaults.
- `lib/orchestration/types.ts`, `lib/agents/qualified-role.ts`, and `lib/orchestration/chain-runner.ts` — added the shared role surface, `integrationVerifier` config key, and a role-specific default stage prompt.
- `README.md`, `AGENTS.md`, and `.cosmonauts/config.example.json` — updated public workflow examples to match the shipped pipeline.
- `tests/domains/coding-workflows.test.ts` plus role/prompt/orchestration test updates — locked stage placement, prompt loading, config-key mapping, and scaffolding behavior.

## Gotchas & Lessons

- **Do not describe the report shape loosely.** This feature depends on a concrete markdown wire format; a TypeScript-ish description is not enough because `quality-manager` reads a file, not a typed object.
- **Rerun triggers must cover every code-changing remediation path.** Limiting reruns to integration-originated findings leaves stale architectural sign-off after ordinary reviewer fixes or failed-check remediation.
- **Plan identity can drift unless remediation tasks carry `plan:<slug>`.** Once quality creates new tasks, older implementation tasks are no longer a reliable source of truth for active-plan discovery.
- **`skipped` is intentional behavior, not an error case.** Multi-plan task sets and underspecified plans should still produce a complete report so the quality loop can continue with an explicit rationale.
- **The verifier needs write tools but must stay effectively readonly.** The prompt-level constraint that it may only write `missions/plans/<slug>/integration-report.md` is a real safety boundary, not documentation fluff.
