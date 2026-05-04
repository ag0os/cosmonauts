---
id: TASK-277
title: 'Plan 2: Add resolveDefaultLead helper and wire three CLI sites'
status: Done
priority: high
assignee: worker
labels:
  - cli
  - backend
  - 'plan:main-domain-and-cosmo-rename'
dependencies:
  - TASK-264
  - TASK-266
createdAt: '2026-05-04T20:21:10.912Z'
updatedAt: '2026-05-04T20:41:20.218Z'
---

## Description

**Implementation Order step 4.** Introduce `resolveDefaultLead(runtime, options)` and replace the three hardcoded `"cosmo"` sites in `cli/main.ts` with calls to it.

Decisions: D-P2-2
QCs: QC-003, QC-004

<!-- AC:BEGIN -->
- [ ] #1 resolveDefaultLead helper exists (as lib/agents/resolve-default-lead.ts or inlined in cli/main.ts) and implements all four branches: agent flag, domainContext, main domain fallback, first non-shared/main domain fallback.
- [ ] #2 cli/main.ts lines 430, 478, 645/651 no longer hardcode the string "cosmo" — all call resolveDefaultLead.
- [ ] #3 tests/cli/resolve-default-lead.test.ts passes covering all resolver branches.
- [ ] #4 QC-003 passes: default routing with main+coding installed routes to main/cosmo.
- [ ] #5 QC-004 passes: -d coding (no agent flag) routes to coding/cody.
- [ ] #6 tests/cli/dump-prompt.test.ts passes: --dump-prompt (no args) → main/cosmo; -a cody → cody; cody.md does NOT contain "You are Cosmo".
<!-- AC:END -->

## Implementation Notes

Implemented resolveDefaultLead and wired the three cli/main.ts call sites. Added tests/cli/resolve-default-lead.test.ts for all resolver branches and tests/cli/dump-prompt.test.ts for main/cosmo default and explicit cody. Verification passed: targeted CLI tests, bun run typecheck, bun run lint. Commit: ef32869.

## Files to Change / Create

- NEW (or inline): `lib/agents/resolve-default-lead.ts` — the `resolveDefaultLead` helper
- EDIT `cli/main.ts`:
  - Line 430 (`handleDumpPrompt`): replace `"cosmo"` with `resolveDefaultLead(runtime, options)`
  - Line 478 (`handleInitMode`): replace `"cosmo"` with `resolveDefaultLead(runtime, options)`
  - Lines 645/651 (`resolveCliAgent`): replace `"cosmo"` with `resolveDefaultLead(runtime, options)`

## Helper contract

```ts
function resolveDefaultLead(
  runtime: CosmonautsRuntime,
  options: CliOptions,
): AgentDefinition {
  if (options.agent) {
    return runtime.agentRegistry.resolve(options.agent, runtime.domainContext);
  }
  if (runtime.domainContext) {
    const lead = runtime.domainRegistry.get(runtime.domainContext)?.manifest.lead;
    if (lead) return runtime.agentRegistry.resolve(lead, runtime.domainContext);
    throw new Error(`Domain "${runtime.domainContext}" has no lead agent`);
  }
  const mainLead = runtime.domainRegistry.get("main")?.manifest.lead;
  if (mainLead) return runtime.agentRegistry.resolve(mainLead, "main");
  const fallback = runtime.domains.find(
    (d) => !["shared", "main"].includes(d.manifest.id) && d.manifest.lead,
  );
  if (fallback) {
    return runtime.agentRegistry.resolve(fallback.manifest.lead!, fallback.manifest.id);
  }
  throw new Error("No domain with a lead agent installed");
}
```

## New test files

- `tests/cli/resolve-default-lead.test.ts` — all branches: no-agent-flag+main-domain → main/cosmo; no-agent-flag+domainContext → domain lead; no-agent-flag+no-main+fallback-domain → fallback lead; no-domain → error
- Extend `tests/cli/main.test.ts`: default routing scenarios; `-a cody` flag; `-d coding` context
- Extend `tests/cli/dump-prompt.test.ts`: `--dump-prompt` (no args) → main/cosmo; `--dump-prompt -a cody` → cody; cody.md does NOT contain "You are Cosmo"

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
