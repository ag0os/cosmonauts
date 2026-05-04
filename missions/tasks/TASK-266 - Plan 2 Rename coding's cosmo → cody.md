---
id: TASK-266
title: 'Plan 2: Rename coding''s cosmo → cody'
status: Done
priority: high
assignee: worker
labels:
  - domain
  - backend
  - 'plan:main-domain-and-cosmo-rename'
dependencies: []
createdAt: '2026-05-04T20:19:51.454Z'
updatedAt: '2026-05-04T20:31:52.054Z'
---

## Description

**Implementation Order step 2.** Rename `bundled/coding/coding/agents/cosmo.ts` → `cody.ts` and `prompts/cosmo.md` → `cody.md`. Update `id`, `description`, route labels. Subagents list stays UNQUALIFIED. Update `domain.ts:lead`.

Decisions: D-P2-5
QCs: QC-002

<!-- AC:BEGIN -->
- [x] #1 bundled/coding/coding/agents/cosmo.ts and bundled/coding/coding/prompts/cosmo.md are deleted.
- [x] #2 bundled/coding/coding/agents/cody.ts exists with id: "cody" and all subagents entries are UNQUALIFIED (no slash prefix).
- [x] #3 bundled/coding/coding/prompts/cody.md exists, does NOT contain the string "You are Cosmo", and route labels previously named cosmo-facilitates-dialogue are renamed to cody-facilitates-dialogue.
- [x] #4 bundled/coding/coding/domain.ts declares lead: "cody".
- [x] #5 tests/coding-domain-rename.test.ts passes: coding domain validates after rename; coding/cody loads with unqualified subagents; tests/domains/coding-agents.test.ts:75-83 invariant continues to pass.
- [x] #6 QC-002 passes.
<!-- AC:END -->

## Implementation Notes

Renamed coding lead from cosmo to cody in be34694. Cody subagents remain unqualified. Verified with `bun run test --grep "coding-domain-rename"`, `bun run test --grep "coding cody rename complete"`, `bun run test tests/domains/coding-agents.test.ts`, `bun run lint`, and `bun run typecheck`.

## Files to Change

- RENAME `bundled/coding/coding/agents/cosmo.ts` → `cody.ts`: set `id: "cody"`, update description to identify as coding-domain coordinator. Keep subagents list UNQUALIFIED (no slash prefix — see P2-INV-3; the existing invariant test at `tests/domains/coding-agents.test.ts:75-83` asserts this).
- RENAME + REWRITE `bundled/coding/coding/prompts/cosmo.md` → `cody.md`: self-identifies as Cody. Must NOT contain "You are Cosmo". Rename route labels `cosmo-facilitates-dialogue` → `cody-facilitates-dialogue`.
- EDIT `bundled/coding/coding/domain.ts`: `lead: "cosmo"` → `lead: "cody"`.
- DELETE old `cosmo.ts` and `cosmo.md`.
- NEW `tests/coding-domain-rename.test.ts` — coding domain validates after rename; `coding/cody` loads; `tests/domains/coding-agents.test.ts:75-83` invariant continues to pass.

## Integration seams

- Cody's agent definition at `bundled/coding/coding/agents/cody.ts` should be structurally identical to the old `cosmo.ts` except for `id` and `description` — same `tools: "coding"`, same capabilities, same unqualified subagents.
- Authorization check at `domains/shared/extensions/orchestration/authorization.ts:15-18` accepts both unqualified ID and `${domain}/${id}` form — unqualified subagents in coding domain are valid.

## Cross-Plan Invariants

**P2-INV-1**: `main/cosmo` uses `tools: "none"`. Extension-registered tools come via the extensions union (`lib/orchestration/definition-resolution.ts:36-50`). Do NOT use `tools: "coding"` — that grants read/edit/bash/write which contradicts the delegation-only role.

**P2-INV-2**: `main/cosmo.subagents` MUST NOT contain "coding/cody".

**P2-INV-3**: `coding/cody.subagents` MUST stay UNQUALIFIED within the coding domain ("planner", "worker", etc.) — same-domain unqualified references are the existing convention. `tests/domains/coding-agents.test.ts:75-83` asserts this. Switching cody to qualified IDs would break that test.

**P2-INV-4**: In `cli/session.ts`, replace `def.id === "cosmo"` special-case with: if `def.id === domain.lead`, use `<sessionDir>/<def.domain>/`. Non-lead agents use `<sessionDir>/<def.id>/`.

**P2-INV-5**: TaskManager status literals are Title Case: "To Do", "In Progress", "Done", "Blocked". `implementationNotes` field, not `note`.

**P2-INV-6**: Slash-qualified agent IDs use SLASH form (e.g. "coding/planner") not dot form — `lib/agents/qualified-role.ts:8`.

**P2-INV-7**: `hasInstalledDomain` (`cli/main.ts:323`) must exclude both "shared" AND "main".

**P2-INV-8**: Chain-runner unknown-role rejection lives at `lib/orchestration/chain-runner.ts:635-650` (`prepareStageExecution`), NOT in chain-parser.

**P2-INV-9**: `bundled/coding-minimal/` is deleted entirely (directory + catalog entry at `lib/packages/catalog.ts:35-40`). No detection, no warning, no migration code.
