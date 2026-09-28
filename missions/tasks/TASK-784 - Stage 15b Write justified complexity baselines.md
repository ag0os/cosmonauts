---
id: TASK-784
title: 'Stage 15b: Write justified complexity baselines'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-782
createdAt: '2026-09-28T15:43:15.532Z'
updatedAt: '2026-09-28T17:27:22.485Z'
---

## Description

Write the per-file justified retained-complexity baseline at the TASK-782 (Stage 15a) tip. This task is the primary owner of B-006 and verifies B-007 and B-010. The four `tests/` critical rows (the anonymous suite callbacks in `tests/harness-adapters/sync.test.ts`, `tests/orchestration/chain-runner.test.ts`, and `tests/memory/markdown-store.test.ts`, and `auditMigratedSeed` in `tests/memory/interface.test.ts`) get their reasons here. Ratified invariants, acceptance criteria, and human-decided Decision Log entries are stop-and-escalate ground under the deviation protocol, not worker-adjustable detail.

<!-- AC:BEGIN -->
- [ ] #1 Owned behavior B-006 — observer: future maintainer comparing health debt over time; entry point: the per-file baselined-complexity section of `docs/fallow-exceptions.md` and its machine companion in the committed project-health record; outcome: every remaining high or moderate function and every reproduced critical test function has a per-file written justification and a stable identity, and no production critical function is moved into this baseline. This stage also verifies B-007 for non-growing/zero-stale suppression debt and B-010 through the stage gate/freeze check.
- [ ] #2 At the TASK-782 tip, every fresh high/moderate row and every reproduced test-critical row appears under `### Baselined complexity (project-health-audit)` in `docs/fallow-exceptions.md` with its stable identity (`metric/path/line/column/name`) and a file-specific role/coverage/tier-deferral reason, not boilerplate; fresh evidence governs additions and no fifth test-critical row is fabricated. The coordinator-custodied record JSON mirrors identical identities and text. No production critical appears. Owned Files to Change entries are that `docs/fallow-exceptions.md` subsection and `missions/reviews/project-health-audit.{md,json}` as coordinator-custodied mirrors; no production or test file is edited.
- [ ] #3 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 escalation/false-positive evidence stays explicit. Before every edit the Pi-hosted worker runs `analysis_status`, reconfirms each baselined row through the project analysis surface, and stops and reports if tools are unavailable (D-017). Any regression returns to its owning stage rather than being absorbed into the baseline.
- [ ] #4 D-015 freeze check. The base is the slice-start commit `S`, the HEAD the worker started from. Under driver-commits HEAD does not include the worker's edits, so the worker's in-session check compares the working tree with the base and records the base SHA and the exact outputs of `git diff --name-status --diff-filter=MDR S -- tests/`, `git status --porcelain -- tests/`, and `git diff -U0 S -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`. Allowed without a human stop: (a) newly added test files; (b) pre-declared mechanical reference updates in existing tests for a symbol this task renames or moves, where every changed hunk contains only that identifier change and no assertion, fixture, or expectation change, named in this task before editing and reviewed and recorded by the coordinator. This task edits no test file, so the output is empty. Anything else blocks for human review. The freeze verdict comes from the coordinator, not the worker: after Drive commits this task, the coordinator confirms the base (`S` is the parent of this task's Drive commit), re-runs the same diff commands from that base to this task's Drive commit, and records its output and both SHAs under `## Implementation Notes` beside the worker's. Finding citations go in this task's notes, not in a commit message. Any disagreement, wrong base, or undeclared modified/deleted/renamed test or added skip/only/todo leaves the task `blocked` and the next slice is not dispatched. Worker-recorded output alone never satisfies this AC. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [ ] #5 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; cyclomatic/cognitive/CRAP, dead-code, suppression, and project-scope duplication with D-012 diagnostic pairing are re-run and recorded, proving no production critical, no recreated earlier debt, and complete justified dispositions. The post-edit surface duplication outcome is completed with `verdict: "fail"`; any other state is recorded as it is and fails this stage (Design §3).
<!-- AC:END -->

## Implementation Notes

### Standing coordinator note (2026-09-28, applies to every attempt)

Drive commits this task only when **every** acceptance criterion is checked; an unchecked criterion ends the run `task_blocked` with nothing committed and Drive then overwrites these notes with its block reason. The in-process worker prompt does not say this, so: before your final report, (1) record your evidence (analysis_status output, traces, the D-015 in-session check verbatim against the slice-start commit, stage-gate exit codes and result lines) with `task_edit` `implementationNotes` (append, never drop earlier sections); (2) tick every satisfied criterion with `task_edit` `checkAc`; for a coordinator-verdict freeze criterion, plan D-020 applies: tick it once your in-session half is recorded and the coordinator appends the post-commit verdict; (3) report `outcome: success` only then. Leave source and test files uncommitted; the driver commits. Never run git operations on `missions/reviews/`; write record rows to the record files and copy them here.
