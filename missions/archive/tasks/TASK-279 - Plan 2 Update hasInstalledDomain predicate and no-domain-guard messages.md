---
id: TASK-279
title: 'Plan 2: Update hasInstalledDomain predicate and no-domain-guard messages'
status: Done
priority: medium
assignee: worker
labels:
  - cli
  - backend
  - 'plan:main-domain-and-cosmo-rename'
dependencies:
  - TASK-277
createdAt: '2026-05-04T20:21:25.393Z'
updatedAt: '2026-05-04T20:40:32.493Z'
---

## Description

**Implementation Order step 5.** Update `hasInstalledDomain` at `cli/main.ts:323` to exclude both `"shared"` and `"main"` from the check. Update the no-domain-guard message copy to drop the `coding-minimal` reference.

Decisions: D-P2-11
QCs: QC-005

<!-- AC:BEGIN -->
- [ ] #1 hasInstalledDomain at cli/main.ts:323 excludes both "shared" and "main" from its domain check.
- [ ] #2 The no-domain-guard message in cli/main.ts does not mention coding-minimal.
- [ ] #3 tests/cli/no-domain-guard.test.ts passes: guard fires when only shared+main installed; guard does NOT fire with coding domain present; message contains no coding-minimal reference.
- [ ] #4 QC-005 passes: bun run test --grep 'no-domain guard fires after main built-in'
<!-- AC:END -->

## Implementation Notes

Implemented in commit bde8f4f. hasInstalledDomain excludes shared/main and is exported for the new no-domain guard regression tests. Removed coding-minimal from cli/main.ts guard copy. Verified: bun run test --grep "no-domain guard"; bun run test --grep "no-domain guard fires after main built-in"; bun run typecheck; Biome check for cli/main.ts and tests/cli/no-domain-guard.test.ts. Full bun run lint is blocked by unrelated pre-existing formatting issues in lib/agents/resolve-default-lead.ts, tests/cli/resolve-default-lead.test.ts, and tests/cli/session-per-domain-leads.test.ts.

## Files to Change

- EDIT `cli/main.ts:323` — `hasInstalledDomain`:
  ```ts
  function hasInstalledDomain(runtime: CosmonautsRuntime): boolean {
    return runtime.domains.some(
      (d) => !["shared", "main"].includes(d.manifest.id),
    );
  }
  ```
- EDIT the no-domain-guard message body in `cli/main.ts` (wherever it appears) to remove the `install coding-minimal` line. The message should guide users to install a real domain package.

## Why this depends on TASK-277

Both changes are in `cli/main.ts`. Sequencing after the resolveDefaultLead wiring (TASK-277) avoids merge-conflict churn on the same file.

## Why `main` must be excluded (P2-INV-7)

Without excluding `"main"`, `hasInstalledDomain` always returns `true` once the `domains/main/` built-in is registered — suppressing the no-domain-guard for fresh installs that have only built-in domains and no user-installed coding/domain package.

## New test

- Extend `tests/cli/no-domain-guard.test.ts`: guard fires when only `"shared"` + `"main"` are installed; guard does NOT fire when a real domain (e.g. `"coding"`) is installed; no-domain guard message does not mention `coding-minimal`.

## Cross-Plan Invariants

**P2-INV-1**: `main/cosmo` uses `tools: "none"`. Extension-registered tools come via the extensions union (`lib/orchestration/definition-resolution.ts:36-50`). Do NOT use `tools: "coding"`.

**P2-INV-2**: `main/cosmo.subagents` MUST NOT contain "coding/cody".

**P2-INV-3**: `coding/cody.subagents` MUST stay UNQUALIFIED. `tests/domains/coding-agents.test.ts:75-83` asserts this.

**P2-INV-4**: In `cli/session.ts`, replace `def.id === "cosmo"` with per-domain-lead rule.

**P2-INV-5**: TaskManager status literals are Title Case: "To Do", "In Progress", "Done", "Blocked". `implementationNotes` field, not `note`.

**P2-INV-6**: Slash-qualified agent IDs use SLASH form — `lib/agents/qualified-role.ts:8`.

**P2-INV-7**: `hasInstalledDomain` (`cli/main.ts:323`) must exclude both "shared" AND "main" — adding main as a built-in makes the predicate vacuously true otherwise, suppressing the no-domain-guard.

**P2-INV-8**: Chain-runner unknown-role rejection lives at `lib/orchestration/chain-runner.ts:635-650` (`prepareStageExecution`), NOT in chain-parser.

**P2-INV-9**: `bundled/coding-minimal/` is deleted entirely (directory + catalog entry at `lib/packages/catalog.ts:35-40`). No detection, no warning, no migration code.
