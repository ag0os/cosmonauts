---
title: Main Domain and Cosmo Rename — top-level cross-domain assistant
status: active
createdAt: '2026-04-30T17:23:00.988Z'
updatedAt: '2026-05-04T16:31:54.152Z'
---

## Summary

Introduce the cross-domain executive assistant as the new top-level cosmonauts agent. Create the `domains/main/` built-in domain hosting the new `cosmo` agent. Rename the existing coding-domain `cosmo` to `cody` (with rewritten persona and migrated tests). Delete `bundled/coding-minimal/` (no migration — nobody uses it). Ship the coding-domain default driver envelope. Update CLI default-agent routing across every call site that currently hardcodes `"cosmo"`. Adopt **per-domain session directories** so multiple domain leads can coexist without history bleed-through. No driver mechanics; no external backends; no CLI verbs added — those are Plans 1 and 3.

## Distillation reference

Plan 2 lands the persona half of `docs/designs/executive-assistant.md` Part 1. Plan 1 ships the driver primitives the new cosmo uses. Plan 3 adds external backends + CLI verb. Plan 2 ships the coding-domain envelope (Q5).

## Revision history

This plan was revised twice after adversarial reviews. The first review (8 findings) drove the initial revision; the second review (`missions/plans/main-domain-and-cosmo-rename/review.md`, 7 findings) drove this third revision. Key changes from the second revision:

- **Q6 A — per-domain unscoped session directories.** Instead of `def.id === "cosmo"` or "lead of any domain", each domain lead gets `<sessionDir>/<domain>/` (e.g., `<sessionDir>/main/`, `<sessionDir>/coding/`). No bleed.
- **Q7 A — cosmo delegates directly to specialists; cody is NOT in cosmo's allowlist.** Cody is the in-domain coordinator users get when invoking `cosmonauts -d coding`.
- **Q8 — no `coding-minimal` migration.** Just delete the bundled directory and catalog entry. No detection, no warnings, no removal command. Risk text simplified.
- **Migration error moved from chain-parser to chain-runner.** `prepareStageExecution` at `lib/orchestration/chain-runner.ts:635-650` is the actual unknown-role rejection point.
- **`main/cosmo` gets `tools: "none"`** — extension tools come via the extensions union; main/cosmo doesn't need read/edit/bash/write.
- **Cody's subagents stay unqualified** within the coding domain (matches `tests/domains/coding-agents.test.ts:75-83` invariant).
- **QC-006 grep scope widened** to cover all required directories and quote styles.

## Scope

Included:
- New built-in domain `domains/main/`: `domain.ts`, `agents/cosmo.ts`, `prompts/cosmo.md`, `skills/{dispatch,script-coordinator,fleet}/SKILL.md`, `capabilities/fleet.md`, `workflows.ts`.
- **`main/cosmo` with `tools: "none"`** and capabilities `["core", "tasks", "spawning", "todo", "fleet"]`. No `engineering-discipline`. Subagents are slash-qualified specialist IDs from coding (NOT including `coding/cody`).
- **Rename `bundled/coding/coding/agents/cosmo.ts` → `agents/cody.ts`** (`id: "cody"`). Subagents stay UNQUALIFIED (`"planner"`, `"worker"`, etc.) — matches the coding-domain invariant test.
- **Rewrite `prompts/cosmo.md` → `prompts/cody.md`** to self-identify as Cody. Rename `cosmo-facilitates-dialogue` route labels to `cody-facilitates-dialogue`. Update `bundled/coding/coding/domain.ts` lead from `"cosmo"` to `"cody"`.
- **Delete `bundled/coding-minimal/`** entirely (the directory and the catalog entry at `lib/packages/catalog.ts:35-40`). No detection, no migration, no warning. The package was unused.
- **Ship coding-domain default driver envelope** at `bundled/coding/coding/drivers/templates/envelope.md`.
- Update CLI default-agent resolution: `resolveDefaultLead(runtime, options)` replaces hardcoded `"cosmo"` at all three sites: `cli/main.ts:430` (handleDumpPrompt), `cli/main.ts:478` (handleInitMode), `cli/main.ts:645/651` (resolveCliAgent).
- Update `hasInstalledDomain` predicate (`cli/main.ts:323`) to exclude both `shared` and `main`.
- **Per-domain unscoped session directories** in `cli/session.ts`: replace the `def.id === "cosmo"` special-case with `<sessionDir>/<def.domain>/` for any agent that is its domain's lead. Non-lead agents continue to use the per-agent scoped directory.
- **Custom workflow chain migration**: when `prepareStageExecution` (`lib/orchestration/chain-runner.ts:635-650`) encounters a stage role of `cosmo` and cannot resolve it, raise a structured error with migration hint pointing at `main/cosmo` or `coding/cody`.
- Update `AGENTS.md`, `README.md`, `--list-agents` output for the new layout.
- Tests: domain loading, rename completeness with the existing coding-agent invariant test passing, default-lead branches, per-domain session dirs, dump-prompt for both agents, cody prompt does not say "You are Cosmo", chain-runner migration-hint error, broad rename-leftovers grep.

