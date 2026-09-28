---
id: TASK-782
title: 'Stage 15: Refactor runPass and justify retained complexity'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-781
  - TASK-774
  - TASK-776
  - TASK-778
  - TASK-780
createdAt: '2026-09-28T15:27:01.270Z'
updatedAt: '2026-09-28T15:27:01.270Z'
---

## Description

Refactor `runPass`, remove the living-memory clone family, prove production critical complexity is gone, and write the justified retained-complexity baseline. This task is the primary owner of B-006 and verifies B-004, B-005, B-007, and B-010.

<!-- AC:BEGIN -->
- [ ] #1 Owned behavior B-006 — observer: future maintainer comparing health debt over time; entry point: `### Baselined complexity (project-health-audit)` in `docs/fallow-exceptions.md` and its machine companion in the committed record; outcome: every remaining high/moderate function and every reproduced critical test function has a stable identity and per-file written justification, with no production critical moved into the baseline. This stage also verifies B-004 for the nine-group living-memory family, B-005 for `runPass` and all production criticals, B-007 for non-growing/zero-stale suppression debt, and B-010 through the stage gate/freeze check.
- [ ] #2 Owned findings are `runPass`; the `lib/memory/living-memory.ts` same-file family of nine groups/174 lines spanning `runPass` and `recoverAcceptedEpisodeFinalization`; every fresh high/moderate complexity row; and reproduced test criticals at the anonymous callbacks in `tests/harness-adapters/sync.test.ts`, `tests/orchestration/chain-runner.test.ts`, `tests/memory/markdown-store.test.ts`, plus `auditMigratedSeed` in `tests/memory/interface.test.ts` (fresh evidence governs additions, and no fifth row is fabricated). Owned Files to Change entries are `lib/memory/living-memory.ts`, `docs/fallow-exceptions.md`, `missions/reviews/project-health-audit.{md,json}` as coordinator-custodied mirrors, plan-approved internal memory helpers, and no tests after TASK-781.
- [ ] #3 D-009/D-016 and Design §4 are satisfied: exact TASK-781 cases are named before edit and `runPass` is decomposed into recovery/preflight, collection/inventory/pressure, deterministic execution, model judgment/materialization, and final assembly with one state owner retaining write-through `details`, `writesCommitted`, and `episodePrunes`; persisted stores remain authoritative after restart. Non-exported helpers are cyclomatic ≤9/cognitive ≤14 when test-reachable or cyclomatic ≤4/cognitive ≤14 when no test imports the file; exported entry points retain measured tier, helpers are not exported to gain tier, and planned helper counts/target cyclomatic are recorded. Any inability to meet ceilings permits only a further named characterization-seam commit; otherwise the task blocks/escalates, never baselines production criticals.
- [ ] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 requires failed symbol trace plus successful containing-file trace/repository search to remain explicit and unedited unless fresh metric confirmation authorizes the refactor. Before every edit the Pi-hosted worker runs `analysis_status`, uses fresh complexity/exact-location clone/dead-code tools, and stops/reports if unavailable (D-017).
- [ ] #5 D-008/D-012/D-014 are checkable: the living-memory family is extracted only through the narrowest ownership-preserving seam and disappears from surface, diagnostic, and per-location trace evidence; project-scope duplication remains paired with direct diagnostic `fallow ["dupes", "--format", "json", "--quiet", "--no-cache"]`. `docs/fallow-exceptions.md` contains `### Baselined complexity (project-health-audit)` with each retained high/moderate and reproduced test-critical stable identity (`metric/path/line/column/name`) and a file-specific role/coverage/tier-deferral reason, not boilerplate; JSON mirrors identical identities/text, the health refresh reason will name the section and JSON digest, and no production critical appears. All complexity metrics prove zero production critical, and dead-code/duplication rechecks route regressions back to their owner.
- [ ] #6 D-015 records slice-start `S`, characterization commit `C` from TASK-781, and outputs of `git diff --name-status --diff-filter=MDR C HEAD -- tests/` and `git diff -U0 C HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; additions belong in `C` only. Any modified/deleted/renamed test or skip/only/todo addition cites the pinned finding and leaves the task blocked for independent human review. Record/baseline rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns the record-only commit.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; cyclomatic/cognitive/CRAP, dead-code, suppression, and project-scope duplication with D-012 diagnostic pairing are re-run and recorded, proving no production critical, no recreated earlier debt, no stale suppression, the living-memory family absent, and complete justified dispositions.
<!-- AC:END -->
