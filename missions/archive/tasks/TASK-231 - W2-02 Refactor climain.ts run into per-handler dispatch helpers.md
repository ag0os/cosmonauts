---
id: TASK-231
title: 'W2-02: Refactor cli/main.ts run into per-handler dispatch helpers'
status: Done
priority: medium
labels:
  - 'wave:2'
  - 'area:cli-infra'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies:
  - TASK-230
createdAt: '2026-04-29T13:58:18.745Z'
updatedAt: '2026-04-29T15:39:42.577Z'
---

## Description

Refactor the private `run(options)` function at `cli/main.ts:262` into named per-mode dispatch helpers, removing the complexity suppression. Requires W2-01 to already be landed to avoid same-file conflicts.

**Suppression:** `cli/main.ts:262`, private `run(options)`.

**Current responsibilities:** discovers framework/bundled/domain runtime, handles no-domain first-run guard, routes list-domains/list-workflows/list-agents/dump-prompt/init/workflow/print/interactive modes, sets profiling output for chains, creates sessions, and maps failures to exit codes.

**Target pattern:** per-handler dispatch:
- `selectRunMode(options: CliOptions, hasNonSharedDomain: boolean): CliRunMode`
- `handleListDomains(runtime: CosmonautsRuntime): Promise<void>`
- `handleListWorkflows(cwd: string, domainWorkflows: readonly WorkflowDefinition[]): Promise<void>`
- `handleListAgents(runtime: CosmonautsRuntime, options: CliOptions): Promise<void>`
- `handleDumpPrompt(runtime: CosmonautsRuntime, options: CliOptions): Promise<void>`
- `handleInitMode(runtime: CosmonautsRuntime, options: CliOptions, cwd: string): Promise<void>`
- `handleWorkflowMode(runtime: CosmonautsRuntime, options: CliOptions, cwd: string): Promise<void>`
- `handlePrintMode(...)` and `handleInteractiveMode(...)`

**Coverage status:** `add-characterization-tests` — no direct tests cover private dispatch; add tests through exported pure helpers where possible and CLI entry behavior where feasible: no-domain guard, list modes bypass guard, dump-prompt file/stdout, workflow failure sets exitCode, print requires prompt, and interactive registry setup. Workers may first extract/export `selectRunMode` under test, then keep behavior locked while splitting handler bodies.

**TDD note:** no for IO-heavy mode handlers; yes for `selectRunMode`.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/main.ts:262`.
- Commit the change as a single commit: `W2-02: Refactor cli/main.ts run`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 2 / W2-02

<!-- AC:BEGIN -->
- [ ] #1 Dispatch characterization tests are added before body split and are green.
- [ ] #2 run becomes a short orchestration wrapper delegating to mode handlers.
- [ ] #3 Suppression at cli/main.ts:262 is removed.
- [ ] #4 parseCliArgs refactor from W2-01 is already landed to avoid conflicts.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