Excluded:
- Driver primitive (`lib/driver/`) — Plan 1.
- External backends and `cosmonauts drive` CLI verb — Plan 3.
- Daemon mode, peer dialogue, durable inboxes, specialist agents under `domains/main/` — design doc Part 2.
- Any handling of pre-installed `coding-minimal` packages (Q8: not our concern).

Assumptions:
- `domains/main/` is a *built-in* domain (precedence 0), like `domains/shared/`. Verified at `lib/runtime.ts:115-118`.
- `coding-minimal` package is not in active use (Q8 user-confirmed).
- Plan 1 has either landed or will land before users invoke fleet capability; persona degrades gracefully if absent.

## Decision Log (plan-internal)

- **D-P2-1 — Where does the main domain live?**
  - Decision: Built-in at `domains/main/`. Always discovered via `builtinDomainsDir`.
  - Why: Spine of the cosmonauts UX; matches `shared/`'s role.
  - Decided by: planner-proposed.

- **D-P2-2 — CLI default-agent resolution via `resolveDefaultLead`**
  - Decision: Helper replaces hardcoded `"cosmo"` at all three sites: `handleDumpPrompt`, `handleInitMode`, `resolveCliAgent`.
  - Why: Domains already declare `lead`; consistency means future domains plug in without CLI changes.
  - Decided by: planner-proposed.

- **D-P2-3 — Persona references Plan 1 tools with graceful degradation**
  - Decision: `domains/main/capabilities/fleet.md` references `run_driver` / `watch_events`. If absent at runtime, persona falls back to `chain_run` / `spawn_agent`.
  - Why: Plan 2 should be independently mergeable.
  - Decided by: planner-proposed.

- **D-P2-4 — Slash-qualified sub-agent allowlist for `main/cosmo`**
  - Decision: `main/cosmo.subagents` uses **slash-qualified** IDs (`coding/planner`, `coding/task-manager`, etc.) per `lib/agents/qualified-role.ts:8`. **`coding/cody` is NOT in the list** (Q7 A).
  - Why: Cosmo delegates directly to specialists across domains. Cody is the in-domain coordinator for `cosmonauts -d coding`. Two-hop delegation would be redundant; the persona is explicit about this.
  - Decided by: user-directed (Q7).

- **D-P2-5 — Cody's sub-agent allowlist stays UNQUALIFIED within coding**
  - Decision: `coding/cody.subagents` is the same unqualified list as the prior `cosmo.ts` (`"planner"`, `"task-manager"`, `"worker"`, etc.). Same-domain unqualified references are the existing convention and the existing invariant test (`tests/domains/coding-agents.test.ts:75-83`) asserts unqualified IDs.
  - Why: Within a domain, unqualified IDs work. Switching cody to qualified IDs would break the existing invariant test for no actual benefit.
  - Decided by: planner-proposed; corrects review PR-005.

