---
id: TASK-273
title: 'Plan 2: Ship coding-domain default driver envelope'
status: Done
priority: medium
assignee: worker
labels:
  - domain
  - backend
  - 'plan:main-domain-and-cosmo-rename'
dependencies:
  - TASK-266
createdAt: '2026-05-04T20:20:35.189Z'
updatedAt: '2026-05-04T20:32:38.108Z'
---

## Description

**Implementation Order step 9.** Create `bundled/coding/coding/drivers/templates/envelope.md` — the coding-domain default driver envelope, derived from the fallow-cleanup run's prompt header.

Decisions: D-P2-12
QCs: QC-010

<!-- AC:BEGIN -->
- [x] #1 bundled/coding/coding/drivers/templates/envelope.md exists.
- [x] #2 The file contains a repo-conventions section covering Bun, ESM, .ts imports, and lint/test/typecheck commands.
- [x] #3 The file contains a worker-discipline section covering: explore-first, TDD-if-marked, target pattern, no suppression removal without replacement, no commit/git-add, no missions/ or memory/ edits.
- [x] #4 The file contains a failure-protocol section: capture ~30 lines of stderr, distinguish own failures from pre-existing.
- [x] #5 The file contains a final-report-format section specifying fenced JSON output with OUTCOME-text fallback.
- [x] #6 QC-010 reviewer check passes.
<!-- AC:END -->

## Implementation Notes

Created bundled/coding/coding/drivers/templates/envelope.md with repo-conventions, worker-discipline, failure-protocol, and final-report-format sections. Verification: ls/rg content check passed; bun run lint and bun run typecheck passed. bun run test failed on pre-existing unrelated failures in tests/extensions/orchestration*.test.ts and tests/prompts/loader.test.ts (cosmo/cody rename expectations), not caused by the envelope change. Commit: 5401f0c feat(TASK-273): add coding-domain default driver envelope.

## File to Create

- `bundled/coding/coding/drivers/templates/envelope.md`

## Content requirements

The envelope must contain all of the following sections:

1. **Repo conventions** — Bun, ESM, `.ts` imports, lint/test/typecheck commands
2. **Worker discipline** — explore first; TDD if marked; target pattern; remove suppression; no commit; no `git add`; no `missions/` or `memory/` edits
3. **Failure protocol** — capture stderr ~30 lines; distinguish own failures vs pre-existing
4. **Final report format spec** — fenced JSON; OUTCOME-text fallback

This task depends on TASK-266 (rename cosmo → cody) because this file lives in the coding-domain bundle that is being updated in that step. The envelope should reference `cody` (not `cosmo`) where agent names appear.

## Cross-Plan Invariants

**P2-INV-1**: `main/cosmo` uses `tools: "none"`. Extension-registered tools come via the extensions union (`lib/orchestration/definition-resolution.ts:36-50`). Do NOT use `tools: "coding"`.

**P2-INV-2**: `main/cosmo.subagents` MUST NOT contain "coding/cody".

**P2-INV-3**: `coding/cody.subagents` MUST stay UNQUALIFIED. `tests/domains/coding-agents.test.ts:75-83` asserts this.

**P2-INV-4**: In `cli/session.ts`, replace `def.id === "cosmo"` with per-domain-lead rule.

**P2-INV-5**: TaskManager status literals are Title Case: "To Do", "In Progress", "Done", "Blocked". `implementationNotes` field, not `note`.

**P2-INV-6**: Slash-qualified agent IDs use SLASH form — `lib/agents/qualified-role.ts:8`.

**P2-INV-7**: `hasInstalledDomain` (`cli/main.ts:323`) must exclude both "shared" AND "main".

**P2-INV-8**: Chain-runner unknown-role rejection lives at `lib/orchestration/chain-runner.ts:635-650` (`prepareStageExecution`), NOT in chain-parser.

**P2-INV-9**: `bundled/coding-minimal/` is deleted entirely (directory + catalog entry at `lib/packages/catalog.ts:35-40`). No detection, no warning, no migration code.
