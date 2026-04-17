---
id: TASK-186
title: 'Extend quality-manager to consume, route, and rerun the integration report'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:integration-verifier'
dependencies:
  - TASK-185
createdAt: '2026-04-14T19:28:45.165Z'
updatedAt: '2026-04-14T19:44:27.578Z'
---

## Description

Update the quality-manager agent definition and prompt so it can spawn `integration-verifier` as a subagent, read `integration-report.md`, route findings through the existing remediation paths, preserve plan identity on created tasks, and rerun integration verification after any code-modifying remediation.

**Files to modify:**
- `bundled/coding/coding/agents/quality-manager.ts` — add `"integration-verifier"` to the `subagents` array.
- `bundled/coding/coding/prompts/quality-manager.md` — insert an integration report step into the per-invocation workflow:
  - After coordinator/tdd-coordinator completes (i.e., after the existing step 2.5 quality-contract loading), read `missions/plans/<slug>/integration-report.md` if present. If `overall: incorrect`, route findings using the same `priority`/`severity`/`confidence`/`complexity` fields as reviewer findings (simple → fixer, complex → task_create with `plan: activePlanSlug` and labels `review-fix`, `review-round:N`).
  - After any code-modifying remediation path (fixer run, complex task completion, reviewer findings, or failed-check remediation), rerun `integration-verifier` by spawning it, then reread the updated report.
  - Final merge-readiness requires the latest integration report to be `overall: correct` or `overall: skipped` (never `incorrect`).
  - All `task_create` calls for remediation tasks must include `plan: activePlanSlug` to preserve plan identity.
  - `overall: skipped` is treated as non-blocking — quality-manager does not fail or rerun for skipped reports.

**Contracts to enforce (from plan):**
- `activePlanSlug` := the only `plan:<slug>` label found across current tasks; zero or multiple → treat as skipped.
- Rerun trigger: every code-modifying remediation path, not just integration-originated ones.
- `task_create.plan = activePlanSlug` on all remediation tasks created in this loop.

<!-- AC:BEGIN -->
- [ ] #1 quality-manager.ts subagents array includes "integration-verifier"
- [ ] #2 quality-manager.md reads integration-report.md and routes I-### findings using reviewer-compatible priority/severity/confidence/complexity fields
- [ ] #3 quality-manager.md reruns integration-verifier after every code-modifying remediation path (fixer, complex tasks, reviewer findings, failed checks) — not only after integration-originated findings
- [ ] #4 quality-manager.md final merge-readiness check requires the latest integration report to be overall: correct or overall: skipped
- [ ] #5 quality-manager.md all task_create calls for remediation tasks pass plan: <activePlanSlug> to preserve plan identity
- [ ] #6 quality-manager.md treats overall: skipped as non-blocking (no rerun, no failure)
<!-- AC:END -->

## Implementation Notes

Completed AC #1-#6. Added integration-verifier to quality-manager subagents, extended the quality-manager prompt to load and route integration-report.md findings via reviewer-compatible fields, rerun integration-verifier after every code-modifying remediation path unless the latest report is skipped, require final overall correct/skipped integration state, and require plan: activePlanSlug on remediation task_create calls. Added prompt coverage in tests/prompts/quality-manager.test.ts and updated coding agent invariants test.
