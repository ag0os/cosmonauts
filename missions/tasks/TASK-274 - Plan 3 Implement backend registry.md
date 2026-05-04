---
id: TASK-274
title: 'Plan 3: Implement backend registry'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:external-backends-and-cli'
dependencies:
  - TASK-267
  - TASK-268
createdAt: '2026-05-04T20:20:38.997Z'
updatedAt: '2026-05-04T20:20:38.997Z'
---

## Description

Implements Implementation Order step 4. Decision Log: D-P3-3. Quality Contract: QC-002.

Create `lib/driver/backends/registry.ts` with `resolveBackend(name, deps)`. Used by the run-step binary to construct backends by name from a serialized spec.

**Cross-plan invariants:**
- P3-INV-3: Registry MUST reject `"cosmonauts-subagent"` with a structured error (not silently fall through to default). This guard exists both here AND in `startDetached` (step 8) — both must reject independently.

```ts
export interface BackendRegistryDeps {
  codexBinary?: string;
  claudeBinary?: string;
}

export function resolveBackend(name: string, deps: BackendRegistryDeps): Backend {
  switch (name) {
    case "codex": return createCodexBackend({ binary: deps.codexBinary });
    case "claude-cli": return createClaudeCliBackend({ binary: deps.claudeBinary });
    case "cosmonauts-subagent":
      throw new Error("cosmonauts-subagent backend cannot run in detached mode");
    default:
      throw new Error(`Unknown backend: ${name}`);
  }
}
```

<!-- AC:BEGIN -->
- [ ] #1 resolveBackend("codex", deps) returns the codex backend with deps.codexBinary forwarded to createCodexBackend.
- [ ] #2 resolveBackend("claude-cli", deps) returns the claude-cli backend with deps.claudeBinary forwarded to createClaudeCliBackend.
- [ ] #3 resolveBackend("cosmonauts-subagent", deps) throws a structured error — does not silently fall through to default — per P3-INV-3.
- [ ] #4 resolveBackend("<unknown>", deps) throws a structured error.
- [ ] #5 Tests in tests/driver/backends/registry.test.ts cover all four cases above.
<!-- AC:END -->
