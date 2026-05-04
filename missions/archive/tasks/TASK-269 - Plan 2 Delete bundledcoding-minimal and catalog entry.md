---
id: TASK-269
title: 'Plan 2: Delete bundled/coding-minimal/ and catalog entry'
status: Done
priority: medium
assignee: worker
labels:
  - devops
  - backend
  - 'plan:main-domain-and-cosmo-rename'
dependencies: []
createdAt: '2026-05-04T20:20:05.077Z'
updatedAt: '2026-05-04T20:28:46.679Z'
---

## Description

**Implementation Order step 7.** Delete the entire `bundled/coding-minimal/` directory and remove the corresponding entry from `lib/packages/catalog.ts:35-40`. No detection code, no warnings, no migration, no `--ignore` flags.

Decisions: D-P2-6
QCs: QC-007

<!-- AC:BEGIN -->
- [x] #1 bundled/coding-minimal/ directory does not exist on disk.
- [x] #2 lib/packages/catalog.ts contains no entry referencing coding-minimal.
- [x] #3 No detection, warning, migration code, or --ignore flag was added anywhere in the codebase.
- [x] #4 tests/packages/catalog.test.ts passes and asserts coding-minimal is not present in the catalog.
- [x] #5 QC-007 passes: bash -c 'test ! -d bundled/coding-minimal && bun run test --grep "coding-minimal retired"'
<!-- AC:END -->

## Implementation Notes

Deleted bundled/coding-minimal/, removed the bundled catalog entry, and updated catalog tests with the coding-minimal retired assertion. Verified with bun run test --grep "coding-minimal", QC-007, bun run test, bun run lint, and bun run typecheck. Commit: fc90f99.

## Files to Change

- DELETE `bundled/coding-minimal/` (entire directory tree — every file inside)
- EDIT `lib/packages/catalog.ts`: remove the `coding-minimal` entry (around lines 35-40)
- EXTEND `tests/packages/catalog.test.ts`: add/update assertion that `coding-minimal` is not listed in the catalog

## What NOT to do

Do NOT add any of the following:
- Runtime detection of pre-installed `coding-minimal` packages
- Warning messages about `coding-minimal`
- A migration path or removal command
- An `--ignore` flag
- Auto-migration code

Pre-installed copies on user machines are the user's problem (Q8 user-confirmed: nobody is using this package).

## Cross-Plan Invariants

**P2-INV-1**: `main/cosmo` uses `tools: "none"`. Extension-registered tools come via the extensions union (`lib/orchestration/definition-resolution.ts:36-50`). Do NOT use `tools: "coding"`.

**P2-INV-2**: `main/cosmo.subagents` MUST NOT contain "coding/cody".

**P2-INV-3**: `coding/cody.subagents` MUST stay UNQUALIFIED. `tests/domains/coding-agents.test.ts:75-83` asserts this.

**P2-INV-4**: In `cli/session.ts`, replace `def.id === "cosmo"` with per-domain-lead rule.

**P2-INV-5**: TaskManager status literals are Title Case: "To Do", "In Progress", "Done", "Blocked". `implementationNotes` field, not `note`.

**P2-INV-6**: Slash-qualified agent IDs use SLASH form — `lib/agents/qualified-role.ts:8`.

**P2-INV-7**: `hasInstalledDomain` (`cli/main.ts:323`) must exclude both "shared" AND "main".

**P2-INV-8**: Chain-runner unknown-role rejection lives at `lib/orchestration/chain-runner.ts:635-650` (`prepareStageExecution`), NOT in chain-parser.

**P2-INV-9**: `bundled/coding-minimal/` is deleted entirely (directory + catalog entry at `lib/packages/catalog.ts:35-40`). No detection, no warning, no migration code. Do not add `--ignore` flags or auto-migration.