- **D-P2-6 — Delete `coding-minimal`; no migration**
  - Decision: Delete `bundled/coding-minimal/` entirely and the catalog entry at `lib/packages/catalog.ts:35-40`. No runtime detection. No warning. No `--ignore` flag. No CLI removal command. Pre-installed copies on user machines are the user's problem.
  - Alternatives: runtime warning + manual cleanup; loader silently ignores; auto-migrate; document only.
  - Why: User Q8 — nobody is using `coding-minimal`. Migration code would have zero users.
  - Decided by: user-directed (Q8); supersedes review PR-004.

- **D-P2-7 — main's skills written from scratch**
  - Decision: `dispatch`, `script-coordinator`, `fleet` skills authored at `domains/main/skills/<name>/SKILL.md`. Not copied from coding.
  - Why: Coordinator/dispatch skills, not coding skills.
  - Decided by: planner-proposed.

- **D-P2-8 — `main/cosmo` capabilities exclude `engineering-discipline`**
  - Decision: `["core", "tasks", "spawning", "todo", "fleet"]`. No `engineering-discipline`.
  - Why: User Q3 — main/cosmo orchestrates; doesn't write code.
  - Decided by: user-directed (Q3).

- **D-P2-9 — `main/cosmo` uses `tools: "none"`**
  - Decision: `tools: "none"`. Extension-registered tools (`tasks`, `plans`, `orchestration`, `todo`, `init`, `observability`) come via the extensions union into the allowlist (`lib/orchestration/definition-resolution.ts:36-50` describes this).
  - Alternatives: `tools: "coding"` (review PR-006: includes `read`, `bash`, `edit`, `write` — contradicts delegation-only role); custom tools pack.
  - Why: Main/cosmo is a delegation-only orchestrator. Filesystem mutation tools expand blast radius unnecessarily.
  - Decided by: planner-proposed; corrects review PR-006.

- **D-P2-10 — Per-domain unscoped session directories**
  - Decision: `cli/session.ts` rule: if `def` is the lead of its domain (i.e., `def.id === domain.lead`), session dir is `<sessionDir>/<def.domain>/` (e.g., `<sessionDir>/main/`, `<sessionDir>/coding/`). Non-lead agents continue to use `<sessionDir>/<def.id>/`.
  - Alternatives: drop the unscoped-dir special-case entirely (all-scoped — loses lead continuity); keep the literal `def.id === "cosmo"` check; one shared dir for all leads (review PR-001 — bleed-through).
  - Why: User Q6 A — preserves lead-history UX without bleeding `main/cosmo` and `coding/cody` into the same directory. Each domain gets its own continuous history.
  - Decided by: user-directed (Q6); corrects review PR-001.

- **D-P2-11 — `hasInstalledDomain` excludes shared AND main**
  - Decision: `hasInstalledDomain` returns true only when at least one domain whose ID is NOT in `["shared", "main"]` is installed. No-domain-guard fires for fresh installs that have only built-in domains.
  - Why: Adding main as built-in makes the predicate vacuously true otherwise.
  - Decided by: planner-proposed.

- **D-P2-12 — Plan 2 ships the coding-domain envelope**
  - Decision: `bundled/coding/coding/drivers/templates/envelope.md` lands here, derived from the fallow-cleanup run's prompt header.
  - Why: User Q5 — Plan 2 already touches coding-domain assets.
  - Decided by: user-directed (Q5).

