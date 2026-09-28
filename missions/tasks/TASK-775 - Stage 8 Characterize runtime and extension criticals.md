---
id: TASK-775
title: 'Stage 8: Characterize runtime and extension criticals'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-772
createdAt: '2026-09-28T15:24:34.550Z'
updatedAt: '2026-09-28T15:24:34.550Z'
---

## Description

Land characterization-only coverage for below-high runtime, CLI, domain, and extension critical functions. This task verifies B-005 and B-010 and is independent of stages 6/7.

<!-- AC:BEGIN -->
- [ ] #1 Behavior verification: B-005 is verified at characterization level for the owned runtime/CLI/domain/extension criticals by pinning their shipped success, failure, cancellation, event, parsing, and analysis-status variants before refactor; B-010 is verified through a green characterization-only stage and freeze check.
- [ ] #2 Owned functions are `summarizeEvent`, `isStepRecordLike`, `validateChainAgentEvidence`, `adaptStoredEvent`, `runDrive`, `parseTaskBatchRow`, `describeDriverEvent`, `introspectProvider`, and `parseRememberParams`; each function’s signature/return sites are enumerated and tests assert named result variants and durable fields, not helpers. `introspectProvider` specifically pins normalized `analysis_status` output for the repository configuration. Owned Files to Change entries are new test files under `tests/`; observed-but-unedited production entries are `cli/chain-execution.ts`, `cli/drive/subcommand.ts`, `domains/shared/extensions/orchestration/watch-events-tool.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`, `lib/durable-runtime/{scheduler-state,controller}.ts`, `lib/extensions/knowledge-surface/knowledge-tools.ts`, and `lib/orchestration/{chain-episodes,chain-event-adapter}.ts`.
- [ ] #3 D-009/D-016 are satisfied by a separate green commit before stage 9: `static_estimated` partial/none/missing tiers trigger characterization, exact cases/files are recorded, and this task does not edit any owned critical function or owned production module. Cases cover branch-count/result variants for `summarizeEvent`, `isStepRecordLike`, `adaptStoredEvent`, and `describeDriverEvent`, plus CLI cancellation/errors and provider binding normalization; high-tier `runDurableGraphScheduler` remains unchanged under existing coverage.
- [ ] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 applies to failed traces. Before every edit the Pi-hosted worker runs `analysis_status`, reconfirms each owned complexity finding through the project analysis surface, and stops and reports if tools are unavailable (D-017).
- [ ] #5 Characterization does not alter the measuring instrument: the Fallow provider-neutral contract, identities, bindings, and normalized outcomes remain unchanged. It introduces no production seam/export, suppression registration, boundary zone, dependency/provider bump, or configuration change, and records exact before identities and cases for stage 9.
- [ ] #6 D-015 records slice-start `S` and outputs of `git diff --name-status --diff-filter=MDR S HEAD -- tests/` and `git diff -U0 S HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; only added test files are allowed without escalation. Any modified/deleted/renamed test or skip/only/todo addition cites the pinned finding and leaves the task blocked for independent human review. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope cyclomatic, cognitive, and CRAP capabilities plus `analysis_status` are re-run and recorded for all nine owned functions.
<!-- AC:END -->
