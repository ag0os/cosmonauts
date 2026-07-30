---
id: TASK-541
title: Delete the legacy Detected Analysis Tools bridge
status: To Do
priority: high
labels:
  - 'plan:analysis-gate-rewiring'
  - backend
dependencies:
  - TASK-538
  - TASK-539
  - TASK-540
createdAt: '2026-07-30T16:29:50.584Z'
updatedAt: '2026-07-30T16:29:50.584Z'
---

## Description

Stage 5 of `missions/plans/analysis-gate-rewiring/plan.md`. Delete the
legacy prose injection now that every consumer reads the capability
surface. This is the irreversible step and it is deliberately last.

The plan's ordering rule: the injection goes with its consumers, not
before and not after. It must NOT land before the Quality Manager,
Verifier, Fixer, and migration-sweep rewiring are done — a stranded prompt
with no analysis block is a silent gate window. A double surface (the
injection present but unread) is the recoverable intermediate state. If
this task cannot complete, REVERT the deletion rather than shipping half.

Scope: the injection builder in
`domains/shared/extensions/project-tools/index.ts`, its assertions in
`tests/extensions/project-tools.test.ts`, and the shipped-skill links to
the deleted provider skill in `docs/fallow.md`,
`docs/fallow-workflow-integration.md`, and `docs/fallow-exceptions.md`.
The provider documentation content itself stays; provider docs and
provider runtime source remain excluded from INV-1 content scans.

Do not touch the runtime contract, adapter, runner, or tool schemas —
those belong to `analysis-capability-runtime`. The D-018 capability status
injection that replaced this block must keep working.

Gate kinds: `correctness` (hard fail), `dead-code` (bound). This deletion
is migration-shaped: pair the bound capability with the explicit
old-string search. Record the commit HEAD at task start; that SHA is the
changed-scope base for any audit at task close.


<!-- AC:BEGIN -->
- [ ] #1 The `## Detected Analysis Tools` prose block is no longer built or injected by `domains/shared/extensions/project-tools/index.ts`.
- [ ] #2 An explicit repository-wide search for the string `Detected Analysis Tools` and for the injection's builder finds no remaining reference in runtime source, prompts, skills, tests, or docs.
- [ ] #3 The five existing `tests/extensions/project-tools.test.ts` assertions about the injected block are removed or replaced by assertions on the capability status injection; none is left asserting the deleted block's presence.
- [ ] #4 The D-018 capability status injection at `before_agent_start` still injects the seven capability rows and its tests pass.
- [ ] #5 Links to the deleted `bundled/coding/skills/fallow/` skill are removed from `docs/fallow.md`, `docs/fallow-workflow-integration.md`, and `docs/fallow-exceptions.md`, while the provider documentation content itself is retained.
- [ ] #6 No shipped prompt or skill is left referencing an analysis surface that no longer exists, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
