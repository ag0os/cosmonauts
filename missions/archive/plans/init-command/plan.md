---
title: Interactive /init command — AGENTS.md bootstrap + skill activation
status: active
createdAt: '2026-04-13T17:23:39.343Z'
updatedAt: '2026-04-13T18:18:59.855Z'
---

## Summary

Redesign `cosmonauts init` into a dedicated interactive bootstrap flow that seeds Cosmo with a reusable `/skill:init` workflow, asks before writing, and can suggest skills from the full installed catalogue without breaking normal post-init agent behavior.

## Scope

Included:
- `cosmonauts init` runs through `InteractiveMode` instead of `runPrintMode`
- init bootstrap instructions move out of the hardcoded prompt into a shared `init` skill
- init can see the full skill catalogue when suggesting skills
- normal sessions continue to respect project skill filtering, but shared/framework skills stay available after init writes `.cosmonauts/config.json`
- init prompt uses the same canonical config defaults as `scaffoldProjectConfig()`
- docs/tests updated for the new interactive behavior

Explicitly excluded:
- adding a dedicated config-editing tool; the agent still edits `AGENTS.md` and `.cosmonauts/config.json` with normal file tools
- changing `scaffold missions` scope or merging it into init
- building a deterministic rules engine for stack→skill matching; the agent uses scan results + skill descriptions
- guaranteeing full parity for invoking `/init` inside an already-running filtered session; the supported bootstrap path is the `cosmonauts init` CLI flow

Assumptions:
- shared-domain skills (`plan`, `task`, `pi`, etc.) are framework capabilities and must remain loadable even when project config defines a `skills` array
- the current scaffold defaults in `lib/config/loader.ts` remain the canonical `.cosmonauts/config.json` baseline until extracted into a helper

## Design

### Module structure

**`lib/config/defaults.ts` (new)**
Single responsibility: expose the canonical default `.cosmonauts/config.json` object used everywhere Cosmonauts scaffolds or describes project config. This removes the current prompt/scaffold drift risk.

**`lib/init/prompt.ts` (new)**
Single responsibility: build the short bootstrap message for init sessions. It does not encode the full workflow; it points the agent at `/skill:init`, embeds the cwd, and injects the canonical config template the agent must use when creating `.cosmonauts/config.json`.

**`domains/shared/skills/init/SKILL.md` (new)**
Single responsibility: describe the six-phase init workflow (scan → ask → propose AGENTS → suggest skills → write → summarize), AGENTS.md content rules, rerun/diff behavior, and config merge rules. This is the volatile workflow surface that should evolve without code changes.

**`domains/shared/extensions/init/index.ts`**
Single responsibility: register `/init` and delegate to `lib/init/prompt.ts`. It must not contain workflow logic beyond dispatching the bootstrap message.

**`cli/main.ts`**
Single responsibility for this feature: route `cosmonauts init` into a dedicated interactive session. It should create an ephemeral interactive session, seed it with the bootstrap prompt, and bypass project skill filtering only for this bootstrap session.

**`cli/session.ts` + `lib/agents/session-assembly.ts`**
Single responsibility for this feature: carry an init-only `ignoreProjectSkills` flag into session assembly, and compute the effective project skill allowlist for normal sessions as `shared skills ∪ project skills`. `session-assembly` owns the skill-filter decision because both CLI and orchestrated sessions already converge there.

**`lib/config/loader.ts`**
Single responsibility remains config loading/scaffolding. It should consume `lib/config/defaults.ts` rather than owning a duplicated inline constant.

### Dependency graph

- `cli/main.ts` → `cli/session.ts` → `lib/agents/session-assembly.ts`
- `cli/main.ts` → `lib/init/prompt.ts`
- `domains/shared/extensions/init/index.ts` → `lib/init/prompt.ts`
- `lib/init/prompt.ts` → `lib/config/defaults.ts`
- `lib/config/loader.ts` → `lib/config/defaults.ts`
- `lib/agents/session-assembly.ts` → `lib/agents/skills.ts` and reads shared skill names via `resolver`/`domainsDir`
- `domains/shared/skills/init/SKILL.md` is data only; no code depends on it at compile time

Dependency rule: prompt/config helpers must not import CLI code. Session assembly may depend on domain resolver metadata, but init workflow content stays in the skill file, not in the CLI branch.

### Key contracts

```ts
// cli/session.ts
export interface CreateSessionOptions {
  // existing fields...
  ignoreProjectSkills?: boolean;
}
```

```ts
// lib/agents/session-assembly.ts
export interface BuildSessionParamsOptions {
  // existing fields...
  ignoreProjectSkills?: boolean;
}
```