- **D-P2-13 — Migration error in chain-runner, not chain-parser**
  - Decision: When `prepareStageExecution` (`lib/orchestration/chain-runner.ts:635-650`) raises `Unknown agent role "cosmo"`, the error message is enhanced with: " — did you mean 'main/cosmo' (cross-domain assistant) or 'coding/cody' (coding-domain lead)? See migration notes." Detection: `stage.name === "cosmo"`.
  - Alternatives: chain-parser (review PR-002 — wrong component, parser doesn't reject unknown roles); auto-rewrite; warning-only.
  - Why: Chain runner is where unknown roles are actually rejected today. Existing chain-runner tests at `tests/orchestration/chain-runner.test.ts:180,1418` assert the current message format; the migration hint augments it.
  - Decided by: planner-proposed; corrects review PR-002.

## Design

### Module structure

```
domains/main/                                  NEW (built-in domain)
  domain.ts                                    id: "main", lead: "cosmo"
  agents/cosmo.ts                              tools: "none"
                                               capabilities: [core, tasks, spawning, todo, fleet]
                                               subagents: ["coding/planner", "coding/worker", ...]
                                               (NO coding/cody)
  prompts/cosmo.md                             persona: cross-domain orchestrator
  capabilities/fleet.md                        run_driver + watch_events
  skills/{dispatch,script-coordinator,fleet}/SKILL.md
  workflows.ts                                 returns []

bundled/coding/coding/                         RENAME + ADD
  agents/cosmo.ts → cody.ts                    id: "cody"
                                               subagents: UNQUALIFIED (planner, worker, ...)
  prompts/cosmo.md → cody.md                   REWRITTEN: identifies as Cody
  domain.ts                                    lead: "cody"
  drivers/templates/envelope.md                NEW: coding-domain default envelope

bundled/coding-minimal/                        DELETED entirely

cli/main.ts                                    EDIT (resolveDefaultLead at 3 sites; hasInstalledDomain;
                                               no-domain-guard message)
cli/session.ts                                 EDIT: per-domain unscoped dir for any domain lead
lib/packages/catalog.ts                        EDIT: remove coding-minimal entry
lib/orchestration/chain-runner.ts              EDIT: prepareStageExecution unknown-role error
                                               appends migration hint when stage.name === "cosmo"
AGENTS.md / README.md                          EDIT: new layout / usage examples
tests/prompts/cosmo.test.ts                    RENAMED → tests/prompts/cody.test.ts
```

### Dependency direction

```
domains/main/cosmo
       │ references (subagents, slash-qualified — coding/cody NOT included)
       ▼
bundled/coding/coding/agents/{planner, task-manager, coordinator, worker, ...}

domains/main/skills/dispatch
       │ references at run_driver invocation
       ▼
bundled/coding/coding/drivers/templates/envelope.md
```

### Key contracts

```ts
// domains/main/domain.ts
export const manifest: DomainManifest = {
  id: "main",
  description:
    "Cross-domain orchestration. Houses the executive assistant — the top-level " +
    "cosmonauts agent that delegates directly to specialists across all installed " +
    "domains and dispatches fleets via the driver primitives.",
  lead: "cosmo",
};
```

```ts
// domains/main/agents/cosmo.ts
const definition: AgentDefinition = {
  id: "cosmo",
  description:
    "Executive assistant — cross-domain orchestrator. Delegates directly to " +
    "specialists; dispatches fleets via the driver primitives.",
  capabilities: ["core", "tasks", "spawning", "todo", "fleet"],
  model: "anthropic/claude-opus-4-7",
  tools: "none",                                          // PR-006 fix
  extensions: ["tasks", "plans", "orchestration", "todo", "init", "observability"],
  skills: ["*"],
  subagents: [
    // Coding-domain specialists, slash-qualified — NO coding/cody (Q7)
    "coding/adaptation-planner", "coding/coordinator", "coding/distiller",
    "coding/explorer", "coding/fixer", "coding/implementer",
    "coding/integration-verifier", "coding/performance-reviewer",
    "coding/plan-reviewer", "coding/planner", "coding/quality-manager",
    "coding/refactorer", "coding/reviewer", "coding/security-reviewer",
    "coding/spec-writer", "coding/task-manager", "coding/tdd-coordinator",
    "coding/tdd-planner", "coding/test-writer", "coding/ux-reviewer",
    "coding/verifier", "coding/worker",
  ],
  projectContext: true,
  session: "persistent",
  loop: false,
};
export default definition;
```

```ts
// bundled/coding/coding/agents/cody.ts (renamed from cosmo.ts)
const definition: AgentDefinition = {
  id: "cody",
  description:
    "Coding-domain coordinator. The in-domain agent users get when invoking " +
    "`cosmonauts -d coding`. Coordinates within-domain work — planners, workers, " +
    "reviewers — for users who want a coding-focused interactive session.",
  capabilities: [
    "core", "engineering-discipline", "coding-readwrite",
    "tasks", "spawning", "todo",
  ],
  model: "anthropic/claude-opus-4-7",
  tools: "coding",
  extensions: ["tasks", "plans", "orchestration", "todo", "init", "observability"],
  skills: ["*"],
  subagents: [
    // UNQUALIFIED — same-domain references (PR-005 fix)
    "adaptation-planner", "coordinator", "distiller", "explorer", "fixer",
    "implementer", "integration-verifier", "performance-reviewer",
    "plan-reviewer", "planner", "quality-manager", "refactorer", "reviewer",
    "security-reviewer", "spec-writer", "task-manager", "tdd-coordinator",
    "tdd-planner", "test-writer", "ux-reviewer", "verifier", "worker",
  ],
  projectContext: true,
  session: "persistent",
  loop: false,
};
export default definition;
```

```ts
// CLI default-agent resolver
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

```ts
// hasInstalledDomain (cli/main.ts:323 update)
function hasInstalledDomain(runtime: CosmonautsRuntime): boolean {
  return runtime.domains.some(
    (d) => !["shared", "main"].includes(d.manifest.id),
  );
}
```

```ts
// cli/session.ts session-dir rule (per-domain unscoped — PR-001 fix)
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
  // Non-lead agents → fully scoped
  return join(piSessionDir(cwd), def.id);
}
```

```ts
// lib/orchestration/chain-runner.ts prepareStageExecution change (PR-002 fix)
// At the existing unknown-role rejection (~line 635-650):
if (!definition) {
  const baseMsg = `Unknown agent role "${stage.name}"`;
  const hint = stage.name === "cosmo"
    ? " — did you mean 'main/cosmo' (cross-domain assistant) or 'coding/cody' (coding-domain lead)? See migration notes in docs/designs/executive-assistant.md."
    : "";
  throw new Error(baseMsg + hint);
}
```

### Persona prompt sketch (`domains/main/prompts/cosmo.md`)

```
# Cosmo — Executive Assistant

