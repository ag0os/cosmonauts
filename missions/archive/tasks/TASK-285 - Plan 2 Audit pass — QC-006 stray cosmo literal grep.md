---
id: TASK-285
title: 'Plan 2: Audit pass — QC-006 stray cosmo literal grep'
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:main-domain-and-cosmo-rename'
dependencies:
  - TASK-264
  - TASK-266
  - TASK-269
  - TASK-271
  - TASK-273
  - TASK-275
  - TASK-277
  - TASK-279
  - TASK-281
  - TASK-283
createdAt: '2026-05-04T20:22:12.586Z'
updatedAt: '2026-05-04T20:51:54.005Z'
---

## Description

**Implementation Order step 11.** Run a broad grep across `cli/`, `lib/`, `bundled/coding/`, `domains/`, and `tests/` to verify no stray `"cosmo"` agent string literals remain outside the permitted locations.

QCs: QC-006

<!-- AC:BEGIN -->
- [ ] #1 QC-006 grep returns zero matches: no stray "cosmo" string literal in cli/, lib/, bundled/coding/, tests/ outside the four permitted locations (resolveDefaultLead, --agent help text, chain-runner migration hint, domains/main/).
- [ ] #2 bundled/coding/coding/agents/cosmo.ts does not exist.
- [ ] #3 bundled/coding/coding/prompts/cosmo.md does not exist.
- [ ] #4 cli/session.ts contains no def.id === "cosmo" literal.
- [ ] #5 No source file in any directory references bundled/coding-minimal.
<!-- AC:END -->

## Implementation Notes

Committed 2230ffe feat(TASK-285): QC-006 audit pass — zero stray cosmo literals. QC-006 grep returns zero stray matches; AC2-AC5 and cross-plan invariants pass. Verified with bun run test, bun run lint, and bun run typecheck.

## What to verify

Run the QC-006 command:
```bash
bash -c 'remaining=$(grep -rEn "[\"'\''](cosmo)[\"'\'']" cli/ lib/ bundled/coding/ tests/ domains/coding 2>/dev/null | grep -vE "resolveDefaultLead|--agent|migration|main/cosmo" | wc -l); test "$remaining" -eq 0'
```

The only permitted locations for `"cosmo"` as a string literal are:
- (a) The `resolveDefaultLead` helper — looking up the `"main"` domain lead
- (b) The `--agent` CLI help text — documenting `--agent cosmo` as an example
- (c) The chain-runner migration-hint error message — `"coding/cody"` / `"main/cosmo"` migration text
- (d) `domains/main/` — legitimate references to the new cosmo agent definition itself

If any stray reference is found outside these locations, file it as a blocker and fix before the verification gate task.

## Also verify

- No reference to `bundled/coding-minimal` in any source file (all dirs)
- `bundled/coding/coding/agents/cosmo.ts` does not exist
- `bundled/coding/coding/prompts/cosmo.md` does not exist
- `cli/session.ts` does not contain `def.id === "cosmo"`

## Acceptance

This task is purely a verification/audit step. If findings are clean, mark Done. If blockers are found, document them in implementation notes and mark this task Blocked (do NOT mark Done until clean).

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
