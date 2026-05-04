---
id: TASK-271
title: 'Plan 2: Migrate tests/prompts/cosmo.test.ts → cody.test.ts'
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:main-domain-and-cosmo-rename'
dependencies:
  - TASK-266
createdAt: '2026-05-04T20:20:21.421Z'
updatedAt: '2026-05-04T20:31:16.314Z'
---

## Description

**Implementation Order step 3.** Rename `tests/prompts/cosmo.test.ts` → `tests/prompts/cody.test.ts` and update its assertions to validate the renamed prompt file at the new path with the new identity.

QCs: QC-002 (partial — cody.md identity assertions)

<!-- AC:BEGIN -->
- [ ] #1 tests/prompts/cosmo.test.ts is deleted.
- [ ] #2 tests/prompts/cody.test.ts exists and all tests pass.
- [ ] #3 The test asserts that bundled/coding/coding/prompts/cody.md does NOT contain the string "You are Cosmo".
- [ ] #4 The test asserts that cody.md self-identifies as Cody (not Cosmo).
- [ ] #5 bun run test --grep 'cody prompt' passes (or equivalent grep matching the new test suite name).
<!-- AC:END -->

## Implementation Notes

Implemented and committed as 4d89851 (`feat(TASK-271): migrate cosmo.test.ts → cody.test.ts`). Verified `bun run test --grep "cody prompt"`, `test ! -f tests/prompts/cosmo.test.ts`, `bun run typecheck`, and `bunx biome check tests/prompts/cody.test.ts`. Full `bun run lint` currently fails on an unrelated pre-existing formatting issue in tests/coding-domain-rename.test.ts.

## Files to Change

- RENAME `tests/prompts/cosmo.test.ts` → `tests/prompts/cody.test.ts`
- UPDATE test logic: assert `cody.md` (new path), assert prompt does NOT contain "You are Cosmo", assert prompt self-identifies as Cody
- DELETE `tests/prompts/cosmo.test.ts`

## Context

This task depends on TASK-266 (rename coding's cosmo → cody), which creates `bundled/coding/coding/prompts/cody.md`. The test should target that file. The plan also notes that `tests/cli/dump-prompt.test.ts` will be extended separately (step 4) to assert `--dump-prompt -a cody` works end-to-end.

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
