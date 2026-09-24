---
id: TASK-731
title: Stage 6 remediation C - restore specialist lenses and QM panel triage
status: To Do
priority: high
labels:
  - prompts
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-725
createdAt: '2026-09-24T05:47:37.941Z'
updatedAt: '2026-09-24T05:47:37.941Z'
---

## Description

Remediate AC-016 findings from the mid-branch independent review: Claude M1 and M2, codex C4 and C6 (`missions/plans/qm-chain-safety/mid-review-1-*.md`). This work is governed by plan D-025 ("Panel triage", "Reviewer prompts serve both callers"), D-012 and Design §6.

TASK-725 replaced `bundled/coding/prompts/{reviewer,security-reviewer,performance-reviewer,ux-reviewer}.md` (roughly 170 lines each) and `quality-manager.md` (276 lines) with short stubs. Start from their text at commit `e43c238` (`git show e43c238:<path>`). Make only the targeted edits the plan requires:
- scope from host materials when present;
- the report is returned as final text, with no output paths;
- performance P1 needs measured or reproduced evidence;
- no shell, write, fixer, coordinator or worker, tasks, commits or second round in the QM.

Keep the review dimensions, the verification methods, the lens-applicability check, calibrated severity and the findings format. Stage 7 (TASK-726) adds the closure rule and model diversity. Do not do that here. Authored prompts are reviewed semantically. Binding ratified ground is as in TASK-725.

Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.


<!-- AC:BEGIN -->
- [ ] #1 Each specialist prompt retains its pre-plan review dimensions, verification methods, lens-applicability (`no findings in scope`) step, calibrated severity and findings format, with only the D-025/Design §6 targeted edits applied; a semantic diff against `e43c238` shows no dropped dimension.
- [ ] #2 Reviewer prompts work for both callers (D-025): inside a QM panel they read scope from host materials and return final text without running commands; when spawned directly by `cody`/`cosmo` (no materials), they establish diff scope as before; a test covers both prompt paths or the assembled instructions for both contexts.
- [ ] #3 The QM prompt restores pre-plan panel triage judgment, the blast-radius lens for shared primitives and the regression-semantics lens for changed shared code, adapted to one pass through `spawn_agent`, with no remediation, rounds, verifier, fixer, commits or tasks.
- [ ] #4 Panel triage per D-025: the host computes a minimum required lens set (including UX for user-facing CLI/help/flag/error-message/API-shape changes, and security for dependency, spawn/exec, path-handling and auth changes); the QM may add any other of the four lenses once each; every started lens is required evidence; the QM cannot drop a host-required lens; tested with a CLI-help-only diff, a dependency bump and a QM-added lens.
<!-- AC:END -->
