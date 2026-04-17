---
id: TASK-182
title: >-
  Add lib/init/prompt.ts, domains/shared/skills/init/SKILL.md, and slim down the
  init extension
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:init-command'
dependencies:
  - TASK-180
createdAt: '2026-04-14T13:38:16.314Z'
updatedAt: '2026-04-14T13:49:18.437Z'
---

## Description

Implement the thin-code / thick-skill split for the init bootstrap flow.

**New files:**

`lib/init/prompt.ts` — short bootstrap message builder shared by the CLI and the init extension:
```ts
export interface InitPromptOptions {
  cwd: string;
  defaultConfig: ProjectConfig;
}
export function buildInitBootstrapPrompt(options: InitPromptOptions): string;
```
The prompt must: instruct Cosmo to load `/skill:init` first; state that init is interactive and must not write before confirmation; embed the canonical default config template for new `.cosmonauts/config.json` creation. It should be short — workflow logic lives in the skill file, not here.

`domains/shared/skills/init/SKILL.md` — six-phase init workflow (scan → ask → propose AGENTS.md → suggest skills → write → summarize), AGENTS.md content rules, rerun/diff behavior (propose before overwrite), and config merge rules. This is the authoritative spec for what the agent does during init.

**Updated file:**

`domains/shared/extensions/init/index.ts` — replace the current `buildInitPrompt` function and its embedded workflow checklist with a thin wrapper that calls `buildInitBootstrapPrompt` from `lib/init/prompt.ts`. The extension must continue to register the `/init` command with the same name; only the message content changes.

**Test files:**
- `tests/extensions/init.test.ts` — remove assertions about the old AGENTS.md-exists stop logic; assert the thin bootstrap message contains the `/skill:init` reference and no embedded workflow steps
- `tests/init/prompt.test.ts` — new tests for `buildInitBootstrapPrompt`: prompt contains `/skill:init`, embeds cwd, embeds the serialized default config, forbids silent writes (contains confirmation language)

**Depends on TASK-180** (imports `createDefaultProjectConfig()` from `lib/config/defaults.ts`).

<!-- AC:BEGIN -->
- [x] #1 lib/init/prompt.ts exists and exports buildInitBootstrapPrompt(options: InitPromptOptions): string
- [x] #2 buildInitBootstrapPrompt output contains '/skill:init' instruction
- [x] #3 buildInitBootstrapPrompt output contains the cwd
- [x] #4 buildInitBootstrapPrompt output embeds the serialized canonical default config template
- [x] #5 buildInitBootstrapPrompt output contains language requiring user confirmation before writing files
- [x] #6 domains/shared/skills/init/SKILL.md exists and describes all six phases: scan, ask, propose AGENTS.md, suggest skills, write, summarize
- [x] #7 SKILL.md describes rerun behavior as propose-before-write (not a hard stop on existing AGENTS.md)
- [x] #8 domains/shared/extensions/init/index.ts delegates to buildInitBootstrapPrompt and contains no embedded workflow checklist
- [x] #9 tests/init/prompt.test.ts covers prompt content requirements
- [x] #10 tests/extensions/init.test.ts updated for the thin bootstrap message
- [x] #11 bun run test passes with no regressions
<!-- AC:END -->

<!-- AC:BEGIN -->
- [ ] #1 lib/init/prompt.ts exists and exports buildInitBootstrapPrompt(options: InitPromptOptions): string
- [ ] #2 buildInitBootstrapPrompt output contains '/skill:init' instruction
- [ ] #3 buildInitBootstrapPrompt output contains the cwd
- [ ] #4 buildInitBootstrapPrompt output embeds the serialized canonical default config template
- [ ] #5 buildInitBootstrapPrompt output contains language requiring user confirmation before writing files
- [ ] #6 domains/shared/skills/init/SKILL.md exists and describes all six phases: scan, ask, propose AGENTS.md, suggest skills, write, summarize
- [ ] #7 SKILL.md describes rerun behavior as propose-before-write (not a hard stop on existing AGENTS.md)
- [ ] #8 domains/shared/extensions/init/index.ts delegates to buildInitBootstrapPrompt and contains no embedded workflow checklist
- [ ] #9 tests/init/prompt.test.ts covers prompt content requirements
- [ ] #10 tests/extensions/init.test.ts updated for the thin bootstrap message
- [ ] #11 bun run test passes with no regressions
<!-- AC:END -->

## Implementation Notes

Added lib/init/prompt.ts for the shared thin bootstrap message, created domains/shared/skills/init/SKILL.md as the authoritative six-phase workflow, slimmed the init extension to delegate to the prompt builder, and updated init prompt coverage in tests/extensions/init.test.ts and tests/init/prompt.test.ts. Verification: bun run test, bun run lint, bun run typecheck.
