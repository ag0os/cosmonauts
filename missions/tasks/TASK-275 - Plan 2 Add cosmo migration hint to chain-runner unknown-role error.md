---
id: TASK-275
title: 'Plan 2: Add cosmo migration hint to chain-runner unknown-role error'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:main-domain-and-cosmo-rename'
dependencies:
  - TASK-266
createdAt: '2026-05-04T20:20:52.058Z'
updatedAt: '2026-05-04T20:34:34.180Z'
---

## Description

**Implementation Order step 8.** Update `lib/orchestration/chain-runner.ts:prepareStageExecution` (lines 635-650) to append a migration hint to the error message when the unresolved stage role is `"cosmo"`.

Decisions: D-P2-13
QCs: QC-009

<!-- AC:BEGIN -->
- [ ] #1 lib/orchestration/chain-runner.ts:prepareStageExecution appends the migration hint when stage.name === "cosmo" and the role cannot be resolved.
- [ ] #2 The error message contains both substrings "main/cosmo" and "coding/cody" when triggered.
- [ ] #3 Existing tests at tests/orchestration/chain-runner.test.ts:180,1418 still pass (the base message format is preserved; hint is appended).
- [ ] #4 tests/orchestration/chain-runner-cosmo-migration.test.ts passes (new test verifying the hint on a chain with a cosmo stage role).
- [ ] #5 No hint logic was added to chain-parser — the change is exclusively in prepareStageExecution.
- [ ] #6 QC-009 passes.
<!-- AC:END -->

## Implementation Notes

Implemented in commit 44f1a78.

Verification:
- bun run test tests/orchestration/chain-runner.test.ts
- bun run test tests/orchestration/chain-runner-cosmo-migration.test.ts
- bun run test --grep 'chain-runner cosmo migration'
- bun run lint
- bun run typecheck

## File to Change

- `lib/orchestration/chain-runner.ts` (lines 635-650, `prepareStageExecution`)

## Change Description

At the existing unknown-role rejection point:

```ts
if (!definition) {
  const baseMsg = `Unknown agent role "${stage.name}"`;
  const hint = stage.name === "cosmo"
    ? " — did you mean 'main/cosmo' (cross-domain assistant) or 'coding/cody' (coding-domain lead)? See migration notes in docs/designs/executive-assistant.md."
    : "";
  throw new Error(baseMsg + hint);
}
```

Detection condition: `stage.name === "cosmo"` (exact string match only — no fuzzy matching).

The change augments the existing error message; it does NOT restructure the error flow, change the throw, or add any recovery path.

## Existing tests

Existing tests at `tests/orchestration/chain-runner.test.ts:180,1418` assert the current message format. The migration hint augments the message — verify the existing tests still pass after the change (they assert on the base message; the hint is appended).

## New test file

- `tests/orchestration/chain-runner-cosmo-migration.test.ts` — asserts that a chain with stage role `"cosmo"` raises an error whose message contains BOTH `"main/cosmo"` AND `"coding/cody"` substrings.

## IMPORTANT: Error lives in chain-runner, NOT chain-parser

The plan's decision log D-P2-13 explicitly notes that chain-parser does NOT reject unknown roles — that happens only in `prepareStageExecution`. Do not add any hint logic to chain-parser. See P2-INV-8.

## Cross-Plan Invariants

**P2-INV-1**: `main/cosmo` uses `tools: "none"`. Extension-registered tools come via the extensions union (`lib/orchestration/definition-resolution.ts:36-50`). Do NOT use `tools: "coding"`.

**P2-INV-2**: `main/cosmo.subagents` MUST NOT contain "coding/cody".

**P2-INV-3**: `coding/cody.subagents` MUST stay UNQUALIFIED. `tests/domains/coding-agents.test.ts:75-83` asserts this.

**P2-INV-4**: In `cli/session.ts`, replace `def.id === "cosmo"` with per-domain-lead rule.

**P2-INV-5**: TaskManager status literals are Title Case: "To Do", "In Progress", "Done", "Blocked". `implementationNotes` field, not `note`.

**P2-INV-6**: Slash-qualified agent IDs use SLASH form — `lib/agents/qualified-role.ts:8`.

**P2-INV-7**: `hasInstalledDomain` (`cli/main.ts:323`) must exclude both "shared" AND "main".

**P2-INV-8**: Chain-runner unknown-role rejection lives at `lib/orchestration/chain-runner.ts:635-650` (`prepareStageExecution`), NOT in chain-parser. The migration hint for unresolved `cosmo` stage role appends to that error.

**P2-INV-9**: `bundled/coding-minimal/` is deleted entirely (directory + catalog entry at `lib/packages/catalog.ts:35-40`). No detection, no warning, no migration code.
