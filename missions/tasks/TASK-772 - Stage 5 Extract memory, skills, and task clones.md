---
id: TASK-772
title: 'Stage 5: Extract memory, skills, and task clones'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-770
  - TASK-771
createdAt: '2026-09-28T15:23:32.781Z'
updatedAt: '2026-09-28T15:23:32.781Z'
---

## Description

Eliminate the remaining memory, skills, and task clone families assigned to duplication cleanup, record the two three-file refusals, and reconcile the 41/2 split. This task verifies B-004 and B-010.

<!-- AC:BEGIN -->
- [ ] #1 Behavior verification: B-004 is verified by removing every owned reproduced one-/two-file family, retaining the two three-file families with exact files/reasons and measured totals, and preserving the actual surface outcome; B-010 is verified by a green stage and freeze check.
- [ ] #2 Owned families are judgment-provider/living-memory byte formatting; judgment-provider/retirement-receipt exact-object helpers outside the baseline family; consolidation receipt reads; proposal/retirement validation; consolidation-source same-file validation and source/store reads; durable-files with knowledge/retirement stores; episode-transition and episode locking; knowledge-record/OKF parsing; knowledge/markdown-store reads; markdown-store paths; proposal-files/retirement-store operations; retirement receipt/store parsing; and task-manager dependency/status work. Owned Files to Change entries are `cli/memory/judgment-provider.ts`, `lib/memory/{consolidation-proposals,consolidation-receipts,consolidation-sources,durable-files,episode-transition-lock,episode,knowledge-records,knowledge-store,living-memory,markdown-store,okf,proposal-files,retirement-receipts,retirement-store}.ts`, `lib/tasks/{lock,task-manager}.ts`, applicable `lib/skills/discovery.ts`, focused internal helpers, and new focused tests.
- [ ] #3 D-008’s exact three-file dispositions are recorded: validation stays local across `cli/memory/judgment-provider.ts`, `lib/memory/consolidation-proposals.ts`, and `lib/memory/retirement-receipts.ts` because model-output and persisted-record trust/error ownership differ; read loops stay local across `lib/memory/consolidation-sources.ts`, `lib/memory/knowledge-store.ts`, and `lib/memory/living-memory.ts` because no-follow, consistency, error, and record-validation semantics differ. The persisted 87-group mapping is reconciled to 41 extract families/2 baseline families, fresh unmapped groups are classified by file count, and living-memory, proposals/receipts, and exporter families gated by below-high critical functions remain pending stages 15, 13, and 11 respectively.
- [ ] #4 D-009 is enforced before extraction: current clone ranges are compared with current partial/none/missing-tier critical ranges; any newly overlapping family moves to its critical owner and is recorded. Local-first/narrow-primitive sharing preserves trust boundaries, TOCTOU, lock, durable-file, validation, and error semantics; a one-/two-file family that cannot be removed without violating ratified scope or dependency direction stops for human scope review and is not silently baselined.
- [ ] #5 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 requires reproduced-but-untraceable findings to record failed/narrow successful traces plus repository-wide search and escalate without edit. Before every edit the Pi-hosted worker runs `analysis_status`, traces each owned group through the project analysis surface, and stops and reports if tools are unavailable (D-017).
- [ ] #6 D-012 evidence pairs the completed project-scope duplication surface outcome with direct diagnostic `fallow ["dupes", "--format", "json", "--quiet", "--no-cache"]`, never treating diagnostic evidence as a surface pass. Every owned group is absent from the diagnostic inventory and its pre-edit location trace; the two baseline families and three moved families remain explicitly visible with dispositions. No public-entry/configuration/boundary/dependency change substitutes for extraction.
- [ ] #7 D-015 records slice-start `S` and outputs of `git diff --name-status --diff-filter=MDR S HEAD -- tests/` and `git diff -U0 S HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; only added test files are allowed without escalation. Any modified/deleted/renamed test or added skip/only/todo cites the pinned finding and leaves the task blocked for independent human review. Rows are copied to `## Implementation Notes`; the worker does no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [ ] #8 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope duplication and the D-012 diagnostic pair are re-run and recorded, with all owned families absent and the 41/2 reconciliation plus pending critical-owned families explicit.
<!-- AC:END -->