You are the top-level cosmonauts agent. You are not a coding agent; you are a
cross-domain orchestrator. You delegate directly to specialists across all
installed domains.

## Tools (priority order)

- Direct conversation with the user.
- `spawn_agent` — delegate one focused task to one specialist using the
  slash-qualified ID (`coding/planner`, `coding/worker`, future `<domain>/<agent>`).
- `chain_run` — run a fully mechanical pipeline.
- `run_driver` + `watch_events` — dispatch a fleet of N tasks against an internal
  or external backend. (If these tools are absent, fleet dispatch is unavailable
  in this build — fall back to chain_run / spawn_agent and tell the user the
  fleet capability requires the driver primitives.)

## Delegation pattern

You delegate DIRECTLY to specialists, not to domain leads. For coding work, you
spawn `coding/planner`, `coding/worker`, `coding/reviewer`, etc. Cody is the
in-domain coordinator that the user gets when they invoke `cosmonauts -d coding`
— you do not route through cody.

(See /skill:dispatch for full discipline.)
```

### Coding envelope sketch (`bundled/coding/coding/drivers/templates/envelope.md`)

Derived from `/tmp/cosmo-fallow-cleanup/run.sh:render_prompt` heredoc. Contains:
- Repo conventions (Bun, ESM, `.ts` imports, lint/test/typecheck commands)
- Worker discipline (explore first, TDD if marked, target pattern, remove suppression, no commit, no `git add`, no `missions/`/`memory/` edits)
- Failure protocol (capture stderr ~30 lines, distinguish own vs pre-existing)
- Final report format spec (fenced JSON; OUTCOME-text fallback)

### Integration seams (verified)

- **Domain loading** — `lib/runtime.ts:115-118` scans `builtinDomainsDir` (precedence 0).
- **Agent resolution** — `runtime.agentRegistry.resolve(agentId, domainContext)` at `cli/main.ts:431, 477, 645/651`.
- **`DomainManifest`** — `lib/domains/types.ts:13`.
- **Validator** — `lib/domains/validator.ts:48` + capability resolution at lines 216-241.
- **Qualified IDs** — slash form at `lib/agents/qualified-role.ts:8`, `lib/agents/resolver.ts:18-20`, `lib/domains/validator.ts:110`.
- **Authorization** — `domains/shared/extensions/orchestration/authorization.ts:15-18`. `isSubagentAllowed` accepts unqualified ID OR `${targetDef.domain}/${targetDef.id}`.
- **`hasInstalledDomain`** — `cli/main.ts:323`.
- **Session dir resolution** — `cli/session.ts:516-525, 605-612`.
- **Chain runner unknown-role rejection** — `lib/orchestration/chain-runner.ts:635-650` (`prepareStageExecution`).
- **Tools resolution** — `lib/orchestration/definition-resolution.ts:36-50`. `tools: "none"` plus extensions union → only extension-registered tools.
- **Existing coding-agent invariant test** — `tests/domains/coding-agents.test.ts:75-83`. Asserts every coding-domain subagent string is in the unqualified coding agent ID set.

## Files to Change

New files:
- `domains/main/{domain.ts, agents/cosmo.ts, prompts/cosmo.md, capabilities/fleet.md, skills/dispatch/SKILL.md, skills/script-coordinator/SKILL.md, skills/fleet/SKILL.md, workflows.ts}`
- `bundled/coding/coding/agents/cody.ts` (renamed from `cosmo.ts`)
- `bundled/coding/coding/prompts/cody.md` (renamed; rewritten content)
- `bundled/coding/coding/drivers/templates/envelope.md`
- `lib/agents/resolve-default-lead.ts` (or inlined in `cli/main.ts`)
- `tests/prompts/cody.test.ts` (renamed from `cosmo.test.ts`)
- Multiple new test files (see Test Files section below)

Deleted files:
- `bundled/coding/coding/agents/cosmo.ts`
- `bundled/coding/coding/prompts/cosmo.md`
- `bundled/coding-minimal/` (entire directory)
- `tests/prompts/cosmo.test.ts` (renamed)

Modified files:
- `bundled/coding/coding/domain.ts` — `lead: "cosmo"` → `lead: "cody"`.
- `cli/main.ts` —
  - Replace hardcoded `"cosmo"` at lines 430, 478, 645/651 with `resolveDefaultLead(runtime, options)`.
  - Update `hasInstalledDomain` (line 323) to exclude `["shared", "main"]`.
  - Remove `install coding-minimal` line from no-domain-guard messages.
- `cli/session.ts` — Replace `def.id === "cosmo"` with the per-domain-lead rule (D-P2-10).
- `lib/packages/catalog.ts` — Remove coding-minimal catalog entry (lines 35-40).
- `lib/orchestration/chain-runner.ts` — `prepareStageExecution` (lines 635-650): when `stage.name === "cosmo"` and unknown, append migration hint to error message.
- `AGENTS.md` — `domains/` contains `shared/` AND `main/`; remove coding-minimal references.
- `README.md` — Usage examples for `cosmonauts`, `-a cosmo`, `-a cody`.
- `cli/tasks/commands/list.ts` (or wherever `--list-agents` outputs) — disambiguate by qualified ID when multiple domains share an unqualified name.

Test files (new):
- `tests/domains/main-domain.test.ts` — main domain loads; `main/cosmo` resolves; `fleet` capability resolves; `tools: "none"` correctly produces only extension tools in the allowlist.
- `tests/cli/resolve-default-lead.test.ts` — all branches of the resolver.
- `tests/cli/main.test.ts` (extended) — agent flag resolution; default routing; coding-domain context.
- `tests/coding-domain-rename.test.ts` — coding domain validates after rename; coding/cody loads with unqualified subagents; existing `tests/domains/coding-agents.test.ts` invariant passes.
- `tests/cli/dump-prompt.test.ts` (extended) — `--dump-prompt` (no args) → main/cosmo; `-a cody` → coding/cody; cody.md does NOT contain "You are Cosmo".
- `tests/cli/no-domain-guard.test.ts` (extended) — guard fires when only `shared`+`main` installed.
- `tests/cli/session-per-domain-leads.test.ts` (NEW) — `main/cosmo` uses `<sessionDir>/main/`; `coding/cody` uses `<sessionDir>/coding/`; non-lead coding agents use `<sessionDir>/<agentId>/`. No directory shared between leads.
- `tests/orchestration/chain-runner-cosmo-migration.test.ts` (NEW) — chain `"cosmo -> ..."` raises error containing `"main/cosmo"` AND `"coding/cody"` substrings.
- `tests/prompts/cody.test.ts` (renamed) — opens with cody identity; `cosmo-facilitates-dialogue` route names migrated.
- `tests/packages/catalog.test.ts` (extended) — coding-minimal not present; only `coding` in catalog.

## Risks

- **Mitigated — Renaming coding's cosmo breaks user habit.** Documented in `AGENTS.md` and `README.md`. Chain runner emits migration-hint error.
- **Mitigated — Hardcoded `"cosmo"` references in code.** Audit step + QC-006 broad grep.
- **Mitigated — `cli/session.ts` history bleed-through.** Per-domain unscoped dir rule (D-P2-10); QC-008 verifies isolation.
- **Mitigated — `hasInstalledDomain` predicate breaks no-domain-guard.** D-P2-11 + QC-005.
- **Mitigated — Plan 2 ships before Plan 1.** Persona instructs graceful fallback; tests assert it.
- **Mitigated — User project has custom workflow chain referencing `cosmo`.** Chain-runner emits migration-hint error.
- **Mitigated — main/cosmo over-privileged with edit/write/bash.** `tools: "none"` (D-P2-9); only extension tools come through.
- **Accepted — Pre-installed `coding-minimal` packages on user machines.** Q8: not our concern. They were unused; no migration code.

## Quality Contract

- id: QC-001
  category: architecture
  criterion: "`domains/main/` is a built-in domain (precedence 0); the runtime discovers it without any package install or config change. The validator emits no errors for `main/cosmo` (validates `fleet` capability resolves; `engineering-discipline` is NOT referenced)."
  verification: verifier
  command: "bun run test --grep 'main domain built-in discovery'"

- id: QC-002
  category: correctness
  criterion: "After rename, `bundled/coding/coding/agents/cosmo.ts` and `prompts/cosmo.md` are gone; `cody.ts` (id: `\"cody\"`) and `cody.md` exist; coding `domain.ts` declares `lead: \"cody\"`. cody.md does NOT contain `\"You are Cosmo\"`. coding/cody.subagents are UNQUALIFIED (matches existing coding-agents invariant test)."
  verification: verifier
  command: "bun run test --grep 'coding cody rename complete'"

