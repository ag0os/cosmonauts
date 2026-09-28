---
id: TASK-774
title: 'Stage 7: Refactor harness and validation criticals'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-773
createdAt: '2026-09-28T15:24:13.239Z'
updatedAt: '2026-09-28T15:24:13.239Z'
---

## Description

Refactor all seven harness and validation critical functions after characterization. This task verifies B-005 and B-010.

<!-- AC:BEGIN -->
- [ ] #1 Behavior verification: B-005 is verified for `isManifestEntry`, `validateCommandEvidenceIdentity`, `syncHarnessAssetCore`, `prepareClaudeCommandPair`, `recoverOwnerRootJournal`, `runRepositoryExportValidation`, and `runPersonalBundleValidation`: their shipped success/failure/recovery/durable-file behavior is unchanged and every function and replacement helper is below its applicable thresholds. B-010 is verified through the stage gate and freeze check.
- [ ] #2 Owned Files to Change entries are the function-owning files under `lib/harness-adapters/{inventory,provenance,registry,sync,target-registry,types,render}.ts`, `scripts/validate-harness-exports.ts`, plan-approved focused internal helpers, and no tests after TASK-773’s characterization commit. Entry points remain composition roots; transactions, filesystem consistency, validation ownership, command-evidence identity, and high-tier validation behavior remain at their existing boundaries.
- [ ] #3 D-009/D-016 and Design §4 are satisfied: the exact TASK-773 cases relied on are recorded before edit; all relevant complexity metrics are freshly reconfirmed; decomposition uses cohesive decisions/parsers/phases. Every non-exported helper is cyclomatic ≤9 and cognitive ≤14 when its file is test-reachable, or cyclomatic ≤4 and cognitive ≤14 when no test imports its file; exported entry points retain their measured tier (about cyclomatic 27 at high), and helpers are not exported merely to gain a tier. Planned helper count and target cyclomatic are recorded before edit; `validateCommandEvidenceIdentity` reduces branches into cyclomatic-9 units rather than merely flattening cognition. If ceilings still cannot be met, only a further named characterization seam commit may raise a tier; otherwise the task blocks and escalates.
- [ ] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 applies to failed traces. Before every edit the Pi-hosted worker runs `analysis_status`, reconfirms cyclomatic/cognitive/CRAP through the project analysis surface, and stops and reports if tools are unavailable (D-017). No production critical may be baselined.
- [ ] #5 Dependency direction remains inward; public signatures change only when a private extraction makes them unnecessary and fresh reachability proves no shipped consumer. No boundary zone, dependency/provider bump, direct-fix shadow gate, production-scope change, or edit to `fallow.toml`, `missions/architecture/staged-code.toml`, `.cosmonauts/config.json`, `qualityReview`, or execution-liveness artifacts occurs. Exact before/after identities, metrics, cases, and ownership are recorded.
- [ ] #6 D-015 records slice-start `S`, characterization commit `C` from TASK-773, and exact outputs of `git diff --name-status --diff-filter=MDR C HEAD -- tests/` and `git diff -U0 C HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; test additions belong in `C` only. Any modified/deleted/renamed test or skip/only/todo addition cites the pinned finding and leaves the task blocked for independent human review. Rows are copied to `## Implementation Notes`; the worker does no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope cyclomatic, cognitive, and CRAP capabilities are re-run and recorded with all seven owned functions and every new helper below applicable thresholds.
<!-- AC:END -->
