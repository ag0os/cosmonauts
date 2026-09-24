---
id: TASK-741
title: >-
  Stage 6 remediation K - pay down introduced debt in orchestration tools and
  session plumbing
status: To Do
priority: high
labels:
  - refactoring
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-740
createdAt: '2026-09-24T13:40:06.932Z'
updatedAt: '2026-09-24T13:40:06.932Z'
---

## Description

This is the second part of the introduced-debt paydown (TASK-740 covers the quality-review modules). It is a behavior-preserving refactor under INV-005, D-009, D-027 and R-014. Use the refactoring and tdd skills. Keep every existing test green without weakening it, add characterization tests where a split seam lacks coverage, and change no observable behavior. Do not re-save any baseline, and do not add suppression directives.

Check progress with the changed-scope audit:

```
npx fallow audit --base main \
  --dead-code-baseline .fallow-baselines/dead-code.json \
  --health-baseline .fallow-baselines/health.json \
  --dupes-baseline .fallow-baselines/dupes.json --format json
```

`bun run lint` has one known error, in Shepherd's gitignored backup under `.shepherd/backups/`. Do not touch it; lint on tracked paths must pass. Run the full suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`.


<!-- AC:BEGIN -->
- [ ] #1 The changed-scope audit reports no introduced complexity finding in `domains/shared/extensions/orchestration/{spawn-tool,driver-tool,chain-tool}.ts`, `lib/orchestration/{session-factory,agent-spawner,durable-chain-runner,chain-runner}.ts`, `lib/agents/session-assembly.ts` or `lib/config/loader.ts`; each changed function is under cyclomatic 20 and cognitive 15.
- [ ] #2 Behavior, output and event order are unchanged; no baseline changed; no suppression directive added; typecheck and the full suite pass.
<!-- AC:END -->
