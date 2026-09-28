---
id: TASK-777
title: 'Stage 10: Characterize skills and reachability criticals'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-772
createdAt: '2026-09-28T15:25:14.192Z'
updatedAt: '2026-09-28T15:25:14.192Z'
---

## Description

Land characterization-only coverage for skills and reachability critical functions. This task verifies B-005 and B-010 and is independent of stages 6-9.

<!-- AC:BEGIN -->
- [ ] #1 Behavior verification: B-005 is verified at characterization level for skills/reachability entry points by pinning their shipped synchronization, catalogue, row, and reachability outcomes before refactor; B-010 is verified through a green characterization-only stage and freeze check.
- [ ] #2 Owned functions are missing-tier `runHarnessSync`, partial-tier `groupCatalogue` and `enhancedRows`, and no-coverage `visit`. Their signatures and return sites are enumerated into named observable variants/durable outputs; `visit` pins the reachability verdict for current `missions/architecture/staged-code.toml`, and `groupCatalogue` pins behavior surrounding its pending same-file clone family. Owned Files to Change entries are new test files under `tests/`; `cli/harness/subcommand.ts`, `lib/skills/exporter.ts`, and `scripts/check-reachability.ts` are observed but not edited.
- [ ] #3 D-009/D-016 are satisfied: `static_estimated` absent/partial/none tiers all trigger this separate characterization commit, exact files/cases are recorded for stage 11, tests assert entry-point results rather than helper calls, and this task does not edit any owned critical function or production module. Any needed testability seam belongs in this characterization commit, is explicitly named, and cannot be added later in the refactor without a further characterization commit.
- [ ] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 applies to failed traces. Before every edit the Pi-hosted worker runs `analysis_status`, reconfirms owned complexity and exporter-clone evidence through the project analysis surface, and stops and reports if tools are unavailable (D-017).
- [ ] #5 The characterization commit changes neither current reachability verdict nor staged-code entries and introduces no production export merely to raise coverage. The analysis/reachability measuring instruments, public signatures, dependency direction, provider version, thresholds, boundary zones, configurations, and execution-liveness artifacts remain unchanged.
- [ ] #6 D-015 records slice-start `S` and outputs of `git diff --name-status --diff-filter=MDR S HEAD -- tests/` and `git diff -U0 S HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; only added test files are allowed without escalation. Any modified/deleted/renamed test or skip/only/todo addition cites the pinned finding and leaves the task blocked for independent human review. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope cyclomatic, cognitive, and CRAP plus the exporter duplication capability/diagnostic pair are re-run and recorded for all four functions and the pending clone family.
<!-- AC:END -->
