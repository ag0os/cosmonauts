---
id: TASK-267
title: 'Plan 3: Implement codex backend'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:external-backends-and-cli'
dependencies:
  - TASK-265
createdAt: '2026-05-04T20:19:55.309Z'
updatedAt: '2026-05-05T15:28:05.699Z'
---

## Description

Implements Implementation Order step 2. Decision Log: D-P3-2, D-P3-9. Quality Contract: QC-006.

Create `lib/driver/backends/codex.ts` implementing the `Backend` interface.

**Cross-plan invariants:**
- P3-INV-9: `Bun.spawn` argv is constructed as an **array**, NOT a shell string. No `printf %q` or shell-template substitution. Bun handles OS-level quoting.

**Key shape:**
- `name: "codex"`, `capabilities: { canCommit: false, isolatedFromHostSource: true }`
- `livenessCheck()` returns `{ argv: [binary, "--version"], expectExitZero: true }`
- `run(invocation)`: spawns `[binary, "exec", "--full-auto", "-o", summaryPath, "-"]` via `Bun.spawn` with `stdin: Bun.file(promptPath)`, `stdout: "pipe"`, `stderr: "pipe"`. Signal abort propagated to child.

```ts
export interface CodexBackendDeps { binary?: string }

export function createCodexBackend(deps: CodexBackendDeps = {}): Backend {
  const binary = deps.binary ?? "codex";
  // livenessCheck, run(...) ...
}
```

<!-- AC:BEGIN -->
- [ ] #1 createCodexBackend(deps?) exported from lib/driver/backends/codex.ts returns a Backend with name: "codex", capabilities: { canCommit: false, isolatedFromHostSource: true }.
- [ ] #2 livenessCheck() returns { argv: [binary, "--version"], expectExitZero: true } where binary defaults to "codex" and is overridable via deps.binary.
- [ ] #3 run(invocation) spawns Bun.spawn with argv array [binary, "exec", "--full-auto", "-o", summaryPath, "-"] — no shell string — per P3-INV-9; stdin is Bun.file(invocation.promptPath).
- [ ] #4 AbortSignal passed via invocation is forwarded to the child process.
- [ ] #5 Tests in tests/driver/backends/codex.test.ts verify: argv array shape matches expected invocation; signal abort stops the child; livenessCheck structure is correct.
<!-- AC:END -->

## Implementation Notes

Implemented lib/driver/backends/codex.ts with livenessCheck, Bun.spawn argv-array invocation, prompt file stdin, signal forwarding, summary-file preference, and tests/driver/backends/codex.test.ts. Verified focused tests, typecheck, and lint pass. Patched stdout/stderr handling to use Response(stream).text() for Bun subprocess compatibility.
