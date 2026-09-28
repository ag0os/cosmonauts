---
id: TASK-771
title: 'Stage 4: Extract extension and harness clones'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-768
createdAt: '2026-09-28T15:23:08.691Z'
updatedAt: '2026-09-28T15:23:08.691Z'
---

## Description

Eliminate the extensions, harness, and validation one-/two-file clone families independently of stage 3. This task verifies B-004 and B-010 and depends only on stage 1 as specified.

<!-- AC:BEGIN -->
- [ ] #1 Behavior verification: B-004 is verified for the owned extension/harness/validation families through the committed project-health record—owned reproduced one-/two-file families disappear while surface state and diagnostic evidence remain distinct—and B-010 is verified through the stage gate, freeze check, and unchanged shipped behavior.
- [ ] #2 Owned clone families are agent-memory/architecture-memory rendering and byte helpers; agent-memory/knowledge-tool limit normalization; harness-render same-file writes; render/sync path checks; sync-transaction same-file blocks; sync/validation-script durable file operations; and harness-export validation same-file command probes. Owned Files to Change entries are `lib/extensions/agent-memory/index.ts`, `lib/extensions/architecture-memory/index.ts`, `lib/extensions/knowledge-surface/knowledge-tools.ts`, `lib/harness-adapters/render.ts`, `lib/harness-adapters/sync.ts`, applicable `lib/harness-adapters/{inventory,provenance,registry,target-registry,types}.ts`, `scripts/validate-harness-exports.ts`, focused internal helpers under plan-approved directories, and new focused tests where needed.
- [ ] #3 D-008/D-009 govern the extraction: every fresh clone range is compared with fresh partial/none/missing-tier critical ranges before edit and any overlap moves to its owning critical stage. Same-file families become private helpers; same-subsystem sharing stays internal; cross-file sharing is the smallest identical primitive; transaction boundaries, durable-write behavior, no-follow/consistency rules, filesystem errors, and validation ownership remain at their current subsystem. No global utility or broader dependency is introduced.
- [ ] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). A below-high critical overlap requires a separate prior green characterization commit (D-009). D-013 requires reproduced-but-untraceable findings to record failed/narrow successful traces plus repository-wide search and escalate without edit. Before every edit the Pi-hosted worker runs `analysis_status`, traces a current location for every owned group through the analysis surface, and stops and reports if the tools are unavailable (D-017).
- [ ] #5 For each owned group, the post-edit diagnostic inventory and exact-location trace prove absence; any surviving group fails the stage. D-012 pairing records project-scope duplication’s completed surface outcome and direct diagnostic `fallow ["dupes", "--format", "json", "--quiet", "--no-cache"]` separately. Boundary zones, dependencies, public entries, `fallow.toml`, `missions/architecture/staged-code.toml`, `.cosmonauts/config.json`, `qualityReview`, and execution-liveness artifacts remain unchanged.
- [ ] #6 D-015 records slice-start `S` and outputs of `git diff --name-status --diff-filter=MDR S HEAD -- tests/` and `git diff -U0 S HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; only added test files are allowed without escalation. Any modified/deleted/renamed test or added skip/only/todo cites the pinned finding and leaves the task blocked for independent human review. Evidence/disposition rows are copied to `## Implementation Notes`; the worker does no git operation on `missions/reviews/project-health-audit.{md,json}`, and the coordinator owns the record-only commit.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope duplication is re-run through the surface with its actual outcome and D-012 diagnostic pair, and neither evidence surface contains an owned family.
<!-- AC:END -->