- id: QC-003
  category: behavior
  criterion: "`cosmonauts` (no args, no domain context, with main + coding installed) routes to `main/cosmo` via the interactive/print path."
  verification: verifier
  command: "bun run test --grep 'default routing main installed'"

- id: QC-004
  category: behavior
  criterion: "`cosmonauts -d coding` (no agent) routes to `coding/cody`."
  verification: verifier
  command: "bun run test --grep 'default routing coding domain'"

- id: QC-005
  category: behavior
  criterion: "`hasInstalledDomain` returns false when only `shared` + `main` are installed; the no-domain-guard fires; the message no longer mentions `coding-minimal`."
  verification: verifier
  command: "bun run test --grep 'no-domain guard fires after main built-in'"

- id: QC-006
  category: correctness
  criterion: "No `cosmo` agent string literal remains in `cli/`, `lib/`, `bundled/coding/`, `domains/`, or `tests/` outside (a) the `resolveDefaultLead` helper, (b) the `--agent` CLI help text, (c) the chain-runner migration-hint error message, (d) `domains/main/` (legitimate references to the new cosmo)."
  verification: verifier
  command: "bash -c 'remaining=$(grep -rEn \"[\\\"'\\''](cosmo)[\\\"'\\'']\" cli/ lib/ bundled/coding/ tests/ domains/coding 2>/dev/null | grep -vE \"resolveDefaultLead|--agent|migration|main/cosmo\" | wc -l); test \"$remaining\" -eq 0'"

