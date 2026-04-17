---
id: TASK-183
title: >-
  Switch cli/main.ts init branch to InteractiveMode and wire the skill-bypass
  flag
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - api
  - 'plan:init-command'
dependencies:
  - TASK-181
  - TASK-182
createdAt: '2026-04-14T13:38:29.268Z'
updatedAt: '2026-04-14T13:49:21.019Z'
---

## Description

Replace the `runPrintMode` init path in `cli/main.ts` with an interactive session that uses the new bootstrap prompt and bypasses project skill filtering.

**Files to change:**

`cli/main.ts` — in the `if (options.init)` branch (currently around line 363–395):
- Replace `runPrintMode(initRuntime, { mode: 'text', initialMessage: buildInitPrompt(cwd) })` with `InteractiveMode` using an initial user message built by `buildInitBootstrapPrompt({ cwd, defaultConfig: createDefaultProjectConfig() })`
- Pass `ignoreProjectSkills: true` to `createSession(...)` when building the init runtime
- Keep the existing "no domain installed" guard above the branch unchanged
- Remove the import of the old `buildInitPrompt` from `domains/shared/extensions/init/index.ts`; import `buildInitBootstrapPrompt` from `lib/init/prompt.ts` instead

`cli/session.ts` — forward the `ignoreProjectSkills` option from `CreateSessionOptions` into `buildSessionParams` (the interface change was made in TASK-181; this task wires the call site).

`tests/cli/main.test.ts` — add or update tests verifying:
- `parseCliArgs(['init'])` still sets `opts.init === true`
- Any helper behavior extracted from the init branch is covered

**Depends on TASK-181** (ignoreProjectSkills in session assembly) and **TASK-182** (buildInitBootstrapPrompt).

<!-- AC:BEGIN -->
- [ ] #1 cli/main.ts init branch uses InteractiveMode, not runPrintMode
- [ ] #2 The init session is created with ignoreProjectSkills: true
- [ ] #3 The initial user message is built by buildInitBootstrapPrompt with createDefaultProjectConfig()
- [ ] #4 The old buildInitPrompt import from the init extension is removed from cli/main.ts
- [ ] #5 The 'no domain installed' guard before the init branch remains intact
- [ ] #6 cli/session.ts forwards ignoreProjectSkills from CreateSessionOptions to buildSessionParams
- [ ] #7 tests/cli/main.test.ts covers the init flag parsing and any extracted helper logic
- [ ] #8 bun run test passes with no regressions
<!-- AC:END -->

## Implementation Notes

Completed and verified.
- AC1-5: cli/main.ts now builds init session config with buildInitBootstrapPrompt(createDefaultProjectConfig()), keeps the existing no-domain guard, removes the old buildInitPrompt import, and runs init through InteractiveMode instead of runPrintMode.
- AC6: cli/session.ts already forwards ignoreProjectSkills from CreateSessionOptions into both buildSessionParams call sites; verified unchanged.
- AC7: tests/cli/main.test.ts covers parseCliArgs(["init"]) behavior, init passthrough flags, and the extracted buildInitSessionConfig helper.
- AC8: bun run test passed; also ran bun run typecheck and bun run lint.
