---
id: TASK-268
title: 'Plan 3: Implement claude-cli backend'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:external-backends-and-cli'
dependencies:
  - TASK-265
createdAt: '2026-05-04T20:20:03.681Z'
updatedAt: '2026-05-04T20:20:03.681Z'
---

## Description

Implements Implementation Order step 3. Decision Log: D-P3-2, D-P3-9. Quality Contract: QC-006.

Create `lib/driver/backends/claude-cli.ts` following the same shape as the codex backend.

**Cross-plan invariants:**
- P3-INV-9: `Bun.spawn` argv is constructed as an **array**, NOT a shell string. No `printf %q` or shell-template substitution.

**Key shape:**
- `name: "claude-cli"`, `capabilities: { canCommit: true, isolatedFromHostSource: true }`
- `livenessCheck()` returns `{ argv: [binary, "--version"], expectExitZero: true }`
- `run(invocation)`: spawns `[binary, "-p"]` via `Bun.spawn`; prompt content piped via stdin.

```ts
export function createClaudeCliBackend(deps: { binary?: string } = {}): Backend {
  const binary = deps.binary ?? "claude";
  // livenessCheck, run(...) ...
}
```

<!-- AC:BEGIN -->
- [ ] #1 createClaudeCliBackend(deps?) exported from lib/driver/backends/claude-cli.ts returns a Backend with name: "claude-cli", capabilities: { canCommit: true, isolatedFromHostSource: true }.
- [ ] #2 livenessCheck() returns { argv: [binary, "--version"], expectExitZero: true } where binary defaults to "claude" and is overridable via deps.binary.
- [ ] #3 run(invocation) spawns Bun.spawn with argv array [binary, "-p"] — no shell string — per P3-INV-9; prompt content piped via stdin.
- [ ] #4 AbortSignal passed via invocation is propagated to the child process.
- [ ] #5 Tests in tests/driver/backends/claude-cli.test.ts verify argv shape, signal abort, and livenessCheck structure.
<!-- AC:END -->