- id: QC-007
  category: behavior
  criterion: "`bundled/coding-minimal/` is removed from disk; `lib/packages/catalog.ts` does not list `coding-minimal`; tests still pass."
  verification: verifier
  command: "bash -c 'test ! -d bundled/coding-minimal && bun run test --grep \"coding-minimal retired\"'"

- id: QC-008
  category: behavior
  criterion: "`main/cosmo` session dir is `<sessionDir>/main/`; `coding/cody` session dir is `<sessionDir>/coding/`; non-lead coding agents use `<sessionDir>/<agentId>/`. No two agents share a session directory."
  verification: verifier
  command: "bun run test --grep 'session per-domain-leads'"

- id: QC-009
  category: behavior
  criterion: "Chain runner raises a migration-hint error when an unresolved stage role equals `\"cosmo\"`, error message contains both `\"main/cosmo\"` and `\"coding/cody\"` substrings."
  verification: verifier
  command: "bun run test --grep 'chain-runner cosmo migration'"

- id: QC-010
  category: integration
  criterion: "`bundled/coding/coding/drivers/templates/envelope.md` exists and contains the worker-discipline / report-format sections."
  verification: reviewer

- id: QC-011
  category: behavior
  criterion: "`main/cosmo` agent definition has `tools: \"none\"`; the resolved tool allowlist contains ONLY extension-registered tools (no `read`, `bash`, `edit`, `write`)."
  verification: verifier
  command: "bun run test --grep 'main/cosmo tools none allowlist'"

