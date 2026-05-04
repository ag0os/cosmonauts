---
id: TASK-264
title: 'Plan 2: Create domains/main/ skeleton'
status: Done
priority: high
assignee: worker
labels:
  - domain
  - backend
  - 'plan:main-domain-and-cosmo-rename'
dependencies: []
createdAt: '2026-05-04T20:19:33.406Z'
updatedAt: '2026-05-04T20:40:10.077Z'
---

## Description

**Implementation Order step 1.** Land the new built-in `domains/main/` domain hosting the top-level executive assistant.

Decisions: D-P2-1, D-P2-3, D-P2-4, D-P2-7, D-P2-8, D-P2-9
QCs: QC-001, QC-011, QC-012

<!-- AC:BEGIN -->
- [ ] #1 domains/main/domain.ts exports DomainManifest with id: "main" and lead: "cosmo".
- [ ] #2 domains/main/agents/cosmo.ts has tools: "none", capabilities ["core", "tasks", "spawning", "todo", "fleet"] (no engineering-discipline), and subagents is a slash-qualified list of coding specialists that does NOT include "coding/cody".
- [ ] #3 domains/main/ is discovered by the runtime as a built-in domain (precedence 0, lib/runtime.ts:115-118) without any package install or config change.
- [ ] #4 The validator emits no errors for main/cosmo: fleet capability resolves; engineering-discipline is not referenced.
- [ ] #5 tests/domains/main-domain.test.ts passes: domain loads, main/cosmo resolves, fleet capability resolves, resolved tool allowlist contains only extension-registered tools (no read, bash, edit, write). Covers QC-001, QC-011, QC-012.
- [ ] #6 domains/main/prompts/cosmo.md describes the delegation pattern (spawn coding/planner, coding/worker etc. DIRECTLY — NOT through coding/cody) and includes graceful fleet-capability degradation if driver primitives are absent.
<!-- AC:END -->

## Implementation Notes

Verified required files exist on disk with ls. domains/main skeleton and tests are already present in HEAD commit cb9b565 (feat(TASK-264): create domains/main/ skeleton with main/cosmo agent). AC verification: bun run test tests/domains/main-domain.test.ts passes; bun run lint passes; bun run typecheck passes. Full bun run test has unrelated failures in tests/prompts/loader.test.ts for legacy bundled/coding/coding/prompts/cosmo.md expectations after the cody rename, outside TASK-264 scope.

## Files to Create

- `domains/main/domain.ts` — `DomainManifest` with `id: "main"`, `lead: "cosmo"`
- `domains/main/agents/cosmo.ts` — `tools: "none"`, `capabilities: ["core", "tasks", "spawning", "todo", "fleet"]` (no `engineering-discipline`), slash-qualified subagents EXCLUDING `"coding/cody"` (see P2-INV-1 and P2-INV-2)
- `domains/main/prompts/cosmo.md` — persona: cross-domain orchestrator; delegation pattern (spawn `coding/planner`, `coding/worker` etc. DIRECTLY — never route through `coding/cody`); graceful fleet degradation when driver primitives absent
- `domains/main/capabilities/fleet.md` — references `run_driver` + `watch_events`; instructs fallback to `chain_run`/`spawn_agent` if tools absent (D-P2-3)
- `domains/main/skills/dispatch/SKILL.md`
- `domains/main/skills/script-coordinator/SKILL.md`
- `domains/main/skills/fleet/SKILL.md`
- `domains/main/workflows.ts` — returns `[]`
- `tests/domains/main-domain.test.ts` (new test file)

## Integration seams

- Domain loading: `lib/runtime.ts:115-118` scans `builtinDomainsDir` (precedence 0)
- Capability resolution: `lib/domains/validator.ts:216-241`
- Tools resolution: `lib/orchestration/definition-resolution.ts:36-50` — `tools: "none"` + extensions union = only extension-registered tools
- Authorization: `domains/shared/extensions/orchestration/authorization.ts:15-18` — `isSubagentAllowed` accepts `"${domain}/${id}"` form

## Cross-Plan Invariants

**P2-INV-1**: `main/cosmo` uses `tools: "none"`. Extension-registered tools come via the extensions union (`lib/orchestration/definition-resolution.ts:36-50`). Do NOT use `tools: "coding"` — that grants read/edit/bash/write which contradicts the delegation-only role.

**P2-INV-2**: `main/cosmo.subagents` is a slash-qualified list of specialist IDs from the coding domain (e.g. "coding/planner"). It MUST NOT contain "coding/cody" — cosmo delegates directly to specialists; cody is the in-domain coordinator users get when invoking `cosmonauts -d coding`.

**P2-INV-3**: `coding/cody.subagents` MUST stay UNQUALIFIED within the coding domain ("planner", "worker", etc.) — `tests/domains/coding-agents.test.ts:75-83` asserts this.

**P2-INV-4**: In `cli/session.ts`, replace `def.id === "cosmo"` special-case with: if `def.id === domain.lead`, use `<sessionDir>/<def.domain>/`. Non-lead agents use `<sessionDir>/<def.id>/`.

**P2-INV-5**: TaskManager status literals are Title Case: "To Do", "In Progress", "Done", "Blocked". `implementationNotes` field, not `note`.

**P2-INV-6**: Slash-qualified agent IDs use SLASH form (e.g. "coding/planner") not dot form — `lib/agents/qualified-role.ts:8`.

**P2-INV-7**: `hasInstalledDomain` (`cli/main.ts:323`) must exclude both "shared" AND "main" — adding main as a built-in makes the predicate vacuously true otherwise.

**P2-INV-8**: Chain-runner unknown-role rejection lives at `lib/orchestration/chain-runner.ts:635-650` (`prepareStageExecution`), NOT in chain-parser.

**P2-INV-9**: `bundled/coding-minimal/` is deleted entirely (directory + catalog entry at `lib/packages/catalog.ts:35-40`). No detection, no warning, no migration code.
