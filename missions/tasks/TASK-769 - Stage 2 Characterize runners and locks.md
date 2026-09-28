---
id: TASK-769
title: 'Stage 2: Characterize runners and locks'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-768
createdAt: '2026-09-28T15:22:18.329Z'
updatedAt: '2026-09-28T15:22:18.329Z'
---

## Description

Land a characterization-only green commit for behavior-sensitive binary-runner and lock clone families. This task is the primary owner of B-011 and verifies B-010. Ratified ground is stop-and-escalate ground.

<!-- AC:BEGIN -->
- [ ] #1 Owned behavior B-011 — observer: Drive and package users running Claude/Codex binaries and concurrent task/plan writers contending for locks; entry point: `runClaudeBinary`/`runCodexBinary` in `lib/agent-packages/` and lock primitives in `lib/driver/lock.ts` and `lib/entity-file-lock.ts`; outcome: after extraction runners clean materialized resources exactly once, uninstall signal handlers, propagate child exit code and signal unchanged, preserve variant-specific argument handling, and locks retain distinct timeout, stale-owner, warning, and release-confirmation behavior, with these outcomes characterized in this separate green commit before extraction. This stage verifies B-010 by closing without regression.
- [ ] #2 The owned characterization cluster is `runClaudeBinary`, `runCodexBinary`, and the lock primitives in `lib/driver/lock.ts` and `lib/entity-file-lock.ts`, covering single cleanup, handler removal, exit-code/signal propagation, variant arguments, timeout, stale-owner races, warnings, and release confirmation. Owned Files to Change entries are new focused or mirrored test files under `tests/`; `lib/agent-packages/claude-binary-runner.ts`, `lib/agent-packages/codex-binary-runner.ts`, `lib/driver/lock.ts`, and `lib/entity-file-lock.ts` are observed but not edited.
- [ ] #3 D-009/D-016 are checkable: each function’s current result variants and durable fields are enumerated from signatures/return sites before tests, tests assert observable results rather than helper calls, missing tier is below high, and this characterization task does not edit any owned critical function or any of the four owned production modules. The commit is characterization-only, green, and records exact test files/cases for stage 3 reuse.
- [ ] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 requires reproduced-but-untraceable findings to record failed/narrow successful traces plus repository-wide search and escalate without edit. Before every edit the Pi-hosted worker runs `analysis_status`, uses the project analysis surface tools to reconfirm/trace the owned clone locations, and stops and reports if those tools are unavailable (D-017).
- [ ] #5 Dependency direction and ownership remain unchanged: characterization introduces no public entry, global utility, production seam, provider substitution, boundary zones, dependency bump, or change to `fallow.toml`, `missions/architecture/staged-code.toml`, `.cosmonauts/config.json`, `qualityReview`, or execution-liveness artifacts. Direct provider evidence, if needed for diagnosis, is labeled and cannot turn a failed/unbound surface result into a pass.
- [ ] #6 D-015 evidence records slice-start `S` and exact outputs of `git diff --name-status --diff-filter=MDR S HEAD -- tests/` and `git diff -U0 S HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; only added test files are allowed without escalation. Any modified/deleted/renamed test or added skip/only/todo cites the pinned finding and leaves the task blocked for independent human review. Updated evidence rows are copied into this task’s `## Implementation Notes`; the worker performs no git operation on `missions/reviews/project-health-audit.{md,json}`, and the coordinator owns the post-stage record-only commit.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; the project-scope duplication capability and its D-012 diagnostic pairing are re-run and recorded with the owned families still present pending stage 3.
<!-- AC:END -->
