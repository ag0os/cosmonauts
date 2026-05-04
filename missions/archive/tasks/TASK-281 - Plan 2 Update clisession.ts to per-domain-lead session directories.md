---
id: TASK-281
title: 'Plan 2: Update cli/session.ts to per-domain-lead session directories'
status: Done
priority: medium
assignee: worker
labels:
  - cli
  - backend
  - 'plan:main-domain-and-cosmo-rename'
dependencies:
  - TASK-264
  - TASK-266
createdAt: '2026-05-04T20:21:40.342Z'
updatedAt: '2026-05-04T20:39:32.619Z'
---

## Description

**Implementation Order step 6.** Replace the `def.id === "cosmo"` special-case in `cli/session.ts` (lines 516-525, 605-612) with the general per-domain-lead rule: any agent that is the lead of its domain gets `<sessionDir>/<def.domain>/`. Non-leads continue to use `<sessionDir>/<def.id>/`.

Decisions: D-P2-10
QCs: QC-008

<!-- AC:BEGIN -->
- [ ] #1 cli/session.ts no longer contains a def.id === "cosmo" check — the per-domain-lead rule (def.id === domainLead) is used instead.
- [ ] #2 main/cosmo session dir resolves to <sessionDir>/main/.
- [ ] #3 coding/cody session dir resolves to <sessionDir>/coding/.
- [ ] #4 Non-lead coding agents (e.g. coding/planner) resolve to <sessionDir>/planner/ (per-agent scoped).
- [ ] #5 tests/cli/session-per-domain-leads.test.ts passes covering all four cases and asserting no directory is shared between leads.
- [ ] #6 QC-008 passes.
<!-- AC:END -->

## Implementation Notes

Implemented per-domain lead session directory resolution in cli/session.ts using def.id === domainLead. Added tests/cli/session-per-domain-leads.test.ts for main/cosmo -> main, coding/cody -> coding, coding/planner -> planner, and coding/worker -> worker. Verified targeted session tests, QC-008 grep test, lint, and typecheck pass. Full bun run test currently fails in tests/prompts/loader.test.ts due unrelated stale cosmo prompt expectations from the coding/cody rename.

## File to Change

- EDIT `cli/session.ts:516-525, 605-612` — replace `def.id === "cosmo"` check with:

```ts
function resolveSessionDir(
  def: AgentDefinition,
  runtime: CosmonautsRuntime,
  cwd: string,
): string | undefined {
  const domainLead = runtime.domainRegistry.get(def.domain)?.manifest.lead;
  if (def.id === domainLead) {
    // Lead of its domain → unscoped per-domain session dir
    return join(piSessionDir(cwd), def.domain);
  }
  // Non-lead agents → per-agent scoped dir
  return join(piSessionDir(cwd), def.id);
}
```

## Expected directory mapping

| Agent | Session dir |
|---|---|
| `main/cosmo` (lead of "main") | `<sessionDir>/main/` |
| `coding/cody` (lead of "coding") | `<sessionDir>/coding/` |
| `coding/planner` (non-lead) | `<sessionDir>/planner/` |
| `coding/worker` (non-lead) | `<sessionDir>/worker/` |

No two agents must share a session directory.

## New test file

- `tests/cli/session-per-domain-leads.test.ts` — asserts the four cases above; asserts no directory is shared between leads.

## Cross-Plan Invariants

**P2-INV-1**: `main/cosmo` uses `tools: "none"`. Extension-registered tools come via the extensions union (`lib/orchestration/definition-resolution.ts:36-50`). Do NOT use `tools: "coding"`.

**P2-INV-2**: `main/cosmo.subagents` MUST NOT contain "coding/cody".

**P2-INV-3**: `coding/cody.subagents` MUST stay UNQUALIFIED. `tests/domains/coding-agents.test.ts:75-83` asserts this.

**P2-INV-4**: In `cli/session.ts`, replace the `def.id === "cosmo"` special-case with: if `def.id === domain.lead` for its domain, use `<sessionDir>/<def.domain>/` (e.g. `<sessionDir>/main/`, `<sessionDir>/coding/`). Non-lead agents continue to use the per-agent scoped directory. No two agents share a session dir.

**P2-INV-5**: TaskManager status literals are Title Case: "To Do", "In Progress", "Done", "Blocked". `implementationNotes` field, not `note`.

**P2-INV-6**: Slash-qualified agent IDs use SLASH form — `lib/agents/qualified-role.ts:8`.

**P2-INV-7**: `hasInstalledDomain` (`cli/main.ts:323`) must exclude both "shared" AND "main".

**P2-INV-8**: Chain-runner unknown-role rejection lives at `lib/orchestration/chain-runner.ts:635-650` (`prepareStageExecution`), NOT in chain-parser.

**P2-INV-9**: `bundled/coding-minimal/` is deleted entirely (directory + catalog entry at `lib/packages/catalog.ts:35-40`). No detection, no warning, no migration code.
