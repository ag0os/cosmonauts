---
id: TASK-283
title: 'Plan 2: Update AGENTS.md and README.md for new agent layout'
status: Done
priority: low
assignee: worker
labels:
  - backend
  - 'plan:main-domain-and-cosmo-rename'
dependencies:
  - TASK-264
  - TASK-266
createdAt: '2026-05-04T20:21:55.240Z'
updatedAt: '2026-05-04T20:42:30.584Z'
---

## Description

**Implementation Order step 10.** Update `AGENTS.md` and `README.md` to reflect the new two-domain layout: `domains/shared/` and `domains/main/` as built-ins, `bundled/coding/` as the coding domain, and the cosmo → cody rename.

QCs: (documentation completeness — supports QC-013 overall pass)

<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md lists both domains/shared/ and domains/main/ as built-in domains and contains no references to coding-minimal.
- [ ] #2 AGENTS.md documents cosmo as cross-domain orchestrator (domains/main/) and cody as coding-domain coordinator (bundled/coding/).
- [ ] #3 README.md usage examples show: cosmonauts (no args) routes to main/cosmo; cosmonauts -d coding routes to coding/cody; no coding-minimal install instructions.
- [ ] #4 The --list-agents output (cli/tasks/commands/list.ts or equivalent) uses qualified IDs (main/cosmo, coding/cody) to disambiguate agents across domains.
<!-- AC:END -->

## Implementation Notes

Updated AGENTS.md and README.md for domains/shared, domains/main, main/cosmo, and coding/cody. Updated cli/main.ts --list-agents to render qualified IDs. Verified grep -c coding-minimal returns 0 for AGENTS.md and README.md; bun run test tests/cli/main.test.ts, bun run typecheck, and bun run lint pass. Commit: 98b486a.

## Files to Change

- EDIT `AGENTS.md`:
  - `domains/` section: list `shared/` AND `main/` as built-in domains
  - Remove all references to `coding-minimal`
  - Document `cosmo` as the executive assistant in `domains/main/` (top-level, cross-domain)
  - Document `cody` as the coding-domain coordinator in `bundled/coding/`
  - Update the agent list to show qualified IDs (`main/cosmo`, `coding/cody`, etc.)

- EDIT `README.md`:
  - Update usage examples: `cosmonauts` (no args) → routes to `main/cosmo`; `cosmonauts -a cody` or `cosmonauts -d coding` → routes to `coding/cody`
  - Remove any reference to the old `cosmo` being the coding coordinator
  - Remove `coding-minimal` installation instructions

- EDIT `cli/tasks/commands/list.ts` (or wherever `--list-agents` output is generated): disambiguate by qualified ID when multiple domains share an unqualified agent name.

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