Behavior:
- `ignoreProjectSkills: true` → pass `undefined` into `buildSkillsOverride(...)` so wildcard agents see the full skill catalogue from `skillPaths`
- default path → if `projectSkills` exists, expand it to `projectSkills ∪ sharedSkillNames` before calling `buildSkillsOverride(...)`

```ts
// lib/config/defaults.ts
export function createDefaultProjectConfig(): ProjectConfig;
```

Behavior:
- returns a fresh object every call
- contains the same workflows/skill defaults used by `scaffoldProjectConfig()`
- is the object rendered into the init bootstrap prompt when `.cosmonauts/config.json` must be created

```ts
// lib/init/prompt.ts
export interface InitPromptOptions {
  cwd: string;
  defaultConfig: ProjectConfig;
}

export function buildInitBootstrapPrompt(options: InitPromptOptions): string;
```

Behavior:
- instructs Cosmo to load `/skill:init` first
- states that init is interactive and must not write before confirmation
- includes the canonical default config template for new `.cosmonauts/config.json`

### Integration seams

- `cli/main.ts:363-395` currently routes `options.init` through `runPrintMode(...)` with `buildInitPrompt(cwd)`. This is the exact branch to replace with `InteractiveMode`, preserving the existing “no domain installed” guard above it.
- `lib/runtime.ts:158-173` already composes `skillPaths` from all domain skill directories plus project `skillPaths`, and surfaces `projectSkills` from config. The init session should reuse those `skillPaths` but omit the project filter so the agent sees the full catalogue.
- `lib/agents/session-assembly.ts:44-45,94-95,131-132` is where `projectSkills` and `skillPaths` become Pi loader settings. This is the correct boundary for both the init-session bypass and the normal-session shared-skill preservation.
- `lib/agents/skills.ts:47-55` confirms that a wildcard agent plus `projectSkills` is filtered down to the project list. Without an upstream adjustment, any init-created `skills` array would hide shared framework skills from planner/task flows.
- `bundled/coding/coding/agents/cosmo.ts:17-25` shows Cosmo already carries the `init` extension and wildcard skill access, so no agent-definition change is required.
- `domains/shared/extensions/init/index.ts:16-17` and `:19-34` currently encode “stop if AGENTS.md exists” and a write-oriented checklist. That directly conflicts with the approved rerun/diff spec and must be replaced by a thin bootstrap wrapper.
- `lib/config/loader.ts:103-148` is the current canonical scaffold path for `.cosmonauts/config.json`; init must reuse these defaults rather than restating them in prose.
- `docs/pi-framework.md:326-330` documents that Pi already auto-loads `AGENTS.md`/`CLAUDE.md` context files. Init does not need a custom tool for those files; the skill should only instruct the agent to read additional AI config files (`.cursor`, Copilot instructions, etc.) explicitly.

### Seams for change

- **Init workflow wording/content rules** are volatile → keep them in `domains/shared/skills/init/SKILL.md`.
- **Default project config shape** may evolve → centralize in `lib/config/defaults.ts` so scaffolding and init prompt generation do not drift.
- **Project skill filtering semantics** are now stable core logic → keep the shared-skill preservation in session assembly, not in the init prompt, so future commands that write `skills` do not reintroduce the bug.

## Approach

Use a thin-code / thick-skill split:
1. `cosmonauts init` starts an interactive ephemeral Cosmo session.
2. The initial user message is generated code-side and is intentionally short: it tells Cosmo to load `/skill:init`, identifies the project root, and embeds the canonical config template.
3. The `/skill:init` content drives the six-phase conversation and the AGENTS.md quality bar.
4. The init session sees the full skill catalogue because the CLI path suppresses the project skill filter.
5. After init finishes, normal sessions still filter by project skills, but session assembly implicitly unions shared framework skills into the allowlist so planner/task/init/meta skills remain accessible.

Key decisions:
- **Use a skill, not a hardcoded prompt.** The current workflow in `domains/shared/extensions/init/index.ts:11-34` is already too long and already drifted from the approved spec. A shared skill keeps this editable without changing code.
- **Do not add a config-edit tool.** The agent already has file tools, and the only missing deterministic input is the canonical default config template, which the bootstrap prompt can inject.
- **Fix the shared-skill regression in infrastructure, not in the prompt.** If init writes `.cosmonauts/config.json` and the code keeps filtering wildcard agents to only project skills, planner and other flows degrade immediately. That must be solved in session assembly.
- **Keep init session ephemeral.** The conversation is interactive, but it is a bootstrap flow, not a long-lived workspace REPL. In-memory persistence during the run is sufficient.

