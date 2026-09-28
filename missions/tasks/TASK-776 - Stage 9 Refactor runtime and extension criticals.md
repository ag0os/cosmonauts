---
id: TASK-776
title: 'Stage 9: Refactor runtime and extension criticals'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-775
createdAt: '2026-09-28T15:24:56.144Z'
updatedAt: '2026-09-28T15:24:56.144Z'
---

## Description

Refactor the runtime, CLI, domain, and extension critical cluster and remove the stale runDrive suppression. This task verifies B-005, B-007, and B-010.

<!-- AC:BEGIN -->
- [ ] #1 Behavior verification: B-005 is verified for `summarizeEvent`, `isStepRecordLike`, `validateChainAgentEvidence`, `adaptStoredEvent`, `runDrive`, `parseTaskBatchRow`, `describeDriverEvent`, `introspectProvider`, `parseRememberParams`, and high-tier `runDurableGraphScheduler`, preserving shipped success/failure/cancellation/event/provider behavior while all functions/helpers fall below thresholds. B-007 is verified by removing the now-stale `runDrive` `complexity` directive and only its registry row, with suppression counts non-growing and stale count zero. B-010 is verified by the stage gate/freeze check.
- [ ] #2 Owned Files to Change entries are `cli/chain-execution.ts`, `cli/drive/subcommand.ts`, `.cosmonauts/suppression-exceptions.json` (shrink-only), `domains/shared/extensions/orchestration/watch-events-tool.ts`, `domains/shared/extensions/project-tools/fallow-provider.ts`, `lib/durable-runtime/{scheduler,scheduler-state,controller}.ts`, `lib/extensions/knowledge-surface/knowledge-tools.ts`, `lib/orchestration/{chain-episodes,chain-event-adapter}.ts`, plan-approved focused helpers, and no tests after TASK-775’s characterization commit. Stateful schedulers retain one state owner; parsers/validators use explicit result variants; presentation may use exhaustive data-driven dispatch.
- [ ] #3 D-009/D-016 and Design §4 are satisfied: exact TASK-775 cases are named before edit and all metrics freshly reconfirmed. Every non-exported helper is cyclomatic ≤9/cognitive ≤14 when test-reachable or cyclomatic ≤4/cognitive ≤14 when no test imports its file; exported entry points retain their measured tier (about cyclomatic 27 at high), helpers are not exported to gain tier, and planned helper counts/target cyclomatic are recorded. `summarizeEvent`, `isStepRecordLike`, `adaptStoredEvent`, and `describeDriverEvent` reduce branch count into cyclomatic-9 units. Failure to meet ceilings allows only a further named characterization-seam commit; otherwise the task blocks/escalates, never baselines production criticals.
- [ ] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 applies to failed traces. Before every edit the Pi-hosted worker runs `analysis_status`, reconfirms cyclomatic/cognitive/CRAP through the project analysis surface, and stops and reports if tools are unavailable (D-017).
- [ ] #5 `introspectProvider` retains the provider-neutral normalized `analysis_status` contract pinned in TASK-775; any altered finding identity for an unchanged file is a regression. The adapter change remains visible in `analysisConfiguration` and is flagged gate-owned for closeout. Dependency direction, public entries/signatures, thresholds, boundary zones, project scope, and all explicitly unchanged configuration/artifacts remain intact; the suppression registry authorizes no new directive.
- [ ] #6 D-015 records slice-start `S`, characterization commit `C` from TASK-775, and outputs of `git diff --name-status --diff-filter=MDR C HEAD -- tests/` and `git diff -U0 C HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; additions belong in `C` only. Any modified/deleted/renamed test or skip/only/todo addition cites the pinned finding and leaves the task blocked for independent human review. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope cyclomatic, cognitive, and CRAP plus suppression/dead-code evidence are re-run and recorded with all ten owned functions/helpers below thresholds and the `runDrive` directive/row absent.
<!-- AC:END -->