- id: QC-012
  category: behavior
  criterion: "`main/cosmo.subagents` does NOT contain `\"coding/cody\"`. Subagent allowlist contains only the slash-qualified specialist IDs from coding."
  verification: verifier
  command: "bun run test --grep 'main/cosmo allowlist excludes cody'"

- id: QC-013
  category: integration
  criterion: "`bun run test`, `bun run lint`, `bun run typecheck` all pass after Plan 2 lands."
  verification: verifier
  command: "bun run test && bun run lint && bun run typecheck"

## Implementation Order

1. **Create `domains/main/` skeleton.** Land `domain.ts`, `agents/cosmo.ts` (with `tools: "none"`, NO `engineering-discipline`, slash-qualified subagents EXCLUDING `coding/cody`), `prompts/cosmo.md`, `capabilities/fleet.md`, three skills, empty `workflows.ts`. Verify load.
2. **Rename coding's cosmo to cody.** Move agent + prompt files. Update `id`, `description`. Subagents stay UNQUALIFIED. Rewrite prompt content to identify as Cody. Update `domain.ts:lead`.
3. **Migrate `tests/prompts/cosmo.test.ts` → `cody.test.ts`** asserting new path/identity.
4. **Add `resolveDefaultLead` helper.** Replace three hardcoded `"cosmo"` sites in `cli/main.ts` (handleDumpPrompt, handleInitMode, resolveCliAgent).
5. **Update `hasInstalledDomain`** to exclude `["shared", "main"]`. Update no-domain-guard messages (drop `coding-minimal` line).
6. **Update `cli/session.ts`** to per-domain-lead rule (`<sessionDir>/<def.domain>/` for any domain lead).
7. **Delete `bundled/coding-minimal/`** and the catalog entry. No detection code.
8. **Update `chain-runner.ts:prepareStageExecution`** to append migration hint when `stage.name === "cosmo"` and unknown.
9. **Ship coding-domain envelope** at `bundled/coding/coding/drivers/templates/envelope.md`.
10. **Update `AGENTS.md` and `README.md`** for the new layout.
11. **Audit pass.** Broad grep across `cli/`, `lib/`, `bundled/coding/`, `domains/coding/` (if exists), `tests/`. Verify QC-006.
12. **Verification gate.** `bun run test`, `bun run lint`, `bun run typecheck`. Verify QC-001 through QC-013.

Each step is independently committable; CI stays green throughout.