Composition strategy:
- `CLI init branch` → `createSession(ignoreProjectSkills: true)` → `InteractiveMode(initialMessage)`
- `initialMessage` → `/skill:init` + canonical config defaults
- `normal sessions` → `effectiveProjectSkills = sharedSkillNames ∪ projectSkills` → `buildSkillsOverride(...)`

## Files to Change

- `cli/main.ts` -- replace the init `runPrintMode` path with `InteractiveMode`, pass the init-only skill-filter bypass, and seed the new bootstrap prompt
- `cli/session.ts` -- add/pass `ignoreProjectSkills` into `buildSessionParams`
- `lib/agents/session-assembly.ts` -- implement init-only bypass plus shared-skill preservation for normal filtered sessions
- `lib/config/defaults.ts` -- new canonical default project config factory
- `lib/config/loader.ts` -- consume the new defaults helper from scaffolding code
- `lib/init/prompt.ts` -- new bootstrap prompt builder shared by CLI and init extension
- `domains/shared/extensions/init/index.ts` -- slim wrapper around the new prompt builder; remove embedded workflow logic
- `domains/shared/skills/init/SKILL.md` -- new shared skill containing the approved six-phase init workflow and content rules
- `.cosmonauts/config.example.json` -- align the checked-in example with the canonical default config helper or remove the misleading mismatch
- `README.md` -- update `cosmonauts init` docs to describe the interactive/bootstrap behavior
- `tests/agents/session-assembly.test.ts` -- cover shared-skill preservation and init bypass behavior
- `tests/config/scaffold.test.ts` -- assert scaffolding still emits the canonical default config
- `tests/extensions/init.test.ts` -- update prompt/command assertions for the thin bootstrap message
- `tests/cli/main.test.ts` -- add coverage for the init interactive path or extracted helper behavior
- `tests/init/prompt.test.ts` -- new tests for bootstrap prompt content and default-config embedding

## Risks

- **Must fix — init-created `skills` arrays can hide framework skills.** Blast radius: planner/task-manager/init/meta workflows lose `/skill:plan`, `/skill:init`, etc., which degrades planning and bootstrap flows immediately after init. Countermeasure: normal session filtering becomes `shared skills ∪ project skills`, implemented in session assembly.
- **Must fix — current init prompt stops on existing `AGENTS.md`.** Blast radius: rerun flow cannot propose diffs, so users with evolving projects get stale bootstrap instructions and no safe update path. Countermeasure: move behavior into `/skill:init` and explicitly require propose-before-write rerun behavior.
- **Mitigated — prompt/config drift creates mismatched `.cosmonauts/config.json` output.** Blast radius: init may write workflows/skills that differ from `scaffoldProjectConfig()`, confusing users and tests. Countermeasure: extract canonical defaults into `lib/config/defaults.ts` and render that exact object into the bootstrap prompt.
- **Accepted — stack→skill suggestion remains heuristic, not deterministic.** Blast radius: init may suggest a suboptimal but non-breaking skill set; users can adjust before confirmation. This is acceptable because the interaction remains user-confirmed and no silent writes occur.

## Quality Contract

- id: QC-001
  category: architecture
  criterion: "`cosmonauts init` launches `InteractiveMode` and no longer routes through `runPrintMode` for the init branch."
  verification: reviewer

- id: QC-002
  category: integration
  criterion: "When `.cosmonauts/config.json` defines `skills`, normal sessions still expose all shared-domain skills in addition to the configured project skills."
  verification: reviewer

- id: QC-003
  category: correctness
  criterion: "The dedicated init session ignores project skill filtering and receives the full skill catalogue from runtime `skillPaths` for suggestion purposes."
  verification: reviewer

- id: QC-004
  category: behavior
  criterion: "The init bootstrap instructions explicitly require at least one user question and forbid file writes before user confirmation."
  verification: reviewer

- id: QC-005
  category: behavior
  criterion: "Rerun behavior is update-oriented: existing `AGENTS.md` is reviewed and proposed changes are shown before writing, rather than treated as a hard stop."
  verification: reviewer

- id: QC-006
  category: integration
  criterion: "`scaffoldProjectConfig()` and the init bootstrap prompt use the same canonical default config object."
  verification: verifier
  command: "bun run test"

## Implementation Order

1. Extract canonical config defaults and extend session assembly with shared-skill preservation plus an init-only `ignoreProjectSkills` option; cover these invariants with unit tests first.
2. Add `lib/init/prompt.ts` and `domains/shared/skills/init/SKILL.md`, then simplify the init extension to delegate to the new prompt builder.
3. Switch `cli/main.ts` init handling to interactive mode, wire the init-only skill bypass, and add/adjust CLI tests.
4. Update checked-in examples/docs (`.cosmonauts/config.example.json`, `README.md`) so the documented bootstrap flow matches the implemented behavior.
