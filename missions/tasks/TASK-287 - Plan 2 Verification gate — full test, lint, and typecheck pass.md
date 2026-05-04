---
id: TASK-287
title: 'Plan 2: Verification gate — full test, lint, and typecheck pass'
status: Done
priority: high
assignee: worker
labels:
  - testing
  - devops
  - 'plan:main-domain-and-cosmo-rename'
dependencies:
  - TASK-285
createdAt: '2026-05-04T20:22:26.380Z'
updatedAt: '2026-05-04T20:52:47.873Z'
---

## Description

**Implementation Order step 12.** Run `bun run test`, `bun run lint`, and `bun run typecheck` and verify all 13 QCs pass. This is the final gate before the plan can be marked complete.

QCs: QC-001 through QC-013

<!-- AC:BEGIN -->
- [ ] #1 bun run test passes with zero failures.
- [ ] #2 bun run lint passes with zero errors.
- [ ] #3 bun run typecheck passes with zero type errors.
- [ ] #4 QC-001 through QC-012 all individually pass (grep-targeted test runs confirm each criterion).
- [ ] #5 QC-013 (full suite) passes: bun run test && bun run lint && bun run typecheck
<!-- AC:END -->

## Implementation Notes

QC-001 through QC-012 targeted checks passed, including QC-006 grep and QC-010 envelope section check. QC-013 passed with exit code 0: bun run test && bun run lint && bun run typecheck. Committed verification fix as 2f292ac.

## Commands to run

```bash
bun run test && bun run lint && bun run typecheck
```

## QC checklist

- QC-001: `bun run test --grep 'main domain built-in discovery'`
- QC-002: `bun run test --grep 'coding cody rename complete'`
- QC-003: `bun run test --grep 'default routing main installed'`
- QC-004: `bun run test --grep 'default routing coding domain'`
- QC-005: `bun run test --grep 'no-domain guard fires after main built-in'`
- QC-006: `bash -c 'remaining=$(grep -rEn "[\"'\''](cosmo)[\"'\'']" cli/ lib/ bundled/coding/ tests/ domains/coding 2>/dev/null | grep -vE "resolveDefaultLead|--agent|migration|main/cosmo" | wc -l); test "$remaining" -eq 0'`
- QC-007: `bash -c 'test ! -d bundled/coding-minimal && bun run test --grep "coding-minimal retired"'`
- QC-008: `bun run test --grep 'session per-domain-leads'`
- QC-009: `bun run test --grep 'chain-runner cosmo migration'`
- QC-010: reviewer check — `bundled/coding/coding/drivers/templates/envelope.md` contains worker-discipline and report-format sections
- QC-011: `bun run test --grep 'main/cosmo tools none allowlist'`
- QC-012: `bun run test --grep 'main/cosmo allowlist excludes cody'`
- QC-013: `bun run test && bun run lint && bun run typecheck` (full suite)

## Acceptance

All 13 QCs must be green. If any fail, mark this task Blocked, capture the failing QC IDs in implementation notes, and route back to the relevant implementation task.

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
