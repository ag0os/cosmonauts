---
id: TASK-232
title: 'W2-03: Refactor cli/session.ts resolveSessionManager into strategy helpers'
status: Done
priority: medium
labels:
  - 'wave:2'
  - 'area:cli-infra'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T13:58:29.666Z'
updatedAt: '2026-04-29T15:42:09.327Z'
---

## Description

Refactor the private `resolveSessionManager(opts)` function at `cli/session.ts:246` into named strategy helpers, removing the complexity suppression.

**Suppression:** `cli/session.ts:246`, private `resolveSessionManager(opts)`.

**Current responsibilities:** validates Pi session flag conflicts; applies Pi priority cascade `noSession → fork → session → resume → continue → default`; resolves path/partial IDs; prompts for cross-project fork; lists local/global sessions for resume; returns in-memory or persistent fallback.

**Target pattern:** strategy helpers:
- `resolveNoSessionStrategy(): SessionManager | undefined`
- `resolveForkStrategy(piFlags, cwd, sessionDir): Promise<SessionManager | undefined>`
- `resolveSessionStrategy(piFlags, cwd, sessionDir): Promise<SessionManager | undefined>`
- `resolveResumeStrategy(piFlags, cwd, sessionDir): Promise<SessionManager | undefined>`
- `resolveContinueOrDefaultStrategy(piFlags, persistent, cwd, sessionDir): SessionManager`

**Coverage status:** `existing-coverage-sufficient` — `tests/cli/session.test.ts:207` covers `--continue`, `--no-session`, `--session` path/partial/cross-project decline, `--fork` path/unknown/conflicts, `--resume` no sessions/cancel, and default persistence through `createSession`.

**TDD note:** no; behavior is already covered through public `createSession`.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/session.ts:246`.
- Commit the change as a single commit: `W2-03: Refactor cli/session.ts resolveSessionManager`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 2 / W2-03

<!-- AC:BEGIN -->
- [ ] #1 Existing session flag tests are green before refactor.
- [ ] #2 Strategy helpers implement the existing priority order without changing createSession API.
- [ ] #3 Suppression at cli/session.ts:246 is removed.
- [ ] #4 Cross-project fork and resume cancel still throw GracefulExitError.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
