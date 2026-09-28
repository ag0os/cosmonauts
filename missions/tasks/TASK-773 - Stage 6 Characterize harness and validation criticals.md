---
id: TASK-773
title: 'Stage 6: Characterize harness and validation criticals'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-772
createdAt: '2026-09-28T15:23:52.540Z'
updatedAt: '2026-09-28T15:23:52.540Z'
---

## Description

Land characterization-only coverage for the below-high harness and validation critical functions. This task is the primary owner of B-005 and verifies B-010.

<!-- AC:BEGIN -->
- [ ] #1 Owned behavior B-005 — observer: users of existing CLI commands, registered tools, public library entries, and persisted memory/runtime artifacts; entry point: those shipped entry points and recovery paths; outcome: success, failure, cancellation, retry, recovery, and persisted-artifact behavior remains unchanged while every reproduced production critical in `lib/`, `cli/`, `domains/`, and `scripts/` falls below all thresholds, below-high functions have prior characterization commits, and replacement helpers obey Design §4 ceilings. This stage establishes that contract for its below-high harness/validation functions and verifies B-010.
- [ ] #2 Owned functions are `isManifestEntry`, `validateCommandEvidenceIdentity`, `syncHarnessAssetCore`, `prepareClaudeCommandPair`, and `recoverOwnerRootJournal`; their signatures/return sites are enumerated into named result variants and durable fields before tests, including branch-count-sensitive variants for `validateCommandEvidenceIdentity`. Owned Files to Change entries are new focused or mirrored test files under `tests/`; relevant production entries under `lib/harness-adapters/{inventory,provenance,registry,sync,target-registry,types,render}.ts` and `scripts/validate-harness-exports.ts` are observed but not edited.
- [ ] #3 D-009/D-016 are satisfied by a separate green characterization-only commit: missing/partial/none tiers are below high, tests assert observable variants, errors, transactions, durable filesystem effects, and recovery outcomes rather than helper calls, exact cases/files are recorded for stage 7, and this task does not edit any owned critical function or its production module. `runRepositoryExportValidation` and `runPersonalBundleValidation` remain unchanged under their existing high-tier coverage.
- [ ] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 applies to failed traces. Before every edit the Pi-hosted worker runs `analysis_status`, reconfirms all relevant cyclomatic/cognitive/CRAP findings through the analysis surface, and stops and reports if tools are unavailable (D-017).
- [ ] #5 The `static_estimated` tier is the characterization trigger; runtime coverage cannot waive it. Characterization preserves subsystem-owned state, transaction, validation, command-evidence identity, recovery, and durable-file contracts and introduces no production seam, public export, boundary zone, dependency, provider, or configuration change.
- [ ] #6 D-015 records slice-start `S` and outputs of `git diff --name-status --diff-filter=MDR S HEAD -- tests/` and `git diff -U0 S HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; only added test files are allowed without escalation. Any modified/deleted/renamed test or skip/only/todo addition cites the pinned finding and leaves the task blocked for independent human review. Evidence rows are copied to `## Implementation Notes`; the worker does no git operation on `missions/reviews/`, and the coordinator owns the record-only commit.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope cyclomatic, cognitive, and CRAP capabilities are re-run and recorded for all five owned functions at the characterization commit.
<!-- AC:END -->
